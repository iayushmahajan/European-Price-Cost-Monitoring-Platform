"""Per-source PostgreSQL locking and atomic publication of validated batches."""

import hashlib
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.data_sources._download import download_bytes
from app.data_sources.errors import SourceContractError
from app.ingestion.artifacts import ArtifactStore
from app.ingestion.freshness import freshness, source_today
from app.ingestion.mapping import map_record
from app.ingestion.sources import SOURCES, SourceConfig, acquire
from app.models import price_cost as m

FACTS = {
    SOURCES[0]: (m.FuelPriceObservation, "reference_week"),
    SOURCES[1]: (m.HicpObservation, "reference_month"),
    SOURCES[2]: (m.ExchangeRateObservation, "reference_date"),
}
CONTENT_TYPES = {
    "html": "text/html",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "json": "application/json",
    "csv": "text/csv",
}


class SynchronizationBusy(RuntimeError):
    pass


def utcnow():
    return datetime.now(timezone.utc)


def lock_key(source):
    return int.from_bytes(hashlib.sha256(f"price-cost:{source}".encode()).digest()[:8], "big", signed=True)


def event(session, run_id, source, code, message, severity="info", **details):
    session.add(
        m.DataQualityEvent(
            ingestion_run_id=run_id,
            source_code=source,
            event_code=code,
            severity=severity,
            message=message,
            details=details,
        )
    )


def validate_precision(model, values):
    for field, value in values.items():
        if isinstance(value, Decimal):
            column = model.__table__.c[field]
            scale, precision = column.type.scale, column.type.precision
            if (
                not value.is_finite()
                or abs(value) >= Decimal(10) ** (precision - scale)
                or value != value.quantize(Decimal(1).scaleb(-scale))
            ):
                raise SourceContractError(f"{model.__tablename__}.{field} exceeds exact database precision")


