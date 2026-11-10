"""Deterministic ingestion contracts and real PostgreSQL transactional tests."""

import hashlib
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timezone
from decimal import Decimal
from threading import Event
from unittest.mock import patch

import pytest
from sqlalchemy import create_engine, func, select, text
from sqlalchemy.orm import Session

from app.data_sources.contracts import TaxBasis
from app.data_sources.errors import SourceContractError
from app.data_sources.oil_bulletin import WeeklyOilBulletinAdapter
from app.ingestion.artifacts import ArtifactStore
from app.ingestion.freshness import ecb_publication_day, freshness
from app.ingestion.service import FACTS, SynchronizationBusy, Synchronizer, synchronization_status
from app.ingestion.sources import SOURCES, Acquired, SourceConfig, acquire, discover_oil
from app.models import price_cost as m
from tests.test_source_adapters import (
    ECB_PAYLOAD,
    HICP_PAYLOAD,
    OIL_PAYLOAD,
    OIL_WITHOUT_TAX_PAYLOAD,
    _ecb_adapter,
    _hicp_adapter,
    _oil_mutation,
)

NOW = datetime(2026, 11, 8, tzinfo=timezone.utc)
TODAY = NOW.date()


def oil_page(without=True):
    bases = ["with", "without"] if without else ["with"]
    return (
        "<html>"
        + "".join(
            f"<article><div>Prices {basis} taxes latest prices (xlsx)</div><div>5 November 2026</div>"
            f'<a href="/document/download/{basis}?filename=old-2024.xlsx">Download</a></article>'
            for basis in bases
        )
        + "</html>"
    ).encode()


def items(source):
    if source == SOURCES[0]:
        return [
            Acquired("https://energy.ec.europa.eu/landing", oil_page(), "html", None, NOW),
            *[
                Acquired(
                    f"https://energy.ec.europa.eu/{basis.value}",
                    payload,
                    "xlsx",
                    WeeklyOilBulletinAdapter(tax_basis=basis, publication_date=date(2026, 11, 5)).parse(
                        payload
                    ),
                    NOW,
                    date(2026, 11, 5),
                )
                for basis, payload in [
                    (TaxBasis.WITH_TAX, OIL_PAYLOAD),
                    (TaxBasis.WITHOUT_TAX, OIL_WITHOUT_TAX_PAYLOAD),
                ]
            ],
        ]
    adapter, payload, ext = (
        (_hicp_adapter(), HICP_PAYLOAD, "json")
        if source == SOURCES[1]
        else (_ecb_adapter(), ECB_PAYLOAD, "csv")
    )
    return [Acquired(adapter.source_url, payload, ext, adapter.parse(payload), NOW)]


def test_discovery_uses_component_publication_and_rejects_ambiguity():
    links = discover_oil(oil_page())
    assert {basis for basis, _, _ in links} == set(TaxBasis)
    assert all(published == date(2026, 11, 5) for _, _, published in links)
    for payload in [
        oil_page(False),
        oil_page().replace(b"energy", b"evil") + oil_page(),
        oil_page().replace(b"/document/download/with?", b"https://evil.example/document/download/with?"),
    ]:
        with pytest.raises(SourceContractError):
            discover_oil(payload)


def test_content_addressing_deduplicates_and_detects_corruption(tmp_path):
    store = ArtifactStore(tmp_path)
    digest, path = store.put(SOURCES[0], OIL_PAYLOAD, "xlsx")
    assert digest == hashlib.sha256(OIL_PAYLOAD).hexdigest()
    assert path == f"raw/{SOURCES[0]}/{digest}.xlsx"
    assert store.put(SOURCES[0], OIL_PAYLOAD, "xlsx") == (digest, path)
    (tmp_path / path).write_bytes(b"corrupt")
    with pytest.raises(ValueError, match="hash mismatch"):
        store.put(SOURCES[0], OIL_PAYLOAD, "xlsx")
    for source in ["../escape", "/tmp", "a/b"]:
        with pytest.raises(ValueError):
            store.put(source, b"x", "json")


