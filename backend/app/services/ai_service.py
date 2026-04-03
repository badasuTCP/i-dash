"""
AI service for I-Dash Analytics Platform.

Uses Groq API (OpenAI-compatible) to provide intelligent chatbot responses,
automated insights, and natural language report generation.

Groq is free with no expiration and extremely fast (LPU-powered inference).
Falls back gracefully when no API key is configured.
"""

import json
import logging
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


class AIService:
    """
    AI-powered analytics service using Groq API.

    Groq's API is OpenAI-compatible, so we use the openai SDK
    pointed at https://api.groq.com/openai/v1.

    Provides:
    - Chat interface for questions about metrics
    - Automated insight generation
    - Natural language report generation
    - Department-aware data filtering

    Gracefully degrades when no API key is set.
    """

    def __init__(self, api_key: str = "") -> None:
        """
        Initialize AI service with Groq API key.

        Args:
            api_key: Groq API key. If empty, AI features are disabled
                     but the service won't crash.
        """
        self.api_key = api_key
        self.client = None
        self.model = "llama-3.3-70b-versatile"  # Best free model on Groq
        self.logger = logging.getLogger(f"{__name__}.AIService")

        if not api_key:
            self.logger.warning(
                "No Groq API key configured. AI features disabled. "
                "Set GROQ_API_KEY in .env to enable AI-powered insights."
            )
            return

        # Initialize OpenAI-compatible client pointed at Groq
        try:
            from openai import OpenAI
            self.client = OpenAI(
                api_key=api_key,
                base_url="https://api.groq.com/openai/v1",
            )
            self.logger.info("Groq AI service initialized successfully")
        except ImportError:
            self.logger.warning(
                "openai library not installed. AI features will not work. "
                "Install with: pip install openai"
            )

    @property
    def is_available(self) -> bool:
        """Check if AI service is available."""
        return self.client is not None

    def _build_metrics_prompt(self, context: Dict[str, Any]) -> str:
        """
        Build a formatted prompt with current metrics context.

        Args:
            context: Dictionary of metrics and metadata.

        Returns:
            Formatted prompt string with metrics context.
        """
        metrics_text = f"""
Current Analytics Context (Last {context.get('period_days', 30)} days):
- Period: {context.get('start_date')} to {context.get('end_date')}
- Total Revenue: ${context.get('total_revenue', 0):,.2f}
- Total Ad Spend: ${context.get('total_ad_spend', 0):,.2f}
- Total Leads Generated: {context.get('total_leads', 0):,}
- Deals Won: {context.get('total_deals_won', 0):,}
- Blended ROAS: {context.get('blended_roas', 0):.2f}x

"""

        # Division breakdown
        for division in ["cp", "sanitred", "ibos"]:
            div_data = context.get(division)
            if div_data:
                div_label = {
                    "cp": "The Concrete Protector",
                    "sanitred": "Sani-Tred",
                    "ibos": "I-BOS",
                }.get(division, division)
                metrics_text += f"""{div_label}:
- Revenue: ${div_data.get('revenue', 0):,.2f}
- Ad Spend: ${div_data.get('ad_spend', 0):,.2f}
- Conversions: {div_data.get('conversions', 0):,}
- ROAS: {div_data.get('roas', 0):.2f}x

"""

        if "meta_ads" in context:
            meta = context["meta_ads"]
            metrics_text += f"""Meta Ads Performance:
- Spend: ${meta.get('spend', 0):,.2f}
- Conversions: {meta.get('conversions', 0):.0f}
- ROAS: {meta.get('roas', 0):.2f}x

"""

        if "google_ads" in context:
            gads = context["google_ads"]
            metrics_text += f"""Google Ads Performance:
- Spend: ${gads.get('spend', 0):,.2f}
- Clicks: {gads.get('clicks', 0):,}
- Conversions: {gads.get('conversions', 0):.0f}
- ROAS: {gads.get('roas', 0):.2f}x

"""

        if "hubspot" in context:
            hubspot = context["hubspot"]
            metrics_text += f"""HubSpot CRM Metrics:
- Contacts Created: {hubspot.get('contacts_created', 0):,}
- Deals Created: {hubspot.get('deals_created', 0):,}
- Revenue Won: ${hubspot.get('revenue_won', 0):,.2f}

"""

        if "ga4" in context:
            ga4 = context["ga4"]
            metrics_text += f"""Web Analytics (GA4):
- Sessions: {ga4.get('sessions', 0):,}
- Users: {ga4.get('users', 0):,}
- Bounce Rate: {ga4.get('bounce_rate', 0):.1f}%
- Conversion Rate: {ga4.get('conversion_rate', 0):.2f}%

"""

        return metrics_text

    async def chat(
        self,
        question: str,
        context: Dict[str, Any],
        user_department: str = "all",
    ) -> str:
        """
        Answer a question about analytics using Groq.

        Args:
            question: User's question about metrics.
            context: Current metrics context.
            user_department: User's department for filtering.

        Returns:
            AI-generated answer, or a fallback message if unavailable.
        """
        if not self.client:
            return (
                "AI Insights is not configured yet. "
                "Add your Groq API key (GROQ_API_KEY) in Settings "
                "to enable AI-powered analytics."
            )

        try:
            metrics_context = self._build_metrics_prompt(context)

            system_prompt = f"""You are an analytics expert assistant for I-Dash,
an enterprise analytics platform for a company with three divisions:
The Concrete Protector (CP), Sani-Tred, and I-BOS.

You have access to real-time metrics from marketing campaigns (Meta Ads, Google Ads),
web analytics (GA4), sales CRM (HubSpot), and revenue data.

Department Access: {user_department}

Your role is to:
- Answer questions about business metrics and KPIs
- Provide data-driven insights across all three divisions
- Explain trends and patterns
- Offer actionable recommendations
- Be concise but thorough

Current Data:
{metrics_context}

Always cite specific numbers when available and explain what metrics mean for the business."""

            response = self.client.chat.completions.create(
                model=self.model,
                max_tokens=1024,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": question},
                ],
            )

            response_text = response.choices[0].message.content

            self.logger.info(
                f"AI chat response generated for: {question[:50]}..."
            )

            return response_text

        except Exception as e:
            self.logger.error(f"Error in AI chat: {str(e)}")
            return f"Sorry, I encountered an error processing your question. Please try again. ({type(e).__name__})"

    async def generate_insights(
        self,
        context: Dict[str, Any],
        user_department: str = "all",
    ) -> Dict[str, Any]:
        """
        Generate automated insights about recent data trends.

        Args:
            context: Current metrics context.
            user_department: User's department for filtering.

        Returns:
            Dictionary with insights, findings, anomalies, and recommendations.
        """
        if not self.client:
            return {
                "summary": "AI Insights not configured. Set GROQ_API_KEY to enable.",
                "key_findings": [],
                "anomalies": [],
                "recommendations": ["Configure GROQ_API_KEY in .env to enable AI insights"],
            }

        try:
            metrics_context = self._build_metrics_prompt(context)

            system_prompt = f"""You are an analytics expert for a company with three divisions:
The Concrete Protector (CP), Sani-Tred, and I-BOS.

Analyze the provided metrics and generate insights in valid JSON format only.
No markdown, no code blocks, just pure JSON.

Department Access: {user_department}

Return a JSON object with exactly these keys:
- "summary": Brief 2-3 sentence summary of overall performance
- "key_findings": Array of 3-5 important findings (strings)
- "anomalies": Array of unusual patterns or concerning metrics (strings)
- "recommendations": Array of 2-4 actionable recommendations (strings)

Current Data:
{metrics_context}"""

            response = self.client.chat.completions.create(
                model=self.model,
                max_tokens=1024,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {
                        "role": "user",
                        "content": "Analyze these metrics and provide insights as JSON.",
                    },
                ],
            )

            response_text = response.choices[0].message.content

            # Try to parse as JSON
            try:
                # Strip any markdown code blocks if present
                clean = response_text.strip()
                if clean.startswith("```"):
                    clean = clean.split("\n", 1)[1]
                    clean = clean.rsplit("```", 1)[0]
                insights = json.loads(clean)
            except json.JSONDecodeError:
                insights = {
                    "summary": response_text[:300],
                    "key_findings": [response_text],
                    "anomalies": [],
                    "recommendations": [],
                }

            self.logger.info("AI insights generated successfully")
            return insights

        except Exception as e:
            self.logger.error(f"Error generating insights: {str(e)}")
            return {
                "summary": f"Error generating insights: {str(e)}",
                "key_findings": [],
                "anomalies": [],
                "recommendations": [],
            }

    async def generate_report(
        self,
        context: Dict[str, Any],
        report_type: str = "summary",
        user_department: str = "all",
    ) -> str:
        """
        Generate a natural language report for a date range.

        Args:
            context: Current metrics context.
            report_type: Type of report ('summary', 'detailed', 'executive').
            user_department: User's department for filtering.

        Returns:
            AI-generated natural language report.
        """
        if not self.client:
            return (
                "AI report generation is not configured. "
                "Set GROQ_API_KEY in .env to enable."
            )

        try:
            metrics_context = self._build_metrics_prompt(context)

            if report_type == "executive":
                report_guidance = """Create an executive summary for C-level stakeholders.
Focus on:
- High-level business impact across CP, Sani-Tred, and I-BOS
- Key performance vs goals
- Strategic opportunities
- Risk factors
Keep it concise (3-4 paragraphs) but comprehensive."""

            elif report_type == "detailed":
                report_guidance = """Create a detailed analytical report.
Include:
- Metric breakdown by division (CP, Sani-Tred, I-BOS) and channel
- Trend analysis
- Performance vs targets
- Root cause analysis for variances
- Detailed recommendations
Length: 5-7 paragraphs with specific examples."""

            else:  # summary
                report_guidance = """Create a balanced summary report.
Cover:
- Overall performance highlights across all three divisions
- Key metrics and trends
- Notable achievements
- Areas for improvement
Length: 3-4 paragraphs, balanced coverage."""

            system_prompt = f"""You are a business analyst writing a professional report
for a company with three divisions: The Concrete Protector (CP), Sani-Tred, and I-BOS.
Generate a natural language {report_type} report about business performance.

Department Access: {user_department}

{report_guidance}

Current Data:
{metrics_context}"""

            response = self.client.chat.completions.create(
                model=self.model,
                max_tokens=2048,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {
                        "role": "user",
                        "content": f"Generate a {report_type} business performance report.",
                    },
                ],
            )

            report_text = response.choices[0].message.content

            self.logger.info(
                f"AI report ({report_type}) generated successfully"
            )

            return report_text

        except Exception as e:
            self.logger.error(f"Error generating report: {str(e)}")
            return f"Error generating report: {str(e)}"
