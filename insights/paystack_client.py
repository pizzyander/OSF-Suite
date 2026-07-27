"""
paystack_client.py — thin wrapper around the Paystack REST API.
"""
import os
import hmac
import hashlib
import logging
import httpx

PAYSTACK_SECRET_KEY = os.getenv("PAYSTACK_SECRET_KEY", "")
PAYSTACK_BASE_URL = "https://api.paystack.co"

# Confirmed via direct Paystack test: this account has no active USD
# channel ("No active channel to process transaction" — code
# invalid_params). NGN works and is this account's actual settlement
# currency, so that's what we bill in until/unless USD gets activated
# separately with Paystack support.
CURRENCY = os.getenv("PAYSTACK_CURRENCY", "NGN")

_headers = {
    "Authorization": f"Bearer {PAYSTACK_SECRET_KEY}",
    "Content-Type": "application/json",
}


async def _request(method: str, path: str, json: dict | None = None) -> dict:
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.request(method, f"{PAYSTACK_BASE_URL}{path}", headers=_headers, json=json)
    if resp.status_code >= 400:
        # Paystack's actual explanation lives in the response body — a bare
        # raise_for_status() only gives a generic "400 Bad Request" with no
        # way to tell "unsupported currency" apart from "invalid email"
        # apart from anything else. Surface the real message before raising.
        try:
            body = resp.json()
        except Exception:
            body = resp.text
        logging.getLogger(__name__).error(f"Paystack {method} {path} -> {resp.status_code}: {body}")
    resp.raise_for_status()
    return resp.json()


async def initialize_transaction(
    email: str, amount: float, reference: str, callback_url: str, metadata: dict
) -> dict:
    payload = {
        "email": email,
        "amount": int(round(amount * 100)),
        "currency": CURRENCY,
        "reference": reference,
        "callback_url": callback_url,
        "metadata": metadata,
    }
    return await _request("POST", "/transaction/initialize", payload)


async def charge_authorization(email: str, amount: float, authorization_code: str, reference: str) -> dict:
    payload = {
        "email": email,
        "amount": int(round(amount * 100)),
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