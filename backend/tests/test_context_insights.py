from datetime import date
from decimal import Decimal
from types import SimpleNamespace as NS

from app.services.price_cost.context import comparison_context, measurement_context


def point(value, day=1, **changes):
    fields = dict(
        value=Decimal(value),
        period=date(2026, 10, day),
        evidence_path=f"/evidence/{day}/{value}",
        status=NS(estimated=False, provisional=False),
        tax_basis="with_tax",
        measurement_type="index",
        index_base_year=2025,
        comparison=NS(available=False),
        geography=NS(code="DE", name="Germany"),
        category=NS(code="TOTAL"),
    )
    return NS(**(fields | changes))


def test_fuel_context_does_not_manufacture_importance():
    rows = [point("2", 1), point("2", 8)]
    result = measurement_context("fuel", rows[-1], rows)
    assert len(result) == 1 and result[0].kind == "factual" and result[0].value is None
    assert "no price movement" in result[0].detail
    for row in rows:
        row.tax_basis = "without_tax"
    rows.append(point("2.1", 15, tax_basis="without_tax"))
    result = measurement_context("fuel", rows[-1], rows)
    assert result[0].value == Decimal(5) and "excluding taxes" in result[0].detail
    assert result[1].kind == "recent_extreme" and "not an all-time record" in result[1].detail


def test_hicp_uses_compatible_indices_not_average_rates():
    metric = point("2.8", measurement_type="annual_rate")
    old, current = point("100", 1), point("102", 1)
    old.period = date(2025, 10, 1)
    current.status.estimated = True
    result = measurement_context("inflation", metric, [metric], indices=[old, current])
    assert result[0].kind == "price_level_change" and result[0].value == 2
    assert result[0].unit == "percent" and result[0].estimated
    current.index_base_year = 2015
    assert measurement_context("inflation", metric, [metric], indices=[old, current])[0].kind == "unavailable"
    current.index_base_year = 2025
    current.geography = NS(code="FR", name="France")
    assert measurement_context("inflation", metric, [metric], indices=[old, current])[0].kind == "unavailable"
    aggregate = point("2.4", measurement_type="annual_rate", geography=NS(code="EU27_2020"))
    facts = measurement_context("inflation", metric, [metric], aggregate=aggregate)
    assert facts[-1].value == Decimal(".4") and facts[-1].unit == "percentage_points"
    aggregate.period = date(2026, 9, 1)
    assert len(measurement_context("inflation", metric, [metric], aggregate=aggregate)) == 1


def test_rank_reversals_use_unequal_matched_weeks_and_keep_latest_ranking_separate():
    def row(gap, day):
        return NS(
            base=point("2", day),
            peer=point(str(Decimal(2) + Decimal(gap)), day, geography=NS(code="FR", name="France")),
            gap=Decimal(gap),
        )

    rows = [row("-.1", 1), row("0", 8), row(".1", 22)]
    facts = comparison_context(rows)
    assert len(facts) == 2 and facts[0].kind == "rank_reversal"
    assert facts[0].reference_period == date(2026, 10, 1) and facts[0].period == date(2026, 10, 22)
    assert "crossing date is unknown" in facts[0].detail and "more expensive" in facts[0].detail
    assert facts[1].value == 5 and "France minus Germany" in facts[1].detail
    assert comparison_context([row("0", 1), row(".1", 8)])[0].kind != "rank_reversal"
    assert comparison_context([row("0", 1)])[0].value == 0


def test_fx_conversion_uses_selected_backend_comparison_and_real_dates():
    forward = NS(available=True, absolute_change=Decimal(".001"), reference_period=date(2026, 9, 30))
    inverse = NS(available=True, absolute_change=Decimal("-.002"), reference_period=date(2026, 9, 30))
    metric = point(".8", quote_currency="GBP", comparison=forward, inverse_comparison=inverse)
    assert measurement_context("exchange-rates", metric, [metric])[0].value == Decimal(".1")
    fact = measurement_context("exchange-rates", metric, [metric], inverse=True)[0]
    assert fact.value == Decimal("-.2") and fact.unit == "EUR" and "100 GBP" in fact.title
    metric.inverse_comparison = None
    assert measurement_context("exchange-rates", metric, [metric], inverse=True)[0].kind == "factual"


def test_return_to_initial_price_does_not_claim_the_whole_period_was_flat():
    rows = [point("2", 1), point("1.9", 8), point("2.1", 15), point("2", 22)]
    result = measurement_context("fuel", rows[-1], rows)
    assert len(result) == 1 and result[0].kind == "recent_peak_change"
    assert result[0].value == Decimal("-5")
    assert result[0].reference_period == date(2026, 10, 15)
