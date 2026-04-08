# I-Dash Pipeline Status

Last validated: **2026-04-08**

## Pipeline Summary

| Pipeline | Status | Records | Coverage |
|----------|--------|--------:|----------|
| Google Sheets | **LIVE** | 36,119 | Dual-sheet heuristic: SHEET_ID_A + SHEET_ID_B |
| GA4 Analytics | **LIVE** | 20,436 | 84 properties (13 CP + 71 I-BOS + 1 Sani-Tred) |
| Meta Ads | READY | 0 | Pipeline operational, pending campaign data |
| Google Ads | READY | 0 | Requires Google Ads API enabled in GCP project 906268072620 |
| Snapshot | **LIVE** | 33 | Aggregate KPIs from all pipelines |
| HubSpot | DISABLED | 0 | No API key configured |

## Heuristic Sheet Classification

The Google Sheets pipeline (`backend/app/pipelines/google_sheets.py`) reads from two sheets configured via `SHEET_ID_A` and `SHEET_ID_B` in settings. Each worksheet is auto-classified using header keyword scoring:

- **Retail keywords**: `order`, `sku`, `revenue`, `amazon`, `shipping`
- **Contractor keywords**: `contractor`, `lead`, `territory`, `beckley`, `job`

The category with the higher score wins. Ties default to `retail::`. The prefix is stored in the `sheet_name` field of every `GoogleSheetMetric` record.

### Current Classification (36,119 records)

| Type | Worksheets | Records | Examples |
|------|-----------|--------:|---------|
| `retail::` | 23 | 28,425 | Retail_ROAS_Final, Exec Master, Google Ads Summary |
| `contractor::` | 11 | 7,694 | ContractorLeads_MarketingSpend, Contractors Revenue |

## GA4 Property Coverage

The GA4 pipeline auto-discovers properties via the Google Analytics Admin API and persists them to the `ga4_properties` table. Properties must be **enabled** to be included in data extraction.

- **CP division**: 14 properties (all enabled)
- **I-BOS division**: 71 properties (enabled 2026-04-08)
- **Sani-Tred division**: 1 property (enabled)

Data range: **2026-01-01 to 2026-04-08** (refreshes every 4 hours via scheduler)

## Google Ads

The pipeline queries three customer IDs under MCC 4331355762:

| CID | Division |
|-----|----------|
| 2823564937 | Sani-Tred |
| 6754610688 | I-BOS |
| 2957400868 | I-BOS (CID 2) |

**Action required**: Enable the Google Ads API in GCP project 906268072620:
https://console.developers.google.com/apis/api/googleads.googleapis.com/overview?project=906268072620

## Config Fields Added (2026-04-08)

- `SHEET_ID_A` / `SHEET_ID_B` — Dual Google Sheets for heuristic pipeline
- `GOOGLE_ADS_CUSTOMER_ID_IBOS_2` — Second I-BOS customer ID (2957400868)
- `GA4_PROPERTY_ID_IBOS_SLG` — GA4 property for SLG contractor website

## Zero-Fallback Policy

Frontend pages (`SaniTredRetail.jsx`, `IBOSSMarketing.jsx`, `IBOSSWebAnalytics.jsx`) show `$0.00` or empty state when no 2026 data exists in the database for the selected date range. No mock/seed data is displayed.
