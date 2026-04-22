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
# run the OAuth flow normally.
#
# Persisted to a shared tmpfs file (/tmp/shopify_runtime_creds.json) so all
# gunicorn workers on the same container see the same values. Cleared on
# pod restart — re-prime after every deploy until a DB-backed solution
# replaces this.
import json as _json

_RUNTIME_CREDS_FILE = "/tmp/shopify_runtime_creds.json"

# Keys we persist as SystemSecret rows. Keep in sync with the prime payload.
_PERSISTED_KEYS = (
    "SHOPIFY_API_KEY",
    "SHOPIFY_API_SECRET",
    "SHOPIFY_SHOP_DOMAIN",
    "SHOPIFY_ADMIN_TOKEN",
)


def _load_creds() -> dict:
    try:
        with open(_RUNTIME_CREDS_FILE, "r", encoding="utf-8") as fh:
            return _json.load(fh) or {}
    except (FileNotFoundError, ValueError):
        return {}
    except Exception as exc:
        logger.warning("Shopify creds file read failed: %s", exc)
        return {}


def _save_creds(d: dict) -> None:
    try:
        with open(_RUNTIME_CREDS_FILE, "w", encoding="utf-8") as fh:
            _json.dump(d, fh)
    except Exception as exc:
        logger.warning("Shopify creds file write failed: %s", exc)


async def _persist_creds_to_db(d: dict) -> None:
    """Upsert the Shopify creds into the system_secrets table so they
    survive pod restarts. Called from the prime endpoint."""
    try:
        from sqlalchemy.dialects.postgresql import insert as _pg_insert
        from app.core.database import async_session_maker
        from app.models.metrics import SystemSecret

        async with async_session_maker() as session:
            for k in _PERSISTED_KEYS:
                v = d.get(k)
                if not v:
                    continue
                stmt = _pg_insert(SystemSecret).values(key=k, value=str(v))
                stmt = stmt.on_conflict_do_update(
                    index_elements=["key"],
                    set_={"value": stmt.excluded.value},
                )
                await session.execute(stmt)
            await session.commit()
        logger.info("Shopify creds persisted to system_secrets")
    except Exception as exc:
        logger.warning("Shopify creds DB persistence failed: %s", exc)


async def rehydrate_creds_from_db() -> bool:
    """Rehydrate /tmp/shopify_runtime_creds.json from the system_secrets
    table. Called once on startup — after this, worker pids and pipeline
    init can treat /tmp as the source of truth exactly like before.

    Returns True if any creds were written to the file.
    """
    try:
        from sqlalchemy import select as _sel
        from app.core.database import async_session_maker
        from app.models.metrics import SystemSecret

        async with async_session_maker() as session:
            rows = await session.execute(
                _sel(SystemSecret.key, SystemSecret.value).where(
                    SystemSecret.key.in_(_PERSISTED_KEYS)
                )
            )
            pairs = {k: v for k, v in rows.all() if v}
        if not pairs:
            return False
        existing = _load_creds()
        existing.update(pairs)
        _save_creds(existing)
        logger.info(
            "Shopify creds rehydrated from DB: %s", sorted(pairs.keys())
        )
        return True
    except Exception as exc:
        logger.warning("Shopify creds DB rehydrate failed: %s", exc)
        return False


def _cfg(key: str, default: str = "") -> str:
    """Read a Shopify config value — prefer runtime overrides (file-backed,
    visible to all workers), then live os.environ, then cached pydantic
    settings."""
    creds = _load_creds()
    return creds.get(key) or os.getenv(key) or getattr(settings, key, "") or default


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

    creds = _load_creds()
    accepted = {}
    for k in _PERSISTED_KEYS:
        v = payload.get(k)
        if v:
            creds[k] = str(v)
            accepted[k] = True
    _save_creds(creds)
    await _persist_creds_to_db(creds)
    logger.info("Shopify runtime creds primed: %s (file: %s, DB: system_secrets)",
                list(accepted.keys()), _RUNTIME_CREDS_FILE)

    # If the domain + token are now available, re-initialize the Shopify
    # pipeline so it moves from pipeline_service.init_errors into .pipelines
    # and becomes runnable. Safe to call repeatedly.
    pipeline_status: dict = {"reinitialized": False}
    if creds.get("SHOPIFY_SHOP_DOMAIN") and creds.get("SHOPIFY_ADMIN_TOKEN"):
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
        "known_keys": sorted(creds.keys()),
        "pipeline": pipeline_status,
    }


