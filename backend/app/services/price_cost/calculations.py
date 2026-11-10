"""Decimal-only calculations and explicit source-calendar comparisons."""

from datetime import date, timedelta
from decimal import ROUND_HALF_EVEN, Decimal, localcontext

from app.api.schemas.price_cost import Change, ObservationStatus
from app.ingestion.freshness import ecb_publication_day

DERIVED_SCALE = Decimal("0.000000000000000001")


def ratio(numerator: Decimal, denominator: Decimal, multiplier=Decimal(1)) -> Decimal | None:
    if denominator == 0:
        return None
    with localcontext() as context:
        context.prec = 64
        return (numerator / denominator * multiplier).quantize(DERIVED_SCALE, rounding=ROUND_HALF_EVEN)


def difference(current: Decimal, previous: Decimal) -> Decimal:
    with localcontext() as context:
        context.prec = 64
        return current - previous


def data_status(status: str | None, *, hicp=False) -> ObservationStatus:
    # Interpret only the verified Eurostat flags; retain other source codes without guessing.
    return ObservationStatus(
        source_status=status,
        estimated=bool(status and "e" in status) if hicp else None,
        provisional=bool(status and "p" in status) if hicp else None,
    )


def expected_previous(domain: str, period: date) -> date:
    if domain == "fuel":
        return period - timedelta(days=7)
    if domain == "inflation":
        return (period.replace(day=1) - timedelta(days=1)).replace(day=1)
    previous = period - timedelta(days=1)
    while not ecb_publication_day(previous):
        previous -= timedelta(days=1)
    return previous


def change(domain, measurement, period, value, previous, *, requested=None) -> Change:
    unit = (
        "EUR/litre"
        if domain == "fuel"
        else (
            "percentage_points"
            if domain == "inflation" and measurement != "index"
            else ("index_points" if domain == "inflation" else "quote_currency_units_per_EUR")
        )
    )
    result = Change(
        available=False,
        absolute_change_unit=unit,
        requested_period=requested,
        basis="on_or_before_requested_date" if requested else "previous_available",
    )
    if previous is None or (requested is not None and requested >= period):
        result.unavailable_reason = (
            "No earlier comparable observation is available for the requested comparison."
        )
        return result
    old_period, old_value, old_status = previous
    if old_period >= period:
        raise ValueError("Comparison must precede the current observation")
    delta = difference(value, old_value)
    result.available = True
    result.reference_period = old_period
    result.reference_value = old_value
    result.reference_status = data_status(old_status, hicp=domain == "inflation")
    result.absolute_change = delta
    result.relative_change_percent = (
        None if unit == "percentage_points" else ratio(delta, old_value, Decimal(100))
    )
    result.consecutive = old_period == expected_previous(domain, period) if requested is None else None
    result.elapsed_days = (period - old_period).days
    return result
