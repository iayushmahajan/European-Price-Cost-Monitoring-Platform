"""Product arithmetic/terminology and deterministic real-PostgreSQL HTTP contracts."""

import os
import subprocess
import sys
from contextlib import contextmanager
from dataclasses import replace
from datetime import date
from decimal import Decimal
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from app.api.schemas import price_cost_queries as q
from app.ingestion.service import Synchronizer
from app.ingestion.sources import SOURCES
from app.main import app
from app.models import price_cost as m
from app.services.price_cost import product
from app.services.price_cost.calculations import change, data_status, difference, expected_previous, ratio
from app.services.price_cost.explanations import display, explain
from app.services.price_cost.repository import get_price_cost_db, read_session
from tests.test_ingestion import items

TODAY = date(2026, 11, 8)
PREFIX = "/v1/price-cost"


def test_calculations_preserve_decimal_and_domain_meaning():
    fuel = change(
        "fuel", "price", date(2026, 11, 2), Decimal("2.15"), (date(2026, 10, 26), Decimal("2.10"), None)
    )
    assert fuel.absolute_change == Decimal(".05") and fuel.absolute_change_unit == "EUR/litre"
    assert fuel.relative_change_percent == Decimal("2.380952380952380952") and fuel.consecutive
    rate = change(
        "inflation", "annual_rate", date(2026, 10, 1), Decimal("2.8"), (date(2026, 9, 1), Decimal("3.3"), "p")
    )
    assert rate.absolute_change == Decimal("-.5") and rate.absolute_change_unit == "percentage_points"
    assert rate.relative_change_percent is None and rate.reference_status.provisional
    index = change(
        "inflation", "index", date(2026, 10, 1), Decimal("104"), (date(2026, 9, 1), Decimal("100"), None)
    )
    assert index.absolute_change_unit == "index_points" and index.relative_change_percent == 4
    assert ratio(Decimal(1), Decimal("0.83358")) == Decimal("1.199644905108088006")
    assert ratio(Decimal(1), Decimal(0)) is None
    assert difference(Decimal("999999999999999.000000000000001"), Decimal(".000000000000001")) == Decimal(
        "999999999999999"
    )
    assert data_status("E", hicp=False).estimated is None
    assert display(Decimal("100")) == "100" and display(Decimal("0.00000001"), 6) != "0"


@pytest.mark.parametrize(
    "domain,current,previous,consecutive",
    [
        ("fuel", date(2026, 11, 2), date(2026, 10, 19), False),
        ("inflation", date(2026, 10, 1), date(2026, 8, 1), False),
        ("exchange-rates", date(2026, 11, 9), date(2026, 11, 6), True),
        ("exchange-rates", date(2026, 4, 7), date(2026, 4, 2), True),
        ("exchange-rates", date(2026, 11, 6), date(2026, 11, 4), False),
    ],
)
def test_calendar_gaps_are_explicit(domain, current, previous, consecutive):
    result = change(domain, "price", current, Decimal(2), (previous, Decimal(1), None))
    assert result.consecutive is consecutive
    assert (expected_previous(domain, current) == previous) is consecutive
    explanation = explain(
        domain,
        name="Test",
        category="All items",
        measurement="annual_rate",
        value=Decimal(2),
        period=current,
        comparison=result,
        quote="GBP",
    )
    assert ("not a consecutive" in explanation.what_changed) is not consecutive


@pytest.mark.parametrize(
    "value,term",
    [(Decimal("3.2"), "3.2% higher"), (Decimal("-1.2"), "1.2% lower"), (Decimal(0), "unchanged")],
)
def test_explanations_distinguish_prices_from_inflation_rate(value, term):
    comparison = change(
        "inflation", "annual_rate", date(2026, 10, 1), value, (date(2026, 9, 1), Decimal("3.3"), None)
    )
    result = explain(
        "inflation",
        name="Germany",
        category="Food",
        measurement="annual_rate",
        value=value,
        period=date(2026, 10, 1),
        comparison=comparison,
    )
    assert term in result.what_it_means and "same month a year earlier" in result.what_it_means
    assert "percentage points" in result.what_changed and "Food annual inflation rate" in result.what_changed
    assert "because" not in result.what_changed