def test_publication_gaps_and_dynamic_freshness():
    for day in [date(2026, 4, 3), date(2026, 4, 6), date(2026, 12, 25), date(2026, 11, 8)]:
        assert not ecb_publication_day(day)
    assert freshness(SOURCES[2], date(2026, 11, 6), TODAY) == "current"
    assert freshness(SOURCES[2], date(2026, 4, 2), date(2026, 4, 7)) == "current"
    assert freshness(SOURCES[2], date(2026, 11, 5), TODAY) == "stale"


def test_acquisition_plans_filter_and_overlap():
    calls = []

    def fail(url, **kwargs):
        calls.append(url)
        raise SourceContractError("fixture stop")

    for source, expected in [(SOURCES[1], "sinceTimePeriod=2025-10"), (SOURCES[2], "startPeriod=2025-10-04")]:
        with pytest.raises(SourceContractError):
            list(
                acquire(
                    source, mode="incremental", since=None, today=TODAY, config=SourceConfig(), fetch=fail
                )
            )
        assert expected in calls[-1]
    with pytest.raises(SourceContractError):
        list(acquire(SOURCES[1], mode="backfill", since=None, today=TODAY, config=SourceConfig(), fetch=fail))
    assert "sinceTimePeriod=1996-01" in calls[-1]


@pytest.fixture
def ingestion_db(tmp_path):
    url = os.getenv("TEST_DATABASE_URL")
    if not url or os.getenv("TEST_ALLOW_RESET") != "1":
        pytest.skip("Requires disposable TEST_DATABASE_URL and TEST_ALLOW_RESET=1")
    subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        env=dict(os.environ, DATABASE_URL=url),
        check=True,
        capture_output=True,
    )
    engine = create_engine(url)
    # Integration tests must never fall through to a real network request.
    network_guard = patch("urllib.request.urlopen", side_effect=AssertionError("Unexpected network access"))
    network_guard.start()
    with engine.begin() as connection:
        connection.execute(text("TRUNCATE source_series, source_artifacts, ingestion_runs CASCADE"))
        connection.execute(
            text(
                "UPDATE synchronization_states SET status='never_run', last_attempt_at=NULL, "
                "last_success_at=NULL, last_run_id=NULL, consecutive_failures=0, cursor='{}'::jsonb"
            )
        )
    try:
        yield engine, Synchronizer(engine, tmp_path), tmp_path
    finally:
        network_guard.stop()
        engine.dispose()


def sync(syncer, source, staged=None, **kwargs):
    staged = items(source) if staged is None else staged
    with patch("app.ingestion.service.acquire", return_value=iter(staged)):
        return syncer.sync(source, today=TODAY, trigger="test", **kwargs)


@pytest.mark.integration
@pytest.mark.parametrize("source", SOURCES)
def test_initial_idempotent_incremental_and_historical_revisions(ingestion_db, source):
    engine, syncer, root = ingestion_db
    model, period = FACTS[source]
    first = sync(syncer, source, mode="backfill")
    second = sync(syncer, source)
    with Session(engine) as session:
        run = session.get(m.IngestionRun, second)
        assert run.status == "no_change" and run.revision_count == run.inserted_count == 0
        count = session.scalar(select(func.count()).select_from(model))
        assert count == {SOURCES[0]: 108, SOURCES[1]: 27, SOURCES[2]: 15}[source]
        artifact_count = session.scalar(select(func.count()).select_from(m.SourceArtifact))
        assert artifact_count == len(items(source))
        assert session.scalar(select(func.count()).select_from(m.IngestionRunArtifact)) == 2 * artifact_count
        for artifact in session.scalars(select(m.SourceArtifact)):
            assert hashlib.sha256((root / artifact.storage_path).read_bytes()).hexdigest() == artifact.sha256
        assert session.scalars(select(model.ingestion_run_id)).first() == first
    staged = items(source)
    index = 1 if source == SOURCES[0] else 0
    item = staged[index]
    record = item.batch.records[0]
    field = {SOURCES[0]: "raw_value", SOURCES[1]: "value", SOURCES[2]: "foreign_currency_units_per_eur"}[
        source
    ]
    updates = {field: getattr(record, field) + Decimal("1")}
    if source == SOURCES[0]:
        updates["price_eur_per_litre"] = updates["raw_value"] / 1000
    changed = record.model_copy(update=updates)
    # Add a genuinely new period alongside a changed historical value.
    new_period = {
        SOURCES[0]: date(2026, 11, 3),
        SOURCES[1]: date(2026, 11, 1),
        SOURCES[2]: date(2026, 11, 9),
    }[source]
    if source != SOURCES[2]:
        record_period = "reference_week" if source == SOURCES[0] else "period"
        new = record.model_copy(update={record_period: new_period})
        records = (changed, *item.batch.records[1:], new)
    else:
        records = (changed, *item.batch.records[1:])
    revised_item = Acquired(
        item.url,
        item.payload + b"\nrevision",
        item.extension,
        item.batch.model_copy(update={"records": records}),
        NOW,
        item.publication_date,
    )
    staged[index] = revised_item
    third = sync(syncer, source, staged)
    fourth = sync(syncer, source, staged)
    revision_model = {
        SOURCES[0]: m.FuelPriceRevision,
        SOURCES[1]: m.HicpObservationRevision,
        SOURCES[2]: m.ExchangeRateRevision,
    }[source]
    with Session(engine) as session:
        assert session.get(m.IngestionRun, third).revision_count == 1
        assert session.get(m.IngestionRun, fourth).revision_count == 0
        revision = session.scalar(select(revision_model))
        assert revision.previous_run_id == first and revision.replacement_run_id == third
        assert revision.previous_artifact_id != revision.replacement_artifact_id
        assert session.scalar(select(func.count()).select_from(revision_model)) == 1
    assert (
        synchronization_status(engine, today=date(2027, 1, 1))[SOURCES.index(source)]["observation_freshness"]
        == "stale"
    )


