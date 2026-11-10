"""Opt-in smoke tests against official sources; excluded from normal test runs."""

import os
from datetime import date

import pytest

from app.data_sources import EcbExchangeRateAdapter, EurostatHicpAdapter, WeeklyOilBulletinAdapter

pytestmark = [
    pytest.mark.live,
    pytest.mark.skipif(
        os.getenv("RUN_LIVE_SOURCE_TESTS") != "1",
        reason="Set RUN_LIVE_SOURCE_TESTS=1 to contact official external sources",
    ),
]


def test_live_official_source_contracts():
    oil = WeeklyOilBulletinAdapter().parse(WeeklyOilBulletinAdapter().fetch())
    assert len(oil.records) == 54

    hicp_adapter = EurostatHicpAdapter(
        geographies=("EU27_2020", "DE"),
        categories=("TOTAL", "CP01"),
        since_period="2026-08",
    )
    hicp = hicp_adapter.parse(hicp_adapter.fetch())
    assert hicp.records

    ecb_adapter = EcbExchangeRateAdapter(
        currencies=("CHF", "GBP", "USD"),
        start_date=date(2026, 11, 2),
        end_date=date(2026, 11, 6),
    )
    ecb = ecb_adapter.parse(ecb_adapter.fetch())
    assert len(ecb.records) == 15


def test_live_discovered_acquisition_plans():
    from app.ingestion.sources import SOURCES, SourceConfig, acquire

    config = SourceConfig(geographies=("DE",), categories=("TOTAL",), currencies=("USD",))
    for source in SOURCES:
        responses = list(
            acquire(source, mode="backfill", since=date(2026, 10, 1), today=date(2026, 11, 8), config=config)
        )
        assert any(item.batch and item.batch.records for item in responses)
        if source == SOURCES[0]:
            assert len(responses) == 4  # landing page, both weekly books, archive
