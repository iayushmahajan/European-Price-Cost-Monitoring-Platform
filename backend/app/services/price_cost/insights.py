"""Bounded, read-only context. All arithmetic stays in Decimal on verified records."""

from datetime import date, timedelta
from decimal import Decimal, localcontext

from app.api.schemas import price_cost as s
from app.models import price_cost as m
from app.services.price_cost.calculations import difference, ratio
from app.services.price_cost.repository import DOMAINS


def scaled(value, multiplier):
    with localcontext() as context:
        context.prec = 64
        return value * Decimal(multiplier)


def summary(metrics, *, inverse=False):
    first, last = metrics[0], metrics[-1]
    values = [item.inverse_rate if inverse else item.value for item in metrics]
    with localcontext() as context:
        context.prec = 64
        average = ratio(sum(values, Decimal(0)), Decimal(len(metrics)))
    return s.HistoricalSummary(
        count=len(metrics),
        first_period=first.period,
        last_period=last.period,
        minimum=min(values),
        maximum=max(values),
        average=average,
        change=difference(values[-1], values[0]) if len(metrics) > 1 else None,
        change_unit=first.inverse_unit
        if inverse
        else "percentage_points"
        if first.measurement_type in {"annual_rate", "monthly_rate"}
        else "index_points"
        if first.measurement_type == "index"
        else first.unit,
    )


def fuel_history_comparison(service, **query):
    latest = service.compare_countries("fuel", **query)
    result = s.FuelHistoryComparison(
        available=False,
        latest=latest,
        observations=[],
        summaries=[],
        unmatched_weeks=[],
        absolute_gap_change=None,
        gap_direction=None,
    )
    if not latest.available:
        return result
    base_country = query["base_country"]
    peer_country = next(code for code in query["countries"] if code != base_country)
    series = service.repo.series(
        "fuel", countries=query["countries"], product=query["product"], tax_basis=query["tax_basis"]
    )
    periods = service.repo.matched_fuel_periods(series, latest.period)
    if not periods:
        return result
    maps = {}
    for selected in series:
        rows, _, more = service.repo.history(
            "fuel", selected, periods[0], query.get("period") or query.get("as_of") or service.today, 2000
        )
        if more:
            raise ValueError("Matched history exceeds its bounded result limit")
        maps[selected.geography_code] = {
            service.period("fuel", row): service.metric("fuel", selected, row) for row in rows
        }
    for i, period in enumerate(periods):
        base, peer = maps[base_country][period], maps[peer_country][period]
        result.observations.append(
            s.MatchedFuelWeek(
                period=period,
                base=base,
                peer=peer,
                gap=difference(peer.value, base.value),
                consecutive=None if i == 0 else period - periods[i - 1] == timedelta(days=7),
            )
        )
    # Include an observed unmatched week and a fully absent scheduled week, without inventing observations.
    scheduled = set(periods)
    for country_map in maps.values():
        scheduled.update(country_map)
    day = periods[0]
    while day <= max(scheduled) and len(scheduled) < 2000:
        scheduled.add(day)
        day += timedelta(days=7)
    result.unmatched_weeks = [
        s.MissingFuelWeek(
            period=day,
            missing_countries=[code for code in (base_country, peer_country) if day not in maps[code]],
        )
        for day in sorted(scheduled)
        if any(day not in maps[code] for code in (base_country, peer_country))
    ]
    result.summaries = [
        s.FuelPeriodSummary(
            geography=getattr(result.observations[0], side).geography,
            history=summary([getattr(row, side) for row in result.observations]),
        )
        for side in ("base", "peer")
    ]
    if len(periods) > 1:
        delta = difference(result.observations[-1].gap.copy_abs(), result.observations[0].gap.copy_abs())
        result.absolute_gap_change = delta
        result.gap_direction = "widened" if delta > 0 else "narrowed" if delta < 0 else "unchanged"
    from app.services.price_cost.context import comparison_context
    result.insights = comparison_context(result.observations)
    result.available = True
    return result


