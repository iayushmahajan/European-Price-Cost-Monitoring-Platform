"""Sanitized rate-limit classification and per-process provider cooldowns.

Only Retry-After/known provider limit dimensions drive automatic retries. Raw
provider messages are inspected locally and are never logged or returned.
"""

import math
import re
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

import httpx


@dataclass(frozen=True)
class RateLimit:
    code: str
    retry_after: int | None
    temporary: bool


def retry_seconds(value: str | None) -> int | None:
    if not value:
        return None
    try:
        seconds = float(value)
    except ValueError:
        try:
            when = parsedate_to_datetime(value)
            if when.tzinfo is None:
                when = when.replace(tzinfo=timezone.utc)
            seconds = (when - datetime.now(timezone.utc)).total_seconds()
        except (ValueError, TypeError, OverflowError):
            return None
    if not math.isfinite(seconds) or not 0 <= seconds <= 604800:
        return None
    return math.ceil(seconds)


def classify(response: httpx.Response) -> RateLimit:
    try:
        error = response.json().get("error", {}) if len(response.content) <= 100000 else {}
        if not isinstance(error, dict):
            error = {}
    except (ValueError, AttributeError):
        error = {}
    code = str(error.get("code") or error.get("type") or "").lower()
    message = str(error.get("message", "")).lower()
    wait = retry_seconds(response.headers.get("retry-after"))
    if code in {"insufficient_quota", "billing_hard_limit_reached", "billing_not_active"} or any(
        word in message for word in ("insufficient quota", "quota exhausted", "exceeded your current quota", "billing inactive",
                                     "billing not active", "billing hard limit", "credit balance", "credits exhausted")
    ):
        return RateLimit("provider_quota_exceeded", wait, False)
    amounts = re.search(r"\blimit\s*:?\s*([0-9][\d,]{0,20}).*?\brequested\s*:?\s*([0-9][\d,]{0,20})", message)
    oversized = amounts and int(amounts[2].replace(",", "")) > int(amounts[1].replace(",", ""))
    if code == "request_too_large" or "request too large" in message or oversized:
        return RateLimit("provider_request_too_large", wait, False)
    if re.search(r"\b(?:tpd|rpd)\b|(?:tokens|requests) per day", message):
        return RateLimit("provider_daily_limit", wait, False)
    temporary = bool(wait is not None or re.search(r"\b(?:tpm|rpm|itpm|otpm)\b|per minute", message))
    return RateLimit("provider_rate_limited", wait, temporary)


class Cooldowns:
    """Avoid repeated upstream calls during an explicit provider cooldown.

    Shared by threads in one backend process, not a distributed rate limiter.
    """

    def __init__(self):
        self._lock = threading.Lock()
        self._limits: dict[tuple, tuple[float, RateLimit]] = {}

    def remaining(self, key) -> RateLimit | None:
        with self._lock:
            entry = self._limits.get(key)
            if entry is None:
                return None
            remaining = math.ceil(entry[0] - time.monotonic())
            if remaining <= 0:
                del self._limits[key]
                return None
            return RateLimit(entry[1].code, remaining, entry[1].temporary)

    def remember(self, key, limit: RateLimit):
        # Unknown/no-hint failures get a short suppression window, not an auto-retry.
        delay = limit.retry_after if limit.retry_after is not None else 1 if limit.temporary else 60
        with self._lock:
            until = time.monotonic() + max(1, delay)
            previous = self._limits.get(key)
            if previous is None or until > previous[0]:
                self._limits[key] = (until, limit)

    def clear(self):
        with self._lock:
            self._limits.clear()


cooldowns = Cooldowns()
