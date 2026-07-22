"""
schemas.py — Pydantic request models for input validation.

Why this matters: right now, routes like `async def register(payload: dict)`
accept literally anything — a missing field, a wrong type, or a malicious
string just gets silently `.get()`'d as None deep inside the function,
often surfacing as a confusing 500 error far from where the real problem
is. Pydantic models validate BEFORE your route body ever runs — a bad
request gets an immediate, clear 422 response listing exactly what's
wrong, and every field arrives already the right type.

Analogy: `payload: dict` is like accepting mail through a slot with no
mailbox — anything-shaped can be shoved through, and you only discover
it's a brick, not a letter, once you're already holding it. A Pydantic
model is the mailbox itself: it only accepts things shaped like real mail
in the first place.

Usage — change a route's signature from:
    async def register(request: Request, payload: dict, ...)
to:
    async def register(request: Request, payload: RegisterRequest, ...)
Then access fields as payload.name / payload.email / payload.password
instead of payload.get("name", "").
"""
from pydantic import BaseModel, EmailStr, Field, field_validator


class RegisterRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)

    @field_validator("name")
    @classmethod
    def strip_name(cls, v: str) -> str:
        return v.strip()


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1)


class RefreshRequest(BaseModel):
    refresh_token: str = Field(..., min_length=1)


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=8, max_length=128)


class VerifyEmailRequest(BaseModel):
    token: str = Field(..., min_length=1)


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str = Field(..., min_length=8, max_length=128)


class OnboardingRequest(BaseModel):
    country: str | None = Field(None, max_length=100)
    language: str | None = Field(None, max_length=50)
    job_title: str | None = Field(None, max_length=150)
    role_summary: str | None = Field(None, max_length=1000)
    company_name: str | None = Field(None, max_length=200)
    sales_methodology: str | None = Field(None, max_length=50)
    primary_goal: str | None = Field(None, max_length=50)
    what_we_sell: str | None = Field(None, max_length=1000)
    complete: bool | None = None


class CreateOrganizationRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)

    @field_validator("name")
    @classmethod
    def strip_name(cls, v: str) -> str:
        return v.strip()


class CreateInviteRequest(BaseModel):
    email: EmailStr
    role: str = Field(..., pattern="^(manager|member)$")
    manager_id: str | None = None


class UpdateMemberRequest(BaseModel):
    role: str | None = Field(None, pattern="^(admin|manager|member)$")
    manager_id: str | None = None