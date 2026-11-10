"""PostgreSQL-only validation of the price/cost domain and provenance model."""

import os
import subprocess
import sys
from decimal import Decimal

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.exc import DBAPIError, IntegrityError

pytestmark = pytest.mark.integration


def _insert_provenance(connection, source_code: str, digest: str, missing: int = 0):
    run_id = connection.execute(
        text("""
        INSERT INTO ingestion_runs
        (source_code, status, trigger_type, adapter_version, completed_at,
         fetched_count, parsed_count, inserted_count, missing_count)
        VALUES (:source, 'succeeded', 'test', 'milestone-2', now(), 1, 1, 1, :missing)
        RETURNING id
    """),
        {"source": source_code, "missing": missing},
    ).scalar_one()
    artifact_id = connection.execute(
        text("""
        INSERT INTO source_artifacts
        (source_code, source_url, sha256, byte_size, content_type,
         reference_period_start, reference_period_end, storage_path, metadata)
        VALUES (:source, :url, :digest, 1024, :content_type,
                '2026-01-01', '2026-12-31', :path, '{"fixture": true}'::jsonb)
        RETURNING id
    """),
        {
            "source": source_code,
            "url": f"https://official.example/{source_code}",
            "digest": digest,
            "content_type": "application/octet-stream",
            "path": f"raw/{source_code}/{digest}",
        },
    ).scalar_one()
    connection.execute(
        text("""
        INSERT INTO ingestion_run_artifacts
        (ingestion_run_id, artifact_id, source_code, role)
        VALUES (:run_id, :artifact_id, :source, 'primary')
    """),
        {"run_id": run_id, "artifact_id": artifact_id, "source": source_code},
    )
    return run_id, artifact_id


