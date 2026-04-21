"""
Shopify data pipeline for I-Dash Analytics Platform.

Extracts orders, products, and customers from The Concrete Protector
Shopify store (CP brand) using the Admin REST API with an access token
issued from a custom app. Data lands in ShopifyOrder / ShopifyProduct /
ShopifyCustomer tables so the Executive Summary and CP brand overview
can combine retail revenue from Shopify + WooCommerce.

Mirrors the WooCommerce pipeline structure — synchronous httpx inside
asyncio.to_thread() so the event loop stays responsive.
"""

import asyncio
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import httpx

from app.core.config import settings
from app.models.metrics import ShopifyCustomer, ShopifyOrder, ShopifyProduct
from app.pipelines.base import BasePipeline

logger = logging.getLogger(__name__)

SHOPIFY_CHUNK_DAYS = 90
SHOPIFY_PAGE_LIMIT = 250  # Shopify max per page


def _shopify_cfg(key: str) -> str:
    """Read a Shopify config value with this resolution order:
    1. File-backed runtime overrides at /tmp/shopify_runtime_creds.json
       (populated by POST /api/shopify/prime) — visible to all gunicorn
       workers on the same container. Unblocks us when Railway fails to
       inject env vars for this service.
    2. Live os.environ.
    3. Cached pydantic settings.
    """
    import json as _json
    try:
        with open("/tmp/shopify_runtime_creds.json", "r", encoding="utf-8") as fh:
            creds = _json.load(fh) or {}
        v = creds.get(key)
        if v:
            return v
    except (FileNotFoundError, ValueError, OSError):
        pass
    return os.getenv(key) or getattr(settings, key, "") or ""