@pytest.mark.integration
@pytest.mark.parametrize("source", SOURCES[1:])
def test_status_only_revision(ingestion_db, source):
    engine, syncer, _ = ingestion_db
    sync(syncer, source)
    item = items(source)[0]
    changed = item.batch.records[0].model_copy(update={"status": "p"})
    staged = [
        Acquired(
            item.url,
            item.payload + b"status",
            item.extension,
            item.batch.model_copy(update={"records": (changed, *item.batch.records[1:])}),
            NOW,
        )
    ]
    run = sync(syncer, source, staged)
    sync(syncer, source, staged)
    with Session(engine) as session:
        assert session.get(m.IngestionRun, run).revision_count == 1
        revision_model = m.HicpObservationRevision if source == SOURCES[1] else m.ExchangeRateRevision
        revision = session.scalar(select(revision_model))
        assert revision.revised_status == "p" and revision.previous_status != "p"


@pytest.mark.integration
@pytest.mark.parametrize(
    "failure", ["download", "schema", "missing_fuel", "invalid", "transaction", "interrupt"]
)
def test_failure_preserves_dataset_and_success_cursor(ingestion_db, failure):
    engine, syncer, _ = ingestion_db
    source = SOURCES[0]
    sync(syncer, source)
    with Session(engine) as session:
        before = session.get(m.SynchronizationState, source).sync_cursor
        success = session.get(m.SynchronizationState, source).last_success_at

    def broken(*args, **kwargs):
        if failure == "download":
            raise SourceContractError("offline")
        if failure in {"schema", "missing_fuel"}:
            WeeklyOilBulletinAdapter().parse(_oil_mutation("B2" if failure == "schema" else "B13", None))
        raise AssertionError("unexpected")

    original = syncer._publish

    def rollback(*args):
        original(*args)
        assert args[0].scalar(select(func.count()).select_from(m.FuelPriceRevision)) == 1
        raise KeyboardInterrupt() if failure == "interrupt" else RuntimeError("injected commit failure")

    staged = items(source)
    if failure == "invalid":
        item = staged[1]
        record = item.batch.records[0].model_copy(update={"raw_value": Decimal("NaN")})
        staged[1] = Acquired(
            item.url,
            b"invalid fixture",
            item.extension,
            item.batch.model_copy(update={"records": (record,)}),
            NOW,
        )
    if failure in {"transaction", "interrupt"}:
        item = staged[1]
        record = item.batch.records[0]
        raw = record.raw_value + 1
        changed = record.model_copy(update={"raw_value": raw, "price_eur_per_litre": raw / 1000})
        staged[1] = Acquired(
            item.url,
            item.payload + b"changed",
            item.extension,
            item.batch.model_copy(update={"records": (changed, *item.batch.records[1:])}),
            NOW,
        )
    from contextlib import ExitStack

    expected = (
        KeyboardInterrupt
        if failure == "interrupt"
        else (RuntimeError if failure == "transaction" else SourceContractError)
    )
    with ExitStack() as stack:
        stack.enter_context(
            patch("app.ingestion.service.acquire", side_effect=broken)
            if failure in {"download", "schema", "missing_fuel"}
            else patch("app.ingestion.service.acquire", return_value=iter(staged))
        )
        if failure in {"transaction", "interrupt"}:
            stack.enter_context(patch.object(syncer, "_publish", side_effect=rollback))
        with pytest.raises(expected):
            syncer.sync(source, today=TODAY, trigger="test")
    with Session(engine) as session:
        state = session.get(m.SynchronizationState, source)
        assert state.status == "failed" and state.consecutive_failures == 1
        assert state.last_success_at == success and state.sync_cursor == before
        assert session.get(m.IngestionRun, state.last_run_id).status == "failed"
        assert session.scalar(select(func.count()).select_from(m.FuelPriceObservation)) == 108
        assert session.scalar(select(func.count()).select_from(m.FuelPriceRevision)) == 0
    sync(syncer, source)
    with Session(engine) as session:
        assert session.get(m.SynchronizationState, source).consecutive_failures == 0