def measurement_insights(service, domain, observation_id, *, inverse=False, comparison_date=None):
    model = DOMAINS[domain][0]
    row = service.repo.session.get(model, observation_id)
    if row is None:
        return None
    selected = service.repo.session.get(m.SourceSeries, row.series_id)
    recent = service.repo.recent(domain, selected, service.period(domain, row), 12)
    metrics = [service.metric(domain, selected, item, inverse=inverse) for item in recent]
    metric = service.metric(domain, selected, row, recent[-2] if len(recent) > 1 else None, inverse=inverse)
    indices, aggregate = [], None
    if comparison_date is not None:
        if domain != "exchange-rates" or comparison_date > service.today or abs((metric.period - comparison_date).days) > 3660:
            raise ValueError("Comparison date must be historical and within 3660 days of the FX observation")
        metric = service.latest("exchange-rates", currencies=(selected.quote_currency_code,),
            as_of=metric.period, inverse=inverse, comparison_date=comparison_date).items[0]
    if domain == "inflation":
        if metric.measurement_type == "annual_rate":
            reference = date(metric.period.year - 1, metric.period.month, 1)
        elif metric.measurement_type == "monthly_rate":
            reference = (metric.period - timedelta(days=1)).replace(day=1)
        else:
            reference = metrics[0].period
        index_series = service.repo.series("inflation", countries=(metric.geography.code,),
            category=metric.category.code, measurement="index")
        # A single compatible semantic series; never mix bases or select an arbitrary duplicate.
        candidates = []
        for series in index_series:
            pair = []
            for period in (reference, metric.period):
                rows, _, _ = service.repo.history("inflation", series, period, period, 1)
                if rows:
                    pair.append(service.metric("inflation", series, rows[0]))
            if len(pair) == 2 and reference < metric.period and pair[0].index_base_year == pair[1].index_base_year:
                candidates.append(pair)
        if len(candidates) == 1:
            indices = candidates[0]
        if metric.measurement_type != "index" and metric.geography.code != "EU27_2020":
            peers = service.latest("inflation", countries=("EU27_2020",), category=metric.category.code,
                measurement=metric.measurement_type, as_of=metric.period).items
            aggregate = peers[0] if peers and peers[0].period == metric.period else None
    result = insights_for_metrics(domain, metric, metrics, inverse=inverse, indices=indices, aggregate=aggregate)
    if domain == "exchange-rates":
        comparison = metric.inverse_comparison if inverse else metric.comparison
        if comparison is not None and comparison.available:
            rows, _, _ = service.repo.history(domain, selected, comparison.reference_period, comparison.reference_period, 1)
            if rows:
                reference = service.metric(domain, selected, rows[0], inverse=inverse)
                result.insights[0].evidence_paths = [reference.evidence_path, metric.evidence_path]
                result.insights[0].estimated |= bool(reference.status.estimated)
                result.insights[0].provisional |= bool(reference.status.provisional)
    return result


def insights_for_metrics(domain, metric, metrics, *, inverse=False, indices=(), aggregate=None):
    if domain == "fuel":
        meaning = "A reported national average price per litre."
        note = ""
        example = s.InsightExample(
            label="Illustrative 50-litre purchase at this reported price",
            value=scaled(metric.value, 50),
            unit="EUR",
        )
        limitation = "Station prices and your actual purchase cost may differ from the national average."
    elif domain == "inflation":
        example = None
        if metric.measurement_type == "index":
            meaning = (
                f"An index of consumer prices with the {metric.index_base_year} annual average set to 100."
            )
            note = "Index-point movements describe this series; national index levels are not comparable basket costs."
        else:
            annual = metric.measurement_type == "annual_rate"
            meaning = "Prices compared with " + (
                "the same month one year earlier." if annual else "the preceding month."
            )
            note = (
                "Changes between these rates are percentage-point differences, not additional price increases. "
                + (
                    "A lower positive rate means prices still rose over its comparison period; it does not mean prices fell."
                    if metric.value > 0
                    else "A negative rate means prices were lower than in that rate's comparison period."
                    if metric.value < 0
                    else "A zero rate means no measured price change over that rate's comparison period."
                )
            )
        limitation = (
            "HICP reflects a weighted consumer basket, not an individual's or company's actual costs."
        )
    else:
        meaning = f"The official direction is 1 EUR in {metric.quote_currency}; a higher rate means one euro buys more {metric.quote_currency}."
        if inverse:
            meaning = f"The derived direction is 1 {metric.quote_currency} in EUR; a higher value means one {metric.quote_currency} buys more euros."
        note = (
            "The change compares actual published reference dates. Weekends and missing dates are not filled."
        )
        example = s.InsightExample(
            label=f"Illustrative conversion of 100 {metric.quote_currency if inverse else 'EUR'} before fees",
            value=scaled(metric.inverse_rate if inverse else metric.value, 100),
            unit="EUR" if inverse else metric.quote_currency,
        )
        limitation = "ECB reference rates exclude transaction fees and provider margins; they are not guaranteed quotes."
    from app.services.price_cost.context import measurement_context
    return s.MeasurementInsights(
        insights=measurement_context(domain, metric, metrics, inverse=inverse, indices=indices, aggregate=aggregate),
        metric=metric,
        meaning=meaning,
        comparison_note=note,
        history=summary(metrics, inverse=inverse),
        example=example,
        limitation=limitation,
    )
