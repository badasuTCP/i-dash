"""
Google Sheets data pipeline for I-Dash Analytics Platform.

Reads tabular data from Google Sheets and transforms into GoogleSheetMetric
records. Supports dual-sheet (SHEET_ID_A / SHEET_ID_B) with heuristic
classification of worksheets as retail:: or contractor:: based on header
keyword scoring.
"""

import asyncio
import json
import logging
import random
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import gspread
from gspread.exceptions import APIError, GSpreadException
from gspread.worksheet import Worksheet

from app.core.config import settings
from app.models.metrics import GoogleSheetMetric
from app.pipelines.base import BasePipeline

logger = logging.getLogger(__name__)

_RETAIL_KEYWORDS = {"order", "sku", "revenue", "amazon", "shipping"}
_CONTRACTOR_KEYWORDS = {"contractor", "lead", "territory", "beckley", "job"}

# Tabs containing these keywords are skipped — Meta data must come from the
# direct API pipeline, not the old Coupler-to-Sheets sync.
_BLACKLISTED_TAB_KEYWORDS = {"meta", "facebook", "coupler"}

# Sheets API quota: 60 read requests / minute / user. Each worksheet read
# costs ~1 request. Sleep between worksheet reads to stay well under the
# limit. 2.0s = 30 worksheets/min ceiling — comfortably under quota even
# with the dual-sheet (A + B) workload.
_SHEETS_READ_DELAY_SECONDS = 2.0

# Max attempts before giving up on a single worksheet. Backoff doubles each
# time, with jitter, so 4 attempts spans ~2s + 4s + 8s + 16s = up to 30s.
_SHEETS_RETRY_MAX_ATTEMPTS = 4


