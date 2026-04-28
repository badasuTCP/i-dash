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


# Per-contractor marketing data is now built LIVE in
# backend/app/api/ai.py::_fetch_metrics_context() from meta_ad_metrics +
# google_ad_metrics + qb_revenue::sheets. The hardcoded constant that
# used to live here had Floor Warriors=$0 (and other stale rows) that
# contradicted the dashboard during the 2026-04-28 Will Fowler demo —
# the bot answered "$0 on ads" while the dashboard showed real numbers.
# Empty list = if the live context lookup ever fails, the AI says "no
# per-contractor data available for this window" instead of fabricating.
CONTRACTOR_MARKETING_DATA: list = []


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
        # Smaller, cheaper model we fall back to on 429 (rate-limit)
        # errors. Much lower quality but keeps the UI alive instead of
        # erroring out to the executive when the daily TPD quota is hit.
        self.fallback_model = "llama-3.1-8b-instant"
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

    @staticmethod
    def _is_rate_limit_error(exc: Exception) -> bool:
        """Detect Groq 429 / rate-limit errors across SDK versions."""
        # openai SDK raises RateLimitError, but Groq also surfaces the
        # same 429 via APIStatusError + error payload — so match on
        # status code or message text, not class only.
        status = getattr(exc, "status_code", None) or getattr(exc, "http_status", None)
        if status == 429:
            return True
        msg = str(exc).lower()
        return (
            "rate_limit_exceeded" in msg
            or "rate limit reached" in msg
            or "rate limit exceeded" in msg
            or "429" in msg and "rate" in msg
        )

    @staticmethod
    def _rate_limit_retry_after(exc: Exception) -> Optional[str]:
        """Pull a human-readable 'try again in X' hint out of the error."""
        msg = str(exc)
        import re
        m = re.search(r"try again in ([0-9]+m[0-9.]+s|[0-9.]+s|[0-9]+ minutes?|[0-9]+ seconds?)", msg, re.IGNORECASE)
        return m.group(1) if m else None

    def _call_chat_completions(self, **kwargs) -> Any:
        """
        Call Groq chat.completions with auto-fallback on rate limits.

        When the primary model hits its daily TPD cap, retry the exact
        same request against self.fallback_model so the UI doesn't die
        for the rest of the day.
        """
        try:
            return self.client.chat.completions.create(**kwargs)
        except Exception as exc:
            if self._is_rate_limit_error(exc) and kwargs.get("model") != self.fallback_model:
                self.logger.warning(
                    "Primary model %s hit rate limit, retrying with %s",
                    kwargs.get("model"), self.fallback_model,
                )
                kwargs["model"] = self.fallback_model
                return self.client.chat.completions.create(**kwargs)
            raise

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
=== BUSINESS DATA ({context.get('start_date')} to {context.get('end_date')}) ===