@pytest.fixture(scope="module")
def price_cost_postgres():
    url = os.getenv("TEST_DATABASE_URL")
    reader_url = os.getenv("TEST_ANALYTICS_DATABASE_URL")
    if not url or not reader_url or os.getenv("TEST_ALLOW_RESET") != "1":
        pytest.skip("Requires disposable TEST_DATABASE_URL, TEST_ANALYTICS_DATABASE_URL, TEST_ALLOW_RESET=1")
    env = dict(os.environ, DATABASE_URL=url)
    subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], check=True, env=env)
    subprocess.run([sys.executable, "-m", "app.scripts.apply_grants"], check=True, env=env)
    owner = create_engine(url)
    reader = create_engine(reader_url)

    with owner.begin() as connection:
        connection.execute(
            text("""
            TRUNCATE
              exchange_rate_revisions, hicp_observation_revisions, fuel_price_revisions,
              exchange_rate_observations, hicp_observations, fuel_price_observations,
              data_quality_events, ingestion_run_artifacts, source_series,
              source_artifacts, ingestion_runs
            RESTART IDENTITY CASCADE
        """)
        )
        connection.execute(
            text("""
            INSERT INTO synchronization_states (source_code, status)
            SELECT code, 'never_run' FROM data_sources
            ON CONFLICT (source_code) DO UPDATE
              SET status = 'never_run', last_attempt_at = NULL, last_success_at = NULL,
                  last_run_id = NULL, etag = NULL, last_modified = NULL,
                  cursor = '{}'::jsonb, consecutive_failures = 0
        """)
        )

        fuel_run, fuel_artifact = _insert_provenance(connection, "ec_weekly_oil_bulletin", "1" * 64)
        hicp_previous_run, hicp_previous_artifact = _insert_provenance(
            connection, "eurostat_prc_hicp_minr", "2" * 64, missing=9
        )
        hicp_run, hicp_artifact = _insert_provenance(
            connection, "eurostat_prc_hicp_minr", "3" * 64, missing=9
        )
        ecb_run, ecb_artifact = _insert_provenance(connection, "ecb_exr", "4" * 64)

        fuel_series = connection.execute(
            text("""
            INSERT INTO source_series
            (source_code, external_key, series_kind, indicator_code, geography_code,
             classification_scheme_code, category_code, unit_code, frequency,
             measurement_type, tax_basis, currency_code, source_dimensions)
            VALUES
            ('ec_weekly_oil_bulletin', 'DE.EURO_SUPER_95.with_tax', 'fuel_price',
             'FUEL_PRICE', 'DE', 'FUEL_PRODUCT', 'EURO_SUPER_95', 'EUR_PER_LITRE',
             'weekly', 'price', 'with_tax', 'EUR', '{"country": "Germany"}'::jsonb)
            RETURNING id
        """)
        ).scalar_one()
        hicp_annual_series = connection.execute(
            text("""
            INSERT INTO source_series
            (source_code, external_key, series_kind, indicator_code, geography_code,
             classification_scheme_code, category_code, unit_code, frequency,
             measurement_type, source_dimensions)
            VALUES
            ('eurostat_prc_hicp_minr', 'M.RCH_A.TOTAL.DE', 'hicp', 'RCH_A', 'DE',
             'ECOICOP_2018', 'TOTAL', 'PERCENT', 'monthly', 'annual_rate',
             '{"freq": "M", "unit": "RCH_A"}'::jsonb)
            RETURNING id
        """)
        ).scalar_one()
        hicp_index_series = connection.execute(
            text("""
            INSERT INTO source_series
            (source_code, external_key, series_kind, indicator_code, geography_code,
             classification_scheme_code, category_code, unit_code, frequency,
             measurement_type, source_dimensions)
            VALUES
            ('eurostat_prc_hicp_minr', 'M.I25.TOTAL.DE', 'hicp', 'I25', 'DE',
             'ECOICOP_2018', 'TOTAL', 'INDEX_2025_100', 'monthly', 'index',
             '{"freq": "M", "unit": "I25"}'::jsonb)
            RETURNING id
        """)
        ).scalar_one()
        exchange_series = connection.execute(
            text("""
            INSERT INTO source_series
            (source_code, external_key, series_kind, indicator_code, unit_code,
             frequency, measurement_type, base_currency_code, quote_currency_code,
             source_dimensions)
            VALUES
            ('ecb_exr', 'EXR.D.GBP.EUR.SP00.A', 'exchange_rate', 'EXR_SP00',
             'FOREIGN_CURRENCY_PER_EUR', 'daily', 'reference_rate', 'EUR', 'GBP',
             '{"exr_type": "SP00", "suffix": "A"}'::jsonb)
            RETURNING id
        """)
        ).scalar_one()

        fuel_observation = connection.execute(
            text("""
            INSERT INTO fuel_price_observations
            (series_id, source_code, reference_week, publication_date, raw_value,
             raw_unit_code, normalized_price_eur_per_litre, status,
             ingestion_run_id, artifact_id)
            VALUES
            (:series, 'ec_weekly_oil_bulletin', '2026-11-02', '2026-11-05', 2128,
             'EUR_PER_1000_LITRES', 2.128, NULL, :run, :artifact)
            RETURNING id
        """),
            {
                "series": fuel_series,
                "run": fuel_run,
                "artifact": fuel_artifact,
            },
        ).scalar_one()
        hicp_observation = connection.execute(
            text("""
            INSERT INTO hicp_observations
            (series_id, source_code, reference_month, measurement_type, index_base_year,
             value, status, ingestion_run_id, artifact_id)
            VALUES
            (:series, 'eurostat_prc_hicp_minr', '2026-10-01', 'annual_rate', NULL,
             2.8, 'e', :run, :artifact)
            RETURNING id
        """),
            {
                "series": hicp_annual_series,
                "run": hicp_run,
                "artifact": hicp_artifact,
            },
        ).scalar_one()
        connection.execute(
            text("""
            INSERT INTO hicp_observations
            (series_id, source_code, reference_month, measurement_type, index_base_year,
             value, status, ingestion_run_id, artifact_id)
            VALUES
            (:series, 'eurostat_prc_hicp_minr', '2026-10-01', 'index', 2025,
             103.80, 'e', :run, :artifact)
        """),
            {
                "series": hicp_index_series,
                "run": hicp_run,
                "artifact": hicp_artifact,
            },
        )
        connection.execute(
            text("""
            INSERT INTO exchange_rate_observations
            (series_id, source_code, reference_date, base_currency_code,
             quote_currency_code, reference_rate, quote_convention, source_precision,
             status, confidentiality, ingestion_run_id, artifact_id)
            VALUES
            (:series, 'ecb_exr', '2026-11-03', 'EUR', 'GBP', 0.83358,
             'FOREIGN_CURRENCY_PER_EUR', 5, 'A', 'F', :run, :artifact)
        """),
            {
                "series": exchange_series,
                "run": ecb_run,
                "artifact": ecb_artifact,
            },
        )
        connection.execute(
            text("""
            INSERT INTO hicp_observation_revisions
            (observation_id, source_code, previous_value, revised_value,
             previous_status, revised_status, previous_run_id, previous_artifact_id,
             replacement_run_id, replacement_artifact_id)
            VALUES
            (:observation, 'eurostat_prc_hicp_minr', 2.7, 2.8, 'p', 'e',
             :previous_run, :previous_artifact, :run, :artifact)
        """),
            {
                "observation": hicp_observation,
                "previous_run": hicp_previous_run,
                "previous_artifact": hicp_previous_artifact,
                "run": hicp_run,
                "artifact": hicp_artifact,
            },
        )
        connection.execute(
            text("""
            INSERT INTO data_quality_events
            (ingestion_run_id, source_code, series_id, event_code, severity,
             message, reference_period, details)
            VALUES
            (:run, 'eurostat_prc_hicp_minr', :series, 'SOURCE_MISSING_CELL', 'info',
             'The source omitted an expected coordinate.', '2026-09-01',
             '{"stored_as_zero": false}'::jsonb)
        """),
            {"run": hicp_run, "series": hicp_annual_series},
        )

    yield (
        owner,
        reader,
        {
            "fuel_series": fuel_series,
            "hicp_annual_series": hicp_annual_series,
            "hicp_index_series": hicp_index_series,
            "exchange_series": exchange_series,
            "fuel_observation": fuel_observation,
            "hicp_observation": hicp_observation,
            "fuel_run": fuel_run,
            "fuel_artifact": fuel_artifact,
            "hicp_run": hicp_run,
            "hicp_artifact": hicp_artifact,
            "ecb_run": ecb_run,
            "ecb_artifact": ecb_artifact,
        },
    )
    owner.dispose()
    reader.dispose()


