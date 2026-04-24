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


# ── Contractor-level marketing data (from Looker / Google Sheets / GA4) ──
# This data feeds the AI until the pipeline populates per-contractor metrics
# in the database.  Updated alongside the frontend CONTRACTORS array.
CONTRACTOR_MARKETING_DATA = [
    {"name": "Beckley Concrete Decor",      "spend": 37749, "leads": 290, "clicks": 87728, "revenue": 392470, "roas": 47, "cpl": 130.17},
    {"name": "Tailored Concrete Coatings",  "spend": 15887, "leads": 275, "clicks": 29097, "revenue": 0,      "roas": None, "cpl": 57.77},
    {"name": "SLG Concrete Coatings",       "spend": 11328, "leads": 42,  "clicks": 13388, "revenue": 47790,  "roas": 40, "cpl": 269.72},
    {"name": "Columbus Concrete Coatings",  "spend": 5180,  "leads": 10,  "clicks": 87260, "revenue": 113720, "roas": 26, "cpl": 518.00},
    {"name": "TVS Coatings",                "spend": 4502,  "leads": 16,  "clicks": 10995, "revenue": 0,      "roas": None, "cpl": 281.36},
    {"name": "Eminence",                    "spend": 0,     "leads": 3,   "clicks": 0,     "revenue": 330770, "roas": None, "cpl": 0},
    {"name": "PermaSurface",                "spend": 0,     "leads": 2,   "clicks": 0,     "revenue": 156330, "roas": None, "cpl": 0},
    {"name": "Diamond Topcoat",             "spend": 0,     "leads": 89,  "clicks": 0,     "revenue": 113730, "roas": None, "cpl": 0},
    {"name": "Floor Warriors",              "spend": 0,     "leads": 0,   "clicks": 0,     "revenue": 0,      "roas": None, "cpl": 0},
    {"name": "Graber Design Coatings",      "spend": 0,     "leads": 0,   "clicks": 0,     "revenue": 0,      "roas": None, "cpl": 0},
    {"name": "Decorative Concrete Idaho",   "spend": 0,     "leads": 0,   "clicks": 0,     "revenue": 0,      "roas": None, "cpl": 0},
    {"name": "Reeves Concrete Solutions",   "spend": 0,     "leads": 0,   "clicks": 0,     "revenue": 0,      "roas": None, "cpl": 0},
    {"name": "Elite Pool Coatings",         "spend": 0,     "leads": 0,   "clicks": 0,     "revenue": 0,      "roas": None, "cpl": 0},
]


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
        # Revenue composition — pulled live from each source. The context
        # includes both individual sources and a composite. Important: NEVER
        # invent a ROAS figure from total revenue / ad spend; the revenue
        # sources mix ad-attributable and organic/direct/B2B.
        rev_sources = context.get("revenue_sources", {}) or {}
        tcp_total = context.get("total_revenue_tcp_main", 0) or 0
        composite = context.get("composite_revenue_ex_tcp", 0) or 0

        metrics_text = f"""
=== FULL SYSTEM DATA ({context.get('start_date')} to {context.get('end_date')}) ===

REVENUE COMPOSITION (live from each pipeline):
- TCP MAIN Total Revenue (canonical exec figure, quarterly): ${tcp_total:,.2f}
- Composite of live sources (excluding TCP MAIN to avoid double-counting): ${composite:,.2f}
- Breakdown by source:
"""
        if rev_sources:
            for k, v in rev_sources.items():
                label = {
                    "hubspot_deals_won":    "HubSpot revenue_won (CRM deals — training + B2B)",
                    "shopify_cp_store":     "Shopify CP Store orders",
                    "woocommerce_sanitred": "WooCommerce Sani-Tred orders",
                    "qb_contractors_ibos":  "QB contractor revenue (I-BOS)",
                    "tcp_main_total_revenue": "TCP MAIN Total Revenue (quarterly rollup)",
                }.get(k, k)
                metrics_text += f"  - {label}: ${v:,.2f}\n"
        else:
            metrics_text += "  - (no revenue recorded in any source for this window)\n"

        metrics_text += f"""
PAID MARKETING (Meta + Google Ads, live, date-filtered):
- Total Ad Spend: ${context.get('total_ad_spend', 0):,.2f}
- Total Ad Leads: {context.get('total_leads', 0):,}
- HubSpot Deals Won in period: {context.get('total_deals_won', 0):,}
- Blended ROAS: {context.get('blended_roas', 'N/A')}

HOW TO WRITE ABOUT REVENUE — READ CAREFULLY:

  TCP MAIN is a QUARTERLY executive rollup sourced from the QB
  datasheet, reported by Molly Quick. It records one data point per
  quarter (Q1 2025, Q2 2025, Q3 2025, Q4 2025, Q1 2026...). If the
  selected date range does NOT overlap a full quarter boundary, the
  TCP MAIN figure for that window may read $0 — that means "no
  quarter rolled into this range yet," NOT "the business earned zero."

  NEVER write phrasing like "revenue is $0 according to TCP MAIN" —
  it makes the business look broken. Instead, when TCP MAIN is $0
  for the selected window:
    - Acknowledge the quarterly cadence: "TCP MAIN is a quarterly
      executive rollup from the QB datasheet, summed across quarters
      that overlap the selected range."
    - Pivot to the composite / live sources for the actual revenue
      picture: "For this window, live-source revenue totals $<NUMBER>
      across HubSpot deals, Shopify, WooCommerce, and QB contractor
      records."

  When TCP MAIN has a non-zero figure, lead with it as the headline:
    "The executive headline figure from TCP MAIN (QB datasheet,
     reported by Molly Quick) is $<NUMBER>, comprised of..."

OTHER CRITICAL RULES:
1. When ad revenue is untracked and ad spend is non-zero, do NOT invent a
   ROAS. Say: "ad-attributable revenue is not tracked separately from
   organic/direct/B2B in this system — ROAS can't be computed from these
   inputs." Then offer to drill into by-contractor performance instead.
2. Training Signups is a CP-brand metric (HubSpot contacts flagged
   as training leads). Do NOT report it under I-BOS.
3. Active Contractors is a real count of rows in the `contractors`
   table with active=true and division='i-bos'. NOT GA4 visits.
4. If a metric in this context is zero, check whether that's genuinely
   zero activity or a pipeline gap. When in doubt, say "no activity
   recorded in <source-name>" rather than "the company did zero."

"""
        if "meta_ads" in context:
            meta = context["meta_ads"]
            metrics_text += f"""META ADS (Facebook/Instagram) — ALL TIME:
- Total Spend: ${meta.get('total_spend', meta.get('spend', 0)):,.2f}
- Total Conversions/Leads: {meta.get('total_conversions', meta.get('conversions', 0)):,.0f}
- Avg ROAS: {meta.get('avg_roas', meta.get('roas', 0)):.2f}x
- Records: {meta.get('total_records', 0):,}
"""
            by_contractor = meta.get("by_contractor", [])
            if by_contractor:
                metrics_text += "Per-Contractor Meta Ads Spend:\n"
                for c in by_contractor:
                    cpl = f"${c['spend'] / max(c['leads'], 1):.2f}" if c['leads'] > 0 else "N/A"
                    metrics_text += (
                        f"  - {c['name']}: Spend ${c['spend']:,.2f}, "
                        f"Leads {c['leads']:,}, Clicks {c['clicks']:,}, CPL {cpl}\n"
                    )
            metrics_text += "\n"

        if "google_ads" in context:
            gads = context["google_ads"]
            metrics_text += f"""GOOGLE ADS — ALL TIME:
- Total Spend: ${gads.get('total_spend', gads.get('spend', 0)):,.2f}
- Total Conversions: {gads.get('total_conversions', gads.get('conversions', 0)):,.0f}
- Records: {gads.get('total_records', 0):,}
Note: CID 2823564937 = Sani-Tred, CID 6754610688 = Tailored, CID 2957400868 = SLG

"""

        if "hubspot" in context:
            hubspot = context["hubspot"]
            metrics_text += f"""HUBSPOT CRM — ALL TIME:
- Contacts Created: {hubspot.get('contacts_created', 0):,}
- Deals Created: {hubspot.get('deals_created', 0):,}
- Deals Won: {hubspot.get('deals_won', 0):,}
- Revenue Won: ${hubspot.get('revenue_won', 0):,.2f}
- Meetings Booked: {hubspot.get('meetings_booked', 0):,}
- Pipeline Value: ${hubspot.get('pipeline_value', 0):,.2f}
- Tasks Completed: {hubspot.get('tasks_completed', 0):,}

"""

        if "ga4" in context:
            ga4 = context["ga4"]
            metrics_text += f"""WEB ANALYTICS (GA4) — ALL TIME:
- Total Sessions: {ga4.get('total_sessions', ga4.get('sessions', 0)):,}
- Total Users: {ga4.get('total_users', ga4.get('users', 0)):,}
- Avg Bounce Rate: {ga4.get('avg_bounce_rate', ga4.get('bounce_rate', 0)):.1f}%

"""

        if "woocommerce" in context:
            wc = context["woocommerce"]
            metrics_text += f"""WOOCOMMERCE (Sani-Tred Retail Store) — ALL TIME:
- Total Orders: {wc.get('total_orders', 0):,}
- Total Revenue: ${wc.get('total_revenue', 0):,.2f}
- Avg Order Value: ${wc.get('avg_order_value', 0):,.2f}
- Products in Catalog: {wc.get('product_count', 0):,}

"""

        if "google_sheets_kpis" in context:
            kpis = context["google_sheets_kpis"]
            metrics_text += "EXECUTIVE KPIs (Google Sheets · TCP MAIN — all quarters summed):\n"
            for k, v in kpis.items():
                metrics_text += f"  - {k}: {v:,.2f}\n"
            metrics_text += "\n"

        if "active_contractors" in context:
            contractors_list = context["active_contractors"]
            metrics_text += f"ACTIVE I-BOS CONTRACTORS ({len(contractors_list)}):\n"
            for c in contractors_list:
                status = f" [Ad: {c['ad_status']}]" if c.get("ad_status") else ""
                metrics_text += f"  - {c['name']}{status}\n"
            metrics_text += "\n"

        if "by_brand" in context:
            by_brand = context["by_brand"]
            metrics_text += "PAID MARKETING BREAKDOWN BY DIVISION (for the selected window):\n"
            for slug, row in by_brand.items():
                label = {"cp": "CP (The Concrete Protector)", "sanitred": "Sani-Tred (Retail)", "ibos": "I-BOS (Contractor network)"}.get(slug, slug)
                metrics_text += (
                    f"  - {label}: Spend ${row['ad_spend']:,.2f}, "
                    f"Leads {row['ad_leads']:,}, Clicks {row['ad_clicks']:,}, "
                    f"CPL ${row['cost_per_lead']:,.2f}\n"
                )
            metrics_text += "\n"

        ranking = context.get("contractor_roas_ranking")
        if ranking:
            metrics_text += (
                f"I-BOS CONTRACTOR ROAS RANKING (Meta ad spend vs QB revenue, "
                f"{ranking.get('total_ranked', 0)} contractors ranked):\n"
            )
            if ranking.get("top_3"):
                metrics_text += "  Top 3 by ROAS:\n"
                for c in ranking["top_3"]:
                    metrics_text += (
                        f"    - {c['name']}: Spend ${c['spend']:,.2f}, "
                        f"Leads {c['leads']}, Revenue ${c['revenue']:,.2f}, "
                        f"ROAS {c['roas']}x, CPL ${c['cpl']:,.2f}\n"
                    )
            if ranking.get("bottom_3"):
                metrics_text += "  Bottom 3 by ROAS (spend > $100 only):\n"
                for c in ranking["bottom_3"]:
                    metrics_text += (
                        f"    - {c['name']}: Spend ${c['spend']:,.2f}, "
                        f"Leads {c['leads']}, Revenue ${c['revenue']:,.2f}, "
                        f"ROAS {c['roas']}x, CPL ${c['cpl']:,.2f}\n"
                    )
            metrics_text += "\n"

        prior = context.get("prior_period")
        if prior:
            metrics_text += (
                f"PRIOR PERIOD COMPARISON ({prior.get('period_start')} to "
                f"{prior.get('period_end')}) — same length as the current window:\n"
                f"  - Prior Ad Spend: ${prior.get('ad_spend', 0):,.2f}\n"
                f"  - Prior Ad Leads: {prior.get('ad_leads', 0):,}\n"
                f"  - Prior HubSpot Deals Won: {prior.get('hubspot_deals_won', 0):,}\n"
                f"  - Prior HubSpot Revenue Won: ${prior.get('hubspot_revenue_won', 0):,.2f}\n"
                "  → Use this to compute % change and lead with a momentum read.\n\n"
            )

        # ── Per-contractor marketing spend (I-BOS division) ──────────
        contractors = context.get("contractors", CONTRACTOR_MARKETING_DATA)
        if contractors:
            metrics_text += "I-BOS Contractor Marketing Spend (2026 YTD):\n"
            # Sort by spend descending for easy ranking
            sorted_c = sorted(contractors, key=lambda c: c.get("spend", 0), reverse=True)
            for c in sorted_c:
                spend = c.get("spend", 0)
                leads = c.get("leads", 0)
                revenue = c.get("revenue", 0)
                roas = c.get("roas")
                cpl = c.get("cpl", 0)
                roas_str = f"{roas}x" if roas else "N/A"
                metrics_text += (
                    f"- {c['name']}: Spend=${spend:,.0f}, "
                    f"Leads={leads:,}, Revenue=${revenue:,.0f}, "
                    f"ROAS={roas_str}, CPL=${cpl:,.2f}\n"
                )
            metrics_text += "\n"

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
web analytics (GA4), sales CRM (HubSpot), revenue data, and per-contractor
marketing spend for all 13 I-BOS contractors.

