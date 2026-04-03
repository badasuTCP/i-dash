# I-Dash Analytics Platform

**Enterprise-grade analytics dashboard replacing Looker Studio + Coupler.io**

A fully automated data pipeline and dashboard system that pulls from HubSpot, Meta Ads, Google Ads, and Google Sheets — with AI-powered insights, role-based access, and premium visualizations.

---

## Architecture Overview

```
                    +------------------+
                    |   Nginx Proxy    |
                    |   (Port 80/443)  |
                    +--------+---------+
                             |
              +--------------+--------------+
              |                             |
     +--------v--------+         +---------v--------+
     |  React Frontend |         |  FastAPI Backend  |
     |  (Vite + Nginx) |         |  (Gunicorn/Uvi)  |
     +-----------------+         +--------+----------+
                                          |
                         +----------------+----------------+
                         |                |                |
                  +------v------+  +------v------+  +-----v-----+
                  |  PostgreSQL |  |    Redis    |  | Scheduler |
                  |  (Data)     |  |  (Cache)    |  | (APSched) |
                  +-------------+  +-------------+  +-----------+
                                          |
                    +---------------------+--------------------+
                    |            |              |               |
              +-----v---+ +----v-----+ +------v----+ +-------v-------+
              | HubSpot | | Meta Ads | | Google Ads| | Google Sheets |
              +---------+ +----------+ +-----------+ +---------------+
```

---

## What's Included

### Backend (FastAPI + Python)
- **24 API endpoints** with full authentication and RBAC
- **5 data pipelines** (HubSpot, Meta Ads, Google Ads, Google Sheets, Snapshot Aggregator)
- **AI chatbot** powered by Claude for natural language data queries
- **Automated scheduler** — pipelines refresh every 4 hours
- **Role-based access** — Admin, Director, Manager, Analyst, Viewer
- **Department filtering** — Marketing, Sales, Operations, Finance, Executive

### Frontend (React + Vite)
- **Premium dark theme** with glassmorphism and gradient accents
- **8 KPI scorecards** with sparklines and trend indicators
- **6 chart types** — Area, Bar, Line, Donut, Composed, Table
- **4 dashboard views** — Main, Marketing, Sales, Executive
- **AI chat panel** — ask questions about your data in plain English
- **Auto-generated insights** — daily AI analysis of trends
- **Responsive** — works on desktop, tablet, mobile

### Infrastructure
- **Docker Compose** — one-command deployment
- **Nginx reverse proxy** with SSL support
- **PostgreSQL** with automated backups
- **Redis** caching layer
- **Hetzner VPS ready** — runs on $5-12/mo server

---

## Quick Start (Local Development)

### Prerequisites
- Python 3.11+
- Node.js 20+
- PostgreSQL 15+
- Redis

### 1. Clone and configure

```bash
cd I-Dash

# Backend environment
cp backend/.env.example backend/.env
# Edit backend/.env with your API keys (see Configuration section below)

# Frontend environment
cp frontend/.env.example frontend/.env
```

### 2. Start the backend

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Run database migrations
alembic upgrade head

# Start the server
uvicorn app.main:app --reload --port 8000
```

### 3. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000 — login with the default admin account created on first startup.

---

## Production Deployment (Hetzner VPS)

### 1. Setup your VPS

```bash
# SSH into your new Hetzner server
ssh root@your-server-ip