def test_missing_comparison_and_zero_baseline_are_not_fabricated():
    result = change("fuel", "price", TODAY, Decimal(2), None)
    assert not result.available and result.absolute_change is None
    assert (
        "cannot be calculated"
        in explain(
            "fuel", name="Diesel in Germany", value=Decimal(2), period=TODAY, comparison=result
        ).what_changed
    )
    zero = change(
        "inflation", "monthly_rate", date(2026, 10, 1), Decimal(".2"), (date(2026, 9, 1), Decimal(0), None)
    )
    assert zero.absolute_change == Decimal(".2") and zero.relative_change_percent is None


@pytest.fixture(scope="module")
def api_database(tmp_path_factory):
    url = os.getenv("TEST_DATABASE_URL")
    if not url or os.getenv("TEST_ALLOW_RESET") != "1":
        pytest.skip("Requires disposable TEST_DATABASE_URL and TEST_ALLOW_RESET=1")
    env = dict(os.environ, DATABASE_URL=url)
    for module, arguments in [("alembic", ["upgrade", "head"]), ("app.scripts.apply_grants", [])]:
        subprocess.run([sys.executable, "-m", module, *arguments], env=env, check=True, capture_output=True)
    engine = create_engine(url)
    with engine.begin() as connection:
        connection.execute(text("TRUNCATE source_series, source_artifacts, ingestion_runs CASCADE"))
        connection.execute(
            text(
                "UPDATE synchronization_states SET status='never_run', last_run_id=NULL, "
                "last_attempt_at=NULL, last_success_at=NULL, consecutive_failures=0, cursor='{}'::jsonb"
            )
        )
    worker = Synchronizer(engine, tmp_path_factory.mktemp("api-artifacts"))
    with patch("urllib.request.urlopen", side_effect=AssertionError("No live network allowed")):
        for source in SOURCES:
            staged = items(source)
            if source == SOURCES[0]:
                for i in (1, 2):
                    item = staged[i]
                    old_records = tuple(
                        record.model_copy(
                            update={
                                "reference_week": date(2026, 10, 26),
                                "publication_date": date(2026, 10, 29),
                                "raw_value": record.raw_value - Decimal(50),
                                "price_eur_per_litre": record.price_eur_per_litre - Decimal(".05"),
                            }
                        )
                        for record in item.batch.records
                    )
                    staged[i] = replace(
                        item,
                        payload=item.payload + b"deterministic-test-history",
                        batch=item.batch.model_copy(update={"records": (*old_records, *item.batch.records)}),
                    )
            with patch("app.ingestion.service.acquire", return_value=iter(staged)):
                worker.sync(source, today=TODAY, trigger="test")
    yield engine
    engine.dispose()


@pytest.fixture
def api_client(api_database, monkeypatch):
    monkeypatch.setattr(q, "source_today", lambda: TODAY)
    monkeypatch.setattr(product, "source_today", lambda: TODAY)

    def dependency():
        with read_session(api_database) as session:
            yield session

    app.dependency_overrides[get_price_cost_db] = dependency
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.pop(get_price_cost_db, None)


def get(client, path, **params):
    response = client.get(PREFIX + path, params=params)
    assert response.status_code == 200, response.text
    return response.json()


@pytest.mark.integration
def test_fuel_latest_exact_price_tax_and_geography_filters(api_client):
    body = get(api_client, "/fuel/latest", countries="DE", product="euro_super_95")
    assert body["available"] and not body["missing_selections"] and len(body["items"]) == 1
    row = body["items"][0]
    assert Decimal(row["value"]) == Decimal("2.128") and row["unit"] == "EUR/litre"
    assert row["period"] == "2026-11-02" and row["publication_date"] == "2026-11-05"
    assert Decimal(row["comparison"]["absolute_change"]) == Decimal(".05")
    assert row["comparison"]["consecutive"] and "0.05 EUR per litre" in row["explanation"]["what_changed"]
    assert "including taxes" in row["explanation"]["what_it_means"]
    without = get(
        api_client, "/fuel/latest", countries="DE", product="euro_super_95", tax_basis="without_tax"
    )["items"][0]
    assert without["tax_basis"] == "without_tax" and without["value"] != row["value"]
    assert Decimal(without["comparison"]["absolute_change"]) == Decimal(".05")
    assert "excluding taxes" in without["explanation"]["what_it_means"]
    assert len(get(api_client, "/fuel/latest", countries="DE,FR")["items"]) == 4


