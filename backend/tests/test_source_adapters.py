import csv
import io
import json
from datetime import date
from decimal import Decimal
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import pytest
from openpyxl import load_workbook

from app.data_sources import (
    EcbExchangeRateAdapter,
    EurostatHicpAdapter,
    FuelProduct,
    HicpMeasure,
    SourceContractError,
    TaxBasis,
    WeeklyOilBulletinAdapter,
)

FIXTURES = Path(__file__).parent / "fixtures" / "source_samples"
OIL_PAYLOAD = (FIXTURES / "oil_with_taxes_2026-11-02.xlsx").read_bytes()
OIL_WITHOUT_TAX_PAYLOAD = (FIXTURES / "oil_without_taxes_2026-11-02.xlsx").read_bytes()
HICP_PAYLOAD = (FIXTURES / "hicp_2026-08_2026-10.json").read_bytes()
ECB_PAYLOAD = (FIXTURES / "ecb_2026-11-02_2026-11-06.csv").read_bytes()


def _oil_mutation(cell: str, value: object) -> bytes:
    workbook = load_workbook(io.BytesIO(OIL_PAYLOAD))
    workbook.active[cell] = value
    output = io.BytesIO()
    workbook.save(output)
    return output.getvalue()


def _hicp_adapter() -> EurostatHicpAdapter:
    return EurostatHicpAdapter(
        geographies=("EU27_2020", "DE"),
        categories=("TOTAL", "CP01"),
        since_period="2026-08",
    )


def _ecb_adapter() -> EcbExchangeRateAdapter:
    return EcbExchangeRateAdapter(
        currencies=("CHF", "GBP", "USD"),
        start_date=date(2026, 11, 2),
        end_date=date(2026, 11, 6),
    )


def _ecb_rows(payload: bytes = ECB_PAYLOAD) -> tuple[list[str], list[dict[str, str]]]:
    reader = csv.DictReader(io.StringIO(payload.decode()))
    return list(reader.fieldnames or []), list(reader)


def _ecb_payload(headers: list[str], rows: list[dict[str, str]]) -> bytes:
    output = io.StringIO(newline="")
    writer = csv.DictWriter(output, fieldnames=headers)
    writer.writeheader()
    writer.writerows(rows)
    return output.getvalue().encode()


def test_oil_bulletin_parses_and_normalizes_verified_workbook():
    batch = WeeklyOilBulletinAdapter(
        publication_date=date(2026, 11, 5),
    ).parse(OIL_PAYLOAD)

    assert batch.reference_week == date(2026, 11, 2)
    assert batch.tax_basis == TaxBasis.WITH_TAX
    assert len(batch.records) == 54
    germany_petrol = next(
        record for record in batch.records
        if record.country_code == "DE" and record.product == FuelProduct.EURO_SUPER_95
    )
    germany_diesel = next(
        record for record in batch.records
        if record.country_code == "DE" and record.product == FuelProduct.AUTOMOTIVE_DIESEL
    )
    assert germany_petrol.raw_value == Decimal("2128")
    assert germany_petrol.price_eur_per_litre == Decimal("2.128")
    assert germany_petrol.raw_unit == "EUR/1000 litres"
    assert germany_diesel.price_eur_per_litre == Decimal("2.282")
    assert germany_petrol.publication_date == date(2026, 11, 5)


def test_oil_bulletin_preserves_without_tax_basis():
    adapter = WeeklyOilBulletinAdapter(tax_basis=TaxBasis.WITHOUT_TAX)
    batch = adapter.parse(OIL_WITHOUT_TAX_PAYLOAD)
    austria_petrol = next(
        record for record in batch.records
        if record.country_code == "AT" and record.product == FuelProduct.EURO_SUPER_95
    )
    assert batch.tax_basis == TaxBasis.WITHOUT_TAX
    assert austria_petrol.tax_basis == TaxBasis.WITHOUT_TAX
    assert austria_petrol.raw_value == Decimal("908.56")
    assert austria_petrol.price_eur_per_litre == Decimal("0.90856")
    assert "without+taxes" in adapter.source_url


@pytest.mark.parametrize(("cell", "value"), [
    ("B1", "Petrol"),
    ("B2", "litre"),
    ("A4", "Austria"),
    ("B13", None),
])
def test_oil_bulletin_rejects_schema_duplicates_and_missing_values(cell, value):
    with pytest.raises(SourceContractError):
        WeeklyOilBulletinAdapter().parse(_oil_mutation(cell, value))


def test_oil_bulletin_rejects_publication_before_reference_week():
    with pytest.raises(SourceContractError):
        WeeklyOilBulletinAdapter(publication_date=date(2026, 11, 1)).parse(OIL_PAYLOAD)


def test_hicp_parses_sparse_values_units_dates_and_statuses():
    batch = _hicp_adapter().parse(HICP_PAYLOAD)

    assert len(batch.records) == 27
    assert batch.missing_observation_count == 9
    assert batch.source_updated_at.utcoffset() is not None
    annual = next(
        record for record in batch.records
        if record.geography_code == "DE"
        and record.category_code == "TOTAL"
        and record.period == date(2026, 10, 1)
        and record.measure == HicpMeasure.ANNUAL_RATE
    )
    index = next(
        record for record in batch.records
        if record.geography_code == "DE"
        and record.category_code == "TOTAL"
        and record.period == date(2026, 10, 1)
        and record.measure == HicpMeasure.INDEX_2025
    )
    assert annual.value == Decimal("2.8")
    assert annual.unit_code == "RCH_A"
    assert annual.status == "e"
    assert index.value == Decimal("103.80")
    assert index.unit_code == "I25"
    assert index.status == "e"