def test_catalogue_seed_and_existing_retail_schema_coexist(price_cost_postgres):
    owner, _, _ = price_cost_postgres
    with owner.connect() as connection:
        assert connection.execute(text("SELECT COUNT(*) FROM data_sources")).scalar_one() == 3
        assert connection.execute(text("SELECT COUNT(*) FROM geographies")).scalar_one() == 28
        assert connection.execute(text("SELECT COUNT(*) FROM synchronization_states")).scalar_one() == 3
        for table in ("retail_observations", "retail_imports", "query_history"):
            assert (
                connection.execute(
                    text("SELECT to_regclass(:name)"), {"name": f"public.{table}"}
                ).scalar_one()
                == table
            )


def test_typed_observations_preserve_precision_status_and_units(price_cost_postgres):
    owner, _, _ = price_cost_postgres
    with owner.connect() as connection:
        fuel = connection.execute(
            text("""
            SELECT raw_value, raw_unit_code, normalized_price_eur_per_litre,
                   reference_week, publication_date
              FROM fuel_price_observations
        """)
        ).one()
        hicp = connection.execute(
            text("""
            SELECT value, measurement_type, index_base_year, status
              FROM hicp_observations WHERE measurement_type = 'annual_rate'
        """)
        ).one()
        exchange = connection.execute(
            text("""
            SELECT reference_rate, base_currency_code, quote_currency_code,
                   quote_convention, source_precision, status, confidentiality
              FROM exchange_rate_observations
        """)
        ).one()

    assert fuel.raw_value == Decimal("2128.000000000000000")
    assert fuel.raw_unit_code == "EUR_PER_1000_LITRES"
    assert fuel.normalized_price_eur_per_litre == Decimal("2.128000000000000000")
    assert fuel.publication_date > fuel.reference_week
    assert hicp.value == Decimal("2.8000000000")
    assert hicp.measurement_type == "annual_rate" and hicp.index_base_year is None
    assert hicp.status == "e"
    assert exchange.reference_rate == Decimal("0.833580000000000")
    assert (exchange.base_currency_code, exchange.quote_currency_code) == ("EUR", "GBP")
    assert exchange.quote_convention == "FOREIGN_CURRENCY_PER_EUR"
    assert (exchange.source_precision, exchange.status, exchange.confidentiality) == (5, "A", "F")