@pytest.mark.integration
def test_inflation_rate_index_status_and_category_semantics(api_client):
    rate = get(api_client, "/inflation/latest", countries="DE")["items"][0]
    assert Decimal(rate["value"]) == Decimal("2.8") and rate["unit"] == "percent"
    assert rate["measurement_type"] == "annual_rate" and rate["status"]["estimated"]
    assert Decimal(rate["comparison"]["absolute_change"]) == Decimal("-.5")
    assert rate["comparison"]["absolute_change_unit"] == "percentage_points"
    assert rate["comparison"]["relative_change_percent"] is None
    assert "2.8% higher" in rate["explanation"]["what_it_means"]
    assert any("may be revised" in text for text in rate["explanation"]["limitations"])
    monthly = get(api_client, "/inflation/latest", countries="DE", measurement="monthly_rate")["items"][0]
    assert "0.1% lower" in monthly["explanation"]["what_it_means"]
    index = get(api_client, "/inflation/latest", countries="DE", measurement="index")["items"][0]
    assert index["index_base_year"] == 2025 and index["unit"] == "index_points"
    assert "2025 average set to 100" in index["explanation"]["what_it_means"]
    food = get(api_client, "/inflation/latest", countries="DE", category="CP01")["items"][0]
    assert food["category"]["code"] == "CP01" and food["indicator_id"] == "RCH_A"


@pytest.mark.integration
def test_exchange_quote_direction_inverse_dates_and_comparison(api_client):
    row = get(api_client, "/exchange-rates/latest", currencies="GBP", as_of="2026-11-03", inverse=True)[
        "items"
    ][0]
    assert Decimal(row["value"]) == Decimal(".83358") and row["unit"] == "GBP/EUR"
    assert row["base_currency"] == "EUR" and row["quote_currency"] == "GBP"
    assert Decimal(row["inverse_rate"]) == ratio(Decimal(1), Decimal(".83358"))
    assert row["inverse_unit"] == "EUR/GBP" and row["inverse_is_derived"] is True
    weekend = get(api_client, "/exchange-rates/latest", currencies="GBP", as_of="2026-11-08")["items"][0]
    assert weekend["period"] == "2026-11-06"
    anchor = get(api_client, "/exchange-rates/latest", currencies="GBP,USD", comparison_date="2026-11-03")
    assert len(anchor["items"]) == 2
    assert all(row["comparison"]["reference_period"] == "2026-11-03" for row in anchor["items"])
    assert all(row["comparison"]["basis"] == "on_or_before_requested_date" for row in anchor["items"])
    assert all(row["comparison"]["consecutive"] is None for row in anchor["items"])


@pytest.mark.integration
@pytest.mark.parametrize(
    "path,params",
    [
        ("/fuel/history", dict(country="DE", product="euro_super_95", start="2026-10-26", end="2026-11-02")),
        ("/inflation/history", dict(country="DE", start="2026-08-01", end="2026-10-01")),
        ("/exchange-rates/history", dict(currency="GBP", start="2026-11-02", end="2026-11-06")),
    ],
)
def test_history_order_pagination_and_range_boundaries(api_client, path, params):
    first = get(api_client, path, limit=1, **params)
    assert len(first["items"]) == 1 and first["page"]["has_more"]
    assert first["items"][0]["period"] == params["start"]
    next_params = params | {"start": first["page"]["next_start"]}
    second = get(api_client, path, **next_params)
    assert second["items"][0]["period"] > first["items"][0]["period"]
    assert second["items"][0]["comparison"]["reference_period"] == first["items"][0]["period"]
    assert not second["page"]["has_more"]
    assert all(params["start"] <= row["period"] <= params["end"] for row in second["items"])