@router.post("/debug-meta-actions", include_in_schema=False)
async def debug_meta_actions(payload: dict) -> dict:
    """Fetch raw Meta insights (action_types + values) for a single account-day.

    Admin-gated. Used to diagnose lead-count discrepancies between our
    pipeline and Meta Ads Manager. Returns the full `actions` and
    `action_values` arrays exactly as Meta returns them so we can see
    which event types fired and decide how to bucket them.

    Payload:
      admin_secret: SECRET_KEY
      account_id:   Meta ad account ID (without the `act_` prefix)
      date:         YYYY-MM-DD
    """
    admin_secret = payload.get("admin_secret", "")
    expected = os.getenv("SECRET_KEY") or getattr(settings, "SECRET_KEY", "") or ""
    if not expected or not hmac.compare_digest(str(admin_secret), str(expected)):
        raise HTTPException(403, detail="Unauthorized")

    account_id = str(payload.get("account_id") or "").strip()
    contractor = str(payload.get("contractor") or "").strip()
    d = str(payload.get("date") or "").strip()
    if not d or (not account_id and not contractor):
        raise HTTPException(400, detail="date + (account_id or contractor) required")

    # Contractor-name lookup so the caller doesn't have to know Meta IDs.
    if contractor and not account_id:
        try:
            from sqlalchemy import select as _sel
            from app.core.database import async_session_maker
            from app.models.brand_asset import BrandAsset
            async with async_session_maker() as session:
                q = await session.execute(
                    _sel(BrandAsset.account_id, BrandAsset.account_name)
                    .where(BrandAsset.platform == "meta")
                )
                rows = q.all()
            needle = contractor.lower().replace(" ", "")
            hit = next(
                ((aid, name) for aid, name in rows
                 if needle in (name or "").lower().replace(" ", "")),
                None,
            )
            if not hit:
                raise HTTPException(404, detail=f"No Meta account matching '{contractor}'. Pass account_id directly.")
            account_id = hit[0]
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(500, detail=f"Contractor lookup failed: {exc}")

    # Pull the Meta access token from settings (env or pydantic config).
    token = os.getenv("META_ACCESS_TOKEN") or getattr(settings, "META_ACCESS_TOKEN", "")
    if not token:
        raise HTTPException(500, detail="META_ACCESS_TOKEN not configured")

    acct = account_id if account_id.startswith("act_") else f"act_{account_id}"
    url = f"https://graph.facebook.com/v19.0/{acct}/insights"
    params = {
        "access_token": token,
        "level": "campaign",
        "time_range": _json.dumps({"since": d, "until": d}),
        "fields": "campaign_name,spend,impressions,clicks,actions,action_values",
    }
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.get(url, params=params)
    try:
        data = r.json()
    except Exception:
        data = {"raw": r.text}
    return {"account_id": acct, "date": d, "response": data}


