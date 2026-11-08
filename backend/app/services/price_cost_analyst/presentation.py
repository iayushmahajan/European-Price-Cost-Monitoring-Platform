"""Concise answers, tables and follow-ups from verified M4 values only."""

import re
from decimal import Decimal

from app.api.schemas import price_cost as s
from app.api.schemas import price_cost_analyst as a
from app.services.price_cost.calculations import change, ratio
from app.services.price_cost.explanations import display, explain
from app.services.price_cost.product import MEASUREMENT_NAMES, PRODUCT_NAMES
from app.services.price_cost_analyst.execution import domain_for, observation_points, sources


def assumptions(operation):
    if operation.kind == "supported_currencies":
        return [
            "The list is the approved catalogue, not a promise that every series has current observations."
        ]
    query = operation.query
    domain = domain_for(operation)
    result = []
    if domain == "fuel":
        if hasattr(query, "tax_basis"):
            result.append(
                "Fuel prices "
                + ("include" if query.tax_basis.value == "with_tax" else "exclude")
                + " taxes; values use EUR/litre."
            )
    elif domain == "inflation":
        result.extend(
            [
                f"HICP measurement: {query.measurement}; category: {query.category}.",
                "Changes between inflation rates use percentage points, not percent.",
            ]
        )
    else:
        result.append(
            "The official quote is foreign-currency units per EUR; inverses are derived reciprocals."
        )
    result.append(
        "Latest and previous mean actual stored reference periods. as_of is a period cutoff, not an as-known-at snapshot."
    )
    if operation.kind.endswith("_history"):
        result.append(
            f"History is bounded to {query.limit} chronological observations; summaries cover only the returned window."
        )
    if operation.kind.endswith("_compare") or operation.kind == "fuel_tax_comparison":
        result.append(
            "Differences require exactly aligned reference periods; no cross-frequency alignment is inferred."
        )
    return result


def follow_ups(operation):
    if operation.kind.startswith("fuel"):
        query = operation.query
        country = query.country if hasattr(query, "country") else query.countries.split(",")[0]
        product = query.product.value if query.product else "automotive_diesel"
        product_name = "diesel" if product == "automotive_diesel" else "petrol"
        return [
            f"Compare {product_name} prices in {country} with and without taxes.",
            f"Show {product_name} prices in {country} over the past six months.",
        ]
    if operation.kind.startswith("inflation"):
        query = operation.query
        country = query.country if hasattr(query, "country") else query.countries.split(",")[0]
        return [
            f"Show monthly inflation in {country} for {query.category}.",
            f"Show annual inflation in {country} for {query.category} over the past twelve months.",
        ]
    currency = (
        operation.query.currency
        if hasattr(getattr(operation, "query", None), "currency")
        else (operation.query.currencies.split(",")[0] if hasattr(operation, "query") else "GBP")
    )
    return [
        f"Show the {currency} reference rate over the past month.",
        f"How many euros per {currency} at the latest reference rate?",
    ]


def inverse_summary(point, previous_value, previous_period, *, scope, requested=None):
    current = point.inverse_rate
    previous = ratio(Decimal(1), previous_value) if previous_value is not None else None
    comparison = change(
        "exchange-rates",
        "reference_rate",
        point.period,
        current,
        (previous_period, previous, None) if previous is not None else None,
        requested=requested,
    )
    comparison.absolute_change_unit = f"EUR/{point.quote_currency}"
    if comparison.available:
        delta = comparison.absolute_change
        movement = "increased" if delta > 0 else "decreased" if delta < 0 else "was unchanged"
        changed = f"Between {previous_period} and {point.period}, the derived euros per {point.quote_currency} rate {movement}"
        changed += f" by {display(abs(delta), 8)} EUR per {point.quote_currency}." if delta else "."
        if comparison.consecutive is False:
            changed += " This compares available observations, not consecutive publication days."
    else:
        changed = "No earlier comparable reference observation is available for a derived inverse change."
    explanation = s.Explanation(
        what_changed=changed,
        what_it_means=f"On {point.period}, 1 {point.quote_currency} equalled {display(current, 8)} EUR using the reciprocal of the ECB reference rate.",
        why_it_might_matter=point.explanation.why_it_might_matter,
        limitations=point.explanation.limitations
        + [
            "The inverse and its change are derived; the stored ECB observation retains EUR as its official base."
        ],
    )
    return a.SummaryComparison(
        comparison=comparison, explanation=explanation, scope=scope, direction="inverse"
    )


