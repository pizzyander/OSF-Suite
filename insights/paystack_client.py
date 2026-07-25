"""
paystack_client.py — thin wrapper around the Paystack REST API.
"""
import os
import hmac
import hashlib
import httpx

PAYSTACK_SECRET_KEY = os.getenv("PAYSTACK_SECRET_KEY", "")
PAYSTACK_BASE_URL = "https://api.paystack.co"

# CONFIRM before going live: Settings > Preferences on your Paystack
# dashboard must have USD enabled ALONGSIDE your base currency (NGN) —
# this is currently only available to Nigeria/Kenya-based merchants, not
# universal. If unavailable, switch this to "NGN" and reprice in Naira.
CURRENCY = os.getenv("PAYSTACK_CURRENCY", "USD")

_headers = {
    "Authorization": f"Bearer {PAYSTACK_SECRET_KEY}",
    "Content-Type": "application/json",
}


async def _request(method: str, path: str, json: dict | None = None) -> dict:
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.request(method, f"{PAYSTACK_BASE_URL}{path}", headers=_headers, json=json)
    resp.raise_for_status()
    return resp.json()


async def initialize_transaction(
    email: str, amount_usd: float, reference: str, callback_url: str, metadata: dict
) -> dict:
    payload = {
        "email": email,
        "amount": int(round(amount_usd * 100)),
        "currency": CURRENCY,
        "reference": reference,
        "callback_url": callback_url,
        "metadata": metadata,
    }
    return await _request("POST", "/transaction/initialize", payload)


async def charge_authorization(email: str, amount_usd: float, authorization_code: str, reference: str) -> dict:
    payload = {
        "email": email,
        "amount": int(round(amount_usd * 100)),
        "currency": CURRENCY,
        "authorization_code": authorization_code,
        "reference": reference,
    }
    return await _request("POST", "/transaction/charge_authorization", payload)


async def refund_transaction(reference: str) -> dict:
    payload = {"transaction": reference}
    return await _request("POST", "/refund", payload)


def verify_webhook_signature(raw_body: bytes, signature_header: str) -> bool:
    """
    Paystack signs every webhook with HMAC-SHA512 of the raw request body,
    using your secret key. Verifying this is NOT optional — without it,
    anyone who finds your webhook URL could fabricate a fake
    "charge.success" event and unlock paid access for free.
    """
    computed = hmac.new(
        PAYSTACK_SECRET_KEY.encode("utf-8"), raw_body, hashlib.sha512
    ).hexdigest()
    return hmac.compare_digest(computed, signature_header or "")