class ShopifyPipeline(BasePipeline):
    """
    Extract orders + products + customers from Shopify (CP retail).

    Authentication: Admin API access token (shpat_...) in the
    X-Shopify-Access-Token header.

    Pagination: Shopify 2019-07+ uses cursor-based pagination via the
    `Link` header. We follow the `rel="next"` link until exhausted.
    """

    def __init__(
        self,
        start_date=None,
        end_date=None,
        **kwargs,
    ) -> None:
        super().__init__(name="shopify_pipeline", **kwargs)

        if end_date is None:
            end_date = datetime.now(timezone.utc).date()
        if start_date is None:
            start_date = (datetime.now(timezone.utc) - timedelta(days=30)).date()

        self.start_date = start_date
        self.end_date = end_date

        shop_domain = _shopify_cfg("SHOPIFY_SHOP_DOMAIN")
        admin_token = _shopify_cfg("SHOPIFY_ADMIN_TOKEN")
        api_version = _shopify_cfg("SHOPIFY_API_VERSION") or "2026-04"

        if not shop_domain or not admin_token:
            raise ValueError(
                "Shopify not configured — set SHOPIFY_SHOP_DOMAIN and "
                "SHOPIFY_ADMIN_TOKEN (env vars or POST /api/shopify/prime)"
            )

        domain = shop_domain.strip()
        if domain.startswith("http://") or domain.startswith("https://"):
            domain = domain.split("://", 1)[1]
        domain = domain.rstrip("/")
        self.base_url = f"https://{domain}/admin/api/{api_version}"
        self.headers = {
            "X-Shopify-Access-Token": admin_token,
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    # ── Extract ───────────────────────────────────────────────────────────

    async def extract(self) -> Dict[str, Any]:
        """Fetch orders (date-chunked), products, and customers."""
        self.logger.info(
            "Extracting Shopify data from %s to %s", self.start_date, self.end_date
        )

        orders = await self._get_all_orders()
        products = await self._get_all_products()
        customers = await self._get_all_customers()

        self.logger.info(
            "Shopify extract: %d orders, %d products, %d customers",
            len(orders), len(products), len(customers),
        )
        return {"orders": orders, "products": products, "customers": customers}

    async def _get_all_orders(self) -> List[Dict[str, Any]]:
        """Fetch orders in 90-day windows, each with cursor pagination."""
        all_orders: List[Dict[str, Any]] = []
        window_start = self.start_date

        while window_start <= self.end_date:
            window_end = min(
                window_start + timedelta(days=SHOPIFY_CHUNK_DAYS - 1),
                self.end_date,
            )
            self.logger.info("Shopify orders chunk: %s → %s", window_start, window_end)

            chunk = await asyncio.to_thread(
                self._fetch_orders_sync, window_start, window_end
            )
            all_orders.extend(chunk)
            self.logger.info(
                "Shopify orders %s → %s: %d (running total: %d)",
                window_start, window_end, len(chunk), len(all_orders),
            )

            window_start = window_end + timedelta(days=1)
            if window_start <= self.end_date:
                await asyncio.sleep(0.5)

        return all_orders

    def _fetch_orders_sync(self, start, end) -> List[Dict[str, Any]]:
        """Cursor-paginated order fetch for a single date window."""
        url = f"{self.base_url}/orders.json"
        params = {
            "status": "any",
            "created_at_min": f"{start}T00:00:00Z",
            "created_at_max": f"{end}T23:59:59Z",
            "limit": SHOPIFY_PAGE_LIMIT,
            "order": "created_at asc",
        }
        return self._paginate_sync(url, params, "orders")

    async def _get_all_products(self) -> List[Dict[str, Any]]:
        return await asyncio.to_thread(self._fetch_products_sync)

    def _fetch_products_sync(self) -> List[Dict[str, Any]]:
        url = f"{self.base_url}/products.json"
        return self._paginate_sync(url, {"limit": SHOPIFY_PAGE_LIMIT}, "products")

    async def _get_all_customers(self) -> List[Dict[str, Any]]:
        return await asyncio.to_thread(self._fetch_customers_sync)

    def _fetch_customers_sync(self) -> List[Dict[str, Any]]:
        url = f"{self.base_url}/customers.json"
        return self._paginate_sync(url, {"limit": SHOPIFY_PAGE_LIMIT}, "customers")

    def _paginate_sync(self, initial_url: str, params: Dict[str, Any], key: str) -> List[Dict[str, Any]]:
        """Follow Shopify's cursor pagination (Link header rel=next)."""
        results: List[Dict[str, Any]] = []
        url = initial_url
        current_params: Optional[Dict[str, Any]] = dict(params)

        with httpx.Client(timeout=60, headers=self.headers) as client:
            while True:
                resp = client.get(url, params=current_params)
                # Honor rate limiting
                if resp.status_code == 429:
                    retry_after = float(resp.headers.get("Retry-After", "2"))
                    self.logger.warning("Shopify 429; sleeping %.1fs", retry_after)
                    import time
                    time.sleep(retry_after)
                    continue
                resp.raise_for_status()
                data = resp.json()
                batch = data.get(key, []) or []
                results.extend(batch)

                # Cursor pagination via Link header
                link = resp.headers.get("Link", "")
                next_url = self._extract_next_link(link)
                if not next_url:
                    break
                url = next_url
                # After first request, Shopify expects ONLY page_info.
                # Clear other params so they don't conflict.
                current_params = None

        return results

    @staticmethod
    def _extract_next_link(link_header: str) -> Optional[str]:
        """Parse Shopify's Link header and return the rel=next URL, if any."""
        if not link_header:
            return None
        # Format: <https://shop.myshopify.com/...>; rel="next", <...>; rel="previous"
        for part in link_header.split(","):
            part = part.strip()
            if 'rel="next"' in part:
                start = part.find("<")
                end = part.find(">")
                if start >= 0 and end > start:
                    return part[start + 1:end]
        return None

    # ── Transform ─────────────────────────────────────────────────────────

    async def transform(self, raw_data: Dict[str, Any]) -> List:
        """Transform Shopify API responses into ORM rows."""
        records: List = []

        for o in raw_data.get("orders", []):
            try:
                records.append(self._order_to_model(o))
            except Exception as e:
                self.logger.warning("Error processing Shopify order %s: %s", o.get("id"), e)

        for p in raw_data.get("products", []):
            try:
                records.append(self._product_to_model(p))
            except Exception as e:
                self.logger.warning("Error processing Shopify product %s: %s", p.get("id"), e)

        for cust in raw_data.get("customers", []):
            try:
                records.append(self._customer_to_model(cust))
            except Exception as e:
                self.logger.warning("Error processing Shopify customer %s: %s", cust.get("id"), e)

        self.logger.info(
            "Transformed %d Shopify records (%d orders + %d products + %d customers)",
            len(records),
            len(raw_data.get("orders", [])),
            len(raw_data.get("products", [])),
            len(raw_data.get("customers", [])),
        )
        return records

    @staticmethod
    def _parse_iso_date(s: Optional[str]):
        if not s:
            return None
        try:
            return datetime.fromisoformat(s.replace("Z", "+00:00")).date()
        except Exception:
            return None

    @staticmethod
    def _parse_iso_datetime(s: Optional[str]):
        if not s:
            return None
        try:
            return datetime.fromisoformat(s.replace("Z", "+00:00"))
        except Exception:
            return None

    def _order_to_model(self, o: Dict[str, Any]) -> ShopifyOrder:
        line_items = o.get("line_items", []) or []
        items_count = sum(int(li.get("quantity", 1) or 1) for li in line_items)

        shipping_lines = o.get("shipping_lines", []) or []
        shipping_total = sum(float(s.get("price", 0) or 0) for s in shipping_lines)

        # Shopify gives `current_total_price`, `total_tax`, `total_discounts`,
        # `subtotal_price`. Prefer `total_price` for gross.
        total = float(o.get("total_price", 0) or 0)
        subtotal = float(o.get("subtotal_price", 0) or 0)
        tax = float(o.get("total_tax", 0) or 0)
        discount = float(o.get("total_discounts", 0) or 0)

        billing = o.get("billing_address") or {}
        customer = o.get("customer") or {}

        # Payment method — Shopify returns a list of gateways.
        gateways = o.get("payment_gateway_names", []) or []
        payment_method = ", ".join(gateways)[:64] if gateways else None

        return ShopifyOrder(
            order_id=str(o.get("id", "")),
            order_number=str(o.get("order_number") or o.get("name") or o.get("id", "")),
            status=(o.get("financial_status") or "paid"),
            financial_status=o.get("financial_status"),
            fulfillment_status=o.get("fulfillment_status"),
            total=total,
            subtotal=subtotal,
            tax=tax,
            shipping=shipping_total,
            discount=discount,
            currency=o.get("currency", "USD"),
            payment_method=payment_method,
            customer_email=(customer.get("email") or o.get("email") or ""),
            customer_id=str(customer.get("id") or "") or None,
            billing_state=(billing.get("province") or "")[:64] or None,
            billing_country=(billing.get("country_code") or "")[:8] or None,
            items_count=items_count,
            date_created=self._parse_iso_date(o.get("created_at")),
            date_completed=self._parse_iso_date(o.get("closed_at") or o.get("processed_at")),
            division="cp",
        )

    def _product_to_model(self, p: Dict[str, Any]) -> ShopifyProduct:
        variants = p.get("variants", []) or []
        # Pick the first variant's price as a stand-in for price; Shopify
        # products don't have a single price — each variant can differ.
        first = variants[0] if variants else {}
        price = float(first.get("price", 0) or 0)
        compare_at = first.get("compare_at_price")
        compare_at_price = float(compare_at) if compare_at else None
        stock_qty = sum(
            int(v.get("inventory_quantity") or 0) for v in variants
        )
        sku = first.get("sku") or None
        tags = p.get("tags") or None

        return ShopifyProduct(
            product_id=str(p.get("id", "")),
            sku=(sku[:128] if sku else None),
            name=(p.get("title") or "")[:256],
            price=price,
            compare_at_price=compare_at_price,
            stock_quantity=stock_qty if variants else None,
            stock_status=None,
            product_type=(p.get("product_type") or None),
            vendor=(p.get("vendor") or None),
            tags=(tags[:512] if tags else None),
            status=p.get("status"),
            division="cp",
        )

    def _customer_to_model(self, c: Dict[str, Any]) -> ShopifyCustomer:
        default_addr = c.get("default_address") or {}
        tags = c.get("tags") or None
        return ShopifyCustomer(
            customer_id=str(c.get("id", "")),
            email=c.get("email"),
            first_name=c.get("first_name"),
            last_name=c.get("last_name"),
            orders_count=int(c.get("orders_count") or 0),
            total_spent=float(c.get("total_spent") or 0),
            state=(default_addr.get("province") or None),
            country=(default_addr.get("country_code") or None),
            tags=(tags[:512] if tags else None),
            created_at_remote=self._parse_iso_datetime(c.get("created_at")),
            division="cp",
        )

    # ── Load ──────────────────────────────────────────────────────────────

    async def load(self, records: List) -> int:
        """Replace-in-range for orders; full replace for products + customers."""
        from sqlalchemy import delete
        from app.core.database import async_session_maker

        if not records:
            self.logger.info("No Shopify records to load")
            return 0

        orders = [r for r in records if isinstance(r, ShopifyOrder)]
        products = [r for r in records if isinstance(r, ShopifyProduct)]
        customers = [r for r in records if isinstance(r, ShopifyCustomer)]

        async with async_session_maker() as session:
            try:
                if orders:
                    dates = {o.date_created for o in orders if o.date_created}
                    for d in dates:
                        await session.execute(
                            delete(ShopifyOrder).where(ShopifyOrder.date_created == d)
                        )
                    session.add_all(orders)

                if products:
                    await session.execute(delete(ShopifyProduct))
                    session.add_all(products)

                if customers:
                    await session.execute(delete(ShopifyCustomer))
                    session.add_all(customers)

                await session.commit()

                total = len(orders) + len(products) + len(customers)
                self.logger.info(
                    "Loaded %d Shopify records (%d orders + %d products + %d customers)",
                    total, len(orders), len(products), len(customers),
                )
                return total
            except Exception as e:
                await session.rollback()
                self.logger.error("Error loading Shopify records: %s", e)
                raise
