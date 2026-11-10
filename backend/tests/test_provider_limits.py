from datetime import datetime, timedelta, timezone
from email.utils import format_datetime
from types import SimpleNamespace
from unittest.mock import Mock

import httpx
import pytest

from app.api.schemas.query import QueryPlan
from app.services import provider_limits as limits
from app.services import sql_generator as generator


def limited(message="tokens per minute (TPM): Limit 8000, Used 4213, Requested 4331.", wait="5", code="rate_limit_exceeded"):
    return httpx.Response(429, headers={"Retry-After": wait} if wait is not None else {},
                          json={"error": {"code": code, "message": message}})


def success():
    return httpx.Response(200, json={"choices": [{"message": {"content":
        '{"status":"blocked","interpretation":"Unsupported","explanation":"Unsupported"}'}}],
        "usage": {"prompt_tokens": 100, "completion_tokens": 30, "total_tokens": 130,
                  "secret": "do not log"}})


@pytest.fixture
def clock(monkeypatch):
    state = SimpleNamespace(now=0.0, waits=[])

    def sleep(seconds):
        state.waits.append(seconds)
        state.now += seconds

    monkeypatch.setattr(generator, "time", SimpleNamespace(monotonic=lambda: state.now, sleep=sleep))
    monkeypatch.setattr(limits, "time", SimpleNamespace(monotonic=lambda: state.now))
    monkeypatch.setattr(generator.random, "uniform", lambda *_: 0)
    return state


def complete():
    return generator.structured_completion([{"role": "user", "content": "private question"}], QueryPlan)


def test_temporary_limit_waits_once_and_success_is_still_strictly_validated(monkeypatch, clock, caplog):
    post = Mock(side_effect=[limited(), success()])
    monkeypatch.setattr(httpx.Client, "post", post)
    with caplog.at_level("INFO"):
        assert complete().status == "blocked"
    assert post.call_count == 2 and clock.waits == [5]
    assert post.call_args.kwargs["timeout"] < generator.settings.AI_REQUEST_TIMEOUT_SECONDS
    assert "private question" not in caplog.text and "do not log" not in caplog.text
    assert "ai_provider_rate_limit" in caplog.text
    assert "ai_provider_response" in caplog.text


@pytest.mark.parametrize("response,code", [
    (limited("daily tokens (TPD)", "3600"), "provider_daily_limit"),
    (limited("quota exhausted", None, "insufficient_quota"), "provider_quota_exceeded"),
    (limited("billing inactive", "1"), "provider_quota_exceeded"),
    (limited("Limit 8000, Requested 9000", "1"), "provider_request_too_large"),
    (limited("secret unknown error", None), "provider_rate_limited"),
    (limited(wait="60"), "provider_rate_limited"),
])
def test_permanent_unknown_and_long_limits_are_not_automatically_retried(monkeypatch, clock, response, code):
    post = Mock(return_value=response)
    monkeypatch.setattr(httpx.Client, "post", post)
    with pytest.raises(generator.ProviderError) as error:
        complete()
    assert error.value.code == code
    assert error.value.retry_after is not None
    assert post.call_count == 1 and not clock.waits
    assert "secret" not in str(error.value)
    with pytest.raises(generator.ProviderError):
        complete()
    assert post.call_count == 1


def test_only_one_temporary_retry_and_cooldown_expires(monkeypatch, clock):
    post = Mock(side_effect=[limited(), limited(), success()])
    monkeypatch.setattr(httpx.Client, "post", post)
    with pytest.raises(generator.ProviderError):
        complete()
    assert post.call_count == 2 and clock.waits == [5]
    with pytest.raises(generator.ProviderError):
        complete()
    assert post.call_count == 2
    clock.now += 6
    assert complete().status == "blocked"
    assert post.call_count == 3


def test_no_hint_temporary_backoff_and_invalid_retried_output_still_rejected(monkeypatch, clock):
    post = Mock(side_effect=[limited(wait=None), httpx.Response(200, json={"choices": [{"message": {
        "content": '{"status":"ready","sql":"DROP TABLE x"}'}}]})])
    monkeypatch.setattr(httpx.Client, "post", post)
    with pytest.raises(generator.ProviderError) as error:
        complete()
    assert error.value.code == "invalid_model_output"
    assert post.call_count == 2 and clock.waits == [1]


@pytest.mark.parametrize("value,expected", [("2.1", 3), ("0", 0), ("-2", None),
                                             ("nan", None), ("inf", None), ("999999999", None),
                                             ("not a date", None)])
def test_retry_header_validation(value, expected):
    assert limits.retry_seconds(value) == expected


def test_retry_after_http_date():
    future = format_datetime(datetime.now(timezone.utc) + timedelta(seconds=20), usegmt=True)
    assert 18 <= limits.retry_seconds(future) <= 20


def test_retry_budget_does_not_restart_timeout(monkeypatch, clock):
    monkeypatch.setattr(generator.settings, "AI_REQUEST_TIMEOUT_SECONDS", 10)
    post = Mock(return_value=limited(wait="10"))
    monkeypatch.setattr(httpx.Client, "post", post)
    with pytest.raises(generator.ProviderError):
        complete()
    assert post.call_count == 1 and not clock.waits


def test_billing_upgrade_link_in_temporary_limit_is_not_a_quota_error():
    response = limited("Rate limit on tokens per minute (TPM): Limit 8000, Used 4213, Requested 4331. "
                       "Upgrade at https://console.groq.com/settings/billing")
    limit = limits.classify(response)
    assert limit.code == "provider_rate_limited" and limit.temporary and limit.retry_after == 5


def test_malformed_limit_amounts_fail_conservatively():
    limit = limits.classify(limited("Limit ,,, Requested 123", wait=None))
    assert limit.code == "provider_rate_limited" and not limit.temporary