@pytest.mark.integration
def test_country_comparisons_align_period_and_do_not_rank_indices(api_client):
    fuel = get(api_client, "/fuel/compare", countries="DE,FR", base_country="DE")
    assert fuel["available"] and fuel["period"] == "2026-11-02" and len(fuel["items"]) == 2
    assert Decimal(fuel["items"][0]["difference_from_base"]) == 0
    assert fuel["items"][1]["difference_unit"] == "EUR/litre"
    inflation = get(api_client, "/inflation/compare", countries="DE,EU27_2020", base_country="DE")
    assert inflation["available"] and inflation["items"][1]["difference_unit"] == "percentage_points"
    assert inflation["items"][1]["relative_difference_percent"] is None
    missing = get(api_client, "/inflation/compare", countries="DE,FR", base_country="DE")
    assert not missing["available"] and not missing["items"] and "FR" in missing["missing_selections"]
    assert (
        api_client.get(
            PREFIX + "/inflation/compare",
            params=dict(countries="DE,EU27_2020", base_country="DE", measurement="index"),
        ).status_code
        == 422
    )


@pytest.mark.integration
def test_no_data_overview_sources_catalogue_and_evidence(api_client):
    empty = get(api_client, "/inflation/latest", countries="FR")
    assert not empty["available"] and empty["items"] == [] and empty["missing_selections"] == ["FR"]
    empty_range = get(api_client, "/fuel/history", country="DE", start="2025-01-01", end="2025-02-01")
    assert not empty_range["available"]
    before = get(api_client, "/exchange-rates/latest", currencies="GBP", as_of="2020-01-01")
    assert not before["available"]
    overview = get(api_client, "/overview")
    assert len(overview["fuel"]["items"]) == 2 and len(overview["inflation"]["items"]) == 3
    assert overview["inflation"]["items"][0]["period"] == "2026-10-01"
    assert overview["exchange_rates"]["items"][0]["period"] == "2026-11-06"
    catalogue = get(api_client, "/catalogue")
    assert len(catalogue["geographies"]) == 28 and len(catalogue["fuel_products"]) == 2
    assert catalogue["coverage"] and len(catalogue["inflation_measurements"]) == 3
    source = get(api_client, "/sources")[0]
    assert source["expected_frequency"] == "weekly" and source["observation_freshness"] == "current"
    assert (
        source["latest_observation"] == "2026-11-02"
        and source["latest_artifact_publication_date"] == "2026-11-05"
    )
    row = overview["fuel"]["items"][0]
    evidence = get(api_client, row["evidence_path"].removeprefix(PREFIX))
    assert Decimal(evidence["original_values"]["raw_value"]) / 1000 == Decimal(row["value"])
    assert len(evidence["artifact"]["sha256"]) == 64 and "storage_path" not in str(evidence)
    assert "2026-11-05" in evidence["observation_publication_date"]
    assert api_client.get(PREFIX + "/evidence/fuel/9999999").status_code == 404
    assert api_client.post(PREFIX + "/sync").status_code == 404


@pytest.mark.integration
@pytest.mark.parametrize(
    "path,params",
    [
        ("/evidence/fuel/9223372036854775808", {}),
        ("/fuel/latest", {"countries": "EU27_2020"}),
        ("/fuel/latest", {"countries": "DE,DE"}),
        ("/fuel/latest", {"countries": "DE');DROP TABLE source_series;--"}),
        ("/fuel/latest", {"product": "heating_oil"}),
        ("/fuel/latest", {"tax_basis": "unknown"}),
        ("/fuel/latest", {"unit": "EUR/1000 litres"}),
        ("/inflation/latest", {"category": "WRONG"}),
        ("/inflation/latest", {"measurement": "RCH_A"}),
        ("/inflation/latest", {"measurement": "index", "unit": "percent"}),
        ("/exchange-rates/latest", {"currencies": "EUR"}),
        ("/exchange-rates/latest", {"currencies": "CAD"}),
        ("/exchange-rates/latest", {"comparison_date": "2026-11-08"}),
        ("/fuel/latest", {"as_of": "2099-01-01"}),
        ("/fuel/history", {"country": "DE", "start": "2026-11-02", "end": "2026-10-26"}),
        ("/fuel/history", {"country": "DE", "start": "2000-01-01", "end": "2026-11-02"}),
        ("/fuel/history", {"country": "DE", "start": "2026-01-01", "end": "2026-11-02", "limit": 2001}),
        ("/inflation/history", {"country": "DE", "start": "2026-09-02", "end": "2026-10-01"}),
        ("/fuel/compare", {"countries": "DE,FR", "base_country": "AT"}),
        ("/inflation/compare", {"countries": "DE", "base_country": "DE"}),
    ],
)
def test_invalid_queries_are_controlled_422(api_client, path, params):
    response = api_client.get(PREFIX + path, params=params)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_request"
    assert "Check the supported query parameters" in response.json()["error"]["message"]
    assert "DROP TABLE" not in response.text


