"""Manual CLI and independent Docker scheduler for official price/cost sources."""

import argparse
import json
import logging
import os
import signal
import threading
from datetime import date, datetime, timezone

from app.core.db import engine
from app.ingestion.service import SynchronizationBusy, Synchronizer, synchronization_status
from app.ingestion.sources import SOURCES, SourceConfig

log = logging.getLogger(__name__)


def env_tuple(name, default):
    return (
        tuple(part.strip() for part in os.environ[name].split(",") if part.strip())
        if name in os.environ
        else default
    )


def configuration():
    defaults = SourceConfig()
    return SourceConfig(
        geographies=env_tuple("SYNC_HICP_GEOS", defaults.geographies),
        categories=env_tuple("SYNC_HICP_CATEGORIES", defaults.categories),
        units=env_tuple("SYNC_HICP_UNITS", defaults.units),
        currencies=env_tuple("SYNC_ECB_CURRENCIES", defaults.currencies),
        overlap_days=int(os.getenv("SYNC_OVERLAP_DAYS", "400")),
    )


def interrupted(signum, frame):
    raise KeyboardInterrupt("Synchronization worker stopping")


def scheduler(syncer, *, wait=None):
    wait = wait or threading.Event().wait
    intervals = dict(
        zip(
            SOURCES,
            [
                int(os.getenv("SYNC_FUEL_INTERVAL_SECONDS", "604800")),
                int(os.getenv("SYNC_HICP_INTERVAL_SECONDS", "86400")),
                int(os.getenv("SYNC_ECB_INTERVAL_SECONDS", "21600")),
            ],
            strict=True,
        )
    )
    full_interval = int(os.getenv("SYNC_BACKFILL_INTERVAL_DAYS", "30"))
    if min(intervals.values()) < 60 or full_interval < 1:
        raise ValueError("Scheduling intervals must be >=60 seconds; full backfill >=1 day")
    while True:
        for status in synchronization_status(syncer.engine):
            source = status["source"]
            now = datetime.now(timezone.utc)
            # Retry failures sooner than the weekly fuel cadence, bounded to one hour.
            delay = min(intervals[source], 3600) if status["consecutive_failures"] else intervals[source]
            if (
                status.get("run_status") != "running"
                and status["last_attempt_at"]
                and (now - status["last_attempt_at"]).total_seconds() < delay
            ):
                continue
            full = status["cursor"].get("last_backfill_success")
            mode = (
                "backfill"
                if not full or (now.date() - date.fromisoformat(full)).days >= full_interval
                else "incremental"
            )
            try:
                run_id = syncer.sync(source, mode=mode, trigger="scheduled")
                log.info("%s run %s completed (%s)", source, run_id, mode)
            except SynchronizationBusy:
                log.info("%s already locked by another worker", source)
            except Exception as exc:
                log.error("%s failed: %s; see ingestion_runs", source, type(exc).__name__)
        wait(60)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("sync", "status", "schedule"))
    parser.add_argument("--source", choices=("all", *SOURCES), default="all")
    parser.add_argument("--mode", choices=("incremental", "backfill"), default="incremental")
    parser.add_argument("--since", type=date.fromisoformat, help="Inclusive history start (YYYY-MM-DD)")
    parser.add_argument(
        "--oil-history",
        help="JSON list of archived official weekly workbook URLs, tax_basis, publication_date",
    )
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO)
    signal.signal(signal.SIGTERM, interrupted)
    if args.command == "status":
        statuses = synchronization_status(engine)
        if args.source != "all":
            statuses = [status for status in statuses if status["source"] == args.source]
        print(json.dumps(statuses, default=str, indent=2))
        return 0
    syncer = Synchronizer(
        engine, os.getenv("PRICE_COST_ARTIFACT_ROOT", "/var/lib/price-cost"), config=configuration()
    )
    try:
        if args.command == "schedule":
            scheduler(syncer)
            return 0
        history = ()
        if args.oil_history:
            with open(args.oil_history) as stream:
                history = json.load(stream)
            if not isinstance(history, list):
                parser.error("--oil-history must contain a JSON list")
        failed = False
        for source in SOURCES if args.source == "all" else (args.source,):
            try:
                run_id = syncer.sync(source, mode=args.mode, since=args.since, oil_history=history)
                print(json.dumps(dict(source=source, run_id=run_id)))
            except Exception as exc:
                failed = True
                log.error("%s: %s; see ingestion_runs for audit", source, type(exc).__name__)
        return 1 if failed else 0
    except KeyboardInterrupt:
        log.info("Synchronization interrupted; active publication rolled back")
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