@pytest.mark.integration
def test_concurrent_attempts_and_abandoned_run_recovery(ingestion_db):
    engine, syncer, _ = ingestion_db
    entered, release = Event(), Event()

    def blocked(*args, **kwargs):
        entered.set()
        assert release.wait(20)
        return iter(items(SOURCES[2]))

    with (
        ThreadPoolExecutor(max_workers=1) as pool,
        patch("app.ingestion.service.acquire", side_effect=blocked),
    ):
        future = pool.submit(syncer.sync, SOURCES[2], today=TODAY, trigger="test")
        try:
            assert entered.wait(20)
            with pytest.raises(SynchronizationBusy):
                syncer.sync(SOURCES[2], today=TODAY, trigger="test")
            # Another source can publish while the ECB worker owns its source lock.
            sync(syncer, SOURCES[1])
        finally:
            release.set()
        future.result(timeout=20)
    with Session(engine) as session:
        abandoned = m.IngestionRun(
            source_code=SOURCES[2], status="running", trigger_type="test", adapter_version="test"
        )
        session.add(abandoned)
        session.commit()
        abandoned_id = abandoned.id
    sync(syncer, SOURCES[2])
    with Session(engine) as session:
        assert session.get(m.IngestionRun, abandoned_id).status == "failed"


def historical_page():
    return oil_page() + (
        b"<article><div>Price developments 2005 onwards (xlsx)</div>"
        b'<div>5 November 2026</div><a href="/document/download/history?filename=history.xlsx">'
        b"Download</a></article>"
    )


def history_payload():
    from pathlib import Path

    return (Path(__file__).parent / "fixtures/source_samples/oil_history_excerpt.xlsx").read_bytes()


def test_historical_fuel_contract_and_sparse_cells():
    import io

    from openpyxl import load_workbook

    from app.data_sources.oil_history import OilHistoryAdapter

    adapter = OilHistoryAdapter(since=date(2005, 1, 1), before=date(2026, 11, 2))
    batch = adapter.parse(history_payload())
    assert len(batch.records) == 108
    assert {r.reference_week for r in batch.records} == {date(2026, 10, 26)}
    assert all(r.publication_date is None for r in batch.records)
    workbook = load_workbook(io.BytesIO(history_payload()))
    workbook.worksheets[0]["Q5"] = None
    output = io.BytesIO()
    workbook.save(output)
    assert adapter.parse(output.getvalue()).missing_observation_count == 1
    workbook.worksheets[0]["Q3"] = "litres"
    output = io.BytesIO()
    workbook.save(output)
    with pytest.raises(SourceContractError):
        adapter.parse(output.getvalue())