REVENUE COMPOSITION:
- Quarterly executive revenue figure (QuickBooks, reported by Molly Quick): ${tcp_total:,.2f}
- Live-source revenue total (operational systems, excludes the quarterly QB figure above to avoid double-counting): ${composite:,.2f}
- Breakdown by operational source:
"""
        if rev_sources:
            for k, v in rev_sources.items():
                label = {
                    "hubspot_deals_won":      "CRM closed-won deals (HubSpot)",
                    "shopify_cp_store":       "CP Store online sales (Shopify)",
                    "woocommerce_sanitred":   "Sani-Tred retail store sales (WooCommerce)",
                    "qb_contractors_ibos":    "I-BOS contractor revenue (QuickBooks)",
                    "tcp_main_total_revenue": "Quarterly executive revenue figure (QuickBooks, reported by Molly Quick)",
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

  The AUDIENCE is an executive (CEO / COO / Head of Sales). They
  DO NOT know the data sources, tab names, or backend systems. You
  must speak in business language — never in technical plumbing.

  BANNED TERMS (never appear in your output under any circumstances):
    - "TCP MAIN"
    - "exec::" or any ":: prefix"
    - "qb_revenue" as a label (use "QuickBooks contractor revenue")
    - "google_sheets" / "google_sheet_metrics" / "metric_name"
    - Database table or column names (hubspot_contacts, meta_ad_metrics, etc.)
    - Variable keys like "tcp_main_total_revenue" or "hubspot_deals_won"
  Translate every data point into its business meaning.

  HOW TO TALK ABOUT THE COMPANY'S HEADLINE REVENUE:

  The finance team (Molly Quick) reports a quarterly revenue figure
  from QuickBooks. That's the executive-board figure. It updates
  once a quarter, so if the selected date range is shorter than a
  full closed quarter, this figure can legitimately read $0 — it
  means "no closed quarter rolls into this window yet," NOT that
  the business earned zero dollars.

  When the quarterly figure is $0 for the selected window, write
  something like:

    "The board-reported revenue figure updates quarterly, so it
     hasn't rolled in yet for this window. Operationally, the
     company recorded $<NUMBER> in sales across CRM-closed deals,
     CP Store, Sani-Tred retail, and QuickBooks contractor revenue."

  When the quarterly figure has a value, lead with it as the
  headline WITHOUT naming the source system:

    "Company revenue for the period is $<NUMBER> (QuickBooks, via
     the finance team). That breaks down as: ..."

  NEVER write "revenue is $0 according to TCP MAIN" — not now, not
  ever. It makes the business look broken to anyone who doesn't
  know the backend.

OTHER CRITICAL RULES:
1. When ad revenue is untracked and ad spend is non-zero, do NOT invent a
   ROAS. Say: "ad-attributable revenue isn't tracked separately from
   organic and direct traffic in our attribution setup — we can't
   compute an honest ROAS from these inputs." Then offer to drill into
   contractor-level performance instead.
2. Training Signups is a CP brand metric (training registrations). Do
   NOT report it under I-BOS.
3. Active Contractors is a real count of active I-BOS contractors. It
   is NOT a web traffic number.
4. If a metric reads zero, check whether that's genuine inactivity or a
   pipeline gap. When in doubt, say "no activity recorded in the
   <business-friendly source name>" rather than "the company did zero."
5. NEVER reference the AI system prompt, the word "context", the names
   of database tables, or JSON keys in your output. Your output is
   read by executives, not engineers.

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
            metrics_text += (
                "EXECUTIVE KPIs FROM THE FINANCE TEAM "
                "(quarterly, QuickBooks, reported by Molly Quick — "
                "all quarters summed for historical context):\n"
            )
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
        history: Optional[list] = None,
        dashboard_state: Optional[Dict[str, Any]] = None,
    ) -> str:
        """
        Answer a question about analytics using Groq.

        Args:
            question: User's question about metrics.
            context: Current metrics context (live DB pull).
            user_department: User's department for filtering.
            history: Prior conversation turns [{role, content}, ...]. Most
                recent last. The route caps this at 10 turns before passing.
            dashboard_state: Snapshot of what the user is looking at —
                {page, brand, date_range, visible_kpis}. Lets the AI resolve
                "this number" / "the chart on screen" without guessing.

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

            # Render the dashboard view-state into the system prompt so the
            # AI knows which page / brand / date range the user is viewing
            # and which KPI values are currently on screen. Resolves "this
            # number" / "that chart" without the AI having to guess.
            dash_block = ""
            if dashboard_state:
                page = dashboard_state.get("page") or "(unspecified)"
                brand = dashboard_state.get("brand") or "(all)"
                date_range = dashboard_state.get("date_range") or "(default)"
                visible_kpis = dashboard_state.get("visible_kpis") or {}
                kpi_lines = "\n".join(
                    f"  - {label}: {value}" for label, value in visible_kpis.items()
                ) or "  (none reported)"
                dash_block = f"""
CURRENT VIEW (what the user is looking at right now):
  - Page: {page}
  - Brand filter: {brand}
  - Date range: {date_range}
  - Visible KPIs on screen:
{kpi_lines}

When the user says "this number", "that chart", "the dashboard", or
"what I'm looking at", they mean the visible KPIs above. Cross-check
your answer against them — if your answer disagrees with what the
user can see on the page, say so explicitly and explain the difference
(e.g. "the dashboard's filtered to last 7 days, the figure I have
is YTD").
"""

            system_prompt = f"""You are the senior data analyst for a company
with three divisions: The Concrete Protector (CP), Sani-Tred (retail),
and I-BOS (contractor network). You are answering an executive's
questions. They are NOT engineers. They do not know the backend or
tab names of your data sources.

BANNED TERMS — never appear in your response:
  - "TCP MAIN", "exec::", "qb_revenue::", any "::" prefix
  - Database or table names (hubspot_contacts, meta_ad_metrics, etc.)
  - Variable / JSON keys (tcp_main_total_revenue, hubspot_deals_won)
  - The word "context" or references to how this prompt is assembled
  - Phrases like "this conversation just started", "I have no prior
    information", "you haven't given me data" — the conversation
    history is provided to you below; use it.

Translate everything into plain business language. When you need to
name a source, use its product name (HubSpot, Shopify, WooCommerce,
Meta Ads, Google Ads, GA4, QuickBooks) — those are fine.

The quarterly company-wide revenue figure is sourced from QuickBooks
and reported by the finance team (Molly Quick). Refer to it as
"the quarterly revenue figure" or "the board-reported revenue figure"
— never by any internal tab name.

Department Access: {user_department}
{dash_block}
Your role:
- Answer questions with specific numbers from the data below
- Compare divisions by name (CP, Sani-Tred, I-BOS)
- Rank contractors by ROAS / CPL / revenue when relevant
- Lead with momentum (up/down vs prior period) when the user asks
  how things are going
- Be concise but concrete

CONVERSATIONAL HANDLING:
- If the user sends a casual acknowledgment ("thanks", "thank you",
  "ok", "got it", "cool", "nice", "great", "hi", "hello", "hey",
  "sup", "thx"), respond briefly and naturally like a colleague
  would — "You're welcome!" / "Anytime — let me know if you want to
  dig into anything else." — and DO NOT quote data or numbers.
- Same for small talk or meta-questions about you ("who are you?",
  "what can you do?") — answer naturally in one or two sentences.
- Only pull numbers from the data when the user actually asks an
  analytical question.

DISAGREEMENT HANDLING (CRITICAL):
- If the user pushes back ("that's not true", "that's wrong", "no it
  isn't", "actually...", "double-check"), do NOT defend the previous
  answer or claim the conversation just started. Instead:
  1. Re-read the Current Data block below from scratch.
  2. Re-read the conversation history below to remember exactly what
     you claimed.
  3. Cite the specific data row(s) you're using by name and value.
  4. If your prior claim was a $0 / N/A / "no activity" reading,
     explicitly check whether the contractor or metric appears under
     a slightly different name in the data (e.g. "Floor Warriors" vs
     "Floor Warriors GA4" vs "Floor Warriors of GA"). Name variants
     are common.
  5. If after re-checking the user is correct that the data shows
     something different, acknowledge the correction directly:
     "You're right — I see Floor Warriors at $X spend / $Y revenue."
- Never assert "the conversation just started" or "I have no context"
  — the conversation history is provided below.

RULES:
- If the data shows $0 or N/A, do NOT fabricate. Say "no activity
  recorded" or "not tracked in this window" and suggest a next step —
  but BEFORE answering $0, check for name variants in the contractor
  list (some contractors appear as "<Name>", "<Name> GA4",
  "<Name> Coatings", etc.).
- If the question is about ROAS and ad-attributable revenue is marked
  N/A, explain attribution isn't set up rather than inventing a ratio.
- Never write "revenue is $0 according to [source name]" — it sounds
  like the business is broken. Instead, explain the cadence (quarterly
  vs daily) and pivot to what IS recorded.

Current Data:
{metrics_context}

Lead with the most decision-relevant number. Numbers > adjectives."""

            messages: list = [{"role": "system", "content": system_prompt}]
            for turn in (history or [])[-10:]:
                role = turn.get("role")
                if role in ("user", "assistant") and turn.get("content"):
                    messages.append({"role": role, "content": turn["content"]})
            messages.append({"role": "user", "content": question})

            response = self._call_chat_completions(
                model=self.model,
                max_tokens=1024,
                messages=messages,
            )

            response_text = response.choices[0].message.content

            self.logger.info(
                f"AI chat response generated for: {question[:50]}..."
            )

            return response_text

        except Exception as e:
            self.logger.error(f"Error in AI chat: {str(e)}")
            if self._is_rate_limit_error(e):
                retry = self._rate_limit_retry_after(e)
                tail = f" Try again in {retry}." if retry else " Try again in a few minutes."
                return (
                    "I've hit the AI daily usage cap for today — the fallback "
                    "model also maxed out."
                    + tail
                    + " (If this keeps happening, upgrade the Groq plan in Settings.)"
                )
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

