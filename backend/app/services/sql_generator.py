import json
import logging
import random
import re
import time
from typing import TypeVar

import httpx
from json_repair import repair_json
from pydantic import BaseModel, ValidationError

from app.api.schemas.query import QueryPlan, QueryRequest
from app.core.config import settings
from app.services.prompt_builder import build_sql_generation_messages
from app.services.provider_limits import classify, cooldowns

logger = logging.getLogger(__name__)
MAX_RATE_LIMIT_RETRY_WAIT_SECONDS = 30

T = TypeVar("T", bound=BaseModel)


class ProviderError(Exception):
    def __init__(self, code: str, message: str, http_status: int = 502, retry_after: int | None = None):
        self.code = code
        self.http_status = http_status
        self.retry_after = retry_after
        super().__init__(message)


def _json_content(content: str) -> str:
    stripped = content.strip()
    if stripped.startswith("{") and stripped.endswith("}"):
        return stripped
    fenced = re.fullmatch(r"```(?:json)?\s*\n?(\{.*\})\s*```", stripped, flags=re.DOTALL | re.IGNORECASE)
    if fenced:
        return fenced.group(1)
    raise ValueError("Expected one JSON object")


def structured_completion(messages: list[dict[str, str]], contract: type[T], *, max_tokens: int = 2500) -> T:
    if not settings.AI_API_URL:
        raise ProviderError("provider_not_configured", "The AI provider is not configured.", 503)
    if settings.AI_PROVIDER == "groq" and not settings.AI_API_KEY:
        raise ProviderError("provider_not_configured", "The AI provider is not configured.", 503)
    headers = {"Authorization": f"Bearer {settings.AI_API_KEY}"} if settings.AI_PROVIDER == "groq" else None
    body = {
        "model": settings.AI_MODEL,
        "messages": messages,
        "temperature": 0,
        "max_tokens": max_tokens,
    }
    if settings.AI_PROVIDER == "groq":
        body["response_format"] = {"type": "json_object"}
    key = (settings.AI_PROVIDER, settings.AI_MODEL, settings.AI_API_URL)
    deadline = time.monotonic() + settings.AI_REQUEST_TIMEOUT_SECONDS
    try:
        with httpx.Client(timeout=settings.AI_REQUEST_TIMEOUT_SECONDS) as client:
            for attempt in range(2):
                pending = cooldowns.remaining(key)
                if pending:
                    logger.info("ai_provider_cooldown_active", extra={"error_code": pending.code,
                                "retry_after": pending.retry_after, "provider": settings.AI_PROVIDER,
                                "model": settings.AI_MODEL})
                    raise ProviderError(pending.code, "The AI provider limit is still active.", 429, pending.retry_after)
                kwargs = {"json": body}
                if headers:
                    kwargs["headers"] = headers
                # Retrying does not restart the overall provider timeout budget.
                if attempt:
                    kwargs["timeout"] = max(0.1, deadline - time.monotonic())
                response = client.post(settings.AI_API_URL, **kwargs)
                if response.status_code != 429:
                    usage = {}
                    if not response.is_error and len(response.content) <= 100000:
                        try:
                            raw = response.json().get("usage", {})
                            usage = {k: raw[k] for k in ("prompt_tokens", "completion_tokens", "total_tokens")
                                     if isinstance(raw, dict) and type(raw.get(k)) is int and raw[k] >= 0}
                        except (ValueError, AttributeError):
                            pass
                    logger.info("ai_provider_response", extra={"http_status": response.status_code,
                                "provider": settings.AI_PROVIDER, "model": settings.AI_MODEL,
                                "attempt": attempt + 1, "usage": usage})
                    break
                limit = classify(response)
                cooldowns.remember(key, limit)
                logger.warning("ai_provider_rate_limit", extra={"http_status": 429,
                               "provider": settings.AI_PROVIDER, "model": settings.AI_MODEL,
                               "attempt": attempt + 1, "error_code": limit.code,
                               "retry_after": limit.retry_after})
                # One extra attempt only for temporary throttling. Never retry quota,
                # daily exhaustion, oversized requests, malformed output or outages.
                delay = max(1, limit.retry_after or 1) + random.uniform(0, 0.25)
                if (attempt == 0 and limit.temporary and delay <= MAX_RATE_LIMIT_RETRY_WAIT_SECONDS
                        and time.monotonic() + delay + 1 < deadline):
                    time.sleep(delay)
                    continue
                pending = cooldowns.remaining(key)
                raise ProviderError(limit.code, "The AI provider request limit was reached.", 429,
                                    pending.retry_after if pending else limit.retry_after)
    except httpx.TimeoutException as exc:
        raise ProviderError("provider_timeout", "The AI provider timed out. Please try again.", 504) from exc
    except httpx.HTTPError as exc:
        raise ProviderError("provider_unavailable", "The AI provider is unavailable.", 503) from exc
    if response.is_error:
        raise ProviderError("provider_unavailable", "The AI provider could not complete the request.", 503)
    try:
        if len(response.content) > 100000:
            raise ValueError("Oversized response")
        content = response.json()["choices"][0]["message"]["content"]
        if not isinstance(content, str):
            raise ValueError("Expected text")
        content = _json_content(content)
        try:
            return contract.model_validate_json(content, strict=True)
        except ValidationError as exc:
            if not any(error["type"] == "json_invalid" for error in exc.errors()):
                raise
            return contract.model_validate_json(repair_json(content), strict=True)
    except (ValueError, TypeError, KeyError, IndexError, ValidationError, json.JSONDecodeError) as exc:
        raise ProviderError(
            "invalid_model_output", "The AI response did not match the required format. Please try again."
        ) from exc


def generate_query_plan(request: QueryRequest) -> QueryPlan:
    return structured_completion(build_sql_generation_messages(request), QueryPlan)