class Synchronizer:
    def __init__(self, engine, artifact_root, *, config=None, fetch=download_bytes):
        if engine.dialect.name != "postgresql":
            raise ValueError("Synchronization requires PostgreSQL advisory locks")
        self.engine = engine
        self.store = ArtifactStore(artifact_root)
        self.config = config or SourceConfig()
        self.fetch = fetch

    def sync(self, source, *, mode="incremental", since=None, trigger="manual", today=None, oil_history=()):
        if source not in SOURCES or mode not in {"incremental", "backfill"}:
            raise ValueError("Invalid source or synchronization mode")
        today = today or source_today()
        if since and since > today:
            raise ValueError("Backfill start cannot follow today")
        # Dedicated connection owns the session-level lock across run/audit commits.
        with self.engine.connect() as connection:
            locked = connection.execute(
                text("SELECT pg_try_advisory_lock(:key)"), {"key": lock_key(source)}
            ).scalar_one()
            connection.commit()
            if not locked:
                raise SynchronizationBusy(f"{source} synchronization already running")
            try:
                with Session(connection, expire_on_commit=False) as session:
                    return self._sync(session, source, mode, since, trigger, today, oil_history)
            finally:
                connection.rollback()
                connection.execute(text("SELECT pg_advisory_unlock(:key)"), {"key": lock_key(source)})
                connection.commit()

    def _sync(self, session, source, mode, since, trigger, today, oil_history):
        started = utcnow()
        state = session.get(m.SynchronizationState, source)
        if state is None:
            state = m.SynchronizationState(source_code=source, consecutive_failures=0, sync_cursor={})
            session.add(state)
        if mode == "incremental" and (
            state.last_success_at is None
            or state.sync_cursor.get("configuration_signature") != self.config.signature
        ):
            mode = "backfill"
        # Once the source lock is ours, old running runs belong to interrupted workers.
        for abandoned in session.scalars(
            select(m.IngestionRun).where(
                m.IngestionRun.source_code == source, m.IngestionRun.status == "running"
            )
        ):
            abandoned.status = "failed"
            abandoned.completed_at = started
            abandoned.error_summary = "Worker interrupted before publication; recovered under source lock"
            event(session, abandoned.id, source, "INTERRUPTED", abandoned.error_summary, "error")
        run = m.IngestionRun(
            source_code=source, status="running", trigger_type=trigger, adapter_version="milestone-3.1"
        )
        session.add(run)
        session.flush()
        run_id = run.id
        state.last_run_id = run_id
        state.last_attempt_at = started
        session.commit()
        try:
            # Stage and validate everything before opening the data-publication transaction.
            staged = []
            for item in acquire(
                source,
                mode=mode,
                since=since,
                today=today,
                config=self.config,
                fetch=self.fetch,
                oil_history=oil_history,
            ):
                digest, path = self.store.put(source, item.payload, item.extension)
                staged.append((item, digest, path))
            self._publish(session, run_id, source, staged, today, mode, since)
            session.commit()
            return run_id
        except BaseException as exc:
            session.rollback()
            # Deliberately exclude exception messages/URLs/payloads/credentials from durable error text.
            failed = session.get(m.IngestionRun, run_id)
            if failed.status in {"succeeded", "no_change"}:
                # A signal after COMMIT must not relabel an already-published transaction.
                raise
            failed.status = "failed"
            failed.completed_at = utcnow()
            failed.error_summary = f"{type(exc).__name__}: synchronization aborted; previous dataset retained"
            state = session.get(m.SynchronizationState, source)
            state.status = "failed"
            state.consecutive_failures += 1
            event(session, run_id, source, "SYNC_FAILED", failed.error_summary, "error")
            session.commit()
            raise

    def _publish(self, session, run_id, source, staged, today, mode, since):
        run = session.get(m.IngestionRun, run_id)
        state = session.get(m.SynchronizationState, source)
        series_by_key = {
            s.external_key: s
            for s in session.scalars(select(m.SourceSeries).where(m.SourceSeries.source_code == source))
        }
        model, period_field = FACTS[source]
        # Only load observations in fetched periods, retaining bounded incremental work.
        periods = [map_record(r)[4] for item, _, _ in staged if item.batch for r in item.batch.records]
        if not periods:
            raise SourceContractError("Source returned no observations")
        existing = {
            (row.series_id, getattr(row, period_field)): row
            for row in session.scalars(
                select(model).where(
                    model.source_code == source,
                    getattr(model, period_field) >= min(periods),
                    getattr(model, period_field) <= max(periods),
                )
            )
        }
        seen = {}
        inserted = updated = missing = parsed = 0
        source_updates = []
        for item, digest, path in staged:
            if item.publication_date and item.publication_date > today:
                raise SourceContractError("Source publication date is in the future")
            records = item.batch.records if item.batch else ()
            if any(record.source != source for record in records):
                raise SourceContractError("Staged record source does not match synchronization source")
            mapped = [map_record(record) for record in records]
            artifact = session.scalar(
                select(m.SourceArtifact).where(
                    m.SourceArtifact.source_code == source, m.SourceArtifact.sha256 == digest
                )
            )
            if artifact is None:
                dates = [entry[4] for entry in mapped]
                artifact = m.SourceArtifact(
                    source_code=source,
                    source_url=item.url,
                    sha256=digest,
                    byte_size=len(item.payload),
                    content_type=CONTENT_TYPES[item.extension],
                    retrieved_at=item.retrieved_at,
                    reference_period_start=min(dates) if dates else None,
                    reference_period_end=max(dates) if dates else None,
                    storage_path=path,
                    source_metadata={
                        "adapter_version": "milestone-3.1",
                        "publication_date": item.publication_date.isoformat()
                        if item.publication_date
                        else None,
                        "source_updated_at": getattr(item.batch, "source_updated_at", None).isoformat()
                        if hasattr(item.batch, "source_updated_at")
                        else None,
                    },
                )
                session.add(artifact)
                session.flush()
            link = session.get(m.IngestionRunArtifact, (run_id, artifact.id))
            if link is None:
                session.add(
                    m.IngestionRunArtifact(
                        ingestion_run_id=run_id,
                        artifact_id=artifact.id,
                        source_code=source,
                        role="primary" if records else "supporting",
                    )
                )
                session.flush()
            event(
                session,
                run_id,
                source,
                "ARTIFACT_RETRIEVED",
                "Verified official response retained",
                artifact_id=artifact.id,
                sha256=digest,
                url=item.url,
                retrieved_at=item.retrieved_at.isoformat(),
                publication_date=item.publication_date.isoformat() if item.publication_date else None,
            )
            if not records:
                continue
            if hasattr(item.batch, "source_updated_at"):
                source_updates.append(item.batch.source_updated_at)
            batch_missing = getattr(item.batch, "missing_observation_count", 0)
            missing += batch_missing
            if batch_missing:
                event(
                    session,
                    run_id,
                    source,
                    "SOURCE_MISSING_CELL",
                    "Missing source cells remain absent",
                    count=batch_missing,
                    artifact_id=artifact.id,
                    stored_as_zero=False,
                )
            for dimensions, fact_model, revision_model, period_key, period, values, revision_fields in mapped:
                parsed += 1
                if period > today:
                    raise SourceContractError("Observation period is in the future")
                validate_precision(fact_model, values)
                key = dimensions["external_key"]
                identity = (key, period)
                if identity in seen:
                    if seen[identity] != values:
                        raise SourceContractError("Conflicting observations in staged source artifacts")
                    continue
                seen[identity] = values
                series = series_by_key.get(key)
                if series is None:
                    series = m.SourceSeries(
                        source_code=source, **dimensions, source_dimensions={"external_key": key}
                    )
                    session.add(series)
                    session.flush()
                    series_by_key[key] = series
                old = existing.get((series.id, period))
                if old is not None and "publication_date" in values and values["publication_date"] is None:
                    values["publication_date"] = old.publication_date
                provenance = dict(ingestion_run_id=run_id, artifact_id=artifact.id)
                if old is None:
                    new = fact_model(
                        source_code=source,
                        series_id=series.id,
                        **{period_key: period},
                        **values,
                        **provenance,
                    )
                    session.add(new)
                    existing[(series.id, period)] = new
                    inserted += 1
                elif any(getattr(old, field) != values[field] for field in revision_fields):
                    revision = dict(
                        observation_id=old.id,
                        source_code=source,
                        previous_run_id=old.ingestion_run_id,
                        previous_artifact_id=old.artifact_id,
                        replacement_run_id=run_id,
                        replacement_artifact_id=artifact.id,
                    )
                    for field, suffix in revision_fields.items():
                        revision[f"previous_{suffix}"] = getattr(old, field)
                        revision[f"revised_{suffix}"] = values[field]
                    session.add(revision_model(**revision))
                    for field, value in (values | provenance).items():
                        setattr(old, field, value)
                    old.updated_at = utcnow()
                    updated += 1
        session.flush()
        run.fetched_count = len(staged)
        run.parsed_count = parsed
        run.inserted_count = inserted
        run.updated_count = run.revision_count = updated
        run.missing_count = missing
        run.source_updated_at = max(source_updates) if source_updates else None
        run.status = "succeeded" if inserted or updated else "no_change"
        run.completed_at = utcnow()
        state.last_success_at = run.completed_at
        state.last_attempt_at = run.completed_at
        state.consecutive_failures = 0
        # Retain per-series actual coverage; freshness is the oldest series' latest observation.
        coverage = session.execute(
            select(
                model.series_id,
                func.min(getattr(model, period_field)),
                func.max(getattr(model, period_field)),
            )
            .where(model.source_code == source)
            .group_by(model.series_id)
        ).all()
        latest = min(row[2] for row in coverage)
        state.status = freshness(source, latest, today)
        last_backfill = state.sync_cursor.get("last_backfill_success")
        state.sync_cursor = {
            "configuration_signature": self.config.signature,
            "last_backfill_success": today.isoformat()
            if mode == "backfill" and since is None
            else last_backfill,
            "latest_observation": max(row[2] for row in coverage).isoformat(),
            "oldest_series_latest": latest.isoformat(),
            "mode": mode,
            "requested_since": since.isoformat() if since else None,
            "series_coverage": {
                str(row[0]): {"first": row[1].isoformat(), "last": row[2].isoformat()} for row in coverage
            },
            "retrievals": [
                {"url": item.url, "sha256": digest, "retrieved_at": item.retrieved_at.isoformat()}
                for item, digest, _ in staged
            ],
        }
        if state.status == "stale":
            event(
                session,
                run_id,
                source,
                "STALE_OBSERVATIONS",
                "Source checked but observations are old",
                "warning",
                oldest_series_latest=latest.isoformat(),
                checked_on=today.isoformat(),
            )