def test_hicp_preserves_legitimate_missing_cells():
    document = json.loads(HICP_PAYLOAD)
    document["value"].pop("0")
    batch = _hicp_adapter().parse(json.dumps(document).encode())
    assert batch.missing_observation_count == 10
    assert not any(
        record.geography_code == "EU27_2020"
        and record.category_code == "TOTAL"
        and record.period == date(2026, 8, 1)
        and record.measure == HicpMeasure.INDEX_2025
        for record in batch.records
    )


@pytest.mark.parametrize("mutation", ["category", "duplicate_index", "period", "value"])
def test_hicp_rejects_invalid_contracts(mutation):
    document = json.loads(HICP_PAYLOAD)
    if mutation == "category":
        category = document["dimension"]["coicop18"]["category"]
        category["index"]["INVALID"] = category["index"].pop("CP01")
        category["label"]["INVALID"] = category["label"].pop("CP01")
    elif mutation == "duplicate_index":
        document["dimension"]["coicop18"]["category"]["index"]["CP01"] = 0
    elif mutation == "period":
        time = document["dimension"]["time"]["category"]
        time["index"]["not-a-month"] = time["index"].pop("2026-08")
        time["label"]["not-a-month"] = time["label"].pop("2026-08")
    else:
        document["value"]["0"] = "NaN"
    with pytest.raises(SourceContractError):
        _hicp_adapter().parse(json.dumps(document).encode())


def test_hicp_rejects_unapproved_configuration_identifiers():
    with pytest.raises(SourceContractError):
        EurostatHicpAdapter(categories=("NOT_A_CATEGORY",))
    with pytest.raises(SourceContractError):
        EurostatHicpAdapter(geographies=("XX",))
    with pytest.raises(SourceContractError):
        EurostatHicpAdapter(units=("EUR",))


def test_hicp_url_preserves_repeated_dimension_filters():
    adapter = _hicp_adapter()
    query = parse_qs(urlparse(adapter.source_url).query)
    assert query["unit"] == ["I25", "RCH_M", "RCH_A"]
    assert query["coicop18"] == ["TOTAL", "CP01"]
    assert query["geo"] == ["EU27_2020", "DE"]
    assert query["sinceTimePeriod"] == ["2026-08"]


def test_ecb_parses_quote_direction_precision_dates_and_status():
    batch = _ecb_adapter().parse(ECB_PAYLOAD)

    assert len(batch.records) == 15
    assert batch.earliest_date == date(2026, 11, 2)
    assert batch.latest_date == date(2026, 11, 6)
    sterling = next(
        record for record in batch.records
        if record.quote_currency == "GBP" and record.observation_date == date(2026, 11, 3)
    )
    assert sterling.base_currency == "EUR"
    assert sterling.foreign_currency_units_per_eur == Decimal("0.83358")
    assert sterling.series_key == "EXR.D.GBP.EUR.SP00.A"
    assert sterling.status == "A"
    assert sterling.source_decimals == 5


def test_ecb_allows_weekday_gaps_for_target_holidays():
    headers, rows = _ecb_rows()
    rows = [
        row for row in rows
        if not (row["CURRENCY"] == "CHF" and row["TIME_PERIOD"] == "2026-11-04")
    ]
    batch = _ecb_adapter().parse(_ecb_payload(headers, rows))
    assert len(batch.records) == 14


@pytest.mark.parametrize("mutation", ["currency", "direction", "weekend", "value", "duplicate"])
def test_ecb_rejects_invalid_rows_and_duplicates(mutation):
    headers, rows = _ecb_rows()
    if mutation == "currency":
        rows[0]["CURRENCY"] = "CAD"
    elif mutation == "direction":
        rows[0]["CURRENCY_DENOM"] = "USD"
    elif mutation == "weekend":
        rows[0]["TIME_PERIOD"] = "2026-11-07"
    elif mutation == "value":
        rows[0]["OBS_VALUE"] = ""
    else:
        rows.append(dict(rows[0]))
    with pytest.raises(SourceContractError):
        _ecb_adapter().parse(_ecb_payload(headers, rows))


def test_ecb_rejects_invalid_currency_identifiers():
    with pytest.raises(SourceContractError):
        EcbExchangeRateAdapter(currencies=("usd",))
    with pytest.raises(SourceContractError):
        EcbExchangeRateAdapter(currencies=("EUR",))
    with pytest.raises(SourceContractError):
        EcbExchangeRateAdapter(currencies=("USD", "USD"))


def test_ecb_url_preserves_series_direction_and_date_range():
    url = _ecb_adapter().source_url
    assert "/D.CHF+GBP+USD.EUR.SP00.A" in url
    query = parse_qs(urlparse(url).query)
    assert query == {
        "format": ["csvdata"],
        "startPeriod": ["2026-11-02"],
        "endPeriod": ["2026-11-06"],
    }
