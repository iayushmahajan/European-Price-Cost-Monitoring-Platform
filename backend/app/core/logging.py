import json
import logging
from datetime import datetime, timezone

from app.core.config import settings


class JsonFormatter(logging.Formatter):
    def format(self, record):
        payload = {
            "time": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "event": record.getMessage(),
            "logger": record.name,
        }
        for key in ("request_id", "status", "error_code", "timings", "latency_ms", "http_status",
                    "provider", "model", "attempt", "usage", "retry_after"):
            if hasattr(record, key):
                payload[key] = getattr(record, key)
        return json.dumps(payload)


def setup_logging():
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    logging.basicConfig(
        level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO), handlers=[handler], force=True
    )
    logging.getLogger("httpx").setLevel(logging.WARNING)
    # Parser fallback warnings can contain raw model SQL/user text.
    logging.getLogger("sqlglot").setLevel(logging.ERROR)