@pytest.mark.integration
def test_read_only_transaction_and_unchanged_ai_security(api_database):
    with read_session(api_database) as session:
        assert session.scalar(text("SHOW transaction_read_only")) == "on"
        assert session.scalar(text("SHOW transaction_isolation")) == "repeatable read"
        assert session.scalar(text("SHOW statement_timeout")) == "5s"
        with pytest.raises(DBAPIError):
            session.execute(text("UPDATE data_sources SET active=false"))
    reader_url = os.getenv("TEST_ANALYTICS_DATABASE_URL")
    if not reader_url:
        pytest.skip("Requires TEST_ANALYTICS_DATABASE_URL")
    reader = create_engine(reader_url)
    with reader.connect() as connection:
        assert not connection.scalar(
            text("SELECT has_table_privilege(current_user,'fuel_price_observations','SELECT')")
        )
        assert not connection.scalar(
            text("SELECT has_table_privilege(current_user,'ingestion_runs','SELECT')")
        )
    reader.dispose()


@contextmanager
def altered_rows(engine, model, predicate, **values):
    """Commit temporary fixture changes so actual independent read-only API sessions see them."""
    with Session(engine) as session:
        rows = list(session.scalars(select(model).where(predicate)))
        saved = {
            row.id if hasattr(row, "id") else row.source_code: {name: getattr(row, name) for name in values}
            for row in rows
        }
        for row in rows:
            for name, value in values.items():
                setattr(row, name, value)
        session.commit()
    try:
        yield
    finally:
        with Session(engine) as session:
            for key, original in saved.items():
                row = session.get(model, key)
                for name, value in original.items():
                    setattr(row, name, value)
            session.commit()


@pytest.mark.integration
def test_stale_failed_and_unavailable_states(api_client, api_database, monkeypatch):
    monkeypatch.setattr(product, "source_today", lambda: date(2027, 2, 1))
    stale = get(api_client, "/sources")
    assert all(source["observation_freshness"] == "stale" for source in stale)
    assert get(api_client, "/fuel/latest", countries="DE")["items"][0]["observation_freshness"] == "stale"
    monkeypatch.setattr(product, "source_today", lambda: TODAY)
    with altered_rows(
        api_database,
        m.SynchronizationState,
        m.SynchronizationState.source_code == SOURCES[0],
        status="failed",
    ):
        failed = get(api_client, "/sources")[0]
        assert failed["synchronization_status"] == "failed" and failed["available"]
        assert failed["observation_freshness"] == "current" and failed["last_success_at"]
    with altered_rows(api_database, m.SourceSeries, m.SourceSeries.source_code == SOURCES[2], active=False):
        unavailable = get(api_client, "/exchange-rates/latest", currencies="GBP")
        assert not unavailable["available"] and unavailable["missing_selections"] == ["GBP"]
        assert unavailable["sources"][0]["observation_freshness"] == "unavailable"


