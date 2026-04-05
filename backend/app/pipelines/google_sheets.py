"""
Google Sheets data pipeline for I-Dash Analytics Platform.

Reads tabular data from Google Sheets and transforms into GoogleSheetMetric
records with automatic date column detection.
"""

import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import gspread
from gspread.exceptions import GSpreadException
from gspread.worksheet import Worksheet

from app.core.config import settings
from app.models.metrics import GoogleSheetMetric
from app.pipelines.base import BasePipeline

logger = logging.getLogger(__name__)


class GoogleSheetsPipeline(BasePipeline):
    """
    Extract and load data from Google Sheets.

    Connects to Google Sheets via service account credentials and extracts
    tabular data from specified worksheets. Automatically detects date columns
    and transforms data into GoogleSheetMetric records.

    Supports:
    - Multiple worksheets per sheet
    - Automatic date column detection
    - Flexible metric naming
    - Category grouping
    """

    def __init__(
        self,
        sheet_id: str,
        worksheet_names: List[str] = None,
        **kwargs,
    ) -> None:
        """
        Initialize Google Sheets pipeline.

        Args:
            sheet_id: Google Sheets ID (from the URL).
            worksheet_names: List of worksheet names to fetch (default: all).
            **kwargs: Additional arguments passed to BasePipeline.
        """
        super().__init__(name="google_sheets_pipeline", **kwargs)

        self.sheet_id = sheet_id
        self.worksheet_names = worksheet_names

        if not settings.GOOGLE_SHEETS_CREDENTIALS_FILE:
            raise ValueError("GOOGLE_SHEETS_CREDENTIALS_FILE must be configured")

        # Initialize gspread client - handle JSON string or file path
        try:
            import json as _json

            cred_value = settings.GOOGLE_SHEETS_CREDENTIALS_FILE.strip()
            if cred_value.startswith("{"):
                # JSON content stored directly in env var (Railway style)
                cred_info = _json.loads(cred_value)
                self.gc = gspread.service_account_from_dict(cred_info)
            else:
                # Traditional file path
                self.gc = gspread.service_account(filename=cred_value)
        except Exception as e:
            raise ValueError(
                f"Failed to initialize Google Sheets client: {str(e)}"
            )

    async def extract(self) -> Dict[str, Any]:
        """
        Extract data from Google Sheets.

        Opens the specified sheet and extracts data from all worksheets
        (or specified ones only).

        Returns:
            Dictionary with worksheet data:
                - worksheets: Dict mapping worksheet names to their data
        """
        try:
            self.logger.info(f"Extracting data from sheet {self.sheet_id}")

            # Open the spreadsheet
            sheet = self.gc.open_by_key(self.sheet_id)
            self.logger.debug(f"Opened sheet with {len(sheet.worksheets())} worksheets")

            worksheets_data = {}

            # Get worksheets to process
            if self.worksheet_names:
                worksheets_to_process = [
                    ws
                    for ws in sheet.worksheets()
                    if ws.title in self.worksheet_names
                ]
            else:
                worksheets_to_process = sheet.worksheets()

            self.logger.debug(
                f"Processing {len(worksheets_to_process)} worksheets"
            )

            for worksheet in worksheets_to_process:
                try:
                    data = await self._extract_worksheet(worksheet)
                    worksheets_data[worksheet.title] = data
                    self.logger.debug(
                        f"Extracted {len(data)} rows from "
                        f"worksheet '{worksheet.title}'"
                    )
                except Exception as e:
                    self.logger.warning(
                        f"Error extracting worksheet '{worksheet.title}': "
                        f"{str(e)}"
                    )
                    worksheets_data[worksheet.title] = []

            return {"worksheets": worksheets_data}

        except GSpreadException as e:
            self.logger.error(f"Google Sheets API error: {str(e)}")
            raise
        except Exception as e:
            self.logger.error(f"Error extracting Google Sheets data: {str(e)}")
            raise

    async def _extract_worksheet(self, worksheet: Worksheet) -> List[Dict[str, Any]]:
        """Extract all data from a single worksheet."""
        try:
            # Get all values
            all_values = worksheet.get_all_values()

            if not all_values or len(all_values) < 2:
                self.logger.debug(f"Worksheet '{worksheet.title}' is empty")
                return []

            # First row is headers
            headers = all_values[0]
            data_rows = all_values[1:]

            # Convert to list of dicts
            data = []
            for row in data_rows:
                # Ensure row has same length as headers
                while len(row) < len(headers):
                    row.append("")

                row_dict = dict(zip(headers, row[:len(headers)]))
                if any(row_dict.values()):  # Skip completely empty rows
                    data.append(row_dict)

            return data

        except Exception as e:
            self.logger.warning(f"Error extracting worksheet data: {str(e)}")
            return []

    async def transform(self, raw_data: Dict[str, Any]) -> List[GoogleSheetMetric]:
        """
        Transform Google Sheets data into metric records.

        Detects date columns automatically and creates GoogleSheetMetric
        instances for each row.

        Args:
            raw_data: Dictionary with worksheet data.

        Returns:
            List of GoogleSheetMetric instances.
        """
        try:
            records = []

            for sheet_name, rows in raw_data.get("worksheets", {}).items():
                try:
                    if not rows:
                        continue

                    # Detect date column
                    date_column = self._detect_date_column(rows[0].keys())
                    self.logger.debug(
                        f"Sheet '{sheet_name}': detected date column "
                        f"'{date_column}'"
                    )

                    for row_idx, row in enumerate(rows):
                        try:
                            # Get date from row
                            if date_column:
                                date_str = row.get(date_column, "")
                                metric_date = self._parse_date(date_str)
                                if not metric_date:
                                    self.logger.debug(
                                        f"Skipping row {row_idx} with invalid "
                                        f"date: {date_str}"
                                    )
                                    continue
                            else:
                                # Use current date if no date column found
                                metric_date = datetime.now(timezone.utc).date()

                            # Process each column as a metric
                            for col_name, col_value in row.items():
                                # Skip date column
                                if date_column and col_name == date_column:
                                    continue

                                # Skip empty values
                                if not col_value or col_value.strip() == "":
                                    continue

                                # Try to parse as number
                                try:
                                    metric_value = float(col_value)
                                except ValueError:
                                    self.logger.debug(
                                        f"Skipping non-numeric value "
                                        f"'{col_value}' in column '{col_name}'"
                                    )
                                    continue

                                # Infer category from column name
                                category = self._infer_category(col_name)

                                record = GoogleSheetMetric(
                                    sheet_name=sheet_name,
                                    date=metric_date,
                                    metric_name=col_name,
                                    metric_value=metric_value,
                                    category=category,
                                )
                                records.append(record)

                        except Exception as e:
                            self.logger.warning(
                                f"Error processing row {row_idx} in sheet "
                                f"'{sheet_name}': {str(e)}"
                            )
                            continue

                except Exception as e:
                    self.logger.warning(
                        f"Error processing sheet '{sheet_name}': {str(e)}"
                    )
                    continue

            self.logger.info(
                f"Transformed {len(records)} Google Sheet metric records"
            )
            return records

        except Exception as e:
            self.logger.error(
                f"Error transforming Google Sheets data: {str(e)}"
            )
            raise

    def _detect_date_column(self, column_names: List[str]) -> Optional[str]:
        """
        Detect which column contains dates.

        Looks for common date column names and checks if values can be parsed
        as dates.

        Args:
            column_names: List of column header names.

        Returns:
            Name of the date column, or None if not found.
        """
        # Common date column names
        date_patterns = [
            "date",
            "Date",
            "DATE",
            "created_date",
            "created at",
            "timestamp",
            "day",
            "month",
            "time",
        ]

        for pattern in date_patterns:
            for col_name in column_names:
                if pattern.lower() in col_name.lower():
                    return col_name

        return None

    def _parse_date(self, date_str: str) -> Optional[datetime]:
        """
        Parse a date string in various formats.

        Args:
            date_str: String representation of a date.

        Returns:
            Parsed date, or None if parsing fails.
        """
        if not date_str or not isinstance(date_str, str):
            return None

        date_str = date_str.strip()
        if not date_str:
            return None

        # Common date formats
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
                parsed = datetime.strptime(date_str, fmt)
                return parsed.date()
            except ValueError:
                continue

        # Try ISO format
        try:
            parsed = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
            return parsed.date()
        except (ValueError, AttributeError):
            pass

        self.logger.debug(f"Could not parse date: {date_str}")
        return None

    def _infer_category(self, column_name: str) -> str:
        """
        Infer a category from column name.

        Args:
            column_name: Name of the column.

        Returns:
            Inferred category string.
        """
        # Map common patterns to categories
        name_lower = column_name.lower()

        if any(
            keyword in name_lower
            for keyword in ["revenue", "sales", "income", "earnings"]
        ):
            return "Revenue"
        elif any(
            keyword in name_lower for keyword in ["cost", "spend", "expense"]
        ):
            return "Cost"
        elif any(
            keyword in name_lower
            for keyword in ["lead", "signup", "registration"]
        ):
            return "Lead"
        elif any(
            keyword in name_lower for keyword in ["conversion", "customer"]
        ):
            return "Conversion"
        elif any(
            keyword in name_lower
            for keyword in ["impression", "click", "engagement"]
        ):
            return "Engagement"
        else:
            # Use first word of column name
            return column_name.split("_")[0].split(" ")[0].title()
