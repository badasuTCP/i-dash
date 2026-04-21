"""
Shopify OAuth endpoints for I-Dash.

Handles the Shopify Dev Dashboard install flow for the CP retail custom
app. Two endpoints:

  GET /api/shopify/install  — entry point the store admin clicks. Redirects
                              the browser to Shopify's authorize URL with
                              the scopes we need. Shopify then calls
                              /api/shopify/callback with a ?code=.

  GET /api/shopify/callback — exchanges the code for an Admin API access
                              token (shpat_...) via POST to
                              {shop}/admin/oauth/access_token, verifies
                              HMAC, and renders the token on a one-time
                              page so the admin can copy it into Railway
                              env vars.

This is a one-time admin flow for a single-store integration — no token
is stored server-side. Once SHOPIFY_ADMIN_TOKEN is set in Railway env
vars, these endpoints become dormant.
"""

import hashlib
import hmac
import logging
import os
import secrets
from typing import Optional
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, RedirectResponse

from app.core.config import settings


# NOTE: _cfg is defined below after _runtime_creds is declared.

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/shopify", tags=["shopify-oauth"])

# Runtime credential override — workaround for Railway variable-injection
# issues where WC_* / SHOPIFY_* env vars show in the Variables UI but never
# reach the container. POST creds to /api/shopify/prime to populate, then
# run the OAuth flow normally. In-memory only; cleared on pod restart.
_runtime_creds: dict = {}


def _cfg(key: str, default: str = "") -> str:
    """Read a Shopify config value — prefer runtime overrides, then live
    os.environ, then cached pydantic settings."""
    return _runtime_creds.get(key) or os.getenv(key) or getattr(settings, key, "") or default


@router.post("/prime", include_in_schema=False)
async def shopify_prime(payload: dict) -> dict:
    """One-shot runtime credential injector. Payload must include an
    `admin_secret` matching the service's SECRET_KEY (so random callers
    can't set creds). Accepted keys: SHOPIFY_API_KEY, SHOPIFY_API_SECRET,
    SHOPIFY_SHOP_DOMAIN, SHOPIFY_ADMIN_TOKEN.
    """
    admin_secret = payload.get("admin_secret", "")
    expected = os.getenv("SECRET_KEY") or getattr(settings, "SECRET_KEY", "") or ""
    if not expected or not hmac.compare_digest(str(admin_secret), str(expected)):
        raise HTTPException(403, detail="Unauthorized")

    accepted = {}
    for k in ("SHOPIFY_API_KEY", "SHOPIFY_API_SECRET",
              "SHOPIFY_SHOP_DOMAIN", "SHOPIFY_ADMIN_TOKEN"):
        v = payload.get(k)
        if v:
            _runtime_creds[k] = str(v)
            accepted[k] = True
    logger.info("Shopify runtime creds primed: %s", list(accepted.keys()))

    # If the domain + token are now available, re-initialize the Shopify
    # pipeline so it moves from pipeline_service.init_errors into .pipelines
    # and becomes runnable. Safe to call repeatedly.
    pipeline_status: dict = {"reinitialized": False}
    if _runtime_creds.get("SHOPIFY_SHOP_DOMAIN") and _runtime_creds.get("SHOPIFY_ADMIN_TOKEN"):
        try:
            from app.api.pipelines import get_pipeline_service
            from app.pipelines.shopify import ShopifyPipeline
            svc = get_pipeline_service()
            svc.pipelines["shopify"] = ShopifyPipeline()
            svc.init_errors.pop("shopify", None)
            pipeline_status["reinitialized"] = True
            logger.info("Shopify pipeline re-initialized after prime")
        except Exception as exc:
            pipeline_status["error"] = str(exc)
            logger.warning("Shopify pipeline re-init failed: %s", exc)

    return {
        "primed": accepted,
        "known_keys": sorted(_runtime_creds.keys()),
        "pipeline": pipeline_status,
    }


