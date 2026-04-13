"""
Google Sheets data pipeline for I-Dash Analytics Platform.

Reads tabular data from Google Sheets and transforms into GoogleSheetMetric
records. Supports dual-sheet (SHEET_ID_A / SHEET_ID_B) with heuristic
classification of worksheets as retail:: or contractor:: based on header
keyword scoring.
"""

import json
import logging
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import gspread
from gspread.exceptions import GSpreadException
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

        # If no explicit sheet_id, fall back to settings-driven dual sheets
        if sheet_id:
            self._sheet_ids = [sheet_id]
        else:
            ids = [
                sid
                for sid in [settings.SHEET_ID_A, settings.SHEET_ID_B]
                if sid and sid.strip()
            ]
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

                self.logger.debug(
                    f"Sheet {sheet_id}: processing {len(worksheets_to_process)} worksheets"
                )

                for worksheet in worksheets_to_process:
                    # Skip tabs that contain Meta/Facebook/Coupler data —
                    # Meta metrics must come from the direct API pipeline only.
                    title_lower = worksheet.title.lower()
                    if any(kw in title_lower for kw in _BLACKLISTED_TAB_KEYWORDS):
                        self.logger.info(
                            f"Skipping blacklisted tab '{worksheet.title}' "
                            f"(Meta data sourced from direct API)"
                        )
                        continue

                    try:
                        rows = await self._extract_worksheet(worksheet)
                        prefix = self._classify_sheet(
                            list(rows[0].keys()) if rows else []
                        )
                        key = f"{prefix}{worksheet.title}"
                        all_worksheets[key] = rows
                        self.logger.debug(
                            f"Extracted {len(rows)} rows from '{worksheet.title}' → {key}"
                        )
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

    async def _extract_worksheet(self, worksheet: Worksheet) -> List[Dict[str, Any]]:
        """Extract all rows from a single worksheet as a list of dicts."""
        try:
            all_values = worksheet.get_all_values()

            if not all_values or len(all_values) < 2:
                self.logger.debug(f"Worksheet '{worksheet.title}' is empty")
                return []

            headers = all_values[0]
            data_rows = all_values[1:]

            data = []
            for row in data_rows:
                while len(row) < len(headers):
                    row.append("")
                row_dict = dict(zip(headers, row[: len(headers)]))
                if any(row_dict.values()):
                    data.append(row_dict)

            return data
        except Exception as e:
            self.logger.warning(f"Error extracting worksheet data: {e}")
            return []

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

    def _parse_quarter_header(self, header: str) -> Optional[datetime]:
        """If ``header`` is a quarter label like 'Q1 2025', return its start date."""
        if not header:
            return None
        m = self._QUARTER_RE.match(str(header).strip())
        if not m:
            return None
        q = int(m.group(1))
        year = int(m.group(2))
        month = {1: 1, 2: 4, 3: 7, 4: 10}[q]
        try:
            return datetime(year, month, 1).date()
        except ValueError:
            return None

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
            return None

        headers = list(rows[0].keys())
        if len(headers) < 3:
            return None

        first_col = headers[0]
        period_cols: List[tuple] = []  # (header, date)
        for h in headers[1:]:
            dt = self._parse_quarter_header(h)
            if dt:
                period_cols.append((h, dt))

        # Require at least 2 period columns to call this a pivot (single-quarter
        # tabs are probably normal row-per-date layouts with one metric).
        if len(period_cols) < 2:
            return None
        # And at least half of the non-first columns must be quarter labels.
        if len(period_cols) < max(2, (len(headers) - 1) // 2):
            return None

        # Normalize the sheet_name to 'exec::' so queries can find it cleanly.
        # Strip any prior retail::/contractor:: prefix from the classifier.
        bare = sheet_name.split("::", 1)[1] if "::" in sheet_name else sheet_name
        tagged = f"exec::{bare}"

        out: List[GoogleSheetMetric] = []
        for row in rows:
            metric_label = (row.get(first_col) or "").strip()
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
                        sheet_name=tagged,
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