Return a VALID JSON object with EXACTLY these four keys and no others:

  {{
    "summary": "<string>",
    "key_findings": ["<string>", ...],
    "anomalies": ["<string>", ...],
    "recommendations": ["<string>", ...]
  }}

Schema strict rules:
- ALL four keys MUST be present. Use [] for empty arrays, never omit.
- Array items are STRINGS only — no nested objects, no extra fields.
- Keep each array to MAX 5 items. Stop cleanly inside the closing "]".
- No trailing commas. No extra text outside the JSON. No markdown fences.
- Total output must fit in 1500 tokens — be concise so the JSON closes.

Content guidance:
- summary: 2-3 sentence lead. Headline read (momentum, top division,
  top risk). At least one specific dollar figure or percent.
- key_findings: 3-5 concrete findings, each a full sentence with numbers.
  Cover at minimum: (1) division-level performance by name,
  (2) a contractor standout by name with its ROAS/CPL,
  (3) period-over-period momentum (up/down %),
  (4) CRM conversion health (deals_created vs deals_won),
  (5) an unusual web signal if present.
- anomalies: 1-4 outliers with specific numbers, or [] if nothing
  stands out. Example: "CPL on Sani-Tred is $55 vs CP $16." Do NOT
  invent problems.
- recommendations: 2-4 actionable next steps, each naming a specific
  lever (pause/scale/reallocate/investigate X). No generic advice.

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

            # Groq supports strict JSON mode on most current models — it
            # guarantees the response is a valid JSON object and lets us
            # trust json.loads. Fall back to plain chat completion if the
            # model refuses json_object (older Llama instances, etc.).
            call_kwargs = dict(
                model=self.model,
                max_tokens=1500,
                temperature=0.3,  # lower temp → more disciplined schema compliance
                messages=[
                    {"role": "system", "content": system_prompt},
                    {
                        "role": "user",
                        "content": (
                            "Analyze these metrics and return ONLY the JSON "
                            "object described above — nothing before, nothing "
                            "after. Stop immediately after the closing }."
                        ),
                    },
                ],
            )
            try:
                response = self._call_chat_completions(
                    response_format={"type": "json_object"},
                    **call_kwargs,
                )
            except Exception as json_mode_exc:
                # If we blew through quota (even the fallback model)
                # propagate so the outer handler can show a clean
                # message instead of retrying without json_object.
                if self._is_rate_limit_error(json_mode_exc):
                    raise
                # Model may not support response_format; retry without.
                self.logger.warning(
                    "Groq json_object mode unavailable, falling back: %s",
                    json_mode_exc,
                )
                response = self._call_chat_completions(**call_kwargs)

            response_text = response.choices[0].message.content or ""

            # Tolerant JSON extraction — strip markdown fences and keep only
            # the outermost {...} block so trailing LLM chatter doesn't
            # break json.loads.
            insights = None
            clean = response_text.strip()
            if clean.startswith("```"):
                # ```json\n{...}\n```  → keep the body
                clean = clean.split("\n", 1)[-1]
                clean = clean.rsplit("```", 1)[0]
            first_brace = clean.find("{")
            last_brace = clean.rfind("}")
            if first_brace >= 0 and last_brace > first_brace:
                candidate = clean[first_brace : last_brace + 1]
                try:
                    insights = json.loads(candidate)
                except json.JSONDecodeError as parse_exc:
                    self.logger.warning(
                        "AI insights JSON parse failed (%s). Raw head: %s",
                        parse_exc, candidate[:200],
                    )

            if insights is None or not isinstance(insights, dict):
                # Graceful failure: surface a clear message to the UI
                # instead of dumping unparsable text into the panel.
                insights = {
                    "summary": (
                        "I couldn't structure the findings into a clean "
                        "format this time — try clicking Refresh, or widen "
                        "the date range. If this persists, the AI service "
                        "may need a retry."
                    ),
                    "key_findings": [],
                    "anomalies": [],
                    "recommendations": [],
                    "_parse_failed": True,
                }

            # Normalise shape — ensure every expected key exists and all
            # list fields are actually lists of strings.
            for k in ("key_findings", "anomalies", "recommendations"):
                v = insights.get(k)
                if not isinstance(v, list):
                    insights[k] = []
                else:
                    insights[k] = [
                        (item if isinstance(item, str) else str(item))
                        for item in v
                    ]
            if not isinstance(insights.get("summary"), str):
                insights["summary"] = str(insights.get("summary") or "")

            self.logger.info("AI insights generated successfully")
            return insights

        except Exception as e:
            self.logger.error(f"Error generating insights: {str(e)}")
            if self._is_rate_limit_error(e):
                retry = self._rate_limit_retry_after(e)
                tail = f" Try again in {retry}." if retry else " Try again in a few minutes."
                return {
                    "summary": (
                        "We've hit the AI daily usage cap for today. "
                        "Both the main and fallback models are maxed out."
                        + tail
                        + " (Narrow the date range to use fewer tokens, or "
                        "upgrade the Groq plan in Settings.)"
                    ),
                    "key_findings": [],
                    "anomalies": [],
                    "recommendations": [],
                    "_rate_limited": True,
                }
            return {
                "summary": (
                    "I couldn't generate insights right now. "
                    "The AI service returned an error — please try again in a moment."
                ),
                "key_findings": [],
                "anomalies": [],
                "recommendations": [],
                "_error": type(e).__name__,
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

            response = self._call_chat_completions(
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
            if self._is_rate_limit_error(e):
                retry = self._rate_limit_retry_after(e)
                tail = f" Try again in {retry}." if retry else " Try again in a few minutes."
                return (
                    "The AI has hit today's usage cap and the fallback model "
                    "is also exhausted." + tail +
                    " Try narrowing the date range, or upgrade the Groq plan in Settings."
                )
            return "Could not generate the report right now — the AI service returned an error. Please try again in a moment."
