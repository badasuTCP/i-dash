"""
WooCommerce data pipeline for I-Dash Analytics Platform.

Extracts orders and products from the Sani-Tred WooCommerce REST API
and loads into WCOrder + WCProduct records.

The WC REST API is synchronous HTTP — all calls run inside
asyncio.to_thread() so the event loop stays responsive and the
/pipelines/{name}/run endpoint returns 202 immediately.
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from zoneinfo import ZoneInfo

import httpx

# Sani-Tred WordPress is configured for America/New_York. We parse the
# UTC field (date_created_gmt) and convert into ET, then take the
# calendar date — that way the dashboard's day boundaries line up with
# how Molly + the storefront see orders, regardless of how WC ships the
# naive timestamp on date_created.
WC_LOCAL_TZ = ZoneInfo("America/New_York")

from app.core.config import settings
from app.models.metrics import WCOrder, WCProduct
from app.pipelines.base import BasePipeline

logger = logging.getLogger(__name__)

# WooCommerce date-chunk size (days). 90 days keeps each request well
# under the 100-page limit at 100 orders/page.
WC_CHUNK_DAYS = 90


class WooCommercePipeline(BasePipeline):
    """
    Extract orders + products from WooCommerce (Sani-Tred retail).

    - Orders are fetched in date-windowed chunks (90 days) with full
      pagination, then upserted by order_id.
    - Products are fetched as a full snapshot on every run.
    """

    def __init__(
        self,
        start_date=None,
        end_date=None,
        **kwargs,
    ) -> None:
        super().__init__(name="woocommerce_pipeline", **kwargs)

        if end_date is None:
            end_date = datetime.now(timezone.utc).date()
        if start_date is None:
            start_date = (datetime.now(timezone.utc) - timedelta(days=30)).date()

        self.start_date = start_date
        self.end_date = end_date

        if not settings.WC_STORE_URL or not settings.WC_CONSUMER_KEY:
            raise ValueError(
                "WooCommerce not configured — set WC_STORE_URL, "
                "WC_CONSUMER_KEY, and WC_CONSUMER_SECRET"
            )

        self.base_url = settings.WC_STORE_URL.rstrip("/")
        self.auth = (settings.WC_CONSUMER_KEY, settings.WC_CONSUMER_SECRET)

    # ── Extract ───────────────────────────────────────────────────────────

    async def extract(self) -> Dict[str, Any]:
        """Fetch orders (date-chunked) and products (full snapshot)."""
        self.logger.info(
            "Extracting WooCommerce data from %s to %s", self.start_date, self.end_date
        )

        orders = await self._get_all_orders()
        products = await self._get_all_products()

        self.logger.info(
            "WooCommerce extract: %d orders, %d products", len(orders), len(products)
        )
        return {"orders": orders, "products": products}

    async def _get_all_orders(self) -> List[Dict[str, Any]]:
        """Fetch orders in 90-day windows with pagination per window."""
        all_orders: List[Dict[str, Any]] = []
        window_start = self.start_date

        while window_start <= self.end_date:
            window_end = min(
                window_start + timedelta(days=WC_CHUNK_DAYS - 1),
                self.end_date,
            )
            self.logger.info("WC orders chunk: %s → %s", window_start, window_end)

            chunk = await asyncio.to_thread(
                self._fetch_orders_sync, window_start, window_end
            )
            all_orders.extend(chunk)
            self.logger.info(
                "WC orders %s → %s: %d (running total: %d)",
                window_start, window_end, len(chunk), len(all_orders),
            )

            window_start = window_end + timedelta(days=1)
            if window_start <= self.end_date:
                await asyncio.sleep(0.5)

        return all_orders

    def _fetch_orders_sync(self, start, end) -> List[Dict[str, Any]]:
        """Synchronous paginated order fetch for a single date window."""
        url = f"{self.base_url}/wp-json/wc/v3/orders"
        orders: List[Dict[str, Any]] = []
        page = 1

        with httpx.Client(timeout=60) as client:
            while True:
                resp = client.get(
                    url,
                    auth=self.auth,
                    params={
                        "after": f"{start}T00:00:00",
                        "before": f"{end}T23:59:59",
                        "per_page": 100,
                        "page": page,
                        "status": "any",
                        "orderby": "date",
                        "order": "asc",
                    },
                )
                resp.raise_for_status()
                data = resp.json()
                if not data:
                    break
                orders.extend(data)

                total_pages = int(resp.headers.get("X-WP-TotalPages", 1))
                if page >= total_pages:
                    break
                page += 1

        return orders

    async def _get_all_products(self) -> List[Dict[str, Any]]:
        """Fetch every product (paginated, no date filter)."""
        return await asyncio.to_thread(self._fetch_products_sync)

    def _fetch_products_sync(self) -> List[Dict[str, Any]]:
        """Synchronous paginated product fetch."""
        url = f"{self.base_url}/wp-json/wc/v3/products"
        products: List[Dict[str, Any]] = []
        page = 1

        with httpx.Client(timeout=60) as client:
            while True:
                resp = client.get(
                    url,
                    auth=self.auth,
                    params={"per_page": 100, "page": page},
                )
                resp.raise_for_status()
                data = resp.json()
                if not data:
                    break
                products.extend(data)

                total_pages = int(resp.headers.get("X-WP-TotalPages", 1))
                if page >= total_pages:
                    break
                page += 1

        return products

    # ── Transform ─────────────────────────────────────────────────────────

    async def transform(self, raw_data: Dict[str, Any]) -> List:
        """Transform WC API responses into WCOrder + WCProduct records."""
        records = []

        # Orders
        def _to_local_date(o: dict, base: str) -> Optional[Any]:
            """
            Parse a WC date field and return its calendar date in the
            store's local timezone (America/New_York).

            WC REST API exposes two flavors per timestamp:
              base       (e.g. 'date_created')        — store-local naive
              base_gmt   (e.g. 'date_created_gmt')    — UTC

            We prefer ``base_gmt`` because it's unambiguous, then convert
            into ET. Falls back to the local naive field, treated as
            already-ET, if the GMT field is missing.
            """
            gmt_val = o.get(f"{base}_gmt") or ""
            if gmt_val:
                try:
                    dt_utc = datetime.fromisoformat(gmt_val.replace("Z", "+00:00"))
                    if dt_utc.tzinfo is None:
                        dt_utc = dt_utc.replace(tzinfo=timezone.utc)
                    return dt_utc.astimezone(WC_LOCAL_TZ).date()
                except Exception:
                    pass
            local_val = o.get(base) or ""
            if local_val:
                try:
                    return datetime.fromisoformat(local_val.replace("Z", "+00:00")).date()
                except Exception:
                    pass
            return None

        for o in raw_data.get("orders", []):
            try:
                date_created = _to_local_date(o, "date_created")
                date_completed = _to_local_date(o, "date_completed")

                # Count line items
                line_items = o.get("line_items", [])
                items_count = sum(int(li.get("quantity", 1)) for li in line_items)

                records.append(
                    WCOrder(
                        order_id=str(o.get("id", "")),
                        order_number=str(o.get("number", o.get("id", ""))),
                        status=o.get("status", "unknown"),
                        total=float(o.get("total", 0) or 0),
                        subtotal=sum(
                            float(li.get("subtotal", 0) or 0) for li in line_items
                        ),
                        tax=float(o.get("total_tax", 0) or 0),
                        shipping=float(o.get("shipping_total", 0) or 0),
                        discount=float(o.get("discount_total", 0) or 0),
                        currency=o.get("currency", "USD"),
                        payment_method=o.get("payment_method_title", ""),
                        customer_email=(o.get("billing", {}) or {}).get("email", ""),
                        billing_state=(o.get("billing", {}) or {}).get("state", ""),
                        billing_country=(o.get("billing", {}) or {}).get("country", ""),
                        items_count=items_count,
                        date_created=date_created,
                        date_completed=date_completed,
                        division="sanitred",
                    )
                )
            except Exception as e:
                self.logger.warning("Error processing WC order %s: %s", o.get("id"), e)

        # Products
        for p in raw_data.get("products", []):
            try:
                cats = ", ".join(
                    c.get("name", "") for c in (p.get("categories", []) or [])
                )
                records.append(
                    WCProduct(
                        product_id=str(p.get("id", "")),
                        sku=p.get("sku", ""),
                        name=p.get("name", ""),
                        price=float(p.get("price", 0) or 0),
                        regular_price=float(p.get("regular_price", 0) or 0)
                        if p.get("regular_price")
                        else None,
                        sale_price=float(p.get("sale_price", 0) or 0)
                        if p.get("sale_price")
                        else None,
                        stock_quantity=int(p.get("stock_quantity") or 0)
                        if p.get("stock_quantity") is not None
                        else None,
                        stock_status=p.get("stock_status", ""),
                        total_sales=int(p.get("total_sales", 0) or 0),
                        categories=cats[:512] if cats else None,
                        division="sanitred",
                    )
                )
            except Exception as e:
                self.logger.warning("Error processing WC product %s: %s", p.get("id"), e)

        self.logger.info(
            "Transformed %d WC records (%d orders + %d products)",
            len(records),
            len(raw_data.get("orders", [])),
            len(raw_data.get("products", [])),
        )
        return records

    # ── Load ──────────────────────────────────────────────────────────────

    async def load(self, records: List) -> int:
        """Upsert orders by order_id, products by product_id.

        Uses delete-then-insert for simplicity — the full order set for
        the date range is replaced atomically.
        """
        from sqlalchemy import delete, select
        from app.core.database import async_session_maker

        if not records:
            self.logger.info("No WC records to load")
            return 0

        orders = [r for r in records if isinstance(r, WCOrder)]
        products = [r for r in records if isinstance(r, WCProduct)]

        async with async_session_maker() as session:
            try:
                # Delete existing orders in the date range
                if orders:
                    dates = {o.date_created for o in orders if o.date_created}
                    if dates:
                        for d in dates:
                            await session.execute(
                                delete(WCOrder).where(WCOrder.date_created == d)
                            )
                    session.add_all(orders)

                # Replace full product catalog
                if products:
                    await session.execute(delete(WCProduct))
                    session.add_all(products)

                await session.commit()

                total = len(orders) + len(products)
                self.logger.info(
                    "Loaded %d WC records (%d orders + %d products)",
                    total, len(orders), len(products),
                )
                return total

            except Exception as e:
                await session.rollback()
                self.logger.error("Error loading WC records: %s", e)
                raise
