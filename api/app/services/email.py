"""Email service — SendGrid with console fallback.

If SENDGRID_API_KEY is not set, emails are printed to stdout (safe for local dev).
"""
import logging
from typing import Optional

logger = logging.getLogger(__name__)


def _get_sendgrid():
    """Lazy import SendGrid so the app starts even without the package."""
    try:
        from sendgrid import SendGridAPIClient
        from sendgrid.helpers.mail import Mail
        return SendGridAPIClient, Mail
    except ImportError:
        return None, None


def _settings():
    from app.config import get_settings
    return get_settings()


async def _send(to: str, subject: str, html: str) -> bool:
    """Core send — tries SendGrid, falls back to console log."""
    s = _settings()
    api_key: Optional[str] = getattr(s, "SENDGRID_API_KEY", None)

    if not api_key:
        logger.info(f"[EMAIL MOCK] To: {to} | Subject: {subject}\n{html}")
        return True

    SendGridAPIClient, Mail = _get_sendgrid()
    if not SendGridAPIClient:
        logger.warning("sendgrid package not installed — logging email to console.")
        logger.info(f"[EMAIL MOCK] To: {to} | Subject: {subject}")
        return True

    try:
        sender = getattr(s, "EMAIL_FROM", "noreply@neuranest.ai")
        message = Mail(from_email=sender, to_emails=to, subject=subject, html_content=html)
        client = SendGridAPIClient(api_key)
        client.send(message)
        return True
    except Exception as exc:
        logger.exception(f"Failed to send email to {to}: {exc}")
        return False


async def send_welcome_email(to: str, name: str = "") -> bool:
    display = name or to.split("@")[0]
    subject = "Welcome to NeuraNest — your trend intelligence dashboard is ready"
    html = f"""
<div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;background:#F8FAFC;border-radius:12px;overflow:hidden">
  <div style="background:linear-gradient(135deg,#0F172A,#1E3A5F);padding:36px 32px;text-align:center">
    <div style="display:inline-flex;align-items:center;gap:10px;margin-bottom:16px">
      <div style="width:36px;height:36px;border-radius:9px;background:linear-gradient(135deg,#E16A4A,#6B4EFF);display:flex;align-items:center;justify-content:center">
        <span style="color:#fff;font-size:18px">↗</span>
      </div>
      <span style="color:#fff;font-weight:700;font-size:18px">NeuraNest</span>
    </div>
    <h1 style="color:#fff;font-size:26px;margin:0;font-weight:800">Welcome, {display}! 🎉</h1>
    <p style="color:#94A3B8;margin:8px 0 0;font-size:15px">Your 7-day free trial has started</p>
  </div>
  <div style="padding:32px">
    <p style="color:#0F172A;font-size:15px;line-height:1.7">
      You now have full access to <strong>1,098 trending product topics</strong> with ML opportunity scores,
      competition intelligence, and AI-powered product briefs.
    </p>
    <div style="background:#fff;border-radius:10px;border:1px solid #E2E8F0;padding:20px;margin:20px 0">
      <p style="color:#0F172A;font-weight:700;margin:0 0 12px;font-size:14px">✦ Suggested first steps</p>
      <ol style="color:#475569;font-size:14px;line-height:2;margin:0;padding-left:18px">
        <li>Complete the onboarding wizard to personalise your feed</li>
        <li>Add 3–5 topics to your watchlist</li>
        <li>Set a Stage Change alert on your top topic</li>
      </ol>
    </div>
    <a href="https://app.neuranest.ai/onboarding"
       style="display:block;text-align:center;background:#E16A4A;color:#fff;padding:14px 24px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;margin-top:24px">
      Start Onboarding →
    </a>
  </div>
  <div style="padding:16px 32px;border-top:1px solid #E2E8F0;text-align:center">
    <p style="color:#94A3B8;font-size:12px;margin:0">
      NeuraNest · You're receiving this because you signed up at neuranest.ai<br>
      <a href="#" style="color:#E16A4A">Unsubscribe</a>
    </p>
  </div>
</div>
"""
    return await _send(to, subject, html)


async def send_alert_email(
    to: str,
    alert_type: str,
    topic_name: str,
    details: dict,
) -> bool:
    type_labels = {
        "stage_change":    ("📊 Stage Change Alert", "#2ED3A5"),
        "score_threshold": ("⚡ Score Threshold Alert", "#FFC857"),
        "new_competitor":  ("👥 New Competitor Alert", "#6B4EFF"),
        "price_drop":      ("💰 Price Drop Alert", "#EF4444"),
    }
    label, color = type_labels.get(alert_type, ("🔔 Alert", "#E16A4A"))
    subject = f"{label} — {topic_name} on NeuraNest"
    detail_rows = "".join(
        f"<tr><td style='color:#64748B;padding:4px 0;font-size:13px'>{k}</td>"
        f"<td style='color:#0F172A;font-weight:600;font-size:13px;padding:4px 0 4px 12px'>{v}</td></tr>"
        for k, v in details.items()
    )

    html = f"""
<div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto;background:#F8FAFC;border-radius:12px;overflow:hidden">
  <div style="background:{color};padding:20px 28px">
    <p style="color:#fff;font-size:13px;font-weight:600;margin:0 0 4px;opacity:0.85">{label}</p>
    <h2 style="color:#fff;font-size:22px;margin:0;font-weight:800">{topic_name}</h2>
  </div>
  <div style="padding:24px 28px">
    <table style="width:100%;border-collapse:collapse">{detail_rows}</table>
    <a href="https://app.neuranest.ai/alerts"
       style="display:inline-block;margin-top:20px;background:#E16A4A;color:#fff;padding:11px 22px;border-radius:9px;text-decoration:none;font-weight:600;font-size:14px">
      View Alert →
    </a>
  </div>
  <div style="padding:12px 28px;border-top:1px solid #E2E8F0">
    <p style="color:#94A3B8;font-size:11px;margin:0">NeuraNest · <a href="#" style="color:#E16A4A">Manage alerts</a></p>
  </div>
</div>
"""
    return await _send(to, subject, html)


async def send_weekly_digest(to: str, topics: list) -> bool:
    """Weekly top-5 opportunities digest."""
    rows = "".join(
        f"""<tr style="border-bottom:1px solid #F1F5F9">
          <td style="padding:10px 0;color:#0F172A;font-weight:600;font-size:13px">{i+1}. {t.get('name','')}</td>
          <td style="padding:10px 0;color:#E16A4A;font-weight:700;font-size:13px;text-align:right">{t.get('score',0):.0f}</td>
        </tr>"""
        for i, t in enumerate(topics[:5])
    )
    subject = "NeuraNest Weekly Digest — Your top 5 opportunities this week"
    html = f"""
<div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto;background:#F8FAFC;border-radius:12px;overflow:hidden">
  <div style="background:linear-gradient(135deg,#0F172A,#1E3A5F);padding:24px 28px">
    <h2 style="color:#fff;margin:0;font-size:20px">📈 Weekly Intelligence Digest</h2>
    <p style="color:#94A3B8;margin:4px 0 0;font-size:13px">Your top opportunities this week</p>
  </div>
  <div style="padding:24px 28px">
    <table style="width:100%;border-collapse:collapse">{rows}</table>
    <a href="https://app.neuranest.ai/explore"
       style="display:inline-block;margin-top:20px;background:#E16A4A;color:#fff;padding:11px 22px;border-radius:9px;text-decoration:none;font-weight:600;font-size:14px">
      Explore All Topics →
    </a>
  </div>
</div>
"""
    return await _send(to, subject, html)
