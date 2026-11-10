"""Small, deterministic observations. Never infer causes or fill missing periods."""

from datetime import date, timedelta

from app.api.schemas.price_cost import ContextInsight
from app.services.price_cost.calculations import difference, ratio


def insight(kind, title, detail, points, *, value=None, unit=None):
    return ContextInsight(
        kind=kind,
        title=title,
        detail=detail,
        value=value,
        unit=unit,
        reference_period=points[0].period if len(points) > 1 else None,
        period=points[-1].period,
        evidence_paths=list(dict.fromkeys(p.evidence_path for p in points)),
        estimated=any(p.status.estimated for p in points),
        provisional=any(p.status.provisional for p in points),
    )


def measurement_context(domain, metric, metrics, *, inverse=False, indices=(), aggregate=None):
    from app.services.price_cost.insights import scaled

    first, last = metrics[0], metrics[-1]
    if domain == "fuel":
        facts = []
        tax = "including taxes" if metric.tax_basis == "with_tax" else "excluding taxes"
        peak = max(reversed(metrics), key=lambda p: p.value)
        decline = difference(last.value, peak.value)
        peak_context = (
            first.period < peak.period < last.period
            and decline < 0
            and abs(decline) > abs(difference(last.value, first.value))
        )
        if peak_context:
            facts.append(
                insight(
                    "recent_peak_change",
                    "Below the recent price peak",
                    f"Change in an illustrative 50-litre purchase since the highest of these {len(metrics)} available weekly prices, {tax}.",
                    [peak, last],
                    value=scaled(decline, 50),
                    unit="EUR",
                )
            )
        elif len(metrics) > 1 and first.value != last.value:
            facts.append(
                insight(
                    "fuel_cost_change",
                    "How a 50-litre purchase changed",
                    f"Change in an illustrative purchase at the reported national averages, {tax}.",
                    [first, last],
                    value=scaled(difference(last.value, first.value), 50),
                    unit="EUR",
                )
            )
        values = [p.value for p in metrics]
        if len(metrics) >= 3 and min(values) != max(values) and last.value in {min(values), max(values)}:
            position = "lowest" if last.value == min(values) else "highest"
            facts.append(
                insight(
                    "recent_extreme",
                    f"At the recent {position} recorded price",
                    f"The {position} among these {len(metrics)} available weekly observations; this is not an all-time record.",
                    metrics,
                )
            )
        return facts or [
            insight(
                "factual",
                "Recorded price context",
                "Only one observation is available in this recent window; a historical movement cannot be established."
                if len(metrics) == 1
                else "The available observations show no price movement."
                if min(values) == max(values)
                else "The latest price matches the first in this window; prices varied in between.",
                metrics,
            )
        ]
    if domain == "inflation":
        facts = []
        if len(indices) == 2:
            old, current = indices
            expected = (
                date(metric.period.year - 1, metric.period.month, 1)
                if metric.measurement_type == "annual_rate"
                else (metric.period - timedelta(days=1)).replace(day=1)
                if metric.measurement_type == "monthly_rate"
                else old.period
            )
            compatible = (
                current.period == metric.period
                and old.period == expected
                and old.index_base_year is not None
                and old.index_base_year == current.index_base_year
                and old.geography == metric.geography
                and old.category == metric.category
                and old.geography == current.geography
                and old.category == current.category
                and old.period < current.period
                and old.value > 0
            )
            if compatible:
                facts.append(
                    insight(
                        "price_level_change",
                        "Consumer price-level change",
                        f"Consumer prices {'rose' if current.value > old.value else 'fell' if current.value < old.value else 'were unchanged'} between these months, using matching HICP indices for this country and category. This derived change need not exactly reproduce the published inflation rate."
                        + (
                            " The positive annual rate still means prices were higher than a year earlier."
                            if metric.measurement_type == "annual_rate"
                            and metric.value > 0
                            and metric.comparison.available
                            and metric.comparison.absolute_change < 0
                            else ""
                        ),
                        indices,
                        value=ratio(difference(current.value, old.value), old.value, 100),
                        unit="percent",
                    )
                )
        if not facts:
            facts.append(
                insight(
                    "unavailable",
                    "Price-level context unavailable",
                    "Matching HICP indices with a common base are not available for this comparison. Inflation rates are not averaged or added to replace them.",
                    [metric],
                )
            )
        if aggregate is not None and (
            aggregate.period == metric.period
            and aggregate.category == metric.category
            and aggregate.measurement_type == metric.measurement_type
            and metric.measurement_type != "index"
            and aggregate.geography.code == "EU27_2020"
            and metric.geography.code != "EU27_2020"
        ):
            facts.append(
                insight(
                    "eu_rate_gap",
                    "Compared with the official EU-27 rate",
                    f"{metric.geography.name} minus the EU-27 aggregate for the same category, month and rate type. This compares inflation rates, not national price levels.",
                    [metric, aggregate],
                    value=difference(metric.value, aggregate.value),
                    unit="percentage_points",
                )
            )
        return facts
    comparison = metric.inverse_comparison if inverse else metric.comparison
    if comparison is not None and comparison.available:
        base = metric.quote_currency if inverse else "EUR"
        quote = "EUR" if inverse else metric.quote_currency
        return [
            ContextInsight(
                kind="conversion_change",
                title=f"What changed for 100 {base}",
                detail=f"Change in {quote} received at the selected reference rates, before fees or provider margins.",
                value=scaled(comparison.absolute_change, 100),
                unit=quote,
                reference_period=comparison.reference_period,
                period=metric.period,
                evidence_paths=[metric.evidence_path],
                estimated=bool(metric.status.estimated),
                provisional=bool(metric.status.provisional),
            )
        ]
    return [
        insight(
            "factual",
            "Reference-rate context",
            "An earlier comparable reference rate is unavailable; a conversion change cannot be established.",
            [metric],
        )
    ]


def comparison_context(observations):
    from app.services.price_cost.insights import scaled

    if not observations:
        return []
    latest = observations[-1]
    base, peer = latest.base.geography.name, latest.peer.geography.name
    tax = "including taxes" if latest.base.tax_basis == "with_tax" else "excluding taxes"
    facts, previous = [], None
    reversal = None
    for row in observations:
        if row.gap == 0:
            continue  # A tie is not itself a reversal; retain the last unequal observation.
        if previous is not None and (row.gap > 0) != (previous.gap > 0):
            reversal = (previous, row)
        previous = row
    if reversal:
        before, after = reversal
        direction = "more expensive" if after.gap > 0 else "cheaper"
        facts.append(
            insight(
                "rank_reversal",
                "The observed price ranking reversed",
                f"{peer} changed from {'cheaper' if after.gap > 0 else 'more expensive'} to {direction} than {base} between these matched weeks. The exact crossing date is unknown.",
                [before.base, before.peer, after.base, after.peer],
            )
        )
    direction = "more expensive" if latest.gap > 0 else "cheaper" if latest.gap < 0 else "the same price"
    facts.append(
        insight(
            "fifty_litre_gap",
            "Latest ranking · 50-litre example",
            f"{peer} is {direction}{' than ' + base if latest.gap != 0 else ' as ' + base}. Signed cost difference: {peer} minus {base}, {tax}, at national average prices.",
            [latest.base, latest.peer],
            value=scaled(latest.gap, 50),
            unit="EUR",
        )
    )
    return facts[:2]
