"""Versioned deterministic explanations grounded only in published values and changes."""

from decimal import ROUND_HALF_EVEN, Decimal, localcontext

from app.api.schemas.price_cost import Change, Explanation

FUEL_LIMITS = [
    "National averages may differ from station prices and your actual costs.",
    "Country reporting, weighting and product practices differ; comparisons have limitations.",
]
HICP_LIMITS = [
    "HICP measures a weighted consumer basket, not an individual's or business's actual costs.",
    "Country baskets and weights differ. Index levels are not comparable shopping-basket costs.",
    "Missing source cells are not zeros; previously verified values may be retained when a later response omits them.",
]
ECB_LIMITS = [
    "ECB reference rates are informational, not live quotes or guaranteed transaction prices.",
    "Weekends and TARGET closing days normally have no published rate.",
]


def display(value: Decimal, places=4):
    with localcontext() as context:
        context.prec = 64
        rounded = value.quantize(Decimal(1).scaleb(-places), rounding=ROUND_HALF_EVEN)
        if rounded == 0 and value != 0:
            rounded = value
        return (
            format(rounded, "f").rstrip("0").rstrip(".")
            if "." in format(rounded, "f")
            else format(rounded, "f")
        )


def explain(
    domain,
    *,
    name,
    value,
    period,
    comparison: Change,
    measurement="price",
    category="",
    quote="",
    tax_basis="with_tax",
    status=None,
):
    limits = list({"fuel": FUEL_LIMITS, "inflation": HICP_LIMITS, "exchange-rates": ECB_LIMITS}[domain])
    if status and (status.provisional or status.estimated):
        limits.append("This observation is estimated or provisional and may be revised.")
    if comparison.available:
        delta = comparison.absolute_change
        direction = "increased" if delta > 0 else "decreased" if delta < 0 else "was unchanged"
        suffix = {
            "EUR/litre": "EUR per litre",
            "percentage_points": "percentage points",
            "index_points": "index points",
            "quote_currency_units_per_EUR": f"{quote} per euro",
        }[comparison.absolute_change_unit]
        amount = f" by {display(abs(delta), 6)} {suffix}" if delta else ""
        metric_name = name
        if domain == "inflation":
            label = {
                "annual_rate": "annual inflation rate",
                "monthly_rate": "monthly inflation rate",
                "index": "consumer price index",
            }[measurement]
            metric_name = f"the {category} {label} in {name}"
        changed = f"Between {comparison.reference_period} and {period}, {metric_name} {direction}{amount}."
        if comparison.consecutive is False:
            interval = {"fuel": "weekly", "inflation": "monthly", "exchange-rates": "publication-day"}[domain]
            changed += f" This compares available observations, not a consecutive {interval} change."
        if domain == "exchange-rates" and delta:
            changed += f" One euro buys {'more' if delta > 0 else 'fewer'} {quote} units than on {comparison.reference_period}."
    else:
        changed = "A change cannot be calculated: no earlier comparable observation is available for this comparison."
    if domain == "fuel":
        meaning = f"For the week of {period}, {name} was €{display(value)} per litre, {'including' if tax_basis == 'with_tax' else 'excluding'} taxes."
        matters = "This can help compare reported fuel prices when budgeting fuel purchases; your own price and usage determine actual spending."
    elif domain == "inflation":
        if measurement == "index":
            meaning = f"The consumer price index for {category} in {name} was {display(value)} index points for {period:%Y-%m}, with the 2025 average set to 100."
        else:
            interval = (
                "the same month a year earlier" if measurement == "annual_rate" else "the preceding month"
            )
            movement = (
                f"{display(abs(value))}% {'higher' if value > 0 else 'lower'} than"
                if value
                else "unchanged from"
            )
            meaning = (
                f"Consumer prices for {category} in {name} were {movement} {interval} in {period:%Y-%m}."
            )
        matters = "This provides context for changes in consumer purchasing power; it does not measure your own cost changes."
    else:
        meaning = f"On {period}, 1 EUR equalled {display(value, 8)} {quote} at the ECB reference rate."
        matters = "This can help estimate currency conversion amounts before fees and provider margins."
    return Explanation(
        what_changed=changed, what_it_means=meaning, why_it_might_matter=matters, limitations=limits
    )