def test_missing_hicp_is_absent_not_zero_and_quality_is_explicit(price_cost_postgres):
    owner, _, ids = price_cost_postgres
    with owner.connect() as connection:
        count = connection.execute(
            text("""
            SELECT COUNT(*) FROM hicp_observations
             WHERE series_id = :series AND reference_month = '2026-09-01'
        """),
            {"series": ids["hicp_annual_series"]},
        ).scalar_one()
        event = connection.execute(
            text("""
            SELECT severity, details ->> 'stored_as_zero' AS stored_as_zero
              FROM data_quality_events WHERE event_code = 'SOURCE_MISSING_CELL'
        """)
        ).one()
        missing_count = connection.execute(
            text("""
            SELECT missing_count FROM ingestion_runs WHERE id = :run
        """),
            {"run": ids["hicp_run"]},
        ).scalar_one()
    assert count == 0
    assert event == ("info", "false")
    assert missing_count == 9


@pytest.mark.parametrize(
    "case",
    [
        "bad_unit",
        "bad_category",
        "bad_measurement",
        "duplicate_fuel",
        "fuel_normalization",
        "fuel_publication",
        "hicp_midmonth",
        "hicp_missing_value",
        "hicp_wrong_base",
        "exchange_direction",
        "exchange_negative",
        "invalid_hash",
    ],
)
def test_constraints_reject_invalid_domain_records(price_cost_postgres, case):
    owner, _, ids = price_cost_postgres
    statements = {
        "bad_unit": (
            """
            INSERT INTO source_series
            (source_code, external_key, series_kind, indicator_code, geography_code,
             classification_scheme_code, category_code, unit_code, frequency,
             measurement_type, tax_basis, currency_code)
            VALUES ('ec_weekly_oil_bulletin', 'invalid-unit', 'fuel_price', 'FUEL_PRICE',
                    'FR', 'FUEL_PRODUCT', 'EURO_SUPER_95', 'PERCENT', 'weekly',
                    'price', 'with_tax', 'EUR')
        """,
            {},
        ),
        "bad_category": (
            """
            INSERT INTO source_series
            (source_code, external_key, series_kind, indicator_code, geography_code,
             classification_scheme_code, category_code, unit_code, frequency, measurement_type)
            VALUES ('eurostat_prc_hicp_minr', 'invalid-category', 'hicp', 'RCH_A', 'FR',
                    'FUEL_PRODUCT', 'EURO_SUPER_95', 'PERCENT', 'monthly', 'annual_rate')
        """,
            {},
        ),
        "bad_measurement": (
            """
            INSERT INTO source_series
            (source_code, external_key, series_kind, indicator_code, geography_code,
             classification_scheme_code, category_code, unit_code, frequency, measurement_type)
            VALUES ('eurostat_prc_hicp_minr', 'invalid-measure', 'hicp', 'RCH_A', 'FR',
                    'ECOICOP_2018', 'TOTAL', 'PERCENT', 'monthly', 'monthly_rate')
        """,
            {},
        ),
        "duplicate_fuel": (
            """
            INSERT INTO fuel_price_observations
            (series_id, source_code, reference_week, publication_date, raw_value,
             raw_unit_code, normalized_price_eur_per_litre, ingestion_run_id, artifact_id)
            VALUES (:series, 'ec_weekly_oil_bulletin', '2026-11-02', '2026-11-05', 2128,
                    'EUR_PER_1000_LITRES', 2.128, :run, :artifact)
        """,
            {"series": ids["fuel_series"], "run": ids["fuel_run"], "artifact": ids["fuel_artifact"]},
        ),
        "fuel_normalization": (
            """
            INSERT INTO fuel_price_observations
            (series_id, source_code, reference_week, raw_value, raw_unit_code,
             normalized_price_eur_per_litre, ingestion_run_id, artifact_id)
            VALUES (:series, 'ec_weekly_oil_bulletin', '2026-11-09', 2000,
                    'EUR_PER_1000_LITRES', 2.1, :run, :artifact)
        """,
            {"series": ids["fuel_series"], "run": ids["fuel_run"], "artifact": ids["fuel_artifact"]},
        ),
        "fuel_publication": (
            """
            INSERT INTO fuel_price_observations
            (series_id, source_code, reference_week, publication_date, raw_value,
             raw_unit_code, normalized_price_eur_per_litre, ingestion_run_id, artifact_id)
            VALUES (:series, 'ec_weekly_oil_bulletin', '2026-11-09', '2026-11-08', 2000,
                    'EUR_PER_1000_LITRES', 2, :run, :artifact)
        """,
            {"series": ids["fuel_series"], "run": ids["fuel_run"], "artifact": ids["fuel_artifact"]},
        ),
        "hicp_midmonth": (
            """
            INSERT INTO hicp_observations
            (series_id, source_code, reference_month, measurement_type, value,
             ingestion_run_id, artifact_id)
            VALUES (:series, 'eurostat_prc_hicp_minr', '2026-11-15', 'annual_rate', 2.5,
                    :run, :artifact)
        """,
            {"series": ids["hicp_annual_series"], "run": ids["hicp_run"], "artifact": ids["hicp_artifact"]},
        ),
        "hicp_missing_value": (
            """
            INSERT INTO hicp_observations
            (series_id, source_code, reference_month, measurement_type, value,
             ingestion_run_id, artifact_id)
            VALUES (:series, 'eurostat_prc_hicp_minr', '2026-11-01', 'annual_rate', NULL,
                    :run, :artifact)
        """,
            {"series": ids["hicp_annual_series"], "run": ids["hicp_run"], "artifact": ids["hicp_artifact"]},
        ),
        "hicp_wrong_base": (
            """
            INSERT INTO hicp_observations
            (series_id, source_code, reference_month, measurement_type, index_base_year,
             value, ingestion_run_id, artifact_id)
            VALUES (:series, 'eurostat_prc_hicp_minr', '2026-11-01', 'index', 2015, 104,
                    :run, :artifact)
        """,
            {"series": ids["hicp_index_series"], "run": ids["hicp_run"], "artifact": ids["hicp_artifact"]},
        ),
        "exchange_direction": (
            """
            INSERT INTO exchange_rate_observations
            (series_id, source_code, reference_date, base_currency_code, quote_currency_code,
             reference_rate, quote_convention, source_precision, ingestion_run_id, artifact_id)
            VALUES (:series, 'ecb_exr', '2026-11-04', 'GBP', 'EUR', 1.2,
                    'FOREIGN_CURRENCY_PER_EUR', 5, :run, :artifact)
        """,
            {"series": ids["exchange_series"], "run": ids["ecb_run"], "artifact": ids["ecb_artifact"]},
        ),
        "exchange_negative": (
            """
            INSERT INTO exchange_rate_observations
            (series_id, source_code, reference_date, base_currency_code, quote_currency_code,
             reference_rate, quote_convention, source_precision, ingestion_run_id, artifact_id)
            VALUES (:series, 'ecb_exr', '2026-11-04', 'EUR', 'GBP', -1,
                    'FOREIGN_CURRENCY_PER_EUR', 5, :run, :artifact)
        """,
            {"series": ids["exchange_series"], "run": ids["ecb_run"], "artifact": ids["ecb_artifact"]},
        ),
        "invalid_hash": (
            """
            INSERT INTO source_artifacts
            (source_code, source_url, sha256, byte_size, content_type)
            VALUES ('ecb_exr', 'https://official.example/invalid', :digest, 10, 'text/csv')
        """,
            {"digest": "z" * 64},
        ),
    }
    sql, parameters = statements[case]
    with pytest.raises(IntegrityError), owner.begin() as connection:
        connection.execute(text(sql), parameters)


