"""Bounded official-source downloads with limited retries and response sizes."""

import io
import time
import urllib.error
import urllib.request

from app.data_sources.errors import SourceContractError


def download_bytes(url: str, *, max_bytes: int, timeout: int = 60, attempts: int = 3) -> bytes:
    if not 1 <= attempts <= 5 or not 1 <= timeout <= 120:
        raise ValueError("Invalid download bounds")
    request = urllib.request.Request(url, headers={"User-Agent": "european-price-cost-monitoring/1.0"})
    for attempt in range(attempts):
        try:
            deadline = time.monotonic() + timeout
            with urllib.request.urlopen(request, timeout=timeout) as response:
                output = io.BytesIO()
                read = getattr(response, "read1", response.read)
                while output.tell() <= max_bytes:
                    if time.monotonic() >= deadline:
                        raise TimeoutError("Official response exceeded attempt duration")
                    chunk = read(min(65536, max_bytes + 1 - output.tell()))
                    if not chunk:
                        break
                    output.write(chunk)
                payload = output.getvalue()
            if len(payload) > max_bytes or not payload:
                raise SourceContractError("Official source response is empty or exceeds size limit")
            return payload
        except (OSError, TimeoutError) as exc:
            retryable = not isinstance(exc, urllib.error.HTTPError) or exc.code in {
                408,
                429,
                500,
                502,
                503,
                504,
            }
            if not retryable or attempt + 1 == attempts:
                raise SourceContractError(
                    "Unable to download official source after bounded attempts"
                ) from exc
            delay = 2**attempt
            if isinstance(exc, urllib.error.HTTPError):
                retry_after = exc.headers.get("Retry-After", "")
                if retry_after.isdigit():
                    delay = min(30, max(delay, int(retry_after)))
            time.sleep(delay)
    raise AssertionError("Unreachable")