@pytest.mark.integration
def test_real_oil_acquisition_backfill_to_database(ingestion_db):
    engine, _, root = ingestion_db

    def fetch(url, **kwargs):
        if "/history?" in url:
            return history_payload()
        if "/without?" in url:
            return OIL_WITHOUT_TAX_PAYLOAD
        if "/with?" in url:
            return OIL_PAYLOAD
        return historical_page()

    syncer = Synchronizer(engine, root, fetch=fetch)
    first = syncer.sync(SOURCES[0], mode="backfill", today=TODAY, trigger="test")
    second = syncer.sync(SOURCES[0], mode="incremental", today=TODAY, trigger="test")
    with Session(engine) as session:
        assert session.get(m.IngestionRun, first).inserted_count == 216
        assert session.get(m.IngestionRun, second).status == "no_change"
        assert session.scalar(select(func.count()).select_from(m.SourceArtifact)) == 4
        assert session.scalar(select(func.count()).select_from(m.FuelPriceRevision)) == 0


@pytest.mark.parametrize("failure", ["retry", "size", "permanent"])
def test_bounded_downloader(failure):
    import io
    from urllib.error import HTTPError, URLError

    from app.data_sources._download import download_bytes

    response = io.BytesIO(b"payload")
    outcomes = (
        [URLError("offline"), response]
        if failure == "retry"
        else (
            [HTTPError("https://official.test", 404, "missing", {}, None)]
            if failure == "permanent"
            else [response]
        )
    )
    with patch("urllib.request.urlopen", side_effect=outcomes) as fetch, patch("time.sleep"):
        if failure == "retry":
            assert download_bytes("https://official.test", max_bytes=100) == b"payload"
            assert fetch.call_count == 2
        else:
            with pytest.raises(SourceContractError):
                download_bytes("https://official.test", max_bytes=1 if failure == "size" else 100)
            assert fetch.call_count == 1


def test_scheduler_uses_due_times_retries_and_full_backfill(monkeypatch):
    from unittest.mock import Mock

    from app.scripts import sync_price_cost as cli

    now = datetime.now(timezone.utc)
    statuses = [
        dict(source=source, consecutive_failures=0, last_attempt_at=now, cursor={}) for source in SOURCES
    ]
    statuses[0]["last_attempt_at"] = None
    statuses[1]["last_attempt_at"] = now.replace(year=now.year - 1)
    statuses[1]["consecutive_failures"] = 1
    statuses[1]["cursor"] = {"last_backfill_success": now.date().isoformat()}
    monkeypatch.setattr(cli, "synchronization_status", lambda engine: statuses)
    worker = Mock()
    worker.sync.side_effect = [SourceContractError("offline"), 42]

    def stop(seconds):
        assert seconds == 60
        raise StopIteration()

    with pytest.raises(StopIteration):
        cli.scheduler(worker, wait=stop)
    assert worker.sync.call_count == 2
    assert worker.sync.call_args_list[0].kwargs == {"mode": "backfill", "trigger": "scheduled"}
    assert worker.sync.call_args_list[1].kwargs == {"mode": "incremental", "trigger": "scheduled"}


@pytest.mark.integration
def test_status_is_read_only_and_failed_checks_retain_source_timestamp(ingestion_db):
    engine, syncer, _ = ingestion_db
    first = sync(syncer, SOURCES[1])
    with patch("app.ingestion.service.acquire", side_effect=SourceContractError("offline")):
        with pytest.raises(SourceContractError):
            syncer.sync(SOURCES[1], trigger="test", today=TODAY)
    with Session(engine) as session:
        expected_updated = session.get(m.IngestionRun, first).source_updated_at
        before = session.scalar(select(func.count()).select_from(m.IngestionRun))
    status = synchronization_status(engine, today=TODAY)[1]
    assert status["status"] == "failed" and status["source_updated_at"] == expected_updated
    with Session(engine) as session:
        assert session.scalar(select(func.count()).select_from(m.IngestionRun)) == before


def test_artifact_store_rejects_symlink_escape_before_writing(tmp_path):
    root = tmp_path / "root"
    outside = tmp_path / "outside"
    root.mkdir()
    outside.mkdir()
    (root / "raw").symlink_to(outside, target_is_directory=True)
    with pytest.raises(ValueError, match="escapes"):
        ArtifactStore(root).put(SOURCES[0], b"payload", "json")
    assert not list(outside.iterdir())
