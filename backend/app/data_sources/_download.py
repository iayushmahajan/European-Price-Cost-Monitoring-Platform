"""Small bounded downloader shared by optional live-source smoke tests."""

import urllib.request

from app.data_sources.errors import SourceContractError


def download_bytes(url: str, *, max_bytes: int, timeout: int = 60) -> bytes:
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "european-price-cost-monitoring-poc/1.0"},
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            payload = response.read(max_bytes + 1)
    except OSError as exc:
        raise SourceContractError(f"Unable to download official source: {url}") from exc
    if len(payload) > max_bytes:
        raise SourceContractError("Official source response exceeded the configured size limit")
    return payload