# Run the setup script (installs Docker, firewall, fail2ban)
bash scripts/setup-vps.sh
```

### 2. Configure environment

```bash
cp docker/.env.production.example docker/.env.production
nano docker/.env.production
# Fill in all your API keys and set a strong SECRET_KEY
```

### 3. Deploy

```bash
docker compose -f docker/docker-compose.yml up -d --build
```

### 4. Setup SSL (free with Let's Encrypt)

```bash
certbot --nginx -d yourdomain.com
```

### 5. Setup automated backups

```bash
# Add to crontab — daily backup at 2 AM
crontab -e
0 2 * * * /path/to/scripts/backup-db.sh
```

---

## Configuration — API Keys You'll Need

| Service | Where to get it | What to set |
|---------|----------------|-------------|
| **HubSpot** | Settings > Integrations > API Key | `HUBSPOT_API_KEY` |
| **Meta Ads** | developers.facebook.com > Your App | `META_APP_ID`, `META_APP_SECRET`, `META_ACCESS_TOKEN` |
| **Google Ads** | Google Ads API Console | `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_REFRESH_TOKEN`, `GOOGLE_ADS_CUSTOMER_ID` |
| **Google Sheets** | Google Cloud Console > Service Account | `GOOGLE_SHEETS_CREDENTIALS_FILE` (path to JSON key) |
| **Claude AI** | console.anthropic.com | `ANTHROPIC_API_KEY` |

---

## Project Structure

```
I-Dash/
├── backend/
│   ├── app/
│   │   ├── api/          # FastAPI route handlers
│   │   │   ├── auth.py        # Login, register, profile
│   │   │   ├── dashboard.py   # KPIs, charts, metrics
│   │   │   ├── pipelines.py   # Pipeline management
│   │   │   ├── users.py       # User CRUD (admin)
│   │   │   └── ai.py          # AI chatbot endpoints
│   │   ├── core/         # Config, DB, security
│   │   ├── models/       # SQLAlchemy ORM models
│   │   ├── pipelines/    # Data extraction modules
│   │   │   ├── hubspot.py
│   │   │   ├── meta_ads.py
│   │   │   ├── google_ads.py
│   │   │   ├── google_sheets.py
│   │   │   └── snapshot.py
│   │   ├── schemas/      # Pydantic validation
│   │   └── services/     # Business logic
│   │       ├── ai_service.py
│   │       ├── pipeline_service.py
│   │       └── scheduler.py
│   ├── migrations/       # Alembic DB migrations
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── scorecards/   # KPI scorecard components
│   │   │   ├── charts/       # Chart components (6 types)
│   │   │   ├── dashboard/    # Dashboard page views
│   │   │   ├── ai/           # AI chat panel + insights
│   │   │   ├── auth/         # Login page
│   │   │   ├── common/       # Shared components
│   │   │   └── layout/       # Sidebar, Header, Layout
│   │   ├── context/      # Auth context
│   │   ├── hooks/        # Custom React hooks
│   │   ├── services/     # API client
│   │   └── pages/        # Route pages
│   └── package.json
├── docker/
│   ├── docker-compose.yml
│   ├── Dockerfile.backend
│   ├── Dockerfile.frontend
│   └── nginx configs
├── scripts/
│   ├── deploy.sh
│   ├── setup-vps.sh
│   └── backup-db.sh
└── README.md
```

---

## Estimated Monthly Cost

| Item | Cost |
|------|------|
| Hetzner VPS (CX21) | ~$5-12/mo |
| Domain (optional) | ~$1/mo |
| Claude API (AI features) | ~$5-20/mo depending on usage |
| **Total** | **~$11-33/mo** |

**What you're replacing:**
- Looker Studio Pro: ~$300-500/mo
- Coupler.io: ~$50-200/mo
- Total savings: **$350-650/mo**

---

## Role-Based Access Matrix

| Feature | Admin | Director | Manager | Analyst | Viewer |
|---------|-------|----------|---------|---------|--------|
| All dashboards | Yes | Yes | Own dept | Own dept | Own dept |
| Executive view | Yes | Yes | No | No | No |
| Sensitive metrics | Yes | Yes | Limited | No | No |
| Pipeline management | Yes | Yes | No | No | No |
| User management | Yes | No | No | No | No |
| AI chatbot | Yes | Yes | Yes | Yes | Read-only |

---

## Built With

- **Backend:** Python 3.11, FastAPI, SQLAlchemy 2.0, APScheduler
- **Frontend:** React 18, Vite, Tailwind CSS, Recharts, Framer Motion
- **Database:** PostgreSQL 15, Redis
- **AI:** Anthropic Claude API
- **Infrastructure:** Docker, Nginx, Certbot

---

Built for The Concrete Protector by Daniel.
