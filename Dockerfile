# ─────────────────────────────────────────────────────────────────────
# I-Dash Unified Service (backend + frontend)
#
# Railway build config:
#   Root Directory: /          (repo root — leave unset)
#   Build Command:  (none — Dockerfile handles everything)
#   Start Command:  (none — CMD below)
#   Healthcheck:    /health
#
# Pipeline:
#   1. node    → build the Vite/React frontend  → /frontend/dist
#   2. python  → install backend deps (builder cache)
#   3. runtime → copy backend + frontend dist into /app/static
# ─────────────────────────────────────────────────────────────────────

# ── Stage 1: frontend build ─────────────────────────────────────────
FROM node:20-slim AS frontend-builder
WORKDIR /frontend

COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --no-audit --no-fund --loglevel=error

COPY frontend/ .
# VITE_API_URL is hardcoded to '/api' in services/api.js for prod, so
# no build arg is needed.
RUN npm run build

# ── Stage 2: python deps ────────────────────────────────────────────
FROM python:3.11-slim AS python-builder
WORKDIR /build

RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --user --no-cache-dir -r requirements.txt

# ── Stage 3: runtime ────────────────────────────────────────────────
FROM python:3.11-slim
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
      libpq5 curl \
    && rm -rf /var/lib/apt/lists/*

# Non-root user for runtime
RUN groupadd -r appuser && useradd -r -g appuser appuser

# Python deps
COPY --from=python-builder /root/.local /home/appuser/.local

# Backend source
COPY backend/ /app/

# Frontend build output → /app/static (matches _STATIC_DIR in main.py)
COPY --from=frontend-builder /frontend/dist /app/static

RUN chown -R appuser:appuser /app
USER appuser

ENV PATH=/home/appuser/.local/bin:$PATH \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=/app

# Railway injects PORT at runtime. Do NOT hardcode it.
# Gunicorn binds to $PORT via shell expansion (CMD must be shell form).
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD curl -fsS http://localhost:${PORT:-8080}/health || exit 1

CMD gunicorn \
    --worker-class uvicorn.workers.UvicornWorker \
    --workers 2 \
    --worker-tmp-dir /dev/shm \
    --max-requests 10000 \
    --timeout 120 \
    --access-logfile - \
    --error-logfile - \
    --bind "0.0.0.0:${PORT:-8080}" \
    app.main:app
