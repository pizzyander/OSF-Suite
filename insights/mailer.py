"""
mailer.py — transactional email via Amazon SES.

Every send is non-fatal: if SES isn't configured or a send fails, this
logs the error and returns False rather than raising — the same pattern
used for embedding failures and SQS sends elsewhere in this codebase.
A failed email shouldn't crash the flow that triggered it; the user can
always retry or hit "resend" once SES is fixed.
"""
import os
import boto3
import logging

logger = logging.getLogger(__name__)

AWS_REGION      = os.getenv("AWS_DEFAULT_REGION", "us-east-1")
SES_FROM_EMAIL  = os.getenv("SES_FROM_EMAIL", "")
FRONTEND_URL    = os.getenv("FRONTEND_URL", "http://localhost")


def _send(to_email: str, subject: str, html_body: str, text_body: str) -> bool:
    if not SES_FROM_EMAIL:
        logger.warning(f"SES_FROM_EMAIL not configured — skipping email to {to_email}: {subject}")
        return False

    try:
        ses = boto3.client("ses", region_name=AWS_REGION)
        ses.send_email(
            Source=SES_FROM_EMAIL,
            Destination={"ToAddresses": [to_email]},
            Message={
                "Subject": {"Data": subject},
                "Body": {
                    "Html": {"Data": html_body},
                    "Text": {"Data": text_body},
                },
            },
        )
        return True
    except Exception as e:
        # Common cause in a fresh AWS account: SES sandbox mode only
        # allows sending to pre-verified addresses. Request production
        # access in the SES console before relying on this for real users.
        logger.error(f"SES send failed to {to_email} ({subject}): {repr(e)}")
        return False

def _fmt_amount(amount: float, currency: str) -> str:
    """Formats an amount with the right symbol for NGN or USD — every
    billing email routes through this instead of hardcoding the naira
    sign, now that subscriptions can be billed in either currency."""
    symbol = {"NGN": "\u20a6", "USD": "$"}.get(currency, currency + " ")
    return f"{symbol}{amount:,.0f}"



# ---------------------------------------------------------------------------
# Account / auth
# ---------------------------------------------------------------------------

def send_verification_email(to_email: str, name: str, token: str) -> bool:
    link = f"{FRONTEND_URL}/verify-email?token={token}"
    html = f"""
    <p>Hi {name},</p>
    <p>Confirm your email to finish setting up your OSF-Suite account:</p>
    <p><a href="{link}">Verify my email</a></p>
    <p>This link expires in 48 hours.</p>
    """
    text = f"Hi {name},\n\nConfirm your email: {link}\n\nThis link expires in 48 hours."
    return _send(to_email, "Verify your OSF-Suite email", html, text)


def send_password_reset_email(to_email: str, name: str, token: str) -> bool:
    link = f"{FRONTEND_URL}/reset-password?token={token}"
    html = f"""
    <p>Hi {name},</p>
    <p>Someone requested a password reset for your OSF-Suite account. If this was you:</p>
    <p><a href="{link}">Reset my password</a></p>
    <p>This link expires in 30 minutes. If you didn't request this, you can safely ignore this email.</p>
    """
    text = f"Hi {name},\n\nReset your password: {link}\n\nExpires in 30 minutes. Ignore if this wasn't you."
    return _send(to_email, "Reset your OSF-Suite password", html, text)


def send_invite_email(to_email: str, org_name: str, invited_by_name: str, invite_link: str) -> bool:
    html = f"""
    <p>{invited_by_name} invited you to join <strong>{org_name}</strong> on OSF-Suite.</p>
    <p><a href="{invite_link}">Accept invite</a></p>
    <p>This link expires in 7 days.</p>
    """
    text = f"{invited_by_name} invited you to join {org_name} on OSF-Suite.\n\n{invite_link}\n\nExpires in 7 days."
    return _send(to_email, f"You've been invited to join {org_name} on OSF-Suite", html, text)


# ---------------------------------------------------------------------------
# Meetings / coaching
# ---------------------------------------------------------------------------