@pytest.mark.integration
def test_previous_selection_gap_and_provisional_status_in_database(api_client, api_database):
    with Session(api_database) as session:
        series_id = session.scalar(
            select(m.SourceSeries.id).where(
                m.SourceSeries.geography_code == "DE",
                m.SourceSeries.indicator_code == "RCH_A",
                m.SourceSeries.category_code == "TOTAL",
            )
        )
    predicate = (m.HicpObservation.series_id == series_id) & (
        m.HicpObservation.reference_month == date(2026, 9, 1)
    )
    # Move the September observation to July, creating a real missing-month gap without filling it.
    with altered_rows(api_database, m.HicpObservation, predicate, reference_month=date(2026, 7, 1)):
        row = get(api_client, "/inflation/latest", countries="DE")["items"][0]
        assert (
            row["comparison"]["reference_period"] == "2026-08-01"
            and row["comparison"]["consecutive"] is False
        )
        assert "not a consecutive" in row["explanation"]["what_changed"]
        assert row["status"]["estimated"]
    predicate = (m.HicpObservation.series_id == series_id) & (
        m.HicpObservation.reference_month == date(2026, 10, 1)
    )
    with altered_rows(api_database, m.HicpObservation, predicate, status="ep"):
        row = get(api_client, "/inflation/latest", countries="DE")["items"][0]
        assert (
            row["status"]["estimated"]
            and row["status"]["provisional"]
            and row["status"]["source_status"] == "ep"
        )


@pytest.mark.integration
def test_country_alignment_uses_shared_period_not_individual_latest(api_client, api_database):
    with Session(api_database) as session:
        series_id = session.scalar(
            select(m.SourceSeries.id).where(
                m.SourceSeries.geography_code == "FR",
                m.SourceSeries.indicator_code == "FUEL_PRICE",
                m.SourceSeries.category_code == "EURO_SUPER_95",
                m.SourceSeries.tax_basis == "with_tax",
            )
        )
    predicate = (m.FuelPriceObservation.series_id == series_id) & (
        m.FuelPriceObservation.reference_week == date(2026, 11, 2)
    )
    with altered_rows(api_database, m.FuelPriceObservation, predicate, reference_week=date(2026, 11, 1)):
        separate = get(api_client, "/fuel/latest", countries="DE,FR", product="euro_super_95")
        assert {item["period"] for item in separate["items"]} == {"2026-11-02", "2026-11-01"}
        aligned = get(api_client, "/fuel/compare", countries="DE,FR", base_country="DE")
        assert aligned["period"] == "2026-10-26"
        explicit = get(api_client, "/fuel/compare", countries="DE,FR", base_country="DE", period="2026-11-02")
        assert (
            not explicit["available"] and explicit["missing_selections"] == ["FR"] and explicit["items"] == []
        )


@pytest.mark.integration
def test_database_error_is_sanitized_and_openapi_contracts_are_published(api_client, api_database):
    from sqlalchemy.exc import SQLAlchemyError

    from app.api.routes.price_cost import get_service

    def broken():
        raise SQLAlchemyError("secret host and password")

    app.dependency_overrides[get_service] = broken
    try:
        response = api_client.get(PREFIX + "/sources")
        assert response.status_code == 503 and "secret" not in response.text and response.json()["request_id"]
    finally:
        app.dependency_overrides.pop(get_service, None)
    specification = api_client.get("/openapi.json").json()
    assert (
        len(
            [
                path
                for path in specification["paths"]
                if path.startswith(PREFIX) and not path.startswith(PREFIX + "/analyst")
            ]
        )
        == 12
    )
    schema = (
        specification["components"]["schemas"]["FuelMetric-Output"]
        if "FuelMetric-Output" in specification["components"]["schemas"]
        else specification["components"]["schemas"]["FuelMetric"]
    )
    assert schema["properties"]["unit"]["const"] == "EUR/litre"
    assert schema["properties"]["value"]["type"] == "string"


@pytest.mark.integration
def test_query_count_does_not_grow_with_metric_count(api_client, api_database):
    from sqlalchemy import event

    statements = []

    def record(connection, cursor, statement, parameters, context, executemany):
        statements.append(statement)

    event.listen(api_database, "before_cursor_execute", record)
    try:
        get(api_client, "/fuel/latest", countries="DE")
        narrow = len(statements)
        statements.clear()
        wide = get(api_client, "/fuel/latest")
        assert len(wide["items"]) == 54 and len(statements) == narrow
        assert narrow <= 18
    finally:
        event.remove(api_database, "before_cursor_execute", record)