def window_summary(domain, points):
    if len(points) < 2:
        return None
    first, last = points[0], points[-1]
    if isinstance(last, s.ExchangeMetric) and last.inverse_rate is not None:
        return inverse_summary(
            last, first.value, first.period, scope="returned_window", requested=first.period
        )
    comparison = change(
        domain,
        last.measurement_type,
        last.period,
        last.value,
        (first.period, first.value, first.status.source_status),
        requested=first.period,
    )
    kwargs = {}
    if isinstance(last, s.FuelMetric):
        kwargs = dict(name=f"{last.indicator_name} in {last.geography.name}", tax_basis=last.tax_basis.value)
    elif isinstance(last, s.InflationMetric):
        kwargs = dict(
            name=last.geography.name, category=last.category.name, measurement=last.measurement_type
        )
    else:
        kwargs = dict(name=f"ECB {last.quote_currency} per euro reference rate", quote=last.quote_currency)
    explanation = explain(
        domain, value=last.value, period=last.period, comparison=comparison, status=last.status, **kwargs
    )
    return a.SummaryComparison(comparison=comparison, explanation=explanation, scope="returned_window")


def table_for(result):
    rows = []
    if isinstance(result, a.CurrenciesResult):
        rows = [dict(currency=item.code, name=item.name) for item in result.items]
    elif isinstance(result, a.CountryResult):
        rows = [
            dict(
                period=result.data.period.isoformat(),
                geography=item.geography.code,
                value=str(item.value),
                unit=result.data.unit,
                difference_from_base=str(item.difference_from_base),
                difference_unit=item.difference_unit,
                relative_difference_percent=str(item.relative_difference_percent)
                if item.relative_difference_percent is not None
                else None,
                source_status=item.status.source_status,
            )
            for item in result.data.items
        ]
    else:
        for point in observation_points(result):
            row = dict(
                period=point.period.isoformat(),
                value=str(point.value),
                unit=point.unit,
                series_id=str(point.series_id),
                source_status=point.status.source_status,
                comparison_period=point.comparison.reference_period.isoformat()
                if point.comparison.reference_period
                else None,
                absolute_change=str(point.comparison.absolute_change)
                if point.comparison.absolute_change is not None
                else None,
                change_unit=point.comparison.absolute_change_unit,
                relative_change_percent=str(point.comparison.relative_change_percent)
                if point.comparison.relative_change_percent is not None
                else None,
                consecutive=point.comparison.consecutive,
            )
            if isinstance(point, s.ExchangeMetric):
                row.update(
                    currency=point.quote_currency,
                    inverse_rate=str(point.inverse_rate) if point.inverse_rate is not None else None,
                    inverse_unit=point.inverse_unit,
                )
            else:
                row["geography"] = point.geography.code
            if isinstance(point, s.FuelMetric):
                row.update(product=point.product.value, tax_basis=point.tax_basis.value)
            if isinstance(point, s.InflationMetric):
                row.update(category=point.category.code, measurement=point.measurement_type)
            rows.append(row)
    decimal_keys = {
        "value",
        "absolute_change",
        "relative_change_percent",
        "inverse_rate",
        "difference_from_base",
        "relative_difference_percent",
    }
    date_keys = {"period", "comparison_period"}
    columns = (
        [
            a.TableColumn(
                key=key,
                label=key.replace("_", " ").capitalize(),
                value_type=(
                    "decimal"
                    if key in decimal_keys
                    else "date"
                    if key in date_keys
                    else "boolean"
                    if key == "consecutive"
                    else "text"
                ),
            )
            for key in rows[0]
        ]
        if rows
        else []
    )
    return a.VerifiedTable(columns=columns, rows=rows)


