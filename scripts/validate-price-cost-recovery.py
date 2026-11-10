"""Explicit failure/recovery drill: creates audit runs but never synthetic facts.

Run in a one-off sync container, with no concurrent source writer. Injects a
pre-download failure for ECB, verifies unchanged facts/revisions and success
metadata, then performs one real incremental recovery through official acquisition.
"""
import hashlib
import json
from datetime import date

from app.core.db import engine
from app.data_sources.errors import SourceContractError
from app.ingestion.service import Synchronizer
from sqlalchemy import text


def fingerprint():
    with engine.connect() as connection:
        digest = hashlib.sha256()
        for table in ("exchange_rate_observations", "exchange_rate_revisions"):
            for row in connection.execute(text(f"SELECT row_to_json(t)::text FROM {table} t ORDER BY id")):
                digest.update(row[0].encode())
        state = connection.execute(text("SELECT last_success_at,status FROM synchronization_states WHERE source_code='ecb_exr'")).one()
        return digest.hexdigest(), state


def unavailable(*args, **kwargs):
    raise SourceContractError("Controlled Milestone 7 validation failure")


before, state = fingerprint()
sync = Synchronizer(engine, "/var/lib/price-cost", fetch=unavailable)
try:
    sync.sync("ecb_exr", trigger="manual", since=date(2025, 1, 1))
except SourceContractError:
    pass
else:
    raise AssertionError("Failure drill unexpectedly succeeded")
after, failed = fingerprint()
assert before == after and failed.status == "failed" and failed.last_success_at == state.last_success_at
run_id = Synchronizer(engine, "/var/lib/price-cost").sync("ecb_exr", trigger="manual", since=date(2025, 1, 1))
recovered, success = fingerprint()
assert recovered == before and success.status in {"current", "stale"}
print(json.dumps({"controlled_download_failure_preserved_facts_and_revisions": True, "last_success_preserved_on_failure": True, "real_recovery_run": run_id, "recovered_status": success.status}))
