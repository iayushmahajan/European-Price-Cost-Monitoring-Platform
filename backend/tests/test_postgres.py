"""Integration checks require an explicitly disposable PostgreSQL database."""

import os
import subprocess
import sys
from unittest.mock import Mock

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from app.api.schemas.query import QueryPlan, QueryRequest
from app.models import Base
from app.services import query_workflow, sql_executor
from app.services.metric_policy import prepare_query
from app.services.sql_executor import SQLExecutionError, execute_select_sql
from app.services.sql_validator import validate_sql

pytestmark = pytest.mark.integration


@pytest.fixture(scope="module")
def postgres():
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
        connection.execute(text("TRUNCATE retail_observations, retail_imports, query_history RESTART IDENTITY"))
        connection.execute(text("""
            INSERT INTO retail_observations
            (geo_code, geography, category_code, category, period, value, status,
             monthly_change, yearly_change, rolling_volatility, anomaly_score, is_anomaly)
            VALUES
            ('DE','Germany','G47','Total retail','2026-07-01',98.6,NULL,-3.3,-2.2,1.1,-4.2,true),
            ('DE','Germany','G47','Total retail','2026-08-01',99.9,'p',1.3,-0.4,1.2,1.1,false),
            ('EU27_2020','EU-27','G47','Total retail','2026-08-01',101.2,'p',0.4,0.7,0.7,0.6,false)
        """))
        connection.execute(text("""
            INSERT INTO retail_imports
            (source, source_sha256, source_updated_at, observation_count, missing_cells,
             earliest_period, latest_period, geography_count, category_count)
            VALUES ('eurostat','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                    '2026-10-06T09:00:00Z',3,0,'2026-07-01','2026-08-01',2,1)
        """))
    yield owner, reader
    owner.dispose()
    reader.dispose()


def test_schema_contains_only_current_analytics_tables(postgres):
    from alembic.autogenerate import compare_metadata
    from alembic.migration import MigrationContext

    owner, _ = postgres
    with owner.connect() as connection:
        assert compare_metadata(MigrationContext.configure(connection), Base.metadata) == []
        for removed in ("orders", "retail_lines", "market_observations", "market_forecasts"):
            assert connection.execute(text("SELECT to_regclass(:name)"), {"name": f"public.{removed}"}).scalar() is None


def test_reader_boundary_and_eurostat_query(postgres, monkeypatch):
    _, reader = postgres
    monkeypatch.setattr(sql_executor, "analytics_engine", reader)
    for sql in [
        "SELECT * FROM query_history",
        "UPDATE retail_observations SET value=0",
        "DELETE FROM retail_imports",
        "CREATE TEMP TABLE stolen(id int)",
    ]:
        with reader.connect() as connection:
            with pytest.raises(DBAPIError):
                connection.execute(text(sql))
            connection.rollback()
    plan = QueryPlan(
        status="ready",
        sql="SELECT value FROM retail_observations WHERE geo_code='DE' ORDER BY period DESC LIMIT 1",
        metric="retail_index",
        interpretation="Latest German index",
        explanation="Read latest Germany row",
    )
    assert execute_select_sql(prepare_query(plan))["rows"] == [["99.900"]]


def test_workflow_and_history(postgres, monkeypatch):
    owner, reader = postgres
    monkeypatch.setattr(sql_executor, "analytics_engine", reader)
    monkeypatch.setattr(query_workflow, "generate_query_plan", Mock(return_value=QueryPlan(
        status="ready",
        sql="SELECT value FROM retail_observations WHERE geo_code='DE' ORDER BY period DESC LIMIT 1",
        metric="retail_index",
        interpretation="Latest German index",
        explanation="Read latest Germany row",
    )))
    with Session(owner) as db:
        result, status = query_workflow.run_analysis(
            QueryRequest(question="What is Germany's latest retail index?"), db, "postgres-test"
        )
        assert status == 200 and result.rows == [["99.900"]]
        assert result.dataset == "eurostat"
        assert "99.90" in result.analysis.answer


def test_owner_credentials_fail_closed(postgres, monkeypatch):
    owner, _ = postgres
    monkeypatch.setattr(sql_executor, "analytics_engine", owner)
    with pytest.raises(SQLExecutionError):
        execute_select_sql(validate_sql("SELECT COUNT(*) FROM retail_observations"))