class GoogleSheetsPipeline(BasePipeline):
    """
    Extract and load data from Google Sheets.

    When sheet_id is omitted the pipeline processes both SHEET_ID_A and
    SHEET_ID_B from settings. Each worksheet is classified as retail:: or
    contractor:: via _classify_sheet() and the prefix is prepended to
    sheet_name in every resulting metric record.

    Supports:
    - Single sheet_id or dual-sheet auto-discovery from settings
    - Heuristic retail / contractor classification per worksheet
    - Automatic date column detection
    - Flexible metric naming and category inference
    """

    def __init__(
        self,
        sheet_id: Optional[str] = None,
        worksheet_names: List[str] = None,
        **kwargs,
    ) -> None:
        super().__init__(name="google_sheets_pipeline", **kwargs)

        # If no explicit sheet_id, fall back to settings-driven sheets:
        # SHEET_ID_A + SHEET_ID_B (heuristic retail/contractor classifier)
        # plus SHEET_ID_LEADS (Customer Lead Tracking — vetted leads, source
        # of truth for the CPL numerator). Tabs from the leads sheet are
        # always classified as 'leads::' regardless of header content.
        self._leads_sheet_id = (settings.SHEET_ID_LEADS or "").strip() or None
        if sheet_id:
            self._sheet_ids = [sheet_id]
        else:
            ids = [
                sid
                for sid in [settings.SHEET_ID_A, settings.SHEET_ID_B]
                if sid and sid.strip()
            ]
            if self._leads_sheet_id:
                ids.append(self._leads_sheet_id)
            if not ids:
                raise ValueError(
                    "Provide sheet_id or set SHEET_ID_A / SHEET_ID_B in settings"
                )
            self._sheet_ids = ids

        self.worksheet_names = worksheet_names

        if not settings.GOOGLE_SHEETS_CREDENTIALS_FILE:
            raise ValueError("GOOGLE_SHEETS_CREDENTIALS_FILE must be configured")

        try:
            cred_value = settings.GOOGLE_SHEETS_CREDENTIALS_FILE.strip()
            if cred_value.startswith("{"):
                cred_info = json.loads(cred_value)
                self.gc = gspread.service_account_from_dict(cred_info)
            else:
                self.gc = gspread.service_account(filename=cred_value)
        except Exception as e:
            raise ValueError(
                f"Failed to initialize Google Sheets client: {str(e)}"
            )

    # ──────────────────────────────────────────────────────────────────────────
    # Extract
    # ──────────────────────────────────────────────────────────────────────────

    async def extract(self) -> Dict[str, Any]:
        """
        Extract data from all configured sheets.

        Strategy: ONE batched read per spreadsheet (collapsing N worksheets
        into a single HTTP request via Sheets `values:batchGet`). Falls back
        to per-worksheet reads only if batchGet itself fails. With 2
        spreadsheets × ~20 tabs each, this drops us from 40 reads/run to
        2 reads/run — comfortably inside the 60/min quota even with
        back-to-back runs.

        Returns:
            {"worksheets": {prefixed_sheet_name: [row_dicts, ...]}}
        """
        all_worksheets: Dict[str, List[Dict[str, Any]]] = {}

        for sheet_id in self._sheet_ids:
            try:
                self.logger.info(f"Extracting data from sheet {sheet_id}")
                sheet = self.gc.open_by_key(sheet_id)

                worksheets_to_process = (
                    [ws for ws in sheet.worksheets() if ws.title in self.worksheet_names]
                    if self.worksheet_names
                    else sheet.worksheets()
                )

                # Filter blacklisted tabs (Meta/Facebook/Coupler — those
                # come from the direct API pipeline, not the sheets sync).
                eligible = [
                    ws for ws in worksheets_to_process
                    if not any(kw in ws.title.lower() for kw in _BLACKLISTED_TAB_KEYWORDS)
                ]
                skipped = len(worksheets_to_process) - len(eligible)
                if skipped:
                    self.logger.info(
                        f"Sheet {sheet_id}: skipping {skipped} blacklisted tab(s)"
                    )
                self.logger.debug(
                    f"Sheet {sheet_id}: batching {len(eligible)} worksheets"
                )

                # Tabs from the leads-tracking sheet always get classified
                # as 'leads::' regardless of header content — that sheet IS
                # the canonical lead source by definition.
                is_leads_sheet = (
                    self._leads_sheet_id is not None
                    and sheet_id == self._leads_sheet_id
                )

                def _resolve_prefix(rows: List[Dict[str, Any]]) -> str:
                    if is_leads_sheet:
                        return "leads::"
                    return self._classify_sheet(list(rows[0].keys()) if rows else [])

                # Try the batched path first.
                batched = await self._batch_extract_worksheets(sheet, eligible)
                if batched is not None:
                    for title, rows in batched.items():
                        prefix = _resolve_prefix(rows)
                        all_worksheets[f"{prefix}{title}"] = rows
                        self.logger.debug(
                            f"Batch-extracted {len(rows)} rows from '{title}' (prefix={prefix})"
                        )
                    continue

                # Fallback: per-worksheet sequential reads with throttling.
                # Only reached if batchGet failed wholesale.
                self.logger.warning(
                    f"Sheet {sheet_id}: batchGet failed; falling back to "
                    f"per-worksheet reads with {_SHEETS_READ_DELAY_SECONDS}s throttle"
                )
                for ws_index, worksheet in enumerate(eligible):
                    if ws_index > 0:
                        await asyncio.sleep(_SHEETS_READ_DELAY_SECONDS)
                    try:
                        rows = await self._extract_worksheet_with_retry(worksheet)
                        prefix = _resolve_prefix(rows)
                        all_worksheets[f"{prefix}{worksheet.title}"] = rows
                    except Exception as e:
                        self.logger.warning(
                            f"Error extracting worksheet '{worksheet.title}': {e}"
                        )
                        all_worksheets[worksheet.title] = []

            except GSpreadException as e:
                self.logger.error(f"Google Sheets API error for {sheet_id}: {e}")
                raise
            except Exception as e:
                self.logger.error(f"Error extracting sheet {sheet_id}: {e}")
                raise

        return {"worksheets": all_worksheets}

    async def _batch_extract_worksheets(
        self,
        sheet,
        worksheets: List[Worksheet],
    ) -> Optional[Dict[str, List[Dict[str, Any]]]]:
        """Fetch every worksheet in `sheet` in a single batchGet HTTP call.

        Returns a `{title: parsed_row_dicts}` map on success, or None if the
        batchGet itself failed (caller falls back to per-worksheet reads).

        We retry the batchGet once with backoff if it 429s — but a single
        batchGet rarely trips the quota since it counts as 1 read regardless
        of how many ranges are inside.
        """
        if not worksheets:
            return {}

        # Quote titles that contain spaces / special chars per A1 spec.
        def _quote_title(t: str) -> str:
            if any(c in t for c in " '!:,()") or not t:
                return "'" + t.replace("'", "''") + "'"
            return t

        ranges = [f"{_quote_title(ws.title)}!A1:ZZ" for ws in worksheets]
        title_by_index = [ws.title for ws in worksheets]

        last_exc: Optional[Exception] = None
        for attempt in range(_SHEETS_RETRY_MAX_ATTEMPTS):
            try:
                resp = sheet.values_batch_get(ranges=ranges)
                value_ranges = resp.get("valueRanges", [])
                out: Dict[str, List[Dict[str, Any]]] = {}
                for idx, vr in enumerate(value_ranges):
                    title = title_by_index[idx]
                    raw_values = vr.get("values", []) or []
                    out[title] = self._parse_values_to_rows(title, raw_values)
                return out
            except APIError as exc:
                msg = str(exc)
                is_rate_limit = (
                    "429" in msg
                    or "RATE_LIMIT_EXCEEDED" in msg
                    or "RESOURCE_EXHAUSTED" in msg
                    or "Quota exceeded" in msg
                )
                if not is_rate_limit:
                    self.logger.warning(
                        f"batchGet failed (non-rate-limit), falling back: {exc}"
                    )
                    return None
                last_exc = exc
                wait = (2 ** attempt) * _SHEETS_READ_DELAY_SECONDS + random.uniform(
                    0, _SHEETS_READ_DELAY_SECONDS / 2
                )
                self.logger.warning(
                    f"batchGet rate-limited "
                    f"(attempt {attempt + 1}/{_SHEETS_RETRY_MAX_ATTEMPTS}); "
                    f"sleeping {wait:.1f}s"
                )
                await asyncio.sleep(wait)
            except Exception as exc:
                self.logger.warning(f"batchGet failed unexpectedly: {exc}")
                return None
        if last_exc is not None:
            self.logger.warning(f"batchGet exhausted retries: {last_exc}")
        return None

    def _detect_header_row(self, all_values: List[List[str]]) -> int:
        """Find the most likely header row.

        QuickBooks exports often have title rows ("Income by Customer"),
        date subtitles, blank rows, etc. before the actual column headers.
        Scan the first 10 rows and pick the one that:
          (a) has the most non-empty cells, AND
          (b) contains at least one period-like header (Jul-24, Q1 2025, etc.)
            OR has 5+ non-empty cells (fallback).

        Returns the row INDEX (0-based). Falls back to 0 if nothing better.
        """
        best_idx = 0
        best_score = -1
        scan_limit = min(10, len(all_values))
        for i in range(scan_limit):
            row = all_values[i]
            non_empty = [c for c in row if c and str(c).strip()]
            if len(non_empty) < 3:
                continue
            score = len(non_empty)
            # Bonus if the row contains date-like headers
            for cell in non_empty:
                if self._parse_period_header(str(cell)):
                    score += 50  # heavy bias toward rows with month/quarter labels
                    break
            if score > best_score:
                best_score = score
                best_idx = i
        return best_idx

    async def _extract_worksheet_with_retry(
        self, worksheet: Worksheet
    ) -> List[Dict[str, Any]]:
        """Wrap _extract_worksheet with exponential backoff for 429/quota errors.

        Sheets returns HTTP 429 RESOURCE_EXHAUSTED once we cross 60 reads/min.
        Catch it, back off (2s, 4s, 8s, 16s with jitter), and retry. Other
        errors propagate immediately so we don't mask real bugs.
        """
        last_exc: Optional[Exception] = None
        for attempt in range(_SHEETS_RETRY_MAX_ATTEMPTS):
            try:
                return await self._extract_worksheet(worksheet)
            except APIError as exc:
                msg = str(exc)
                is_rate_limit = (
                    "429" in msg
                    or "RATE_LIMIT_EXCEEDED" in msg
                    or "RESOURCE_EXHAUSTED" in msg
                    or "Quota exceeded" in msg
                )
                if not is_rate_limit:
                    raise
                last_exc = exc
                backoff = (2 ** attempt) * _SHEETS_READ_DELAY_SECONDS
                jitter = random.uniform(0, _SHEETS_READ_DELAY_SECONDS / 2)
                wait = backoff + jitter
                self.logger.warning(
                    f"Sheets rate limit on '{worksheet.title}' "
                    f"(attempt {attempt + 1}/{_SHEETS_RETRY_MAX_ATTEMPTS}); "
                    f"sleeping {wait:.1f}s before retry"
                )
                await asyncio.sleep(wait)
        # All retries exhausted — bubble up the last 429 so the caller
        # logs it and the pipeline status reflects the real failure.
        if last_exc is not None:
            raise last_exc
        return []

    async def _extract_worksheet(self, worksheet: Worksheet) -> List[Dict[str, Any]]:
        """Extract all rows from a single worksheet as a list of dicts.

        Used by the per-worksheet fallback path. Calls the API directly
        (one HTTP request per worksheet), then delegates parsing to the
        shared _parse_values_to_rows helper that batchGet also uses.
        """
        try:
            all_values = worksheet.get_all_values()
            return self._parse_values_to_rows(worksheet.title, all_values)
        except Exception as e:
            self.logger.warning(f"Error extracting worksheet data: {e}")
            return []

    def _parse_values_to_rows(
        self,
        title: str,
        all_values: List[List[str]],
    ) -> List[Dict[str, Any]]:
        """Parse a 2D values array into a list of row dicts.

        Auto-detects the header row to handle QuickBooks-style exports
        with title/section rows above the actual columns. Used by both
        the batched and per-worksheet extract paths so parsing stays
        consistent regardless of which read strategy fetched the data.
        """
        if not all_values or len(all_values) < 2:
            self.logger.debug(f"Worksheet '{title}' is empty")
            return []

        header_idx = self._detect_header_row(all_values)
        headers = all_values[header_idx]
        data_rows = all_values[header_idx + 1:]
        self.logger.info(
            "Worksheet '%s': header row detected at index %d, %d data rows",
            title, header_idx, len(data_rows),
        )

        # De-duplicate empty header columns by giving them placeholder names
        # so dict(zip(...)) doesn't collapse multiple empty-key columns into one.
        cleaned_headers = []
        seen: Dict[str, int] = {}
        for idx, h in enumerate(headers):
            key = (h or "").strip()
            if not key:
                key = f"_col_{idx}"
            if key in seen:
                seen[key] += 1
                key = f"{key}_{seen[key]}"
            else:
                seen[key] = 1
            cleaned_headers.append(key)

        data = []
        for row in data_rows:
            while len(row) < len(cleaned_headers):
                row.append("")
            row_dict = dict(zip(cleaned_headers, row[: len(cleaned_headers)]))
            # Keep rows that have at least one non-empty value in a NAMED column
            # (i.e. ignore rows that only fill placeholder _col_N columns)
            has_real_data = any(
                v and str(v).strip()
                for k, v in row_dict.items()
                if not k.startswith("_col_")
            )
            if has_real_data or any(row_dict.values()):
                data.append(row_dict)

        return data

    # ──────────────────────────────────────────────────────────────────────────
    # Heuristic classification
    # ──────────────────────────────────────────────────────────────────────────

    def _classify_sheet(self, headers: List[str]) -> str:
        """
        Score worksheet headers against retail and contractor keyword sets.

        Each header token that matches a keyword (case-insensitive substring)
        increments that category's score. The category with the higher score
        wins; ties default to 'retail::'.

        Retail keywords : order, sku, revenue, amazon, shipping
        Contractor keywords: contractor, lead, territory, beckley, job

        Returns:
            'retail::' or 'contractor::'
        """
        retail_score = 0
        contractor_score = 0

        for header in headers:
            h_lower = header.lower()
            for kw in _RETAIL_KEYWORDS:
                if kw in h_lower:
                    retail_score += 1
            for kw in _CONTRACTOR_KEYWORDS:
                if kw in h_lower:
                    contractor_score += 1

        return "contractor::" if contractor_score > retail_score else "retail::"

    # ──────────────────────────────────────────────────────────────────────────
    # Transform
    # ──────────────────────────────────────────────────────────────────────────

    async def transform(self, raw_data: Dict[str, Any]) -> List[GoogleSheetMetric]:
        """
        Transform extracted worksheet rows into GoogleSheetMetric records.

        The sheet_name stored on each metric already carries the retail:: or
        contractor:: prefix applied during extraction.
        """
        try:
            records: List[GoogleSheetMetric] = []

            for sheet_name, rows in raw_data.get("worksheets", {}).items():
                try:
                    if not rows:
                        continue

                    # ── Leads sheet: vetted-leads-by-contractor counter ──
                    # Tabs prefixed leads:: come from the Customer Lead
                    # Tracking sheet. They're raw lead records (one row per
                    # lead). We collapse to (date, contractor_name) buckets
                    # with metric_value = lead count, so downstream CPL
                    # queries can do SUM(metric_value) GROUP BY metric_name.
                    if sheet_name.startswith("leads::"):
                        lead_records = self._transform_leads_rows(sheet_name, rows)
                        if lead_records:
                            records.extend(lead_records)
                            self.logger.info(
                                "Leads sheet '%s': emitted %d (date,contractor) lead rows",
                                sheet_name, len(lead_records),
                            )
                        else:
                            self.logger.warning(
                                "Leads sheet '%s': no contractor column detected — "
                                "rows skipped. Expected a header like Contractor / "
                                "Dealer / Account / Company.", sheet_name,
                            )
                        continue

                    # ── Pivot-table layout detection ──────────────────────
                    # Some tabs (notably TCP MAIN) store metric names down
                    # column A and quarter labels across the top row:
                    #     Metric           | Q1 2025 | Q2 2025 | ... | Q1 2026
                    #     Total Revenue    | 1.41M   | 1.99M   | ... | 709.7K
                    # Unwrap each (row, column) cell into one metric record
                    # tagged with the row label as metric_name and the
                    # quarter-start date as the date.
                    pivot_records = self._try_pivot_transform(sheet_name, rows)
                    if pivot_records is not None:
                        records.extend(pivot_records)
                        self.logger.info(
                            "Pivot layout detected for '%s' — extracted %d cell records",
                            sheet_name, len(pivot_records),
                        )
                        continue

                    date_column = self._detect_date_column(list(rows[0].keys()))
                    self.logger.debug(
                        f"Sheet '{sheet_name}': date column = '{date_column}'"
                    )

                    for row_idx, row in enumerate(rows):
                        try:
                            if date_column:
                                metric_date = self._parse_date(
                                    row.get(date_column, "")
                                )
                                if not metric_date:
                                    self.logger.debug(
                                        f"Skipping row {row_idx} — invalid date"
                                    )
                                    continue
                            else:
                                metric_date = datetime.now(timezone.utc).date()

                            for col_name, col_value in row.items():
                                if date_column and col_name == date_column:
                                    continue
                                if not col_value or str(col_value).strip() == "":
                                    continue

                                try:
                                    metric_value = float(col_value)
                                except (ValueError, TypeError):
                                    self.logger.debug(
                                        f"Skipping non-numeric '{col_value}' in '{col_name}'"
                                    )
                                    continue

                                records.append(
                                    GoogleSheetMetric(
                                        sheet_name=sheet_name,
                                        date=metric_date,
                                        metric_name=col_name,
                                        metric_value=metric_value,
                                        category=self._infer_category(col_name),
                                    )
                                )

                        except Exception as e:
                            self.logger.warning(
                                f"Error processing row {row_idx} in '{sheet_name}': {e}"
                            )
                            continue

                except Exception as e:
                    self.logger.warning(f"Error processing sheet '{sheet_name}': {e}")
                    continue

            self.logger.info(f"Transformed {len(records)} Google Sheet metric records")
            return records

        except Exception as e:
            self.logger.error(f"Error transforming Google Sheets data: {e}")
            raise

    # ──────────────────────────────────────────────────────────────────────────
    # Helpers
    # ──────────────────────────────────────────────────────────────────────────

    # Header patterns we'll accept as the contractor identity column on the
    # Customer Lead Tracking sheet. Substring match, case-insensitive — order
    # matters (most specific first) so "contractor name" wins over "name".
    _LEADS_CONTRACTOR_HEADER_PATTERNS = (
        "contractor", "dealer", "account name", "company", "business",
        "account", "client",
    )

    def _detect_leads_contractor_column(
        self, column_names: List[str]
    ) -> Optional[str]:
        """Pick the column on a leads-sheet tab that identifies the contractor."""
        for pattern in self._LEADS_CONTRACTOR_HEADER_PATTERNS:
            for col in column_names:
                if pattern in col.lower():
                    return col
        return None

    def _transform_leads_rows(
        self,
        sheet_name: str,
        rows: List[Dict[str, Any]],
    ) -> List[GoogleSheetMetric]:
        """Collapse raw lead rows into (date, contractor) lead-count metrics.

        Output: one GoogleSheetMetric per (date, contractor) with
        metric_value summing the leads for that pair. Dashboards can then
        do `SUM(metric_value) WHERE sheet_name LIKE 'leads::%'
        GROUP BY metric_name` to get vetted leads per contractor.

        Date column is auto-detected. Contractor column is auto-detected
        from header keywords (contractor / dealer / account / company /
        business). If no contractor column is found, returns [] and the
        caller logs a warning so the operator knows to rename the column.
        """
        if not rows:
            return []

        headers = list(rows[0].keys())
        contractor_col = self._detect_leads_contractor_column(headers)
        if not contractor_col:
            return []
        date_col = self._detect_date_column(headers)

        # Aggregate: { (date, contractor_name) -> count }
        bucket: Dict[tuple, int] = {}
        today = datetime.now(timezone.utc).date()
        for row in rows:
            name = str(row.get(contractor_col, "") or "").strip()
            if not name:
                continue
            metric_date = today
            if date_col:
                parsed = self._parse_date(row.get(date_col, ""))
                if parsed:
                    metric_date = parsed
            key = (metric_date, name)
            bucket[key] = bucket.get(key, 0) + 1

        return [
            GoogleSheetMetric(
                sheet_name=sheet_name,
                date=metric_date,
                metric_name=name,
                metric_value=float(count),
                category="leads",
            )
            for (metric_date, name), count in bucket.items()
        ]

    def _detect_date_column(self, column_names: List[str]) -> Optional[str]:
        """Return the first column whose name contains a common date keyword."""
        date_patterns = [
            "date", "created_date", "created at", "timestamp", "day", "month", "time"
        ]
        for pattern in date_patterns:
            for col_name in column_names:
                if pattern.lower() in col_name.lower():
                    return col_name
        return None

    def _parse_date(self, date_str: str) -> Optional[datetime]:
        """Parse a date string across common formats; return None on failure."""
        if not date_str or not isinstance(date_str, str):
            return None

        date_str = date_str.strip()
        if not date_str:
            return None

        formats = [
            "%Y-%m-%d",
            "%m/%d/%Y",
            "%d/%m/%Y",
            "%Y/%m/%d",
            "%m-%d-%Y",
            "%d-%m-%Y",
            "%Y-%m-%d %H:%M:%S",
            "%m/%d/%Y %H:%M:%S",
            "%Y%m%d",
        ]

        for fmt in formats:
            try:
                return datetime.strptime(date_str, fmt).date()
            except ValueError:
                continue

        try:
            return datetime.fromisoformat(date_str.replace("Z", "+00:00")).date()
        except (ValueError, AttributeError):
            pass

        self.logger.debug(f"Could not parse date: {date_str}")
        return None

    # ──────────────────────────────────────────────────────────────────────────
    # Pivot-table support (TCP MAIN and similar exec-summary tabs)
    # ──────────────────────────────────────────────────────────────────────────

    _QUARTER_RE = re.compile(r"^\s*Q([1-4])\s+(\d{4})\s*$", re.IGNORECASE)
    # Matches: "Jul 24", "Aug 24", "Jan 25", "Mar 2026", "December 2025",
    #          "Jul-24", "Jul'24", "Jul/24", "Jul.24"
    _MONTH_RE = re.compile(
        r"^\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*"
        r"[\s\-/'\.]+(\d{2,4})\s*$",
        re.IGNORECASE,
    )
    # Also accept numeric month-year: "07/24", "07-2024", "7/2025"
    _NUMERIC_MONTH_RE = re.compile(
        r"^\s*(\d{1,2})[\s\-/](\d{2,4})\s*$",
    )
    _MONTH_MAP = {
        "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
        "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
    }

    def _parse_period_header(self, header: str) -> Optional[datetime]:
        """Parse quarter ('Q1 2025') or month ('Jul 24', 'Mar 2026') column headers."""
        if not header:
            return None
        h = str(header).strip()

        # Try quarter first
        m = self._QUARTER_RE.match(h)
        if m:
            q = int(m.group(1))
            year = int(m.group(2))
            month = {1: 1, 2: 4, 3: 7, 4: 10}[q]
            try:
                return datetime(year, month, 1).date()
            except ValueError:
                return None

        # Try month-year (text format: "Jul 24", "Jul-24", etc.)
        m = self._MONTH_RE.match(h)
        if m:
            mon_str = m.group(1).lower()[:3]
            year_str = m.group(2)
            month = self._MONTH_MAP.get(mon_str)
            if not month:
                return None
            year = int(year_str)
            if year < 100:
                year += 2000  # "24" → 2024
            try:
                return datetime(year, month, 1).date()
            except ValueError:
                return None

        # Try numeric month-year ("07/24", "7/2025", "07-2024")
        m = self._NUMERIC_MONTH_RE.match(h)
        if m:
            try:
                month = int(m.group(1))
                year = int(m.group(2))
                if year < 100:
                    year += 2000
                if 1 <= month <= 12 and 1900 < year < 2200:
                    return datetime(year, month, 1).date()
            except (ValueError, TypeError):
                pass

        return None

    def _parse_quarter_header(self, header: str) -> Optional[datetime]:
        """Alias for backwards compat — delegates to _parse_period_header."""
        return self._parse_period_header(header)

    def _try_pivot_transform(
        self, sheet_name: str, rows: List[Dict[str, Any]]
    ) -> Optional[List[GoogleSheetMetric]]:
        """
        Detect and unwrap a pivot-table layout where metric names are in the
        first column and period labels (e.g. 'Q1 2025') span the remaining
        header columns.

        Returns ``None`` if the layout is not a pivot (so caller falls back
        to the standard per-row-date path), else a flattened list of
        ``GoogleSheetMetric`` records — one per (metric-row × period-col) cell.

        Records are stored with a ``sheet_name`` prefixed ``exec::`` so the
        Executive Summary endpoint can pull them with a single indexed query.
        """
        if not rows:
            self.logger.debug("Pivot check '%s': no rows", sheet_name)
            return None

        headers = list(rows[0].keys())
        self.logger.info(
            "Pivot check '%s': %d headers — %s",
            sheet_name, len(headers), headers[:30],
        )
        if len(headers) < 3:
            self.logger.info("Pivot check '%s': fewer than 3 headers — skipping", sheet_name)
            return None

        first_col = headers[0]
        period_cols: List[tuple] = []  # (header, date)
        for h in headers[1:]:
            dt = self._parse_period_header(h)
            if dt:
                period_cols.append((h, dt))

        self.logger.info(
            "Pivot check '%s': matched %d period columns out of %d non-first headers — %s",
            sheet_name, len(period_cols), len(headers) - 1,
            [p[0] for p in period_cols[:10]],
        )

        # Require at least 3 period columns to call this a pivot (prevents
        # false positives on single-date-column sheets).
        if len(period_cols) < 3:
            self.logger.info(
                "Pivot check '%s': only %d period columns — not a pivot, falling through to normal transform",
                sheet_name, len(period_cols),
            )
            return None

        # Tag the sheet_name based on content type.
        # Strip any prior retail::/contractor:: prefix from the classifier.
        bare = sheet_name.split("::", 1)[1] if "::" in sheet_name else sheet_name
        bare_lower = bare.lower()
        # QB contractor revenue sheets get a special prefix for easy querying.
        is_qb = (
            "qb" in bare_lower
            or "contractor_revenue" in bare_lower
            or "contractor revenue" in bare_lower
        )
        if is_qb:
            tagged = f"qb_revenue::{bare}"
        else:
            tagged = f"exec::{bare}"

        self.logger.info(
            "Pivot accepted '%s' → tagged '%s' with %d period columns",
            sheet_name, tagged, len(period_cols),
        )

        # Identify non-period columns (label columns). If there are multiple
        # (e.g. "QB Name" + "Active Contractor"), use the LAST one as the
        # canonical metric_name — that's the user-mapped display name.
        label_cols = [h for h in headers if self._parse_period_header(h) is None]
        # Exclude obvious total/summary columns from label candidates.
        # Catches header forms like "Jan 25 - Mar 26", "Jan '25 - Mar 26",
        # "2025 Total", etc. — these hold numeric grand-totals, not names.
        _range_total_re = re.compile(
            r"[a-z]{3}\s*'?\d{2,4}\s*-\s*[a-z]{3}\s*'?\d{2,4}",
            re.IGNORECASE,
        )
        label_cols = [
            h for h in label_cols
            if not any(kw in h.lower() for kw in ["total", "sum", "grand"])
            and not _range_total_re.search(h)
        ]
        self.logger.info(
            "Pivot '%s': label columns = %s", sheet_name, label_cols,
        )

        def _looks_numeric(s: str) -> bool:
            """True if s parses as a number (incl. $/,/% formatting)."""
            if not s:
                return False
            cleaned = s.replace("$", "").replace(",", "").replace("%", "").strip()
            # Strip shorthand suffix (e.g. "1.4M")
            if cleaned and cleaned[-1] in "KkMmBb":
                cleaned = cleaned[:-1]
            try:
                float(cleaned)
                return True
            except (ValueError, TypeError):
                return False

        out: List[GoogleSheetMetric] = []
        for row in rows:
            # QB Contractor Revenue rule (per the sheet's column structure):
            #   first label column  = personal/owner name (always populated)
            #   second label column = company name (populated ONLY when the
            #                         entry is a currently-active I-BOS contractor)
            # Active   ⇔ second label column is populated → metric_name = company name
            # Inactive ⇔ second label column is empty     → metric_name = first label value
            # The active/inactive flag is encoded as a sheet_name suffix so the
            # dashboard endpoint can sum each bucket with one indexed query.
            # Non-QB pivots keep the legacy "last non-empty non-numeric" rule.
            row_tagged = tagged
            metric_label = ""
            if is_qb and len(label_cols) >= 2:
                first_lc, second_lc = label_cols[0], label_cols[1]
                second_val = (row.get(second_lc) or "").strip()
                first_val = (row.get(first_lc) or "").strip()
                if second_val and not _looks_numeric(second_val):
                    metric_label = second_val
                    row_tagged = f"{tagged}::active"
                elif first_val and not _looks_numeric(first_val):
                    metric_label = first_val
                    row_tagged = f"{tagged}::inactive"
            else:
                # Non-QB pivots: prefer the LAST label column whose value is
                # non-empty AND non-numeric — protects against trailing total
                # columns that slipped past the header filter.
                for lc in reversed(label_cols):
                    val = (row.get(lc) or "").strip()
                    if val and not _looks_numeric(val):
                        metric_label = val
                        break
                if not metric_label:
                    first_val = (row.get(first_col) or "").strip()
                    if first_val and not _looks_numeric(first_val):
                        metric_label = first_val
            if not metric_label:
                continue
            for header, period_date in period_cols:
                raw = row.get(header, "")
                if raw is None or str(raw).strip() == "":
                    continue
                # Strip currency / percent / thousands formatting.
                cleaned = (
                    str(raw)
                    .replace("$", "")
                    .replace(",", "")
                    .replace("%", "")
                    .strip()
                )
                # Handle shorthand: 1.41M → 1410000, 709.7K → 709700
                multiplier = 1.0
                if cleaned.endswith(("M", "m")):
                    multiplier = 1_000_000
                    cleaned = cleaned[:-1]
                elif cleaned.endswith(("K", "k")):
                    multiplier = 1_000
                    cleaned = cleaned[:-1]
                elif cleaned.endswith(("B", "b")):
                    multiplier = 1_000_000_000
                    cleaned = cleaned[:-1]
                try:
                    value = float(cleaned) * multiplier
                except (ValueError, TypeError):
                    continue
                out.append(
                    GoogleSheetMetric(
                        sheet_name=row_tagged,
                        date=period_date,
                        metric_name=metric_label,
                        metric_value=value,
                        category=self._infer_category(metric_label),
                    )
                )
        return out

    def _infer_category(self, column_name: str) -> str:
        """Infer a metric category from a column name."""
        name_lower = column_name.lower()
        if any(kw in name_lower for kw in ["revenue", "sales", "income", "earnings"]):
            return "Revenue"
        if any(kw in name_lower for kw in ["cost", "spend", "expense"]):
            return "Cost"
        if any(kw in name_lower for kw in ["lead", "signup", "registration"]):
            return "Lead"
        if any(kw in name_lower for kw in ["conversion", "customer"]):
            return "Conversion"
        if any(kw in name_lower for kw in ["impression", "click", "engagement"]):
            return "Engagement"
        return column_name.split("_")[0].split(" ")[0].title()
