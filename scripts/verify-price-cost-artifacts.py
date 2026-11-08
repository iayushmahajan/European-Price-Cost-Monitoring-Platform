"""Read-only artifact audit, run in the sync container with its raw volume."""
import hashlib
import json
from pathlib import Path

from app.core.db import engine
from sqlalchemy import text

root = Path("/var/lib/price-cost").resolve()
with engine.connect() as connection:
    rows = connection.execute(text("SELECT source_code,storage_path,sha256,byte_size FROM source_artifacts")).mappings().all()
    for row in rows:
        path = (root / row["storage_path"]).resolve()
        assert path.is_relative_to(root)
        payload = path.read_bytes()
        assert len(payload) == row["byte_size"]
        assert hashlib.sha256(payload).hexdigest() == row["sha256"]
    report = {"artifacts_hash_verified": len(rows), "sources": sorted({r["source_code"] for r in rows})}
    print(json.dumps(report))