def synchronization_status(engine, today=None):
    """Read-only inspection; calculate freshness at read time, including scheduler downtime."""
    today = today or source_today()
    with Session(engine) as session:
        result = []
        for source in SOURCES:
            state = session.get(m.SynchronizationState, source)
            model, period = FACTS[source]
            coverage = session.execute(
                select(model.series_id, func.max(getattr(model, period)))
                .where(model.source_code == source)
                .group_by(model.series_id)
            ).all()
            latest = min((row[1] for row in coverage), default=None)
            run = session.get(m.IngestionRun, state.last_run_id) if state and state.last_run_id else None
            last_successful = session.scalar(
                select(m.IngestionRun)
                .where(
                    m.IngestionRun.source_code == source,
                    m.IngestionRun.status.in_(("succeeded", "no_change")),
                )
                .order_by(m.IngestionRun.completed_at.desc())
                .limit(1)
            )
            result.append(
                dict(
                    source=source,
                    status=state.status if state else "never_run",
                    observation_freshness=freshness(source, latest, today),
                    oldest_series_latest=latest,
                    last_attempt_at=state.last_attempt_at if state else None,
                    last_success_at=state.last_success_at if state else None,
                    last_run_id=state.last_run_id if state else None,
                    run_status=run.status if run else None,
                    source_updated_at=last_successful.source_updated_at if last_successful else None,
                    consecutive_failures=state.consecutive_failures if state else 0,
                    cursor=state.sync_cursor if state else {},
                )
            )
        return result
