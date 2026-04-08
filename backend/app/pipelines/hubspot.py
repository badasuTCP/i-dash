"""
HubSpot data pipeline for I-Dash Analytics Platform.

Extracts contacts, deals, meetings, emails, and tasks from HubSpot API,
aggregates by date, and loads into HubSpotMetric records.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List

from hubspot.crm.contacts import ApiException as HubSpotException
from hubspot.crm.objects import SimplePublicObject
from hubspot import Client

from app.core.config import settings
from app.models.metrics import HubSpotMetric
from app.pipelines.base import BasePipeline

logger = logging.getLogger(__name__)


class HubSpotPipeline(BasePipeline):
    """
    Extract and load HubSpot metrics.

    Connects to HubSpot via their private app API and extracts:
    - Contacts created
    - Deals (created, won, lost)
    - Revenue from closed-won deals
    - Pipeline value from open deals
    - Meetings booked
    - Emails sent
    - Tasks completed

    All metrics are aggregated by date.
    """

    def __init__(
        self,
        start_date: datetime = None,
        end_date: datetime = None,
        **kwargs,
    ) -> None:
        """
        Initialize HubSpot pipeline.

        Args:
            start_date: Start of date range to fetch (default: 30 days ago).
            end_date: End of date range to fetch (default: today).
            **kwargs: Additional arguments passed to BasePipeline.
        """
        super().__init__(name="hubspot_pipeline", **kwargs)

        if end_date is None:
            end_date = datetime.now(timezone.utc).date()
        if start_date is None:
            start_date = (datetime.now(timezone.utc) - timedelta(days=30)).date()

        self.start_date = start_date
        self.end_date = end_date

        # Accept either HUBSPOT_ACCESS_TOKEN (preferred) or HUBSPOT_API_KEY
        hubspot_token = (
            getattr(settings, "HUBSPOT_ACCESS_TOKEN", "") or settings.HUBSPOT_API_KEY
        )
        if not hubspot_token:
            raise ValueError(
                "HubSpot not configured — set HUBSPOT_ACCESS_TOKEN or HUBSPOT_API_KEY"
            )

        self.client = Client(access_token=hubspot_token)

    async def extract(self) -> Dict[str, Any]:
        """
        Extract metrics from HubSpot API.

        Fetches contacts, deals, meetings, emails, and tasks using
        the HubSpot API with pagination support.

        Returns:
            Dictionary with raw data:
                - contacts: List of contact objects
                - deals: List of deal objects
                - meetings: List of meeting engagement objects
                - emails: List of email engagement objects
                - tasks: List of task objects
        """
        try:
            self.logger.info(
                f"Extracting HubSpot data from {self.start_date} to {self.end_date}"
            )

            # Extract contacts
            contacts = await self._get_contacts()
            self.logger.debug(f"Fetched {len(contacts)} contacts")

            # Extract deals
            deals = await self._get_deals()
            self.logger.debug(f"Fetched {len(deals)} deals")

            # Extract meetings
            meetings = await self._get_meetings()
            self.logger.debug(f"Fetched {len(meetings)} meetings")

            # Extract emails
            emails = await self._get_emails()
            self.logger.debug(f"Fetched {len(emails)} emails")

            # Extract tasks
            tasks = await self._get_tasks()
            self.logger.debug(f"Fetched {len(tasks)} tasks")

            return {
                "contacts": contacts,
                "deals": deals,
                "meetings": meetings,
                "emails": emails,
                "tasks": tasks,
            }

        except HubSpotException as e:
            self.logger.error(f"HubSpot API error: {str(e)}")
            raise
        except Exception as e:
            self.logger.error(f"Error extracting HubSpot data: {str(e)}")
            raise

    async def _paginate(self, api, properties: List[str]) -> List[SimplePublicObject]:
        """Generic paginator for HubSpot CRM basic_api.get_page()."""
        results = []
        try:
            page = api.basic_api.get_page(limit=100, properties=properties)
            while page:
                results.extend(page.results or [])
                if page.paging and page.paging.next:
                    page = api.basic_api.get_page(
                        limit=100,
                        after=page.paging.next.after,
                        properties=properties,
                    )
                else:
                    break
        except Exception as e:
            self.logger.warning(f"Error paginating {api}: {str(e)}")
        return results

    async def _get_contacts(self) -> List[SimplePublicObject]:
        return await self._paginate(
            self.client.crm.contacts,
            ["hs_lead_status", "createdate", "lifecyclestage"],
        )

    async def _get_deals(self) -> List[SimplePublicObject]:
        return await self._paginate(
            self.client.crm.deals,
            ["dealname", "dealstage", "amount", "closedate",
             "hs_analytics_num_visits", "createdate"],
        )

    async def _get_meetings(self) -> List[SimplePublicObject]:
        return await self._paginate(
            self.client.crm.objects.meetings,
            ["hs_timestamp", "engagement_type"],
        )

    async def _get_emails(self) -> List[SimplePublicObject]:
        return await self._paginate(
            self.client.crm.objects.emails,
            ["hs_timestamp", "engagement_type"],
        )

    async def _get_tasks(self) -> List[SimplePublicObject]:
        return await self._paginate(
            self.client.crm.objects.tasks,
            ["hs_task_status", "hs_timestamp"],
        )

    async def transform(self, raw_data: Dict[str, Any]) -> List[HubSpotMetric]:
        """
        Transform HubSpot data into metric records aggregated by date.

        Args:
            raw_data: Dictionary with contacts, deals, meetings, emails, tasks.

        Returns:
            List of HubSpotMetric instances.
        """
        try:
            # Dictionary to aggregate metrics by date
            metrics_by_date: Dict[str, Dict[str, Any]] = {}

            # Initialize dates in range
            current_date = self.start_date
            while current_date <= self.end_date:
                date_key = current_date.isoformat()
                metrics_by_date[date_key] = {
                    "date": current_date,
                    "contacts_created": 0,
                    "deals_created": 0,
                    "deals_won": 0,
                    "deals_lost": 0,
                    "revenue_won": 0.0,
                    "pipeline_value": 0.0,
                    "meetings_booked": 0,
                    "emails_sent": 0,
                    "tasks_completed": 0,
                }
                current_date += timedelta(days=1)

            # Process contacts
            for contact in raw_data.get("contacts", []):
                try:
                    create_date = self._extract_date(
                        contact, "createdate"
                    )
                    if create_date and self.start_date <= create_date <= self.end_date:
                        date_key = create_date.isoformat()
                        if date_key in metrics_by_date:
                            metrics_by_date[date_key]["contacts_created"] += 1
                except Exception as e:
                    self.logger.warning(f"Error processing contact: {str(e)}")

            # Process deals
            for deal in raw_data.get("deals", []):
                try:
                    create_date = self._extract_date(deal, "createdate")
                    if create_date and self.start_date <= create_date <= self.end_date:
                        date_key = create_date.isoformat()
                        if date_key in metrics_by_date:
                            metrics_by_date[date_key]["deals_created"] += 1

                    # Check deal stage
                    stage = self._extract_property(deal, "dealstage")
                    close_date = self._extract_date(deal, "closedate")

                    if stage == "closedwon" and close_date:
                        if self.start_date <= close_date <= self.end_date:
                            date_key = close_date.isoformat()
                            if date_key in metrics_by_date:
                                metrics_by_date[date_key]["deals_won"] += 1
                                amount = self._extract_property_float(
                                    deal, "amount"
                                )
                                if amount:
                                    metrics_by_date[date_key]["revenue_won"] += (
                                        amount
                                    )

                    elif stage == "closedlost" and close_date:
                        if self.start_date <= close_date <= self.end_date:
                            date_key = close_date.isoformat()
                            if date_key in metrics_by_date:
                                metrics_by_date[date_key]["deals_lost"] += 1

                    # Pipeline value for open deals
                    elif stage not in ["closedwon", "closedlost"]:
                        amount = self._extract_property_float(deal, "amount")
                        if amount and close_date:
                            if self.start_date <= close_date <= self.end_date:
                                date_key = close_date.isoformat()
                                if date_key in metrics_by_date:
                                    metrics_by_date[date_key][
                                        "pipeline_value"
                                    ] += amount

                except Exception as e:
                    self.logger.warning(f"Error processing deal: {str(e)}")

            # Process meetings
            for meeting in raw_data.get("meetings", []):
                try:
                    meeting_date = self._extract_date(meeting, "hs_timestamp")
                    if meeting_date and self.start_date <= meeting_date <= self.end_date:
                        date_key = meeting_date.isoformat()
                        if date_key in metrics_by_date:
                            metrics_by_date[date_key]["meetings_booked"] += 1
                except Exception as e:
                    self.logger.warning(f"Error processing meeting: {str(e)}")

            # Process emails
            for email in raw_data.get("emails", []):
                try:
                    email_date = self._extract_date(email, "hs_timestamp")
                    if email_date and self.start_date <= email_date <= self.end_date:
                        date_key = email_date.isoformat()
                        if date_key in metrics_by_date:
                            metrics_by_date[date_key]["emails_sent"] += 1
                except Exception as e:
                    self.logger.warning(f"Error processing email: {str(e)}")

            # Process tasks
            for task in raw_data.get("tasks", []):
                try:
                    status = self._extract_property(task, "hs_task_status")
                    task_date = self._extract_date(task, "hs_timestamp")

                    if (
                        status == "completed"
                        and task_date
                        and self.start_date <= task_date <= self.end_date
                    ):
                        date_key = task_date.isoformat()
                        if date_key in metrics_by_date:
                            metrics_by_date[date_key]["tasks_completed"] += 1
                except Exception as e:
                    self.logger.warning(f"Error processing task: {str(e)}")

            # Create HubSpotMetric instances
            records = []
            for date_key, metrics in metrics_by_date.items():
                record = HubSpotMetric(
                    date=metrics["date"],
                    contacts_created=metrics["contacts_created"],
                    deals_created=metrics["deals_created"],
                    deals_won=metrics["deals_won"],
                    deals_lost=metrics["deals_lost"],
                    revenue_won=metrics["revenue_won"],
                    pipeline_value=metrics["pipeline_value"],
                    meetings_booked=metrics["meetings_booked"],
                    emails_sent=metrics["emails_sent"],
                    tasks_completed=metrics["tasks_completed"],
                )
                records.append(record)

            self.logger.info(f"Transformed {len(records)} HubSpot metric records")
            return records

        except Exception as e:
            self.logger.error(f"Error transforming HubSpot data: {str(e)}")
            raise

    def _extract_date(self, obj: SimplePublicObject, property_name: str) -> datetime:
        """Extract and parse date from HubSpot object."""
        try:
            if hasattr(obj, "properties") and obj.properties:
                value = obj.properties.get(property_name)
            else:
                value = getattr(obj, property_name, None)

            if not value:
                return None

            if isinstance(value, str):
                # HubSpot timestamps are in milliseconds
                if value.isdigit() and len(value) == 13:
                    timestamp = int(value) / 1000
                    return datetime.fromtimestamp(timestamp, tz=timezone.utc).date()
                else:
                    return datetime.fromisoformat(value.replace("Z", "+00:00")).date()
            elif isinstance(value, (int, float)):
                return datetime.fromtimestamp(value / 1000, tz=timezone.utc).date()
            elif isinstance(value, datetime):
                return value.date()

            return None
        except Exception as e:
            self.logger.debug(f"Error extracting date from {property_name}: {str(e)}")
            return None

    def _extract_property(self, obj: SimplePublicObject, property_name: str) -> str:
        """Extract string property from HubSpot object."""
        try:
            if hasattr(obj, "properties") and obj.properties:
                return obj.properties.get(property_name)
            return getattr(obj, property_name, None)
        except Exception:
            return None

    def _extract_property_float(
        self, obj: SimplePublicObject, property_name: str
    ) -> float:
        """Extract numeric property from HubSpot object."""
        try:
            if hasattr(obj, "properties") and obj.properties:
                value = obj.properties.get(property_name)
            else:
                value = getattr(obj, property_name, None)

            if value is None:
                return None

            if isinstance(value, (int, float)):
                return float(value)
            elif isinstance(value, str):
                return float(value)

            return None
        except (ValueError, TypeError):
            return None
