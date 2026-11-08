"""Bounded, parameterized PostgreSQL reads over established typed facts."""

from contextlib import contextmanager

from sqlalchemy import func, select, text, true
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, aliased

from app.core.db import engine
from app.ingestion.sources import SOURCES
from app.models import price_cost as m

DOMAINS = {
    "fuel": (m.FuelPriceObservation, "reference_week", SOURCES[0], m.FuelPriceRevision),
    "inflation": (m.HicpObservation, "reference_month", SOURCES[1], m.HicpObservationRevision),
    "exchange-rates": (m.ExchangeRateObservation, "reference_date", SOURCES[2], m.ExchangeRateRevision),
}


@contextmanager
def read_session(database_engine):
    if database_engine.dialect.name != "postgresql":
        raise RuntimeError("Price/cost APIs require PostgreSQL read-only transactions")
    with database_engine.connect().execution_options(isolation_level="REPEATABLE READ") as connection:
        with connection.begin():
            connection.execute(text("SET TRANSACTION READ ONLY"))
            connection.execute(text("SET LOCAL statement_timeout = '5000ms'"))
            connection.execute(text("SET LOCAL lock_timeout = '1000ms'"))
            safe_role = connection.execute(
                text("""
                SELECT NOT (rolsuper OR rolcreaterole OR rolcreatedb OR rolbypassrls)
                FROM pg_roles WHERE rolname = current_user
            """)
            ).scalar_one()
            if not safe_role:
                raise SQLAlchemyError("Unsafe administrative role for price/cost reads")
            with Session(connection, autoflush=False) as session:
                yield session


def get_price_cost_db():
    with read_session(engine) as session:
        yield session


class Repository:
    def __init__(self, session):
        self.session = session

    def series(
        self,
        domain,
        *,
        countries=(),
        category=None,
        product=None,
        tax_basis=None,
        measurement=None,
        currencies=(),
    ):
        source = DOMAINS[domain][2]
        statement = select(m.SourceSeries).where(
            m.SourceSeries.source_code == source, m.SourceSeries.active.is_(True)
        )
        if countries:
            statement = statement.where(m.SourceSeries.geography_code.in_(countries))
        if category:
            statement = statement.where(m.SourceSeries.category_code == category)
        if product:
            statement = statement.where(m.SourceSeries.category_code == product.upper())
        if tax_basis:
            statement = statement.where(m.SourceSeries.tax_basis == tax_basis)
        if measurement:
            statement = statement.where(m.SourceSeries.measurement_type == measurement)
        if currencies:
            statement = statement.where(m.SourceSeries.quote_currency_code.in_(currencies))
        return list(self.session.scalars(statement.order_by(m.SourceSeries.external_key)))

    def latest(self, domain, series, as_of, *, count=2):
        if not series:
            return {}
        model, field, _, _ = DOMAINS[domain]
        period = getattr(model, field)
        # Each lateral lookup uses the unique (series_id, period) index, backwards.
        window = (
            select(model)
            .where(model.series_id == m.SourceSeries.id, period <= as_of)
            .order_by(period.desc())
            .limit(count)
            .lateral()
        )
        fact = aliased(model, window)
        statement = (
            select(m.SourceSeries.id, fact)
            .join(fact, true())
            .where(m.SourceSeries.id.in_([item.id for item in series]))
            .order_by(m.SourceSeries.id, getattr(fact, field).desc())
        )
        grouped = {}
        for series_id, row in self.session.execute(statement):
            grouped.setdefault(series_id, []).append(row)
        return grouped

    def history(self, domain, series, start, end, limit):
        model, field, _, _ = DOMAINS[domain]
        period = getattr(model, field)
        rows = list(
            self.session.scalars(
                select(model)
                .where(model.series_id == series.id, period >= start, period <= end)
                .order_by(period)
                .limit(limit + 1)
            )
        )
        prior = self.session.scalar(
            select(model).where(model.series_id == series.id, period < start).order_by(period.desc()).limit(1)
        )
        return rows[:limit], prior, len(rows) > limit

    def common_period(self, domain, series, start, end):
        if not series:
            return None
        model, field, _, _ = DOMAINS[domain]
        period = getattr(model, field)
        return self.session.scalar(
            select(period)
            .where(model.series_id.in_([item.id for item in series]), period >= start, period <= end)
            .group_by(period)
            .having(func.count() == len(series))
            .order_by(period.desc())
            .limit(1)
        )

    def names(self):
        geographies = {row.code: row.name for row in self.session.scalars(select(m.Geography))}
        categories = {
            (row.scheme_code, row.code): row.name
            for row in self.session.scalars(select(m.ClassificationCategory))
        }
        return geographies, categories

    def coverage(self, domain):
        model, field, source, _ = DOMAINS[domain]
        period = getattr(model, field)

        def edge(descending):
            return (
                select(period)
                .where(model.series_id == m.SourceSeries.id)
                .order_by(period.desc() if descending else period)
                .limit(1)
                .correlate(m.SourceSeries)
                .scalar_subquery()
            )

        return self.session.execute(
            select(m.SourceSeries, edge(False), edge(True))
            .where(m.SourceSeries.source_code == source, m.SourceSeries.active.is_(True))
            .order_by(m.SourceSeries.external_key)
        ).all()

    def source_context(self, source):
        record = self.session.get(m.DataSource, source)
        state = self.session.get(m.SynchronizationState, source)
        run = self.session.get(m.IngestionRun, state.last_run_id) if state and state.last_run_id else None
        successful = self.session.scalar(
            select(m.IngestionRun)
            .where(
                m.IngestionRun.source_code == source, m.IngestionRun.status.in_(("succeeded", "no_change"))
            )
            .order_by(m.IngestionRun.started_at.desc())
            .limit(1)
        )
        artifact = self.session.scalar(
            select(m.SourceArtifact)
            .where(m.SourceArtifact.source_code == source)
            .order_by(m.SourceArtifact.retrieved_at.desc(), m.SourceArtifact.id.desc())
            .limit(1)
        )
        codes = (
            []
            if run is None
            else list(
                self.session.scalars(
                    select(m.DataQualityEvent.event_code)
                    .where(
                        m.DataQualityEvent.ingestion_run_id == run.id,
                        m.DataQualityEvent.severity.in_(("warning", "error")),
                    )
                    .distinct()
                    .order_by(m.DataQualityEvent.event_code)
                    .limit(20)
                )
            )
        )
        publications = (
            []
            if successful is None
            else [
                self.session.scalar(
                    select(func.max(m.DataQualityEvent.details["publication_date"].as_string())).where(
                        m.DataQualityEvent.ingestion_run_id == successful.id,
                        m.DataQualityEvent.event_code == "ARTIFACT_RETRIEVED",
                    )
                )
            ]
        )
        return record, state, run, successful, artifact, codes, publications

    def evidence(self, domain, observation_id, limit):
        model, _, _, revisions = DOMAINS[domain]
        row = self.session.get(model, observation_id)
        if row is None:
            return None
        artifact = self.session.get(m.SourceArtifact, row.artifact_id)
        run = self.session.get(m.IngestionRun, row.ingestion_run_id)
        history = list(
            self.session.scalars(
                select(revisions)
                .where(revisions.observation_id == row.id)
                .order_by(revisions.detected_at.desc(), revisions.id.desc())
                .limit(limit + 1)
            )
        )
        return row, artifact, run, history[:limit], len(history) > limit