@router.get("/debug", include_in_schema=False)
async def shopify_debug() -> dict:
    """Diagnostic — show which Shopify env vars are visible to the running
    process. Returns booleans + lengths only, never values. Safe to expose."""
    keys = ["SHOPIFY_API_KEY", "SHOPIFY_API_SECRET", "SHOPIFY_SHOP_DOMAIN",
            "SHOPIFY_ADMIN_TOKEN", "SHOPIFY_API_VERSION"]
    # Also list any env vars whose NAME starts with SHOPIFY or WC — lets us
    # see if Railway injected anything at all under those prefixes.
    shopify_keys = sorted(k for k in os.environ if k.startswith("SHOPIFY"))
    wc_keys = sorted(k for k in os.environ if k.startswith("WC_"))
    return {
        "env_lengths": {k: len(os.getenv(k, "")) for k in keys},
        "settings_lengths": {k: len(getattr(settings, k, "") or "") for k in keys},
        "env_keys_starting_with_SHOPIFY": shopify_keys,
        "env_keys_starting_with_WC_": wc_keys,
        "total_env_vars": len(os.environ),
        "all_env_keys": sorted(os.environ.keys()),
    }

# Scopes we request when installing on CP store.
SHOPIFY_SCOPES = ",".join([
    "read_orders",
    "read_all_orders",
    "read_products",
    "read_customers",
    "read_inventory",
    "read_price_rules",
    "read_analytics",
    "read_reports",
])


def _verify_hmac(query_params: dict, secret: str) -> bool:
    """Verify Shopify's HMAC on query params."""
    provided = query_params.get("hmac")
    if not provided:
        return False
    # Rebuild canonical message: all params except hmac, sorted
    pairs = [f"{k}={v}" for k, v in sorted(query_params.items()) if k != "hmac"]
    message = "&".join(pairs).encode("utf-8")
    digest = hmac.new(secret.encode("utf-8"), message, hashlib.sha256).hexdigest()
    return hmac.compare_digest(digest, provided)


@router.get("/install", response_class=HTMLResponse, include_in_schema=False)
async def shopify_install(
    request: Request,
    shop: Optional[str] = Query(None, description="Shop domain, e.g. mrvhcp-w0.myshopify.com"),
) -> HTMLResponse:
    """Kick off Shopify OAuth — redirects to the store's authorize URL."""
    api_key = _cfg("SHOPIFY_API_KEY")
    if not api_key:
        logger.error(
            "SHOPIFY_API_KEY missing — os.environ has %s, settings has %s",
            bool(os.getenv("SHOPIFY_API_KEY")),
            bool(getattr(settings, "SHOPIFY_API_KEY", "")),
        )
        raise HTTPException(500, detail="SHOPIFY_API_KEY not configured")

    # Shop may come in as a query param (?shop=...) or we fall back to
    # the configured domain. Required either way.
    target_shop = (shop or _cfg("SHOPIFY_SHOP_DOMAIN") or "").strip().lower()
    if not target_shop:
        return HTMLResponse(
            "<h3>Shop missing</h3>"
            "<p>Append <code>?shop=mrvhcp-w0.myshopify.com</code> to this URL "
            "or set <code>SHOPIFY_SHOP_DOMAIN</code> in Railway env.</p>",
            status_code=400,
        )
    if not target_shop.endswith(".myshopify.com"):
        target_shop = f"{target_shop}.myshopify.com"

    nonce = secrets.token_urlsafe(16)
    redirect_uri = str(request.url_for("shopify_callback"))

    params = {
        "client_id": api_key,
        "scope": SHOPIFY_SCOPES,
        "redirect_uri": redirect_uri,
        "state": nonce,
    }
    auth_url = f"https://{target_shop}/admin/oauth/authorize?{urlencode(params)}"
    logger.info("Shopify install: redirecting admin to %s", auth_url)
    return HTMLResponse(
        f"""
        <html><head><meta http-equiv="refresh" content="0;url={auth_url}"/></head>
        <body style="font-family:sans-serif;background:#0f172a;color:#e2e8f0;padding:40px;">
        <h2>Redirecting to Shopify…</h2>
        <p>If this page does not redirect, <a href="{auth_url}" style="color:#f59e0b;">click here</a>.</p>
        </body></html>
        """
    )


