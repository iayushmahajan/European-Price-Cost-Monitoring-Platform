"""Add the price/cost catalogue, provenance, and typed observation tables."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def _seed_catalogue():
    data_sources = sa.table(
        "data_sources",
        sa.column("code", sa.String),
        sa.column("name", sa.String),
        sa.column("description", sa.Text),
        sa.column("official_url", sa.Text),
        sa.column("licence_url", sa.Text),
        sa.column("default_frequency", sa.String),
    )
    op.bulk_insert(
        data_sources,
        [
            {
                "code": "ec_weekly_oil_bulletin",
                "name": "European Commission Weekly Oil Bulletin",
                "description": "Weekly EU consumer prices for petroleum products.",
                "official_url": "https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en",
                "licence_url": "https://commission.europa.eu/legal-notice_en",
                "default_frequency": "weekly",
            },
            {
                "code": "eurostat_prc_hicp_minr",
                "name": "Eurostat HICP (prc_hicp_minr)",
                "description": "Monthly harmonised consumer-price indices and rates of change.",
                "official_url": (
                    "https://ec.europa.eu/eurostat/databrowser/view/prc_hicp_minr/default/table"
                ),
                "licence_url": "https://ec.europa.eu/eurostat/help/copyright-notice",
                "default_frequency": "monthly",
            },
            {
                "code": "ecb_exr",
                "name": "ECB Euro Foreign Exchange Reference Rates",
                "description": "Daily informational exchange rates quoted against the euro.",
                "official_url": "https://data.ecb.europa.eu/data/datasets/EXR",
                "licence_url": (
                    "https://www.ecb.europa.eu/services/using-our-site/disclaimer/html/index.en.html"
                ),
                "default_frequency": "daily",
            },
        ],
    )

    currencies = sa.table(
        "currencies",
        sa.column("code", sa.String),
        sa.column("name", sa.String),
        sa.column("symbol", sa.String),
        sa.column("minor_unit", sa.SmallInteger),
    )
    op.bulk_insert(
        currencies,
        [
            {"code": "EUR", "name": "Euro", "symbol": "€", "minor_unit": 2},
            {"code": "CZK", "name": "Czech koruna", "symbol": "Kč", "minor_unit": 2},
            {"code": "DKK", "name": "Danish krone", "symbol": "kr", "minor_unit": 2},
            {"code": "HUF", "name": "Hungarian forint", "symbol": "Ft", "minor_unit": 2},
            {"code": "PLN", "name": "Polish złoty", "symbol": "zł", "minor_unit": 2},
            {"code": "RON", "name": "Romanian leu", "symbol": "lei", "minor_unit": 2},
            {"code": "SEK", "name": "Swedish krona", "symbol": "kr", "minor_unit": 2},
            {"code": "GBP", "name": "Pound sterling", "symbol": "£", "minor_unit": 2},
            {"code": "CHF", "name": "Swiss franc", "symbol": "CHF", "minor_unit": 2},
            {"code": "USD", "name": "US dollar", "symbol": "$", "minor_unit": 2},
        ],
    )

    units = sa.table(
        "measurement_units",
        sa.column("code", sa.String),
        sa.column("name", sa.String),
        sa.column("symbol", sa.String),
        sa.column("unit_kind", sa.String),
        sa.column("description", sa.Text),
    )
    op.bulk_insert(
        units,
        [
            {
                "code": "EUR_PER_1000_LITRES",
                "name": "Euro per 1,000 litres",
                "symbol": "EUR/1000 L",
                "unit_kind": "price",
                "description": "Raw Weekly Oil Bulletin motor-fuel price unit.",
            },
            {
                "code": "EUR_PER_LITRE",
                "name": "Euro per litre",
                "symbol": "EUR/L",
                "unit_kind": "price",
                "description": "Normalized consumer fuel price per litre.",
            },
            {
                "code": "INDEX_2025_100",
                "name": "Index, 2025=100",
                "symbol": "2025=100",
                "unit_kind": "index",
                "description": "HICP index relative to the 2025 reference period.",
            },
            {
                "code": "PERCENT",
                "name": "Percentage rate of change",
                "symbol": "%",
                "unit_kind": "percentage",
                "description": "Published monthly or annual percentage rate of change.",
            },
            {
                "code": "FOREIGN_CURRENCY_PER_EUR",
                "name": "Foreign-currency units per euro",
                "symbol": "quote currency/EUR",
                "unit_kind": "exchange_rate",
                "description": "ECB convention: one euro equals X quote-currency units.",
            },
        ],
    )

    geographies = sa.table(
        "geographies",
        sa.column("code", sa.String),
        sa.column("name", sa.String),
        sa.column("geography_type", sa.String),
        sa.column("iso_alpha2", sa.String),
        sa.column("parent_code", sa.String),
        sa.column("currency_code", sa.String),
        sa.column("source_codes", postgresql.JSONB),
    )
    country_rows = [
        ("AT", "Austria", "AT", "EUR"),
        ("BE", "Belgium", "BE", "EUR"),
        ("BG", "Bulgaria", "BG", "EUR"),
        ("HR", "Croatia", "HR", "EUR"),
        ("CY", "Cyprus", "CY", "EUR"),
        ("CZ", "Czechia", "CZ", "CZK"),
        ("DK", "Denmark", "DK", "DKK"),
        ("EE", "Estonia", "EE", "EUR"),
        ("FI", "Finland", "FI", "EUR"),
        ("FR", "France", "FR", "EUR"),
        ("DE", "Germany", "DE", "EUR"),
        ("EL", "Greece", "GR", "EUR"),
        ("HU", "Hungary", "HU", "HUF"),
        ("IE", "Ireland", "IE", "EUR"),
        ("IT", "Italy", "IT", "EUR"),
        ("LV", "Latvia", "LV", "EUR"),
        ("LT", "Lithuania", "LT", "EUR"),
        ("LU", "Luxembourg", "LU", "EUR"),
        ("MT", "Malta", "MT", "EUR"),
        ("NL", "Netherlands", "NL", "EUR"),
        ("PL", "Poland", "PL", "PLN"),
        ("PT", "Portugal", "PT", "EUR"),
        ("RO", "Romania", "RO", "RON"),
        ("SK", "Slovakia", "SK", "EUR"),
        ("SI", "Slovenia", "SI", "EUR"),
        ("ES", "Spain", "ES", "EUR"),
        ("SE", "Sweden", "SE", "SEK"),
    ]
    geography_rows = [
        {
            "code": "EU27_2020",
            "name": "European Union — 27 countries",
            "geography_type": "region",
            "iso_alpha2": None,
            "parent_code": None,
            "currency_code": None,
            "source_codes": {"eurostat": "EU27_2020"},
        }
    ]
    geography_rows.extend(
        {
            "code": code,
            "name": name,
            "geography_type": "country",
            "iso_alpha2": iso,
            "parent_code": "EU27_2020",
            "currency_code": currency,
            "source_codes": {"eurostat": code, "oil_bulletin": name},
        }
        for code, name, iso, currency in country_rows
    )
    op.bulk_insert(geographies, geography_rows)

    schemes = sa.table(
        "classification_schemes",
        sa.column("code", sa.String),
        sa.column("name", sa.String),
        sa.column("source_code", sa.String),
        sa.column("version", sa.String),
        sa.column("description", sa.Text),
    )
    op.bulk_insert(
        schemes,
        [
            {
                "code": "FUEL_PRODUCT",
                "name": "Weekly Oil Bulletin fuel products",
                "source_code": "ec_weekly_oil_bulletin",
                "version": "2026",
                "description": "Initial motor-fuel product scope.",
            },
            {
                "code": "ECOICOP_2018",
                "name": "ECOICOP version 2 / COICOP 2018",
                "source_code": "eurostat_prc_hicp_minr",
                "version": "2018",
                "description": "Consumer-purpose classification used by prc_hicp_minr.",
            },
        ],
    )

    categories = sa.table(
        "classification_categories",
        sa.column("scheme_code", sa.String),
        sa.column("code", sa.String),
        sa.column("name", sa.String),
        sa.column("parent_code", sa.String),
        sa.column("description", sa.Text),
    )
    op.bulk_insert(
        categories,
        [
            {
                "scheme_code": "FUEL_PRODUCT",
                "code": "EURO_SUPER_95",
                "name": "Euro-super 95 petrol",
                "parent_code": None,
                "description": "Motor petrol reported as Euro-super 95.",
            },
            {
                "scheme_code": "FUEL_PRODUCT",
                "code": "AUTOMOTIVE_DIESEL",
                "name": "Automotive diesel",
                "parent_code": None,
                "description": "Automotive gas oil / diesel motor fuel.",
            },
            {
                "scheme_code": "ECOICOP_2018",
                "code": "TOTAL",
                "name": "All items",
                "parent_code": None,
                "description": "All-items HICP.",
            },
            {
                "scheme_code": "ECOICOP_2018",
                "code": "CP01",
                "name": "Food and non-alcoholic beverages",
                "parent_code": None,
                "description": "ECOICOP division 01.",
            },
            {
                "scheme_code": "ECOICOP_2018",
                "code": "CP03",
                "name": "Clothing and footwear",
                "parent_code": None,
                "description": "ECOICOP division 03.",
            },
            {
                "scheme_code": "ECOICOP_2018",
                "code": "CP04",
                "name": "Housing, water, electricity, gas and other fuels",
                "parent_code": None,
                "description": "ECOICOP division 04.",
            },
            {
                "scheme_code": "ECOICOP_2018",
                "code": "CP06",
                "name": "Health",
                "parent_code": None,
                "description": "ECOICOP division 06.",
            },
            {
                "scheme_code": "ECOICOP_2018",
                "code": "CP07",
                "name": "Transport",
                "parent_code": None,
                "description": "ECOICOP division 07.",
            },
            {
                "scheme_code": "ECOICOP_2018",
                "code": "CP11",
                "name": "Restaurants and accommodation services",
                "parent_code": None,
                "description": "ECOICOP division 11.",
            },
        ],
    )

    indicators = sa.table(
        "indicator_definitions",
        sa.column("source_code", sa.String),
        sa.column("code", sa.String),
        sa.column("name", sa.String),
        sa.column("description", sa.Text),
        sa.column("series_kind", sa.String),
        sa.column("frequency", sa.String),
        sa.column("measurement_type", sa.String),
        sa.column("reference_base", sa.String),
    )
    op.bulk_insert(
        indicators,
        [
            {
                "source_code": "ec_weekly_oil_bulletin",
                "code": "FUEL_PRICE",
                "name": "Weekly consumer fuel price",
                "description": "Reported consumer price, normalized to EUR per litre.",
                "series_kind": "fuel_price",
                "frequency": "weekly",
                "measurement_type": "price",
                "reference_base": None,
            },
            {
                "source_code": "eurostat_prc_hicp_minr",
                "code": "I25",
                "name": "HICP index, 2025=100",
                "description": "Published HICP index level.",
                "series_kind": "hicp",
                "frequency": "monthly",
                "measurement_type": "index",
                "reference_base": "2025=100",
            },
            {
                "source_code": "eurostat_prc_hicp_minr",
                "code": "RCH_M",
                "name": "HICP monthly rate",
                "description": "Change from the preceding month.",
                "series_kind": "hicp",
                "frequency": "monthly",
                "measurement_type": "monthly_rate",
                "reference_base": None,
            },
            {
                "source_code": "eurostat_prc_hicp_minr",
                "code": "RCH_A",
                "name": "HICP annual rate",
                "description": "Change from the same month a year earlier.",
                "series_kind": "hicp",
                "frequency": "monthly",
                "measurement_type": "annual_rate",
                "reference_base": None,
            },
            {
                "source_code": "ecb_exr",
                "code": "EXR_SP00",
                "name": "ECB euro foreign-exchange reference rate",
                "description": "Informational spot reference rate quoted against EUR.",
                "series_kind": "exchange_rate",
                "frequency": "daily",
                "measurement_type": "reference_rate",
                "reference_base": "1 EUR",
            },
        ],
    )

    allowed_units = sa.table(
        "indicator_allowed_units",
        sa.column("source_code", sa.String),
        sa.column("indicator_code", sa.String),
        sa.column("unit_code", sa.String),
    )
    op.bulk_insert(
        allowed_units,
        [
            {
                "source_code": "ec_weekly_oil_bulletin",
                "indicator_code": "FUEL_PRICE",
                "unit_code": "EUR_PER_LITRE",
            },
            {"source_code": "eurostat_prc_hicp_minr", "indicator_code": "I25", "unit_code": "INDEX_2025_100"},
            {"source_code": "eurostat_prc_hicp_minr", "indicator_code": "RCH_M", "unit_code": "PERCENT"},
            {"source_code": "eurostat_prc_hicp_minr", "indicator_code": "RCH_A", "unit_code": "PERCENT"},
            {"source_code": "ecb_exr", "indicator_code": "EXR_SP00", "unit_code": "FOREIGN_CURRENCY_PER_EUR"},
        ],
    )

    allowed_categories = sa.table(
        "indicator_allowed_categories",
        sa.column("source_code", sa.String),
        sa.column("indicator_code", sa.String),
        sa.column("scheme_code", sa.String),
        sa.column("category_code", sa.String),
    )
    category_rows = [
        {
            "source_code": "ec_weekly_oil_bulletin",
            "indicator_code": "FUEL_PRICE",
            "scheme_code": "FUEL_PRODUCT",
            "category_code": code,
        }
        for code in ("EURO_SUPER_95", "AUTOMOTIVE_DIESEL")
    ]
    category_rows.extend(
        {
            "source_code": "eurostat_prc_hicp_minr",
            "indicator_code": indicator,
            "scheme_code": "ECOICOP_2018",
            "category_code": category,
        }
        for indicator in ("I25", "RCH_M", "RCH_A")
        for category in ("TOTAL", "CP01", "CP03", "CP04", "CP06", "CP07", "CP11")
    )
    op.bulk_insert(allowed_categories, category_rows)

    sync_states = sa.table(
        "synchronization_states",
        sa.column("source_code", sa.String),
        sa.column("status", sa.String),
    )
    op.bulk_insert(
        sync_states,
        [
            {"source_code": "ec_weekly_oil_bulletin", "status": "never_run"},
            {"source_code": "eurostat_prc_hicp_minr", "status": "never_run"},
            {"source_code": "ecb_exr", "status": "never_run"},
        ],
    )


def upgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    op.create_table(
        "currencies",
        sa.Column("code", sa.String(length=3), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("symbol", sa.String(length=8), nullable=True),
        sa.Column("minor_unit", sa.SmallInteger(), server_default="2", nullable=False),
        sa.CheckConstraint("code = upper(code) AND length(code) = 3", name="ck_currency_code"),
        sa.CheckConstraint("minor_unit BETWEEN 0 AND 6", name="ck_currency_minor_unit"),
        sa.PrimaryKeyConstraint("code"),
        sa.UniqueConstraint("name"),
    )
    op.create_table(
        "data_sources",
        sa.Column("code", sa.String(length=40), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("official_url", sa.Text(), nullable=False),
        sa.Column("licence_url", sa.Text(), nullable=False),
        sa.Column("default_frequency", sa.String(length=12), nullable=False),
        sa.Column("active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.CheckConstraint(
            "default_frequency IN ('daily', 'weekly', 'monthly')", name="ck_data_source_frequency"
        ),
        sa.PrimaryKeyConstraint("code"),
        sa.UniqueConstraint("name"),
    )
    op.create_table(
        "measurement_units",
        sa.Column("code", sa.String(length=40), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("symbol", sa.String(length=40), nullable=False),
        sa.Column("unit_kind", sa.String(length=20), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.CheckConstraint(
            "unit_kind IN ('price', 'index', 'percentage', 'exchange_rate')", name="ck_measurement_unit_kind"
        ),
        sa.PrimaryKeyConstraint("code"),
        sa.UniqueConstraint("name"),
    )
    op.create_table(
        "classification_schemes",
        sa.Column("code", sa.String(length=40), nullable=False),
        sa.Column("name", sa.String(length=140), nullable=False),
        sa.Column("source_code", sa.String(length=40), nullable=False),
        sa.Column("version", sa.String(length=40), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(["source_code"], ["data_sources.code"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("code"),
        sa.UniqueConstraint("name"),
    )
    op.create_table(
        "geographies",
        sa.Column("code", sa.String(length=20), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("geography_type", sa.String(length=12), nullable=False),
        sa.Column("iso_alpha2", sa.String(length=2), nullable=True),
        sa.Column("parent_code", sa.String(length=20), nullable=True),
        sa.Column("currency_code", sa.String(length=3), nullable=True),
        sa.Column(
            "source_codes",
            sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql"),
            server_default=sa.text("'{}'"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "(geography_type = 'country' AND iso_alpha2 IS NOT NULL) OR (geography_type = 'region' AND iso_alpha2 IS NULL)",
            name="ck_geography_iso_by_type",
        ),
        sa.CheckConstraint("geography_type IN ('country', 'region')", name="ck_geography_type"),
        sa.CheckConstraint("jsonb_typeof(source_codes) = 'object'", name="ck_geography_source_codes_object"),
        sa.ForeignKeyConstraint(["currency_code"], ["currencies.code"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["parent_code"], ["geographies.code"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("code"),
        sa.UniqueConstraint("name"),
    )
    op.create_index(
        "uq_geographies_iso_alpha2",
        "geographies",
        ["iso_alpha2"],
        unique=True,
        postgresql_where=sa.text("iso_alpha2 IS NOT NULL"),
    )
    op.create_table(
        "indicator_definitions",
        sa.Column("source_code", sa.String(length=40), nullable=False),
        sa.Column("code", sa.String(length=40), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("series_kind", sa.String(length=20), nullable=False),
        sa.Column("frequency", sa.String(length=12), nullable=False),
        sa.Column("measurement_type", sa.String(length=24), nullable=False),
        sa.Column("reference_base", sa.String(length=80), nullable=True),
        sa.CheckConstraint(
            "(series_kind = 'fuel_price' AND measurement_type = 'price') OR (series_kind = 'hicp' AND measurement_type IN ('index', 'monthly_rate', 'annual_rate')) OR (series_kind = 'exchange_rate' AND measurement_type = 'reference_rate')",
            name="ck_indicator_measurement_type",
        ),
        sa.CheckConstraint("frequency IN ('daily', 'weekly', 'monthly')", name="ck_indicator_frequency"),
        sa.CheckConstraint(
            "series_kind IN ('fuel_price', 'hicp', 'exchange_rate')", name="ck_indicator_series_kind"
        ),
        sa.ForeignKeyConstraint(["source_code"], ["data_sources.code"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("source_code", "code"),
        sa.UniqueConstraint(
            "source_code",
            "code",
            "series_kind",
            "frequency",
            "measurement_type",
            name="uq_indicator_series_contract",
        ),
    )
    op.create_table(
        "ingestion_runs",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("source_code", sa.String(length=40), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("trigger_type", sa.String(length=16), nullable=False),
        sa.Column("adapter_version", sa.String(length=40), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("source_updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("fetched_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("parsed_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("inserted_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("updated_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("missing_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("revision_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("error_summary", sa.Text(), nullable=True),
        sa.CheckConstraint(
            "(status = 'running' AND completed_at IS NULL) OR (status <> 'running' AND completed_at IS NOT NULL)",
            name="ck_ingestion_run_completion",
        ),
        sa.CheckConstraint(
            "status IN ('running', 'succeeded', 'failed', 'no_change')", name="ck_ingestion_run_status"
        ),
        sa.CheckConstraint(
            "trigger_type IN ('manual', 'scheduled', 'test')", name="ck_ingestion_run_trigger"
        ),
        sa.CheckConstraint(
            "fetched_count >= 0 AND parsed_count >= 0 AND inserted_count >= 0 AND updated_count >= 0 AND missing_count >= 0 AND revision_count >= 0",
            name="ck_ingestion_run_counts",
        ),
        sa.ForeignKeyConstraint(["source_code"], ["data_sources.code"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("id", "source_code", name="uq_ingestion_run_id_source"),
    )
    op.create_index(
        "ix_ingestion_runs_source_started", "ingestion_runs", ["source_code", "started_at"], unique=False
    )
    op.create_table(
        "source_artifacts",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("source_code", sa.String(length=40), nullable=False),
        sa.Column("source_url", sa.Text(), nullable=False),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.Column("byte_size", sa.BigInteger(), nullable=False),
        sa.Column("content_type", sa.String(length=120), nullable=False),
        sa.Column(
            "retrieved_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reference_period_start", sa.Date(), nullable=True),
        sa.Column("reference_period_end", sa.Date(), nullable=True),
        sa.Column("storage_path", sa.Text(), nullable=True),
        sa.Column(
            "metadata",
            sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql"),
            server_default=sa.text("'{}'"),
            nullable=False,
        ),
        sa.CheckConstraint("jsonb_typeof(metadata) = 'object'", name="ck_source_artifact_metadata_object"),
        sa.CheckConstraint("byte_size > 0", name="ck_source_artifact_size"),
        sa.CheckConstraint(
            "length(sha256) = 64 AND sha256 = lower(sha256)", name="ck_source_artifact_sha256"
        ),
        sa.CheckConstraint("sha256 ~ '^[0-9a-f]{64}$'", name="ck_source_artifact_sha256_hex"),
        sa.CheckConstraint(
            "reference_period_end IS NULL OR reference_period_start IS NULL OR reference_period_end >= reference_period_start",
            name="ck_source_artifact_period",
        ),
        sa.ForeignKeyConstraint(["source_code"], ["data_sources.code"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("id", "source_code", name="uq_source_artifact_id_source"),
        sa.UniqueConstraint("source_code", "sha256", name="uq_source_artifact_hash"),
    )
    op.create_index(
        "ix_source_artifacts_source_retrieved",
        "source_artifacts",
        ["source_code", "retrieved_at"],
        unique=False,
    )
    op.create_table(
        "classification_categories",
        sa.Column("scheme_code", sa.String(length=40), nullable=False),
        sa.Column("code", sa.String(length=40), nullable=False),
        sa.Column("name", sa.String(length=180), nullable=False),
        sa.Column("parent_code", sa.String(length=40), nullable=True),
        sa.Column("description", sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(
            ["scheme_code", "parent_code"],
            ["classification_categories.scheme_code", "classification_categories.code"],
            name="fk_classification_category_parent",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(["scheme_code"], ["classification_schemes.code"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("scheme_code", "code"),
    )
    op.create_table(
        "indicator_allowed_units",
        sa.Column("source_code", sa.String(length=40), nullable=False),
        sa.Column("indicator_code", sa.String(length=40), nullable=False),
        sa.Column("unit_code", sa.String(length=40), nullable=False),
        sa.ForeignKeyConstraint(
            ["source_code", "indicator_code"],
            ["indicator_definitions.source_code", "indicator_definitions.code"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(["unit_code"], ["measurement_units.code"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("source_code", "indicator_code", "unit_code"),
    )
    op.create_table(
        "ingestion_run_artifacts",
        sa.Column("ingestion_run_id", sa.BigInteger(), nullable=False),
        sa.Column("artifact_id", sa.BigInteger(), nullable=False),
        sa.Column("source_code", sa.String(length=40), nullable=False),
        sa.Column("role", sa.String(length=16), server_default="primary", nullable=False),
        sa.CheckConstraint("role IN ('primary', 'supporting')", name="ck_run_artifact_role"),
        sa.ForeignKeyConstraint(
            ["artifact_id", "source_code"],
            ["source_artifacts.id", "source_artifacts.source_code"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["ingestion_run_id", "source_code"],
            ["ingestion_runs.id", "ingestion_runs.source_code"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("ingestion_run_id", "artifact_id"),
        sa.UniqueConstraint("ingestion_run_id", "artifact_id", "source_code", name="uq_run_artifact_source"),
    )
    op.create_table(
        "synchronization_states",
        sa.Column("source_code", sa.String(length=40), nullable=False),
        sa.Column("status", sa.String(length=16), server_default="never_run", nullable=False),
        sa.Column("last_attempt_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_success_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_run_id", sa.BigInteger(), nullable=True),
        sa.Column("etag", sa.Text(), nullable=True),
        sa.Column("last_modified", sa.Text(), nullable=True),
        sa.Column(
            "cursor",
            sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql"),
            server_default=sa.text("'{}'"),
            nullable=False,
        ),
        sa.Column("consecutive_failures", sa.Integer(), server_default="0", nullable=False),
        sa.CheckConstraint("jsonb_typeof(cursor) = 'object'", name="ck_synchronization_state_cursor_object"),
        sa.CheckConstraint(
            "status IN ('never_run', 'current', 'stale', 'failed')", name="ck_synchronization_state_status"
        ),
        sa.CheckConstraint("consecutive_failures >= 0", name="ck_synchronization_state_failures"),
        sa.CheckConstraint(
            "last_success_at IS NULL OR last_attempt_at IS NULL OR last_success_at <= last_attempt_at",
            name="ck_synchronization_state_times",
        ),
        sa.ForeignKeyConstraint(
            ["last_run_id", "source_code"],
            ["ingestion_runs.id", "ingestion_runs.source_code"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(["source_code"], ["data_sources.code"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("source_code"),
    )
    op.create_table(
        "indicator_allowed_categories",
        sa.Column("source_code", sa.String(length=40), nullable=False),
        sa.Column("indicator_code", sa.String(length=40), nullable=False),
        sa.Column("scheme_code", sa.String(length=40), nullable=False),
        sa.Column("category_code", sa.String(length=40), nullable=False),
        sa.ForeignKeyConstraint(
            ["scheme_code", "category_code"],
            ["classification_categories.scheme_code", "classification_categories.code"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["source_code", "indicator_code"],
            ["indicator_definitions.source_code", "indicator_definitions.code"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("source_code", "indicator_code", "scheme_code", "category_code"),
    )
    op.create_table(
        "source_series",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("source_code", sa.String(length=40), nullable=False),
        sa.Column("external_key", sa.Text(), nullable=False),
        sa.Column("series_kind", sa.String(length=20), nullable=False),
        sa.Column("indicator_code", sa.String(length=40), nullable=False),
        sa.Column("geography_code", sa.String(length=20), nullable=True),
        sa.Column("classification_scheme_code", sa.String(length=40), nullable=True),
        sa.Column("category_code", sa.String(length=40), nullable=True),
        sa.Column("unit_code", sa.String(length=40), nullable=False),
        sa.Column("frequency", sa.String(length=12), nullable=False),
        sa.Column("measurement_type", sa.String(length=24), nullable=False),
        sa.Column("tax_basis", sa.String(length=20), nullable=True),
        sa.Column("currency_code", sa.String(length=3), nullable=True),
        sa.Column("base_currency_code", sa.String(length=3), nullable=True),
        sa.Column("quote_currency_code", sa.String(length=3), nullable=True),
        sa.Column(
            "source_dimensions",
            sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql"),
            server_default=sa.text("'{}'"),
            nullable=False,
        ),
        sa.Column("active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "(series_kind = 'fuel_price' AND frequency = 'weekly' AND geography_code IS NOT NULL AND category_code IS NOT NULL AND tax_basis IN ('with_tax', 'without_tax') AND measurement_type = 'price' AND currency_code = 'EUR' AND base_currency_code IS NULL AND quote_currency_code IS NULL) OR (series_kind = 'hicp' AND frequency = 'monthly' AND geography_code IS NOT NULL AND category_code IS NOT NULL AND tax_basis IS NULL AND currency_code IS NULL AND base_currency_code IS NULL AND quote_currency_code IS NULL AND measurement_type IN ('index', 'monthly_rate', 'annual_rate')) OR (series_kind = 'exchange_rate' AND frequency = 'daily' AND geography_code IS NULL AND category_code IS NULL AND tax_basis IS NULL AND currency_code IS NULL AND base_currency_code = 'EUR' AND quote_currency_code IS NOT NULL AND base_currency_code <> quote_currency_code AND measurement_type = 'reference_rate')",
            name="ck_source_series_dimensions",
        ),
        sa.CheckConstraint("frequency IN ('daily', 'weekly', 'monthly')", name="ck_source_series_frequency"),
        sa.CheckConstraint(
            "series_kind IN ('fuel_price', 'hicp', 'exchange_rate')", name="ck_source_series_kind"
        ),
        sa.CheckConstraint(
            "(classification_scheme_code IS NULL) = (category_code IS NULL)",
            name="ck_source_series_category_pair",
        ),
        sa.ForeignKeyConstraint(["base_currency_code"], ["currencies.code"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["classification_scheme_code", "category_code"],
            ["classification_categories.scheme_code", "classification_categories.code"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(["currency_code"], ["currencies.code"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["geography_code"], ["geographies.code"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["quote_currency_code"], ["currencies.code"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["source_code", "indicator_code", "classification_scheme_code", "category_code"],
            [
                "indicator_allowed_categories.source_code",
                "indicator_allowed_categories.indicator_code",
                "indicator_allowed_categories.scheme_code",
                "indicator_allowed_categories.category_code",
            ],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["source_code", "indicator_code", "series_kind", "frequency", "measurement_type"],
            [
                "indicator_definitions.source_code",
                "indicator_definitions.code",
                "indicator_definitions.series_kind",
                "indicator_definitions.frequency",
                "indicator_definitions.measurement_type",
            ],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["source_code", "indicator_code", "unit_code"],
            [
                "indicator_allowed_units.source_code",
                "indicator_allowed_units.indicator_code",
                "indicator_allowed_units.unit_code",
            ],
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "id",
            "source_code",
            "base_currency_code",
            "quote_currency_code",
            name="uq_source_series_exchange_currencies",
        ),
        sa.UniqueConstraint("id", "source_code", "measurement_type", name="uq_source_series_measurement"),
        sa.UniqueConstraint("id", "source_code", name="uq_source_series_id_source"),
        sa.UniqueConstraint("source_code", "external_key", name="uq_source_series_external_key"),
    )
    op.create_index("ix_source_series_geography", "source_series", ["geography_code"], unique=False)
    op.create_index(
        "ix_source_series_source_kind", "source_series", ["source_code", "series_kind"], unique=False
    )
    op.create_index(
        "uq_exchange_series_dimensions",
        "source_series",
        ["source_code", "indicator_code", "base_currency_code", "quote_currency_code"],
        unique=True,
        postgresql_where=sa.text("series_kind = 'exchange_rate'"),
    )
    op.create_index(
        "uq_fuel_series_dimensions",
        "source_series",
        [
            "source_code",
            "indicator_code",
            "geography_code",
            "classification_scheme_code",
            "category_code",
            "tax_basis",
        ],
        unique=True,
        postgresql_where=sa.text("series_kind = 'fuel_price'"),
    )
    op.create_index(
        "uq_hicp_series_dimensions",
        "source_series",
        ["source_code", "indicator_code", "geography_code", "classification_scheme_code", "category_code"],
        unique=True,
        postgresql_where=sa.text("series_kind = 'hicp'"),
    )
    op.create_table(
        "data_quality_events",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("ingestion_run_id", sa.BigInteger(), nullable=False),
        sa.Column("source_code", sa.String(length=40), nullable=False),
        sa.Column("series_id", sa.BigInteger(), nullable=True),
        sa.Column("event_code", sa.String(length=60), nullable=False),
        sa.Column("severity", sa.String(length=12), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("reference_period", sa.Date(), nullable=True),
        sa.Column(
            "details",
            sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql"),
            server_default=sa.text("'{}'"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("jsonb_typeof(details) = 'object'", name="ck_data_quality_details_object"),
        sa.CheckConstraint("severity IN ('info', 'warning', 'error')", name="ck_data_quality_severity"),
        sa.ForeignKeyConstraint(
            ["ingestion_run_id", "source_code"],
            ["ingestion_runs.id", "ingestion_runs.source_code"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["series_id", "source_code"],
            ["source_series.id", "source_series.source_code"],
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_data_quality_run_severity", "data_quality_events", ["ingestion_run_id", "severity"], unique=False
    )
    op.create_table(
        "exchange_rate_observations",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("series_id", sa.BigInteger(), nullable=False),
        sa.Column("source_code", sa.String(length=40), nullable=False),
        sa.Column("reference_date", sa.Date(), nullable=False),
        sa.Column("base_currency_code", sa.String(length=3), nullable=False),
        sa.Column("quote_currency_code", sa.String(length=3), nullable=False),
        sa.Column("reference_rate", sa.Numeric(precision=30, scale=15), nullable=False),
        sa.Column("quote_convention", sa.String(length=40), nullable=False),
        sa.Column("source_precision", sa.SmallInteger(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=True),
        sa.Column("confidentiality", sa.String(length=20), nullable=True),
        sa.Column("ingestion_run_id", sa.BigInteger(), nullable=False),
        sa.Column("artifact_id", sa.BigInteger(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "base_currency_code = 'EUR' AND base_currency_code <> quote_currency_code",
            name="ck_exchange_observation_currencies",
        ),
        sa.CheckConstraint(
            "quote_convention = 'FOREIGN_CURRENCY_PER_EUR'", name="ck_exchange_observation_quote_convention"
        ),
        sa.CheckConstraint("reference_rate > 0", name="ck_exchange_observation_rate"),
        sa.CheckConstraint("source_precision BETWEEN 0 AND 15", name="ck_exchange_observation_precision"),
        sa.ForeignKeyConstraint(["base_currency_code"], ["currencies.code"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["ingestion_run_id", "artifact_id", "source_code"],
            [
                "ingestion_run_artifacts.ingestion_run_id",
                "ingestion_run_artifacts.artifact_id",
                "ingestion_run_artifacts.source_code",
            ],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(["quote_currency_code"], ["currencies.code"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["series_id", "source_code", "base_currency_code", "quote_currency_code"],
            [
                "source_series.id",
                "source_series.source_code",
                "source_series.base_currency_code",
                "source_series.quote_currency_code",
            ],
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("id", "source_code", name="uq_exchange_observation_id_source"),
        sa.UniqueConstraint("series_id", "reference_date", name="uq_exchange_observation_grain"),
    )
    op.create_index(
        "ix_exchange_observations_reference_date",
        "exchange_rate_observations",
        ["reference_date", "series_id"],
        unique=False,
    )
    op.create_table(
        "fuel_price_observations",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("series_id", sa.BigInteger(), nullable=False),
        sa.Column("source_code", sa.String(length=40), nullable=False),
        sa.Column("reference_week", sa.Date(), nullable=False),
        sa.Column("publication_date", sa.Date(), nullable=True),
        sa.Column("raw_value", sa.Numeric(precision=30, scale=15), nullable=False),
        sa.Column("raw_unit_code", sa.String(length=40), nullable=False),
        sa.Column("normalized_price_eur_per_litre", sa.Numeric(precision=30, scale=18), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=True),
        sa.Column("ingestion_run_id", sa.BigInteger(), nullable=False),
        sa.Column("artifact_id", sa.BigInteger(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("raw_unit_code = 'EUR_PER_1000_LITRES'", name="ck_fuel_observation_raw_unit"),
        sa.CheckConstraint(
            "normalized_price_eur_per_litre = raw_value / 1000", name="ck_fuel_observation_normalization"
        ),
        sa.CheckConstraint("normalized_price_eur_per_litre > 0", name="ck_fuel_observation_normalized_value"),
        sa.CheckConstraint(
            "publication_date IS NULL OR publication_date >= reference_week",
            name="ck_fuel_observation_publication_date",
        ),
        sa.CheckConstraint("raw_value > 0", name="ck_fuel_observation_raw_value"),
        sa.ForeignKeyConstraint(
            ["ingestion_run_id", "artifact_id", "source_code"],
            [
                "ingestion_run_artifacts.ingestion_run_id",
                "ingestion_run_artifacts.artifact_id",
                "ingestion_run_artifacts.source_code",
            ],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(["raw_unit_code"], ["measurement_units.code"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["series_id", "source_code"],
            ["source_series.id", "source_series.source_code"],
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("id", "source_code", name="uq_fuel_observation_id_source"),
        sa.UniqueConstraint("series_id", "reference_week", name="uq_fuel_observation_grain"),
    )
    op.create_index(
        "ix_fuel_observations_reference_week",
        "fuel_price_observations",
        ["reference_week", "series_id"],
        unique=False,
    )
    op.create_table(
        "hicp_observations",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("series_id", sa.BigInteger(), nullable=False),
        sa.Column("source_code", sa.String(length=40), nullable=False),
        sa.Column("reference_month", sa.Date(), nullable=False),
        sa.Column("measurement_type", sa.String(length=24), nullable=False),
        sa.Column("index_base_year", sa.SmallInteger(), nullable=True),
        sa.Column("value", sa.Numeric(precision=20, scale=10), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=True),
        sa.Column("ingestion_run_id", sa.BigInteger(), nullable=False),
        sa.Column("artifact_id", sa.BigInteger(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "(measurement_type = 'index' AND index_base_year = 2025 AND value > 0) OR (measurement_type IN ('monthly_rate', 'annual_rate') AND index_base_year IS NULL)",
            name="ck_hicp_observation_measurement",
        ),
        sa.CheckConstraint(
            "reference_month = CAST(date_trunc('month', reference_month) AS DATE)",
            name="ck_hicp_observation_month_start",
        ),
        sa.ForeignKeyConstraint(
            ["ingestion_run_id", "artifact_id", "source_code"],
            [
                "ingestion_run_artifacts.ingestion_run_id",
                "ingestion_run_artifacts.artifact_id",
                "ingestion_run_artifacts.source_code",
            ],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["series_id", "source_code", "measurement_type"],
            ["source_series.id", "source_series.source_code", "source_series.measurement_type"],
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("id", "source_code", name="uq_hicp_observation_id_source"),
        sa.UniqueConstraint("series_id", "reference_month", name="uq_hicp_observation_grain"),
    )
    op.create_index(
        "ix_hicp_observations_reference_month",
        "hicp_observations",
        ["reference_month", "series_id"],
        unique=False,
    )
    op.create_table(
        "exchange_rate_revisions",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("observation_id", sa.BigInteger(), nullable=False),
        sa.Column("source_code", sa.String(length=40), nullable=False),
        sa.Column("previous_rate", sa.Numeric(precision=30, scale=15), nullable=False),
        sa.Column("revised_rate", sa.Numeric(precision=30, scale=15), nullable=False),
        sa.Column("previous_status", sa.String(length=20), nullable=True),
        sa.Column("revised_status", sa.String(length=20), nullable=True),
        sa.Column("previous_confidentiality", sa.String(length=20), nullable=True),
        sa.Column("revised_confidentiality", sa.String(length=20), nullable=True),
        sa.Column("previous_precision", sa.SmallInteger(), nullable=False),
        sa.Column("revised_precision", sa.SmallInteger(), nullable=False),
        sa.Column("previous_run_id", sa.BigInteger(), nullable=False),
        sa.Column("previous_artifact_id", sa.BigInteger(), nullable=False),
        sa.Column("replacement_run_id", sa.BigInteger(), nullable=False),
        sa.Column("replacement_artifact_id", sa.BigInteger(), nullable=False),
        sa.Column("detected_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "previous_precision BETWEEN 0 AND 15 AND revised_precision BETWEEN 0 AND 15",
            name="ck_exchange_revision_precision",
        ),
        sa.CheckConstraint("previous_rate > 0 AND revised_rate > 0", name="ck_exchange_revision_values"),
        sa.ForeignKeyConstraint(
            ["observation_id", "source_code"],
            ["exchange_rate_observations.id", "exchange_rate_observations.source_code"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["previous_run_id", "previous_artifact_id", "source_code"],
            [
                "ingestion_run_artifacts.ingestion_run_id",
                "ingestion_run_artifacts.artifact_id",
                "ingestion_run_artifacts.source_code",
            ],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["replacement_run_id", "replacement_artifact_id", "source_code"],
            [
                "ingestion_run_artifacts.ingestion_run_id",
                "ingestion_run_artifacts.artifact_id",
                "ingestion_run_artifacts.source_code",
            ],
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "observation_id", "replacement_run_id", name="uq_exchange_revision_observation_run"
        ),
    )
    op.create_index(
        "ix_exchange_revisions_observation",
        "exchange_rate_revisions",
        ["observation_id", "detected_at"],
        unique=False,
    )
    op.create_table(
        "fuel_price_revisions",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("observation_id", sa.BigInteger(), nullable=False),
        sa.Column("source_code", sa.String(length=40), nullable=False),
        sa.Column("previous_raw_value", sa.Numeric(precision=30, scale=15), nullable=False),
        sa.Column("revised_raw_value", sa.Numeric(precision=30, scale=15), nullable=False),
        sa.Column("previous_price_eur_per_litre", sa.Numeric(precision=30, scale=18), nullable=False),
        sa.Column("revised_price_eur_per_litre", sa.Numeric(precision=30, scale=18), nullable=False),
        sa.Column("previous_status", sa.String(length=20), nullable=True),
        sa.Column("revised_status", sa.String(length=20), nullable=True),
        sa.Column("previous_publication_date", sa.Date(), nullable=True),
        sa.Column("revised_publication_date", sa.Date(), nullable=True),
        sa.Column("previous_run_id", sa.BigInteger(), nullable=False),
        sa.Column("previous_artifact_id", sa.BigInteger(), nullable=False),
        sa.Column("replacement_run_id", sa.BigInteger(), nullable=False),
        sa.Column("replacement_artifact_id", sa.BigInteger(), nullable=False),
        sa.Column("detected_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "previous_raw_value > 0 AND revised_raw_value > 0 AND previous_price_eur_per_litre > 0 AND revised_price_eur_per_litre > 0",
            name="ck_fuel_revision_values",
        ),
        sa.ForeignKeyConstraint(
            ["observation_id", "source_code"],
            ["fuel_price_observations.id", "fuel_price_observations.source_code"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["previous_run_id", "previous_artifact_id", "source_code"],
            [
                "ingestion_run_artifacts.ingestion_run_id",
                "ingestion_run_artifacts.artifact_id",
                "ingestion_run_artifacts.source_code",
            ],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["replacement_run_id", "replacement_artifact_id", "source_code"],
            [
                "ingestion_run_artifacts.ingestion_run_id",
                "ingestion_run_artifacts.artifact_id",
                "ingestion_run_artifacts.source_code",
            ],
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("observation_id", "replacement_run_id", name="uq_fuel_revision_observation_run"),
    )
    op.create_index(
        "ix_fuel_revisions_observation",
        "fuel_price_revisions",
        ["observation_id", "detected_at"],
        unique=False,
    )
    op.create_table(
        "hicp_observation_revisions",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("observation_id", sa.BigInteger(), nullable=False),
        sa.Column("source_code", sa.String(length=40), nullable=False),
        sa.Column("previous_value", sa.Numeric(precision=20, scale=10), nullable=False),
        sa.Column("revised_value", sa.Numeric(precision=20, scale=10), nullable=False),
        sa.Column("previous_status", sa.String(length=20), nullable=True),
        sa.Column("revised_status", sa.String(length=20), nullable=True),
        sa.Column("previous_run_id", sa.BigInteger(), nullable=False),
        sa.Column("previous_artifact_id", sa.BigInteger(), nullable=False),
        sa.Column("replacement_run_id", sa.BigInteger(), nullable=False),
        sa.Column("replacement_artifact_id", sa.BigInteger(), nullable=False),
        sa.Column("detected_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["observation_id", "source_code"],
            ["hicp_observations.id", "hicp_observations.source_code"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["previous_run_id", "previous_artifact_id", "source_code"],
            [
                "ingestion_run_artifacts.ingestion_run_id",
                "ingestion_run_artifacts.artifact_id",
                "ingestion_run_artifacts.source_code",
            ],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["replacement_run_id", "replacement_artifact_id", "source_code"],
            [
                "ingestion_run_artifacts.ingestion_run_id",
                "ingestion_run_artifacts.artifact_id",
                "ingestion_run_artifacts.source_code",
            ],
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("observation_id", "replacement_run_id", name="uq_hicp_revision_observation_run"),
    )
    op.create_index(
        "ix_hicp_revisions_observation",
        "hicp_observation_revisions",
        ["observation_id", "detected_at"],
        unique=False,
    )
    _seed_catalogue()
    # ### end Alembic commands ###


def downgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    op.drop_index("ix_hicp_revisions_observation", table_name="hicp_observation_revisions")
    op.drop_table("hicp_observation_revisions")
    op.drop_index("ix_fuel_revisions_observation", table_name="fuel_price_revisions")
    op.drop_table("fuel_price_revisions")
    op.drop_index("ix_exchange_revisions_observation", table_name="exchange_rate_revisions")
    op.drop_table("exchange_rate_revisions")
    op.drop_index("ix_hicp_observations_reference_month", table_name="hicp_observations")
    op.drop_table("hicp_observations")
    op.drop_index("ix_fuel_observations_reference_week", table_name="fuel_price_observations")
    op.drop_table("fuel_price_observations")
    op.drop_index("ix_exchange_observations_reference_date", table_name="exchange_rate_observations")
    op.drop_table("exchange_rate_observations")
    op.drop_index("ix_data_quality_run_severity", table_name="data_quality_events")
    op.drop_table("data_quality_events")
    op.drop_index(
        "uq_hicp_series_dimensions",
        table_name="source_series",
        postgresql_where=sa.text("series_kind = 'hicp'"),
    )
    op.drop_index(
        "uq_fuel_series_dimensions",
        table_name="source_series",
        postgresql_where=sa.text("series_kind = 'fuel_price'"),
    )
    op.drop_index(
        "uq_exchange_series_dimensions",
        table_name="source_series",
        postgresql_where=sa.text("series_kind = 'exchange_rate'"),
    )
    op.drop_index("ix_source_series_source_kind", table_name="source_series")
    op.drop_index("ix_source_series_geography", table_name="source_series")
    op.drop_table("source_series")
    op.drop_table("indicator_allowed_categories")
    op.drop_table("synchronization_states")
    op.drop_table("ingestion_run_artifacts")
    op.drop_table("indicator_allowed_units")
    op.drop_table("classification_categories")
    op.drop_index("ix_source_artifacts_source_retrieved", table_name="source_artifacts")
    op.drop_table("source_artifacts")
    op.drop_index("ix_ingestion_runs_source_started", table_name="ingestion_runs")
    op.drop_table("ingestion_runs")
    op.drop_table("indicator_definitions")
    op.drop_index(
        "uq_geographies_iso_alpha2",
        table_name="geographies",
        postgresql_where=sa.text("iso_alpha2 IS NOT NULL"),
    )
    op.drop_table("geographies")
    op.drop_table("classification_schemes")
    op.drop_table("measurement_units")
    op.drop_table("data_sources")
    op.drop_table("currencies")
    # ### end Alembic commands ###
