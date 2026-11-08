"""Normalized catalogue, provenance, and typed price/cost observation models."""

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
    true,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base

JSON_DOCUMENT = JSON().with_variant(JSONB(), "postgresql")


class DataSource(Base):
    __tablename__ = "data_sources"
    __table_args__ = (
        CheckConstraint(
            "default_frequency IN ('daily', 'weekly', 'monthly')",
            name="ck_data_source_frequency",
        ),
    )

    code: Mapped[str] = mapped_column(String(40), primary_key=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False, unique=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    official_url: Mapped[str] = mapped_column(Text, nullable=False)
    licence_url: Mapped[str] = mapped_column(Text, nullable=False)
    default_frequency: Mapped[str] = mapped_column(String(12), nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=true())


class Currency(Base):
    __tablename__ = "currencies"
    __table_args__ = (
        CheckConstraint("code = upper(code) AND length(code) = 3", name="ck_currency_code"),
        CheckConstraint("minor_unit BETWEEN 0 AND 6", name="ck_currency_minor_unit"),
    )

    code: Mapped[str] = mapped_column(String(3), primary_key=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False, unique=True)
    symbol: Mapped[str | None] = mapped_column(String(8))
    minor_unit: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default="2")


class MeasurementUnit(Base):
    __tablename__ = "measurement_units"
    __table_args__ = (
        CheckConstraint(
            "unit_kind IN ('price', 'index', 'percentage', 'exchange_rate')",
            name="ck_measurement_unit_kind",
        ),
    )

    code: Mapped[str] = mapped_column(String(40), primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    symbol: Mapped[str] = mapped_column(String(40), nullable=False)
    unit_kind: Mapped[str] = mapped_column(String(20), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)


class Geography(Base):
    __tablename__ = "geographies"
    __table_args__ = (
        CheckConstraint("geography_type IN ('country', 'region')", name="ck_geography_type"),
        CheckConstraint(
            "(geography_type = 'country' AND iso_alpha2 IS NOT NULL) OR "
            "(geography_type = 'region' AND iso_alpha2 IS NULL)",
            name="ck_geography_iso_by_type",
        ),
        CheckConstraint(
            "jsonb_typeof(source_codes) = 'object'",
            name="ck_geography_source_codes_object",
        ).ddl_if(dialect="postgresql"),
        Index(
            "uq_geographies_iso_alpha2",
            "iso_alpha2",
            unique=True,
            postgresql_where=text("iso_alpha2 IS NOT NULL"),
        ),
    )

    code: Mapped[str] = mapped_column(String(20), primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    geography_type: Mapped[str] = mapped_column(String(12), nullable=False)
    iso_alpha2: Mapped[str | None] = mapped_column(String(2))
    parent_code: Mapped[str | None] = mapped_column(ForeignKey("geographies.code", ondelete="RESTRICT"))
    currency_code: Mapped[str | None] = mapped_column(ForeignKey("currencies.code", ondelete="RESTRICT"))
    source_codes: Mapped[dict] = mapped_column(
        JSON_DOCUMENT,
        nullable=False,
        server_default=text("'{}'"),
    )


class ClassificationScheme(Base):
    __tablename__ = "classification_schemes"

    code: Mapped[str] = mapped_column(String(40), primary_key=True)
    name: Mapped[str] = mapped_column(String(140), nullable=False, unique=True)
    source_code: Mapped[str] = mapped_column(
        ForeignKey("data_sources.code", ondelete="RESTRICT"),
        nullable=False,
    )
    version: Mapped[str] = mapped_column(String(40), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)


class ClassificationCategory(Base):
    __tablename__ = "classification_categories"
    __table_args__ = (
        ForeignKeyConstraint(
            ["scheme_code", "parent_code"],
            ["classification_categories.scheme_code", "classification_categories.code"],
            name="fk_classification_category_parent",
            ondelete="RESTRICT",
        ),
    )

    scheme_code: Mapped[str] = mapped_column(
        ForeignKey("classification_schemes.code", ondelete="RESTRICT"),
        primary_key=True,
    )
    code: Mapped[str] = mapped_column(String(40), primary_key=True)
    name: Mapped[str] = mapped_column(String(180), nullable=False)
    parent_code: Mapped[str | None] = mapped_column(String(40))
    description: Mapped[str] = mapped_column(Text, nullable=False)


class IndicatorDefinition(Base):
    __tablename__ = "indicator_definitions"
    __table_args__ = (
        CheckConstraint(
            "series_kind IN ('fuel_price', 'hicp', 'exchange_rate')",
            name="ck_indicator_series_kind",
        ),
        CheckConstraint(
            "frequency IN ('daily', 'weekly', 'monthly')",
            name="ck_indicator_frequency",
        ),
        CheckConstraint(
            "(series_kind = 'fuel_price' AND measurement_type = 'price') OR "
            "(series_kind = 'hicp' AND measurement_type IN "
            "('index', 'monthly_rate', 'annual_rate')) OR "
            "(series_kind = 'exchange_rate' AND measurement_type = 'reference_rate')",
            name="ck_indicator_measurement_type",
        ),
        UniqueConstraint(
            "source_code",
            "code",
            "series_kind",
            "frequency",
            "measurement_type",
            name="uq_indicator_series_contract",
        ),
    )

    source_code: Mapped[str] = mapped_column(
        ForeignKey("data_sources.code", ondelete="RESTRICT"),
        primary_key=True,
    )
    code: Mapped[str] = mapped_column(String(40), primary_key=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    series_kind: Mapped[str] = mapped_column(String(20), nullable=False)
    frequency: Mapped[str] = mapped_column(String(12), nullable=False)
    measurement_type: Mapped[str] = mapped_column(String(24), nullable=False)
    reference_base: Mapped[str | None] = mapped_column(String(80))


class IndicatorAllowedUnit(Base):
    __tablename__ = "indicator_allowed_units"
    __table_args__ = (
        ForeignKeyConstraint(
            ["source_code", "indicator_code"],
            ["indicator_definitions.source_code", "indicator_definitions.code"],
            ondelete="CASCADE",
        ),
    )

    source_code: Mapped[str] = mapped_column(String(40), primary_key=True)
    indicator_code: Mapped[str] = mapped_column(String(40), primary_key=True)
    unit_code: Mapped[str] = mapped_column(
        ForeignKey("measurement_units.code", ondelete="RESTRICT"),
        primary_key=True,
    )


class IndicatorAllowedCategory(Base):
    __tablename__ = "indicator_allowed_categories"
    __table_args__ = (
        ForeignKeyConstraint(
            ["source_code", "indicator_code"],
            ["indicator_definitions.source_code", "indicator_definitions.code"],
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["scheme_code", "category_code"],
            ["classification_categories.scheme_code", "classification_categories.code"],
            ondelete="RESTRICT",
        ),
    )

    source_code: Mapped[str] = mapped_column(String(40), primary_key=True)
    indicator_code: Mapped[str] = mapped_column(String(40), primary_key=True)
    scheme_code: Mapped[str] = mapped_column(String(40), primary_key=True)
    category_code: Mapped[str] = mapped_column(String(40), primary_key=True)


class SourceSeries(Base):
    __tablename__ = "source_series"
    __table_args__ = (
        ForeignKeyConstraint(
            [
                "source_code",
                "indicator_code",
                "series_kind",
                "frequency",
                "measurement_type",
            ],
            [
                "indicator_definitions.source_code",
                "indicator_definitions.code",
                "indicator_definitions.series_kind",
                "indicator_definitions.frequency",
                "indicator_definitions.measurement_type",
            ],
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["source_code", "indicator_code", "unit_code"],
            [
                "indicator_allowed_units.source_code",
                "indicator_allowed_units.indicator_code",
                "indicator_allowed_units.unit_code",
            ],
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["classification_scheme_code", "category_code"],
            ["classification_categories.scheme_code", "classification_categories.code"],
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["source_code", "indicator_code", "classification_scheme_code", "category_code"],
            [
                "indicator_allowed_categories.source_code",
                "indicator_allowed_categories.indicator_code",
                "indicator_allowed_categories.scheme_code",
                "indicator_allowed_categories.category_code",
            ],
            ondelete="RESTRICT",
        ),
        UniqueConstraint("source_code", "external_key", name="uq_source_series_external_key"),
        UniqueConstraint("id", "source_code", name="uq_source_series_id_source"),
        UniqueConstraint("id", "source_code", "measurement_type", name="uq_source_series_measurement"),
        UniqueConstraint(
            "id",
            "source_code",
            "base_currency_code",
            "quote_currency_code",
            name="uq_source_series_exchange_currencies",
        ),
        CheckConstraint(
            "series_kind IN ('fuel_price', 'hicp', 'exchange_rate')",
            name="ck_source_series_kind",
        ),
        CheckConstraint(
            "frequency IN ('daily', 'weekly', 'monthly')",
            name="ck_source_series_frequency",
        ),
        CheckConstraint(
            "(classification_scheme_code IS NULL) = (category_code IS NULL)",
            name="ck_source_series_category_pair",
        ),
        CheckConstraint(
            "(series_kind = 'fuel_price' AND frequency = 'weekly' "
            "AND geography_code IS NOT NULL AND category_code IS NOT NULL "
            "AND tax_basis IN ('with_tax', 'without_tax') "
            "AND measurement_type = 'price' AND currency_code = 'EUR' "
            "AND base_currency_code IS NULL AND quote_currency_code IS NULL) OR "
            "(series_kind = 'hicp' AND frequency = 'monthly' "
            "AND geography_code IS NOT NULL AND category_code IS NOT NULL "
            "AND tax_basis IS NULL AND currency_code IS NULL "
            "AND base_currency_code IS NULL AND quote_currency_code IS NULL "
            "AND measurement_type IN ('index', 'monthly_rate', 'annual_rate')) OR "
            "(series_kind = 'exchange_rate' AND frequency = 'daily' "
            "AND geography_code IS NULL AND category_code IS NULL "
            "AND tax_basis IS NULL AND currency_code IS NULL "
            "AND base_currency_code = 'EUR' AND quote_currency_code IS NOT NULL "
            "AND base_currency_code <> quote_currency_code "
            "AND measurement_type = 'reference_rate')",
            name="ck_source_series_dimensions",
        ),
        Index("ix_source_series_source_kind", "source_code", "series_kind"),
        Index("ix_source_series_geography", "geography_code"),
        Index(
            "uq_fuel_series_dimensions",
            "source_code",
            "indicator_code",
            "geography_code",
            "classification_scheme_code",
            "category_code",
            "tax_basis",
            unique=True,
            postgresql_where=text("series_kind = 'fuel_price'"),
        ),
        Index(
            "uq_hicp_series_dimensions",
            "source_code",
            "indicator_code",
            "geography_code",
            "classification_scheme_code",
            "category_code",
            unique=True,
            postgresql_where=text("series_kind = 'hicp'"),
        ),
        Index(
            "uq_exchange_series_dimensions",
            "source_code",
            "indicator_code",
            "base_currency_code",
            "quote_currency_code",
            unique=True,
            postgresql_where=text("series_kind = 'exchange_rate'"),
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    source_code: Mapped[str] = mapped_column(String(40), nullable=False)
    external_key: Mapped[str] = mapped_column(Text, nullable=False)
    series_kind: Mapped[str] = mapped_column(String(20), nullable=False)
    indicator_code: Mapped[str] = mapped_column(String(40), nullable=False)
    geography_code: Mapped[str | None] = mapped_column(ForeignKey("geographies.code", ondelete="RESTRICT"))
    classification_scheme_code: Mapped[str | None] = mapped_column(String(40))
    category_code: Mapped[str | None] = mapped_column(String(40))
    unit_code: Mapped[str] = mapped_column(String(40), nullable=False)
    frequency: Mapped[str] = mapped_column(String(12), nullable=False)
    measurement_type: Mapped[str] = mapped_column(String(24), nullable=False)
    tax_basis: Mapped[str | None] = mapped_column(String(20))
    currency_code: Mapped[str | None] = mapped_column(ForeignKey("currencies.code", ondelete="RESTRICT"))
    base_currency_code: Mapped[str | None] = mapped_column(ForeignKey("currencies.code", ondelete="RESTRICT"))
    quote_currency_code: Mapped[str | None] = mapped_column(
        ForeignKey("currencies.code", ondelete="RESTRICT")
    )
    source_dimensions: Mapped[dict] = mapped_column(
        JSON_DOCUMENT,
        nullable=False,
        server_default=text("'{}'"),
    )
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=true())
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class IngestionRun(Base):
    __tablename__ = "ingestion_runs"
    __table_args__ = (
        UniqueConstraint("id", "source_code", name="uq_ingestion_run_id_source"),
        CheckConstraint(
            "status IN ('running', 'succeeded', 'failed', 'no_change')",
            name="ck_ingestion_run_status",
        ),
        CheckConstraint(
            "trigger_type IN ('manual', 'scheduled', 'test')",
            name="ck_ingestion_run_trigger",
        ),
        CheckConstraint(
            "(status = 'running' AND completed_at IS NULL) OR "
            "(status <> 'running' AND completed_at IS NOT NULL)",
            name="ck_ingestion_run_completion",
        ),
        CheckConstraint(
            "fetched_count >= 0 AND parsed_count >= 0 AND inserted_count >= 0 "
            "AND updated_count >= 0 AND missing_count >= 0 AND revision_count >= 0",
            name="ck_ingestion_run_counts",
        ),
        Index("ix_ingestion_runs_source_started", "source_code", "started_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    source_code: Mapped[str] = mapped_column(
        ForeignKey("data_sources.code", ondelete="RESTRICT"), nullable=False
    )
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    trigger_type: Mapped[str] = mapped_column(String(16), nullable=False)
    adapter_version: Mapped[str] = mapped_column(String(40), nullable=False)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    source_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    fetched_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    parsed_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    inserted_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    updated_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    missing_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    revision_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    error_summary: Mapped[str | None] = mapped_column(Text)


class SourceArtifact(Base):
    __tablename__ = "source_artifacts"
    __table_args__ = (
        UniqueConstraint("source_code", "sha256", name="uq_source_artifact_hash"),
        UniqueConstraint("id", "source_code", name="uq_source_artifact_id_source"),
        CheckConstraint(
            "length(sha256) = 64 AND sha256 = lower(sha256)",
            name="ck_source_artifact_sha256",
        ),
        CheckConstraint(
            "sha256 ~ '^[0-9a-f]{64}$'",
            name="ck_source_artifact_sha256_hex",
        ).ddl_if(dialect="postgresql"),
        CheckConstraint("byte_size > 0", name="ck_source_artifact_size"),
        CheckConstraint(
            "reference_period_end IS NULL OR reference_period_start IS NULL "
            "OR reference_period_end >= reference_period_start",
            name="ck_source_artifact_period",
        ),
        CheckConstraint(
            "jsonb_typeof(metadata) = 'object'",
            name="ck_source_artifact_metadata_object",
        ).ddl_if(dialect="postgresql"),
        Index("ix_source_artifacts_source_retrieved", "source_code", "retrieved_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    source_code: Mapped[str] = mapped_column(
        ForeignKey("data_sources.code", ondelete="RESTRICT"), nullable=False
    )
    source_url: Mapped[str] = mapped_column(Text, nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    byte_size: Mapped[int] = mapped_column(BigInteger, nullable=False)
    content_type: Mapped[str] = mapped_column(String(120), nullable=False)
    retrieved_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reference_period_start: Mapped[date | None] = mapped_column(Date)
    reference_period_end: Mapped[date | None] = mapped_column(Date)
    storage_path: Mapped[str | None] = mapped_column(Text)
    source_metadata: Mapped[dict] = mapped_column(
        "metadata", JSON_DOCUMENT, nullable=False, server_default=text("'{}'")
    )


class IngestionRunArtifact(Base):
    __tablename__ = "ingestion_run_artifacts"
    __table_args__ = (
        ForeignKeyConstraint(
            ["ingestion_run_id", "source_code"],
            ["ingestion_runs.id", "ingestion_runs.source_code"],
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["artifact_id", "source_code"],
            ["source_artifacts.id", "source_artifacts.source_code"],
            ondelete="RESTRICT",
        ),
        UniqueConstraint("ingestion_run_id", "artifact_id", "source_code", name="uq_run_artifact_source"),
        CheckConstraint("role IN ('primary', 'supporting')", name="ck_run_artifact_role"),
    )

    ingestion_run_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    artifact_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    source_code: Mapped[str] = mapped_column(String(40), nullable=False)
    role: Mapped[str] = mapped_column(String(16), nullable=False, server_default="primary")


class SynchronizationState(Base):
    __tablename__ = "synchronization_states"
    __table_args__ = (
        ForeignKeyConstraint(
            ["last_run_id", "source_code"],
            ["ingestion_runs.id", "ingestion_runs.source_code"],
            ondelete="RESTRICT",
        ),
        CheckConstraint(
            "status IN ('never_run', 'current', 'stale', 'failed')",
            name="ck_synchronization_state_status",
        ),
        CheckConstraint("consecutive_failures >= 0", name="ck_synchronization_state_failures"),
        CheckConstraint(
            "last_success_at IS NULL OR last_attempt_at IS NULL OR last_success_at <= last_attempt_at",
            name="ck_synchronization_state_times",
        ),
        CheckConstraint(
            "jsonb_typeof(cursor) = 'object'",
            name="ck_synchronization_state_cursor_object",
        ).ddl_if(dialect="postgresql"),
    )

    source_code: Mapped[str] = mapped_column(
        ForeignKey("data_sources.code", ondelete="RESTRICT"), primary_key=True
    )
    status: Mapped[str] = mapped_column(String(16), nullable=False, server_default="never_run")
    last_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_success_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_run_id: Mapped[int | None] = mapped_column(BigInteger)
    etag: Mapped[str | None] = mapped_column(Text)
    last_modified: Mapped[str | None] = mapped_column(Text)
    sync_cursor: Mapped[dict] = mapped_column(
        "cursor", JSON_DOCUMENT, nullable=False, server_default=text("'{}'")
    )
    consecutive_failures: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")


class DataQualityEvent(Base):
    __tablename__ = "data_quality_events"
    __table_args__ = (
        ForeignKeyConstraint(
            ["ingestion_run_id", "source_code"],
            ["ingestion_runs.id", "ingestion_runs.source_code"],
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["series_id", "source_code"],
            ["source_series.id", "source_series.source_code"],
            ondelete="RESTRICT",
        ),
        CheckConstraint("severity IN ('info', 'warning', 'error')", name="ck_data_quality_severity"),
        CheckConstraint("jsonb_typeof(details) = 'object'", name="ck_data_quality_details_object").ddl_if(
            dialect="postgresql"
        ),
        Index("ix_data_quality_run_severity", "ingestion_run_id", "severity"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    ingestion_run_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    source_code: Mapped[str] = mapped_column(String(40), nullable=False)
    series_id: Mapped[int | None] = mapped_column(BigInteger)
    event_code: Mapped[str] = mapped_column(String(60), nullable=False)
    severity: Mapped[str] = mapped_column(String(12), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    reference_period: Mapped[date | None] = mapped_column(Date)
    details: Mapped[dict] = mapped_column(JSON_DOCUMENT, nullable=False, server_default=text("'{}'"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class FuelPriceObservation(Base):
    __tablename__ = "fuel_price_observations"
    __table_args__ = (
        ForeignKeyConstraint(
            ["series_id", "source_code"],
            ["source_series.id", "source_series.source_code"],
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["ingestion_run_id", "artifact_id", "source_code"],
            [
                "ingestion_run_artifacts.ingestion_run_id",
                "ingestion_run_artifacts.artifact_id",
                "ingestion_run_artifacts.source_code",
            ],
            ondelete="RESTRICT",
        ),
        UniqueConstraint("series_id", "reference_week", name="uq_fuel_observation_grain"),
        UniqueConstraint("id", "source_code", name="uq_fuel_observation_id_source"),
        CheckConstraint("raw_value > 0", name="ck_fuel_observation_raw_value"),
        CheckConstraint(
            "normalized_price_eur_per_litre > 0",
            name="ck_fuel_observation_normalized_value",
        ),
        CheckConstraint(
            "raw_unit_code = 'EUR_PER_1000_LITRES'",
            name="ck_fuel_observation_raw_unit",
        ),
        CheckConstraint(
            "normalized_price_eur_per_litre = raw_value / 1000",
            name="ck_fuel_observation_normalization",
        ),
        CheckConstraint(
            "publication_date IS NULL OR publication_date >= reference_week",
            name="ck_fuel_observation_publication_date",
        ),
        Index("ix_fuel_observations_reference_week", "reference_week", "series_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    series_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    source_code: Mapped[str] = mapped_column(String(40), nullable=False)
    reference_week: Mapped[date] = mapped_column(Date, nullable=False)
    publication_date: Mapped[date | None] = mapped_column(Date)
    raw_value: Mapped[Decimal] = mapped_column(Numeric(30, 15), nullable=False)
    raw_unit_code: Mapped[str] = mapped_column(
        ForeignKey("measurement_units.code", ondelete="RESTRICT"), nullable=False
    )
    normalized_price_eur_per_litre: Mapped[Decimal] = mapped_column(Numeric(30, 18), nullable=False)
    status: Mapped[str | None] = mapped_column(String(20))
    ingestion_run_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    artifact_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class HicpObservation(Base):
    __tablename__ = "hicp_observations"
    __table_args__ = (
        ForeignKeyConstraint(
            ["series_id", "source_code", "measurement_type"],
            ["source_series.id", "source_series.source_code", "source_series.measurement_type"],
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["ingestion_run_id", "artifact_id", "source_code"],
            [
                "ingestion_run_artifacts.ingestion_run_id",
                "ingestion_run_artifacts.artifact_id",
                "ingestion_run_artifacts.source_code",
            ],
            ondelete="RESTRICT",
        ),
        UniqueConstraint("series_id", "reference_month", name="uq_hicp_observation_grain"),
        UniqueConstraint("id", "source_code", name="uq_hicp_observation_id_source"),
        CheckConstraint(
            "reference_month = CAST(date_trunc('month', reference_month) AS DATE)",
            name="ck_hicp_observation_month_start",
        ).ddl_if(dialect="postgresql"),
        CheckConstraint(
            "(measurement_type = 'index' AND index_base_year = 2025 AND value > 0) OR "
            "(measurement_type IN ('monthly_rate', 'annual_rate') "
            "AND index_base_year IS NULL)",
            name="ck_hicp_observation_measurement",
        ),
        Index("ix_hicp_observations_reference_month", "reference_month", "series_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    series_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    source_code: Mapped[str] = mapped_column(String(40), nullable=False)
    reference_month: Mapped[date] = mapped_column(Date, nullable=False)
    measurement_type: Mapped[str] = mapped_column(String(24), nullable=False)
    index_base_year: Mapped[int | None] = mapped_column(SmallInteger)
    value: Mapped[Decimal] = mapped_column(Numeric(20, 10), nullable=False)
    status: Mapped[str | None] = mapped_column(String(20))
    ingestion_run_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    artifact_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class ExchangeRateObservation(Base):
    __tablename__ = "exchange_rate_observations"
    __table_args__ = (
        ForeignKeyConstraint(
            ["series_id", "source_code", "base_currency_code", "quote_currency_code"],
            [
                "source_series.id",
                "source_series.source_code",
                "source_series.base_currency_code",
                "source_series.quote_currency_code",
            ],
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["ingestion_run_id", "artifact_id", "source_code"],
            [
                "ingestion_run_artifacts.ingestion_run_id",
                "ingestion_run_artifacts.artifact_id",
                "ingestion_run_artifacts.source_code",
            ],
            ondelete="RESTRICT",
        ),
        UniqueConstraint("series_id", "reference_date", name="uq_exchange_observation_grain"),
        UniqueConstraint("id", "source_code", name="uq_exchange_observation_id_source"),
        CheckConstraint(
            "base_currency_code = 'EUR' AND base_currency_code <> quote_currency_code",
            name="ck_exchange_observation_currencies",
        ),
        CheckConstraint(
            "quote_convention = 'FOREIGN_CURRENCY_PER_EUR'",
            name="ck_exchange_observation_quote_convention",
        ),
        CheckConstraint("reference_rate > 0", name="ck_exchange_observation_rate"),
        CheckConstraint("source_precision BETWEEN 0 AND 15", name="ck_exchange_observation_precision"),
        Index("ix_exchange_observations_reference_date", "reference_date", "series_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    series_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    source_code: Mapped[str] = mapped_column(String(40), nullable=False)
    reference_date: Mapped[date] = mapped_column(Date, nullable=False)
    base_currency_code: Mapped[str] = mapped_column(
        ForeignKey("currencies.code", ondelete="RESTRICT"), nullable=False
    )
    quote_currency_code: Mapped[str] = mapped_column(
        ForeignKey("currencies.code", ondelete="RESTRICT"), nullable=False
    )
    reference_rate: Mapped[Decimal] = mapped_column(Numeric(30, 15), nullable=False)
    quote_convention: Mapped[str] = mapped_column(String(40), nullable=False)
    source_precision: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    status: Mapped[str | None] = mapped_column(String(20))
    confidentiality: Mapped[str | None] = mapped_column(String(20))
    ingestion_run_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    artifact_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class FuelPriceRevision(Base):
    __tablename__ = "fuel_price_revisions"
    __table_args__ = (
        ForeignKeyConstraint(
            ["observation_id", "source_code"],
            ["fuel_price_observations.id", "fuel_price_observations.source_code"],
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["previous_run_id", "previous_artifact_id", "source_code"],
            [
                "ingestion_run_artifacts.ingestion_run_id",
                "ingestion_run_artifacts.artifact_id",
                "ingestion_run_artifacts.source_code",
            ],
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["replacement_run_id", "replacement_artifact_id", "source_code"],
            [
                "ingestion_run_artifacts.ingestion_run_id",
                "ingestion_run_artifacts.artifact_id",
                "ingestion_run_artifacts.source_code",
            ],
            ondelete="RESTRICT",
        ),
        UniqueConstraint("observation_id", "replacement_run_id", name="uq_fuel_revision_observation_run"),
        CheckConstraint(
            "previous_raw_value > 0 AND revised_raw_value > 0 "
            "AND previous_price_eur_per_litre > 0 AND revised_price_eur_per_litre > 0",
            name="ck_fuel_revision_values",
        ),
        Index("ix_fuel_revisions_observation", "observation_id", "detected_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    observation_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    source_code: Mapped[str] = mapped_column(String(40), nullable=False)
    previous_raw_value: Mapped[Decimal] = mapped_column(Numeric(30, 15), nullable=False)
    revised_raw_value: Mapped[Decimal] = mapped_column(Numeric(30, 15), nullable=False)
    previous_price_eur_per_litre: Mapped[Decimal] = mapped_column(Numeric(30, 18), nullable=False)
    revised_price_eur_per_litre: Mapped[Decimal] = mapped_column(Numeric(30, 18), nullable=False)
    previous_status: Mapped[str | None] = mapped_column(String(20))
    revised_status: Mapped[str | None] = mapped_column(String(20))
    previous_publication_date: Mapped[date | None] = mapped_column(Date)
    revised_publication_date: Mapped[date | None] = mapped_column(Date)
    previous_run_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    previous_artifact_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    replacement_run_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    replacement_artifact_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    detected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class HicpObservationRevision(Base):
    __tablename__ = "hicp_observation_revisions"
    __table_args__ = (
        ForeignKeyConstraint(
            ["observation_id", "source_code"],
            ["hicp_observations.id", "hicp_observations.source_code"],
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["previous_run_id", "previous_artifact_id", "source_code"],
            [
                "ingestion_run_artifacts.ingestion_run_id",
                "ingestion_run_artifacts.artifact_id",
                "ingestion_run_artifacts.source_code",
            ],
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["replacement_run_id", "replacement_artifact_id", "source_code"],
            [
                "ingestion_run_artifacts.ingestion_run_id",
                "ingestion_run_artifacts.artifact_id",
                "ingestion_run_artifacts.source_code",
            ],
            ondelete="RESTRICT",
        ),
        UniqueConstraint("observation_id", "replacement_run_id", name="uq_hicp_revision_observation_run"),
        Index("ix_hicp_revisions_observation", "observation_id", "detected_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    observation_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    source_code: Mapped[str] = mapped_column(String(40), nullable=False)
    previous_value: Mapped[Decimal] = mapped_column(Numeric(20, 10), nullable=False)
    revised_value: Mapped[Decimal] = mapped_column(Numeric(20, 10), nullable=False)
    previous_status: Mapped[str | None] = mapped_column(String(20))
    revised_status: Mapped[str | None] = mapped_column(String(20))
    previous_run_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    previous_artifact_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    replacement_run_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    replacement_artifact_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    detected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class ExchangeRateRevision(Base):
    __tablename__ = "exchange_rate_revisions"
    __table_args__ = (
        ForeignKeyConstraint(
            ["observation_id", "source_code"],
            ["exchange_rate_observations.id", "exchange_rate_observations.source_code"],
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["previous_run_id", "previous_artifact_id", "source_code"],
            [
                "ingestion_run_artifacts.ingestion_run_id",
                "ingestion_run_artifacts.artifact_id",
                "ingestion_run_artifacts.source_code",
            ],
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["replacement_run_id", "replacement_artifact_id", "source_code"],
            [
                "ingestion_run_artifacts.ingestion_run_id",
                "ingestion_run_artifacts.artifact_id",
                "ingestion_run_artifacts.source_code",
            ],
            ondelete="RESTRICT",
        ),
        UniqueConstraint("observation_id", "replacement_run_id", name="uq_exchange_revision_observation_run"),
        CheckConstraint(
            "previous_rate > 0 AND revised_rate > 0",
            name="ck_exchange_revision_values",
        ),
        CheckConstraint(
            "previous_precision BETWEEN 0 AND 15 AND revised_precision BETWEEN 0 AND 15",
            name="ck_exchange_revision_precision",
        ),
        Index("ix_exchange_revisions_observation", "observation_id", "detected_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    observation_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    source_code: Mapped[str] = mapped_column(String(40), nullable=False)
    previous_rate: Mapped[Decimal] = mapped_column(Numeric(30, 15), nullable=False)
    revised_rate: Mapped[Decimal] = mapped_column(Numeric(30, 15), nullable=False)
    previous_status: Mapped[str | None] = mapped_column(String(20))
    revised_status: Mapped[str | None] = mapped_column(String(20))
    previous_confidentiality: Mapped[str | None] = mapped_column(String(20))
    revised_confidentiality: Mapped[str | None] = mapped_column(String(20))
    previous_precision: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    revised_precision: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    previous_run_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    previous_artifact_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    replacement_run_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    replacement_artifact_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    detected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
