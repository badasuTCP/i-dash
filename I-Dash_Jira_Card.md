# Jira Task Card

---

## Title
Build I-Dash Analytics Platform — Replace Looker Studio Pro + Coupler.io

---

## Type
Task

---

## Summary
Build a fully automated, self-hosted analytics dashboard (I-Dash) to replace the current Google Looker Studio Pro + Coupler.io stack. The platform will serve three business divisions (The Concrete Protector, Sani-Tred, I-BOS) with unified executive-level KPIs, per-division marketing and sales dashboards, and AI-powered insights.

---

## Description

### Background
The current analytics stack relies on Google Looker Studio Pro for dashboards and Coupler.io for data connectors. This creates ongoing subscription costs, limited customization, and no control over data pipelines. I-Dash replaces both with a custom-built platform that gives us 100% ownership and flexibility.

### Scope

**Frontend (React + Vite + Tailwind CSS)**
- Executive Dashboard with company-wide KPIs across all three divisions
- Per-division dashboards (3 pages each): Marketing Performance, Sales Pipeline, Web Analytics
- Role-Based Access: Super Admin (full access) and Executive (dashboards + AI only)
- Interactive Chart.js/Recharts visualizations with filters (date range, channel, region)
- Presentation Mode for meetings (charts-only view, hides sidebar/header/filters)
- Collapsible sidebar with division-based navigation
- AI chatbot (floating button) for natural language data queries
- Responsive login page with branded assets

**Backend (Python + FastAPI + PostgreSQL)**
- RESTful API with JWT authentication
- ETL data pipelines with retry/backoff for all data sources:
  - Meta Ads API (per-division ad accounts)
  - Google Ads API (per-division customer IDs)
  - Google Analytics 4 Data API (per-division GA4 properties)
  - HubSpot CRM API (contacts, deals, companies)
  - Google Sheets API (supplemental data)
- Connector Registry — centralized, division-aware data source management
- APScheduler for automated data refresh (configurable interval, default 4 hours)
- Redis caching layer for dashboard performance
- AI service powered by xAI Grok API for insights, reports, and chat

**Infrastructure**
- Docker Compose deployment targeting Hetzner VPS
- PostgreSQL for metrics storage, Redis for caching
- Alembic for database migrations

### Divisions
1. **The Concrete Protector (CP)** — main company
2. **Sani-Tred** — retail outlet division
3. **I-BOS** — contractor division

### Brand Standards
- Primary: #265AA9 (Cerulean Blue)
- Accent: #55A8C3 (Fountain Blue)
- Active navigation: Coral gradient (#F97066 to #FEB47B)
- CP Shield logo used throughout (login, sidebar, favicon)

---

## Acceptance Criteria
- [ ] Login page with role-based authentication (Super Admin + Executive roles)
- [ ] Executive Dashboard displays aggregated KPIs from all three divisions
- [ ] Each division has 3 sub-pages: Marketing, Sales, Web Analytics
- [ ] All dashboard pages have working filters (date range, channel, region)
- [ ] Sidebar supports section collapse/expand AND full sidebar collapse
- [ ] Presentation Mode shows only charts for meeting use
- [ ] Meta Ads pipeline pulling live data per-division
- [ ] Google Ads pipeline pulling live data per-division
- [ ] GA4 pipeline pulling live data per-division
- [ ] HubSpot pipeline pulling contacts, deals, and company data
- [ ] Google Sheets pipeline for supplemental data
- [ ] AI chatbot returns insights using xAI Grok API
- [ ] Automated data refresh on configurable schedule
- [ ] Deployed on Hetzner VPS via Docker Compose
- [ ] All Coupler.io and Looker Studio Pro subscriptions can be cancelled

---

## Labels
`analytics` `dashboard` `data-pipeline` `internal-tool`

---

## Story Points (Estimate)
13

---