def present(response, operation, result, evidence):
    response.verified_data = result
    response.evidence = evidence
    response.table = table_for(result)
    response.row_count = len(response.table.rows)
    response.assumptions = assumptions(operation)
    response.follow_up_questions = follow_ups(operation)
    if isinstance(result, a.CurrenciesResult):
        response.status = "success"
        response.answer = (
            "Supported ECB quote currencies: "
            + ", ".join(f"{item.code} ({item.name})" for item in result.items)
            + "."
        )
    elif isinstance(result, a.CountryResult):
        data = result.data
        response.status = "success" if data.available else "unavailable"
        response.explanation = data.explanation
        differences = []
        base_name = next(
            (item.geography.name for item in data.items if item.geography.code == data.base_geography),
            data.base_geography,
        )
        label = (
            PRODUCT_NAMES[data.category_or_product].lower() + " price"
            if result.domain == "fuel"
            else MEASUREMENT_NAMES[data.measurement_type].lower()
        )
        for point in data.items:
            if point.geography.code == data.base_geography:
                continue
            delta = point.difference_from_base
            unit = "EUR/litre" if result.domain == "fuel" else "percentage points"
            movement = (
                f"{display(abs(delta), 6)} {unit} " + ("above" if delta > 0 else "below")
                if delta
                else "equal to"
            )
            differences.append(
                f"The reported {label} in {point.geography.name} was {movement} {base_name} for {data.period}."
            )
        response.answer = differences[0] if differences else data.explanation.what_changed
        response.findings = (
            (differences[1:2] + [data.explanation.what_it_means, data.explanation.why_it_might_matter])[:3]
            if data.available
            else []
        )
    elif isinstance(result, a.TaxResult):
        response.status = "success" if result.available else "unavailable"
        if result.available:
            taxed, untaxed = result.items
            response.answer = (
                f"For {taxed.geography.name} on {taxed.period}, {taxed.indicator_name.lower()} was "
                f"€{display(taxed.value)} per litre with taxes and €{display(untaxed.value)} without taxes; "
                f"the reported difference was €{display(result.difference_eur_per_litre)} per litre."
            )
            response.explanation = s.Explanation(
                what_changed="This is a same-period tax-basis comparison, not a change over time.",
                what_it_means=response.answer,
                why_it_might_matter=taxed.explanation.why_it_might_matter,
                limitations=taxed.explanation.limitations
                + ["The reported difference is not an individual invoice or a statutory tax calculation."],
            )
            response.findings = [response.explanation.what_changed, response.explanation.why_it_might_matter]
        else:
            response.answer = (
                "No aligned with-tax and without-tax observations are available for this country and product."
            )
    else:
        data = result.data
        points = data.items
        domain = domain_for(operation)
        response.status = "success" if data.available else "unavailable"
        response.possibly_truncated = data.page.has_more
        if not points:
            response.answer = (
                "No matching stored observations are available for the requested scope and dates."
            )
        else:
            summary = window_summary(domain, points) if operation.kind.endswith("_history") else None
            primary = points[-1] if operation.kind.endswith("_history") else points[0]
            if summary is None and isinstance(primary, s.ExchangeMetric) and primary.inverse_rate is not None:
                summary = inverse_summary(
                    primary,
                    primary.comparison.reference_value,
                    primary.comparison.reference_period,
                    scope="latest_comparison",
                    requested=primary.comparison.requested_period,
                )
            response.summary_comparison = summary
            explanation = summary.explanation if summary else primary.explanation
            response.explanation = explanation
            response.answer = (
                explanation.what_changed
                if summary and summary.scope == "returned_window"
                else explanation.what_it_means
            )
            change_requested = bool(
                re.search(
                    r"\b(chang(?:e|ed|es)|movement|increase|decrease|risen|fallen|rose|fell)\b",
                    response.question,
                    re.I,
                )
            )
            if change_requested:
                response.answer = explanation.what_changed
            if len(points) > 1 and not operation.kind.endswith("_history"):
                second = points[1]
                if isinstance(second, s.ExchangeMetric) and second.inverse_rate is not None:
                    second_explanation = inverse_summary(
                        second,
                        second.comparison.reference_value,
                        second.comparison.reference_period,
                        scope="latest_comparison",
                        requested=second.comparison.requested_period,
                    ).explanation
                else:
                    second_explanation = second.explanation
                response.findings = [
                    second_explanation.what_it_means,
                    explanation.what_changed,
                    explanation.why_it_might_matter,
                ]
                if len(points) > 2:
                    response.warnings.append(
                        "The short answer highlights the first two selected series; all returned observations are in the table."
                    )
            else:
                response.findings = [
                    explanation.what_it_means
                    if change_requested or (summary and summary.scope == "returned_window")
                    else explanation.what_changed,
                    explanation.why_it_might_matter,
                ]
            if any(point.status.estimated or point.status.provisional for point in points):
                response.warnings.append(
                    "Some returned observations are estimated or provisional and may be revised."
                )
            if any(point.observation_freshness == "stale" for point in points):
                response.warnings.append(
                    "Some returned observations are old relative to today; inspect their actual reference periods."
                )
        if data.missing_selections:
            response.warnings.append(
                "Some selected series have no matching observation; see missing_selections in verified_data."
            )
        if data.page.has_more:
            response.warnings.append(
                "The row limit was reached. The summary covers returned dates, not the entire requested window; narrow the date range or use history pagination."
            )
    status_items = result.data.items if isinstance(result, a.CountryResult) else observation_points(result)
    marked = [item.status for item in status_items]
    marked.extend(
        item.comparison.reference_status
        for item in observation_points(result)
        if item.comparison.reference_status is not None
    )
    if any(status.estimated or status.provisional for status in marked):
        response.warnings.append(
            "Some returned observations are estimated or provisional and may be revised."
        )
    for source in sources(result):
        if source.synchronization_status == "failed":
            response.warnings.append(
                "The latest synchronization failed; the previous verified dataset remains available."
            )
        if source.observation_freshness == "stale":
            response.warnings.append(
                f"{source.source.name} has stale observations under its source-specific freshness policy."
            )
    response.warnings = list(dict.fromkeys(response.warnings))[:12]
    return response
