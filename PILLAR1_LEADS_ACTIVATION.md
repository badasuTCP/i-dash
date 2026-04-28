# Pillar 1 — Lead Source of Truth: Activation Steps

The strategic pivot routed the **Lead** numerator off the ad platforms and onto
the Customer Lead Tracking sheet. Code is shipped; the data feed needs three
manual one-time steps to go live.

## What the code does

- Reads `SHEET_ID_LEADS` from settings.
- Pulls every tab in that sheet on each `google_sheets_pipeline` run.
- Stores rows in `google_sheet_metrics` under the `leads::<TabName>` prefix.
- Auto-detects the **contractor column** by header keyword: `contractor`,
  `dealer`, `account name`, `company`, `business`, `account`, `client`. First
  match wins.
- Auto-detects the **date column** the same way the rest of the pipeline does
  (header contains `date`, `created`, `timestamp`, etc.).
- Aggregates lead rows into `(date, contractor_name, count)` records.
- Endpoints `/dashboard/marketing/<division>` and
  `/dashboard/contractor-breakdown` now overlay these vetted leads on top of
  Meta + Google Ads spend, recomputing CPL = `(total_spend) / (vetted_leads)`.
- Fuzzy match between sheet contractor names and the contractors table uses
  aggressive normalization (strip LLC/Inc/.com, drop spaces & punctuation,
  remove `[META]` / `[GA4]` / "GA4" suffixes), then substring fallback for
  common variants like "Floor Warriors GA4" vs "Floor Warriors".
- If the leads sheet hasn't been wired up yet, every CPL falls back to
  ad-platform conversions and the response sets `leads_source:
  "ad_platform_conversions"` so the dashboard can later show a banner.

## Activation steps (~5 minutes)

### 1. Get the Google Sheets service account email

The credential JSON used by the pipeline is in Railway under
`GOOGLE_SHEETS_CREDENTIALS_FILE`. Open it, copy the `client_email` field
(looks like `idash-sheets@<project>.iam.gserviceaccount.com`).

### 2. Share the leads sheet with the service account

Open <https://docs.google.com/spreadsheets/d/1P8jTyNXV4Asq2TS-ckeTakeVls3Oade4CClCGva-emQ/edit>,
click **Share**, paste the service account email, set role to **Viewer**, hit
**Send** (uncheck "Notify people" — service accounts don't read mail).

### 3. Set the Railway env var

```
SHEET_ID_LEADS = 1P8jTyNXV4Asq2TS-ckeTakeVls3Oade4CClCGva-emQ
```

Then trigger a redeploy (or hit **Run Now** on the Google Sheets pipeline
from the Pipelines page).

## Verification

After the next sync:

- Pipelines page → Google Sheets row should show records-loaded > 0 and no
  429 (the batchGet pull from a16ff…3792 ships in one HTTP call regardless of
  tab count).
- `GET /api/v1/dashboard/marketing/ibos` response should include
  `"leads_source": "vetted_sheet"`.
- `GET /api/v1/dashboard/contractor-breakdown` response should include
  `leads_source: "vetted_sheet"` and per-contractor records should have
  `leads_source: "vetted_sheet"` on each contractor that matched.

## Column-name caveats

If the leads sheet uses an unusual contractor-column header (e.g. "Sales
Rep" or "Builder"), the pipeline will log:

```
Leads sheet 'leads::<TabName>': no contractor column detected — rows skipped.
Expected a header like Contractor / Dealer / Account / Company.
```

Two options:

- Rename the column in the sheet to one of the recognised names, OR
- Add another keyword to `_LEADS_CONTRACTOR_HEADER_PATTERNS` in
  [`backend/app/pipelines/google_sheets.py`](backend/app/pipelines/google_sheets.py).

## What did NOT change (intentional)

- **Spend** still comes from Meta Ads + Google Ads. The pivot only touched
  the Leads numerator.
- The hardcoded contractor-marketing constant in `ai_service.py` is still
  empty (retired in commit `a0abdf4`); the chatbot now reads the same live
  per-contractor data the dashboard reads, including vetted leads.
- Status / "vetted" filtering on the leads sheet is **not yet active** — the
  pipeline counts every row by contractor. If the sheet has a status column
  with values like Disqualified / Pending that should be excluded, ping me
  and I'll wire that filter in (needs the column header name).