@router.get("/callback", response_class=HTMLResponse, include_in_schema=False, name="shopify_callback")
async def shopify_callback(request: Request) -> HTMLResponse:
    """Exchange Shopify's ?code= for an Admin API access token and display once."""
    qp = dict(request.query_params)
    code = qp.get("code")
    shop = (qp.get("shop") or "").strip().lower()

    if not code or not shop:
        raise HTTPException(400, detail="Missing code or shop in callback")
    api_key = _cfg("SHOPIFY_API_KEY")
    api_secret = _cfg("SHOPIFY_API_SECRET")
    if not api_key or not api_secret:
        raise HTTPException(500, detail="Shopify app credentials not configured")

    if not _verify_hmac(qp, api_secret):
        logger.warning("Shopify callback HMAC failed for shop=%s", shop)
        raise HTTPException(400, detail="HMAC verification failed")

    token_url = f"https://{shop}/admin/oauth/access_token"
    payload = {
        "client_id": api_key,
        "client_secret": api_secret,
        "code": code,
    }

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(token_url, json=payload)
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPError as exc:
        logger.error("Shopify token exchange failed: %s", exc)
        raise HTTPException(502, detail=f"Token exchange failed: {exc}") from exc

    access_token = data.get("access_token")
    granted_scopes = data.get("scope", "")
    if not access_token:
        raise HTTPException(502, detail=f"No access_token in Shopify response: {data}")

    logger.info(
        "Shopify OAuth success — shop=%s, scopes=%s, token_prefix=%s",
        shop, granted_scopes, access_token[:10] + "...",
    )

    # One-time reveal page. Admin copies token into Railway env vars.
    safe_token = access_token.replace("<", "&lt;").replace(">", "&gt;")
    safe_shop = shop.replace("<", "&lt;").replace(">", "&gt;")
    safe_scopes = granted_scopes.replace("<", "&lt;").replace(">", "&gt;")
    return HTMLResponse(f"""
    <html>
    <head>
      <title>Shopify install complete — I-Dash</title>
      <style>
        body {{ font-family: -apple-system, sans-serif; background:#0f172a; color:#e2e8f0; padding:40px; max-width:780px; margin:0 auto; }}
        h1 {{ color:#10b981; }}
        .box {{ background:#1e293b; border:1px solid #334155; border-radius:12px; padding:20px; margin:16px 0; }}
        code {{ background:#0f172a; padding:2px 6px; border-radius:4px; color:#fbbf24; word-break:break-all; font-size:13px; }}
        .token {{ font-size:14px; color:#10b981; font-weight:bold; display:block; padding:12px; background:#0f172a; border-radius:8px; margin-top:8px; word-break:break-all; }}
        .warn {{ color:#f59e0b; font-size:13px; }}
      </style>
    </head>
    <body>
      <h1>✓ Shopify install complete</h1>
      <p>Copy the token below <strong>now</strong> — this page only renders once per install.</p>

      <div class="box">
        <p><strong>SHOPIFY_SHOP_DOMAIN</strong></p>
        <code class="token">{safe_shop}</code>
      </div>

      <div class="box">
        <p><strong>SHOPIFY_ADMIN_TOKEN</strong></p>
        <code class="token">{safe_token}</code>
      </div>

      <div class="box">
        <p><strong>Granted scopes</strong></p>
        <code>{safe_scopes}</code>
      </div>

      <p class="warn">Paste both values into Railway env vars (Variables tab), redeploy, then trigger the Shopify pipeline from the Data Pipelines page.</p>
    </body>
    </html>
    """)