@router.post("/migrate", include_in_schema=False)
async def shopify_migrate(payload: dict) -> dict:
    """Force-create Shopify tables + system_secrets on the CURRENT DB.

    Admin-gated. Defensive against model-registration timing bugs where
    ``Base.metadata.create_all`` on startup missed a table because the
    model module hadn't been imported in time.
    """
    admin_secret = payload.get("admin_secret", "")
    expected = os.getenv("SECRET_KEY") or getattr(settings, "SECRET_KEY", "") or ""
    if not expected or not hmac.compare_digest(str(admin_secret), str(expected)):
        raise HTTPException(403, detail="Unauthorized")

    from app.core.database import engine, Base
    # Force-import so the tables register on Base.metadata RIGHT NOW.
    from app.models import metrics as _metrics  # noqa: F401
    from app.models import pipeline_log as _pl  # noqa: F401

    wanted = [
        _metrics.ShopifyOrder.__table__,
        _metrics.ShopifyOrderLine.__table__,
        _metrics.ShopifyProduct.__table__,
        _metrics.ShopifyCustomer.__table__,
        _metrics.SystemSecret.__table__,
    ]
    async with engine.begin() as conn:
        def _runner(sync_conn):
            Base.metadata.create_all(sync_conn, tables=wanted, checkfirst=True)
        await conn.run_sync(_runner)

    # Verify
    from sqlalchemy import select as _sel, func as _func
    from app.core.database import async_session_maker
    results = {}
    async with async_session_maker() as session:
        for tbl in wanted:
            try:
                n = (await session.execute(_sel(_func.count()).select_from(tbl))).scalar()
                results[tbl.name] = {"exists": True, "rows": int(n or 0)}
            except Exception as exc:
                results[tbl.name] = {"exists": False, "error": str(exc)}
    logger.info("Shopify migrate ran: %s", results)
    return {"tables": results}


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
    # File-backed creds diagnostic
    import os as _os
    file_exists = _os.path.exists(_RUNTIME_CREDS_FILE)
    file_size = _os.path.getsize(_RUNTIME_CREDS_FILE) if file_exists else 0
    creds = _load_creds()
    file_keys = sorted(creds.keys())
    # Pipeline service state
    pipeline_state = {"error": "not reachable"}
    try:
        from app.api.pipelines import get_pipeline_service
        svc = get_pipeline_service()
        # Run the exact status call the frontend gets, so we see the
        # shopify row the UI is rendering from.
        try:
            full_status = await svc.get_pipeline_status()
            shopify_row = next(
                (p for p in full_status.get("pipelines", [])
                 if p.get("name") == "shopify"),
                {"missing": True},
            )
        except Exception as exc:
            shopify_row = {"status_call_error": str(exc)}
        pipeline_state = {
            "init_errors": dict(svc.init_errors),
            "registered_pipelines": sorted(svc.pipelines.keys()),
            "has_retry_method": hasattr(svc, "_retry_failed_inits"),
            "worker_pid": _os.getpid(),
            "shopify_status_row": shopify_row,
        }
    except Exception as exc:
        pipeline_state = {"error": str(exc)}
    # Row counts + pipeline log snapshot — answers "did the data actually land?"
    data_state = {"error": "not queried"}
    try:
        from sqlalchemy import select as _sel, func as _func, desc as _desc
        from app.core.database import async_session_maker
        from app.models.metrics import ShopifyOrder, ShopifyProduct, ShopifyCustomer, SystemSecret
        from app.models.pipeline_log import PipelineLog
        async with async_session_maker() as session:
            orders_count = (await session.execute(_sel(_func.count(ShopifyOrder.id)))).scalar() or 0
            products_count = (await session.execute(_sel(_func.count(ShopifyProduct.id)))).scalar() or 0
            customers_count = (await session.execute(_sel(_func.count(ShopifyCustomer.id)))).scalar() or 0
            secrets_rows = (await session.execute(
                _sel(SystemSecret.key).where(SystemSecret.key.like("SHOPIFY_%"))
            )).scalars().all()
            last_log = (await session.execute(
                _sel(PipelineLog.pipeline_name, PipelineLog.status, PipelineLog.records_fetched,
                     PipelineLog.duration_seconds, PipelineLog.started_at, PipelineLog.error_message)
                .where(PipelineLog.pipeline_name.in_(["shopify", "shopify_pipeline"]))
                .order_by(_desc(PipelineLog.started_at)).limit(3)
            )).all()
        data_state = {
            "shopify_orders_rows": orders_count,
            "shopify_products_rows": products_count,
            "shopify_customers_rows": customers_count,
            "system_secrets_shopify_keys": sorted(secrets_rows),
            "recent_pipeline_logs": [
                {
                    "name": r[0], "status": str(r[1]), "records": r[2],
                    "duration_s": r[3], "started_at": r[4].isoformat() if r[4] else None,
                    "error": r[5],
                } for r in last_log
            ],
        }
    except Exception as exc:
        data_state = {"error": str(exc)}

    return {
        "env_lengths": {k: len(os.getenv(k, "")) for k in keys},
        "settings_lengths": {k: len(getattr(settings, k, "") or "") for k in keys},
        "env_keys_starting_with_SHOPIFY": shopify_keys,
        "env_keys_starting_with_WC_": wc_keys,
        "total_env_vars": len(os.environ),
        "runtime_creds_file": {
            "path": _RUNTIME_CREDS_FILE,
            "exists": file_exists,
            "size_bytes": file_size,
            "keys_present": file_keys,
        },
        "pipeline_service": pipeline_state,
        "data_state": data_state,
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