Department Access: {user_department}

Your role is to:
- Answer questions about business metrics and KPIs
- Provide data-driven insights across all three divisions
- Compare contractor performance (spend, leads, revenue, ROAS, CPL)
- Explain trends and patterns
- Offer actionable recommendations
- Be concise but thorough

IMPORTANT: If a question asks about data you do not have (e.g. a metric that
shows $0 or N/A for all contractors), respond with:
"That data is currently syncing from the pipeline. Please check back shortly
or verify the integration on the Data Pipelines page."
Do NOT fabricate numbers or give generic answers unrelated to the question.

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

            system_prompt = f"""You are the senior data analyst for a holding company
with three divisions: The Concrete Protector (CP), Sani-Tred (retail), and
I-BOS (contractor network).

You are writing the Key Findings panel that an executive will read WITHOUT
you being present. Talk like the analyst in the room — specific, numeric,
opinionated where the data supports it. Never write generic observations.

Department Access: {user_department}

Return a JSON object with EXACTLY these keys (no markdown, no code blocks,
pure JSON):
- "summary": 2-3 sentence lead. Start with the headline read (momentum, top
  division, or top risk). Cite at least one specific dollar figure or percent.
- "key_findings": 3-5 concrete findings, each a full sentence with numbers.
  Cover these angles at minimum:
    1. Division-level performance — name CP, Sani-Tred, and I-BOS by name.
       Which one is pulling the weight, which is lagging.
    2. Contractor standout — by name — top by ROAS or by revenue.
       Use the ROAS ranking in the context.
    3. Period-over-period momentum — use the PRIOR PERIOD COMPARISON block
       to say whether spend/leads/deals are up or down vs the prior window.
    4. CRM conversion health — deals_created vs deals_won, pipeline_value.
    5. Web / traffic signal if unusual.
- "anomalies": 1-4 outliers worth flagging. Use numbers. Examples:
  "CPL on {{brand}} is $X vs cohort average $Y." NOT "CPL might be high."
  Skip this section if nothing stands out — don't invent problems.
- "recommendations": 2-4 actionable next steps tied to findings. Each must
  name the specific lever (pause/scale a campaign, reallocate to a named
  contractor, investigate a specific metric). NO generic "optimise marketing."

HARD RULES:
- You have per-brand breakdown in the "PAID MARKETING BREAKDOWN BY DIVISION"
  block. Use it. Naming divisions without numbers is a fail.
- You have prior-period numbers in the "PRIOR PERIOD COMPARISON" block.
  Compute % change and say up or down.
- You have contractor ROAS ranking. Use specific contractor names.
- Never write "revenue is $0 according to TCP MAIN" — see the rules in
  the metrics context.
- If a field in the context says "N/A — ad-attributable revenue is not
  tracked separately", do NOT compute a ROAS from total revenue / spend.
  Say so and recommend investigating attribution.
- Today's date context: this data window is {context.get('start_date')} to
  {context.get('end_date')}. That's {context.get('period_days')} days.

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
