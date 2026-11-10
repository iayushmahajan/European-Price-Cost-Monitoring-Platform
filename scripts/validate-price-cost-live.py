"""Read-only contract and numerical audit through deployed nginx (run in backend).

    docker compose exec -T backend python - < scripts/validate-price-cost-live.py

No fixtures, provider calls, database writes or credentials in the report.
"""
import json
from decimal import Decimal, localcontext
from urllib.error import HTTPError
from urllib.request import urlopen

from app.api.schemas import price_cost as s
from app.ingestion.freshness import source_today
from pydantic import TypeAdapter

BASE = "http://frontend/api/v1/price-cost"
report = {"validation": "live", "checks": [], "representative_observations": []}


def fetch(path, model, status=200):
    try:
        with urlopen(BASE + path, timeout=30) as response:
            actual, payload = response.status, json.load(response)
    except HTTPError as error:
        actual, payload = error.code, json.load(error)
    assert actual == status, (path, actual, status)
    result = TypeAdapter(model).validate_python(payload) if model else payload
    report["checks"].append({"path": path, "status": actual, "schema_valid": bool(model)})
    return result


catalogue = fetch("/catalogue", s.Catalogue)
assert catalogue.coverage
fetch("/overview?country=DE&currency=GBP", s.Overview)
sources = fetch("/sources", list[s.SourceStatus])
assert len(sources) == 3 and all(source.available for source in sources)
for domain, model, query in (
    ("fuel", s.FuelResponse, "countries=DE,FR&product=automotive_diesel&tax_basis=with_tax"),
    ("fuel", s.FuelResponse, "countries=DE&product=euro_super_95&tax_basis=without_tax"),
    ("inflation", s.InflationResponse, "countries=DE,EU27_2020&category=TOTAL&measurement=annual_rate"),
    ("inflation", s.InflationResponse, "countries=DE&category=CP01&measurement=monthly_rate"),
    ("inflation", s.InflationResponse, "countries=DE&category=TOTAL&measurement=index"),
    ("exchange-rates", s.ExchangeResponse, "currencies=GBP,USD&inverse=true"),
):
    response = fetch(f"/{domain}/latest?{query}", model)
    assert response.available and response.items and not response.missing_selections
    for item in response.items:
        assert isinstance(item.value, Decimal)
        evidence = fetch(item.evidence_path.removeprefix("/v1/price-cost"), s.Evidence)
        assert evidence.period == item.period
        stored = evidence.original_values
        value_key = {"fuel": "normalized_price_eur_per_litre", "inflation": "value", "exchange-rates": "reference_rate"}[domain]
        assert Decimal(str(stored[value_key])) == item.value
        if item.comparison.available:
            change = item.value - item.comparison.reference_value
            assert change == item.comparison.absolute_change
        if domain == "fuel":
            assert Decimal(str(stored["raw_value"])) / 1000 == item.value
            assert item.unit == "EUR/litre"
        elif domain == "inflation":
            assert item.period.day == 1
            if item.measurement_type == "index":
                assert item.index_base_year == 2025
            elif item.comparison.available:
                assert item.comparison.absolute_change_unit == "percentage_points"
        else:
            assert item.base_currency == "EUR" and item.period.weekday() < 5
            with localcontext() as ctx:
                ctx.prec = 64
                assert (Decimal(1) / item.value).quantize(Decimal("1e-18")) == item.inverse_rate
        report["representative_observations"].append({
            "domain": domain, "period": str(item.period), "value": str(item.value),
            "unit": item.unit, "evidence": item.evidence_path,
        })
end = source_today().isoformat()
month_end = end[:7] + "-01"
for domain, model, query in (
    ("fuel", s.FuelResponse, f"country=DE&product=automotive_diesel&start=2025-01-01&end={end}"),
    ("inflation", s.InflationResponse, f"country=DE&category=TOTAL&measurement=annual_rate&start=2025-01-01&end={month_end}"),
    ("exchange-rates", s.ExchangeResponse, f"currency=GBP&inverse=true&start=2025-01-01&end={end}"),
):
    response = fetch(f"/{domain}/history?{query}&limit=2000", model)
    assert response.available and len(response.items) > 2
    periods = [item.period for item in response.items]
    assert periods == sorted(set(periods))
    if domain == "exchange-rates":
        assert all(period.weekday() < 5 for period in periods)
    report["checks"][-1]["observations"] = len(periods)
for domain, query in (
    ("fuel", "countries=DE,FR&base_country=DE&product=automotive_diesel"),
    ("inflation", "countries=DE,EU27_2020&base_country=DE&category=TOTAL&measurement=annual_rate"),
):
    result = fetch(f"/{domain}/compare?{query}", s.CountryComparison)
    assert result.available and len(result.items) == 2
    base = next(item.value for item in result.items if item.geography.code == result.base_geography)
    assert all(item.difference_from_base == item.value - base for item in result.items)
    assert all(item.difference_unit == ("EUR/litre" if domain == "fuel" else "percentage_points") for item in result.items)
fetch("/inflation/compare?countries=DE,FR&base_country=DE&measurement=index", None, 422)
fetch("/fuel/latest?countries=XX", None, 422)
fetch("/fuel/latest?unit=USD", None, 422)
fetch("/fuel/history?country=DE&start=1900-01-01&end=2026-01-01", None, 422)
fetch("/evidence/fuel/9223372036854775807", None, 404)
empty = fetch("/fuel/latest?countries=DE&as_of=1900-01-01", s.FuelResponse)
assert empty.available is False and empty.items == []
print(json.dumps(report, indent=2))