@pytest.mark.integration
def test_administrative_credentials_fail_closed():
    url = os.getenv("TEST_ADMIN_DATABASE_URL")
    if not url:
        pytest.skip("Requires disposable TEST_ADMIN_DATABASE_URL for role-rejection test")
    admin = create_engine(url)
    try:
        from sqlalchemy.exc import SQLAlchemyError

        with pytest.raises(SQLAlchemyError, match="Unsafe administrative role"):
            with read_session(admin):
                pytest.fail("Administrative credentials must be rejected")
    finally:
        admin.dispose()


@pytest.mark.integration
def test_revision_evidence_preserves_before_after_and_artifact_links(api_client, api_database, tmp_path):
    item = items(SOURCES[1])[0]
    records = tuple(
        record.model_copy(update={"value": Decimal("3.2"), "status": "p"})
        if record.geography_code == "DE"
        and record.category_code == "TOTAL"
        and record.unit_code == "RCH_A"
        and record.period == date(2026, 10, 1)
        else record
        for record in item.batch.records
    )
    staged = [
        replace(
            item,
            payload=item.payload + b"deterministic-api-revision",
            batch=item.batch.model_copy(update={"records": records}),
        )
    ]
    with patch("app.ingestion.service.acquire", return_value=iter(staged)):
        Synchronizer(api_database, tmp_path).sync(SOURCES[1], today=TODAY, trigger="test")
    metric = get(api_client, "/inflation/latest", countries="DE")["items"][0]
    assert metric["status"]["provisional"] and not metric["status"]["estimated"]
    evidence = get(api_client, metric["evidence_path"].removeprefix(PREFIX))
    revision = evidence["revisions"][0]
    assert Decimal(revision["previous"]["value"]) == Decimal("2.8")
    assert Decimal(revision["replacement"]["value"]) == Decimal("3.2")
    assert revision["previous"]["status"] == "e" and revision["replacement"]["status"] == "p"
    assert evidence["unit_code"] == "PERCENT" and evidence["source_series_key"] == "M.RCH_A.TOTAL.DE"
    assert {artifact["id"] for artifact in evidence["revision_artifacts"]} == {
        revision["previous_artifact_id"]
    }
    assert evidence["artifact"]["id"] == revision["replacement_artifact_id"]
    assert "storage_path" not in str(evidence) and not evidence["revisions_has_more"]


@pytest.mark.integration
def test_response_models_reject_incompatible_units_and_measurements(api_client):
    from pydantic import ValidationError

    from app.api.schemas.price_cost import ExchangeMetric, InflationMetric

    index = get(api_client, "/inflation/latest", countries="DE", measurement="index")["items"][0]
    for mutation in [
        {"unit": "percent"},
        {"index_base_year": None},
        {"period": "2026-10-02"},
        {"value": "0"},
    ]:
        with pytest.raises(ValidationError):
            InflationMetric.model_validate(index | mutation)
    rate = get(api_client, "/exchange-rates/latest", currencies="GBP", inverse=True)["items"][0]
    for mutation in [{"unit": "EUR/GBP"}, {"inverse_is_derived": False}, {"value": "NaN"}]:
        with pytest.raises(ValidationError):
            ExchangeMetric.model_validate(rate | mutation)


@pytest.mark.integration
def test_publication_metadata_uses_retrieval_evidence_for_deduplicated_artifacts(api_client, api_database):
    predicate = (
        (m.DataQualityEvent.source_code == SOURCES[0])
        & (m.DataQualityEvent.event_code == "ARTIFACT_RETRIEVED")
        & (m.DataQualityEvent.details["publication_date"].as_string().is_not(None))
    )
    with altered_rows(
        api_database, m.DataQualityEvent, predicate, details={"publication_date": "2026-11-06"}
    ):
        source = get(api_client, "/sources")[0]
        assert source["latest_artifact_publication_date"] == "2026-11-06"
        metric = get(api_client, "/fuel/latest", countries="DE", product="euro_super_95")["items"][0]
        assert metric["period"] == "2026-11-02" and metric["publication_date"] == "2026-11-05"