def test_revision_history_retains_both_provenance_versions(price_cost_postgres):
    owner, _, ids = price_cost_postgres
    with owner.connect() as connection:
        revision = connection.execute(
            text("""
            SELECT previous_value, revised_value, previous_status, revised_status,
                   previous_run_id, replacement_run_id,
                   previous_artifact_id, replacement_artifact_id
              FROM hicp_observation_revisions
             WHERE observation_id = :observation
        """),
            {"observation": ids["hicp_observation"]},
        ).one()
        current = connection.execute(
            text("""
            SELECT value, ingestion_run_id, artifact_id
              FROM hicp_observations WHERE id = :observation
        """),
            {"observation": ids["hicp_observation"]},
        ).one()
    assert (revision.previous_value, revision.revised_value) == (
        Decimal("2.7000000000"),
        Decimal("2.8000000000"),
    )
    assert (revision.previous_status, revision.revised_status) == ("p", "e")
    assert revision.previous_run_id != revision.replacement_run_id
    assert revision.previous_artifact_id != revision.replacement_artifact_id
    assert current == (Decimal("2.8000000000"), revision.replacement_run_id, revision.replacement_artifact_id)


def test_provenance_rejects_cross_source_artifacts(price_cost_postgres):
    owner, _, ids = price_cost_postgres
    with pytest.raises(IntegrityError), owner.begin() as connection:
        connection.execute(
            text("""
            INSERT INTO fuel_price_observations
            (series_id, source_code, reference_week, raw_value, raw_unit_code,
             normalized_price_eur_per_litre, ingestion_run_id, artifact_id)
            VALUES (:series, 'ec_weekly_oil_bulletin', '2026-11-09', 2000,
                    'EUR_PER_1000_LITRES', 2, :ecb_run, :ecb_artifact)
        """),
            {
                "series": ids["fuel_series"],
                "ecb_run": ids["ecb_run"],
                "ecb_artifact": ids["ecb_artifact"],
            },
        )


def test_ai_reader_has_no_access_to_new_base_tables(price_cost_postgres):
    _, reader, _ = price_cost_postgres
    protected = (
        "data_sources",
        "source_series",
        "ingestion_runs",
        "source_artifacts",
        "fuel_price_observations",
        "hicp_observations",
        "exchange_rate_observations",
        "hicp_observation_revisions",
        "data_quality_events",
    )
    with reader.connect() as connection:
        privileges = connection.execute(
            text("""
            SELECT table_name,
                   has_table_privilege(current_user, 'public.' || table_name, 'SELECT')
              FROM unnest(CAST(:tables AS text[])) AS table_name
        """),
            {"tables": list(protected)},
        ).all()
        assert all(not allowed for _, allowed in privileges)
        with pytest.raises(DBAPIError):
            connection.execute(text("SELECT * FROM fuel_price_observations"))
        connection.rollback()
        assert connection.execute(text("SELECT COUNT(*) FROM retail_observations")).scalar_one() >= 0