def send_meeting_ready_email(to_email: str, name: str, meeting_id: str, summary: str | None = None) -> bool:
    """
    Sent once a meeting's analysis finishes — from process_message_analysis()
    in worker.py, which is the single place status flips to "done" for BOTH
    live and manually-uploaded meetings, so one call site covers both paths.
    """
    link = f"{FRONTEND_URL}/meeting/{meeting_id}"
    summary_html = f"<p>{summary}</p>" if summary else ""
    summary_text = f"\n\n{summary}" if summary else ""
    html = f"""
    <p>Hi {name},</p>
    <p>Your meeting analysis is ready.</p>
    {summary_html}
    <p><a href="{link}">View full report</a></p>
    """
    text = f"Hi {name},\n\nYour meeting analysis is ready.{summary_text}\n\nView it here: {link}"
    return _send(to_email, "Your meeting analysis is ready", html, text)


def send_coaching_plan_email(to_email: str, name: str, plan_text: str) -> bool:
    link = f"{FRONTEND_URL}/coaching"
    formatted = plan_text.replace("\n", "<br>")
    html = f"""
    <p>Hi {name},</p>
    <p>Here's your coaching plan based on your calls this week:</p>
    <p>{formatted}</p>
    <p><a href="{link}">View in app</a></p>
    """
    text = f"Hi {name},\n\nYour coaching plan for this week:\n\n{plan_text}\n\nView in app: {link}"
    return _send(to_email, "Your weekly coaching plan", html, text)


# ---------------------------------------------------------------------------
# Billing
# ---------------------------------------------------------------------------
# NOTE: hard paywall as of this version — no trial period. The old
# send_trial_started_email / send_trial_ending_soon_email are gone;
# replaced with send_subscription_started_email, sent as soon as the
# first (full) payment succeeds. If anything else in the codebase still
# imports the old trial functions, update those call sites too.

def send_subscription_started_email(to_email: str, name: str, plan_label: str, amount: float, period_end_date: str) -> bool:
    html = f"""
    <p>Hi {name},</p>
    <p>Your <strong>{plan_label}</strong> subscription is active — payment of <strong>₦{amount:,.0f}</strong> received.</p>
    <p>Your access runs until <strong>{period_end_date}</strong>, after which it will renew automatically using your saved card.</p>
    """
    text = (f"Hi {name},\n\nYour {plan_label} subscription is active. Payment of ₦{amount:,.0f} received. "
            f"Access runs until {period_end_date}, then renews automatically.")
    return _send(to_email, "Your OSF-Suite subscription is active", html, text)


def send_renewal_receipt_email(to_email: str, name: str, plan_label: str, amount: float, next_charge_date: str) -> bool:
    html = f"""
    <p>Hi {name},</p>
    <p>Payment received — <strong>₦{amount:,.0f}</strong> for your <strong>{plan_label}</strong> plan.</p>
    <p>Your next charge will be on <strong>{next_charge_date}</strong>.</p>
    """
    text = f"Hi {name},\n\nPayment received: ₦{amount:,.0f} for {plan_label}. Next charge: {next_charge_date}."
    return _send(to_email, "Payment receipt — OSF-Suite", html, text)


def send_payment_failed_email(to_email: str, name: str, grace_days_left: int) -> bool:
    link = f"{FRONTEND_URL}/pricing"
    html = f"""
    <p>Hi {name},</p>
    <p>We couldn't charge your card for your OSF-Suite subscription renewal.</p>
    <p>Your access continues for now, but will pause in <strong>{grace_days_left} day(s)</strong> unless this is resolved.</p>
    <p><a href="{link}">Update payment method</a></p>
    """
    text = (f"Hi {name},\n\nWe couldn't charge your card. Access pauses in {grace_days_left} day(s) "
            f"unless resolved.\n\nUpdate payment: {link}")
    return _send(to_email, "Action needed: payment failed", html, text)


def send_access_expired_email(to_email: str, name: str) -> bool:
    link = f"{FRONTEND_URL}/pricing"
    html = f"""
    <p>Hi {name},</p>
    <p>Your OSF-Suite access has paused due to a payment issue we couldn't resolve.</p>
    <p><a href="{link}">Reactivate your subscription</a></p>
    """
    text = f"Hi {name},\n\nYour access has paused due to a payment issue.\n\nReactivate: {link}"
    return _send(to_email, "Your OSF-Suite access has paused", html, text)
