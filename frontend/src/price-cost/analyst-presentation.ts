/** Analyst-only display projections. Never calculate economic changes or rates here. */
import { quoteValue, quoteUnit, quoteChange, quoteLabel } from "./quote";
import type { AnalysisResponse, ObservationStatus } from "./contracts";
import type { Metric } from "./api";
import {
  displayNumber,
  displayMeasurement,
  displayUnit,
  period,
  changeText,
} from "./format";

export interface DisplayCell {
  text: string;
  note?: string;
  exact?: string;
}
export interface DisplayRow {
  cells: DisplayCell[];
}
export interface AnalystDisplay {
  columns: string[];
  rows: DisplayRow[];
  figures: {
    label: string;
    value: string;
    context: string;
    exact: string;
    unit?: string;
    flag?: string;
  }[];
  context: string;
}
const displayValue = displayMeasurement;
function readableStatus(status: ObservationStatus): string | undefined {
  return (
    [status.estimated && "Estimated", status.provisional && "Provisional"]
      .filter(Boolean)
      .join(" · ") || undefined
  );
}
function measurement(point: Metric): string {
  if (point.measurement_type === "reference_rate")
    return `EUR / ${point.quote_currency}`;
  if (point.measurement_type === "price")
    return `${point.geography.name} · ${point.indicator_name} · ${point.tax_basis === "with_tax" ? "including taxes" : "excluding taxes"}`;
  return `${point.geography.name} · ${point.category.name} · ${point.measurement_type === "annual_rate" ? "annual rate" : point.measurement_type === "monthly_rate" ? "monthly rate" : "index, 2025=100"}`;
}
function observationStatement(point: Metric): string {
  if (point.measurement_type !== "reference_rate")
    return `${measurement(point)}: ${displayMeasurement(point.value, point.unit)}`;
  const inverse = point.inverse_is_derived && point.inverse_rate !== null;
  return `1 ${inverse ? point.quote_currency : "EUR"} ≈ ${displayNumber(inverse ? point.inverse_rate : point.value, point.unit)} ${inverse ? "EUR" : point.quote_currency}${inverse ? " (derived inverse)" : " (ECB reference rate)"}`;
}
function figureValue(
  value: string,
  unit: string,
): { value: string; unit: string } {
  return unit === "EUR/litre"
    ? { value: "€" + displayNumber(value, unit), unit: "per litre" }
    : unit === "percent"
      ? { value: displayNumber(value, unit) + "%", unit: "" }
      : { value: displayNumber(value, unit), unit: displayUnit(unit) };
}
function figure(point: Metric): AnalystDisplay["figures"] {
  const context = period(point.period, point.period_type === "reference_month");
  const flag =
    [
      readableStatus(point.status),
      point.observation_freshness === "stale" && "Potentially stale",
    ]
      .filter(Boolean)
      .join(" · ") || undefined;
  const official = {
    label: measurement(point),
    ...figureValue(point.value, point.unit),
    context:
      point.measurement_type === "reference_rate"
        ? `1 EUR · ${context}`
        : context,
    exact: point.value,
    flag,
  };
  return point.measurement_type === "reference_rate" &&
    point.inverse_rate !== null
    ? [
        {
          ...official,
          label: quoteLabel(point, true),
          ...figureValue(point.inverse_rate, point.inverse_unit!),
          context: `1 ${point.quote_currency} · ${context}`,
          exact: point.inverse_rate,
        },
      ]
    : [official];
}
function observationDisplay(points: Metric[]): AnalystDisplay {
  const inverse = points.some(
    (point) =>
      point.measurement_type === "reference_rate" &&
      point.inverse_rate !== null,
  );
  // Existing history is ordered by period. Keep each series' last returned observation.
  const latest = new Map<number, Metric>();
  points.forEach((point) => latest.set(point.series_id, point));
  return {
    columns: ["Period", "Value", "Measurement", "Change vs reference period"],
    rows: points.map((point) => {
      const c = quoteChange(point, inverse);
      const baseline = c?.reference_period
        ? period(c.reference_period, point.period_type === "reference_month")
        : "";
      const changeUnit =
        c?.absolute_change_unit === "quote_currency_units_per_EUR"
          ? point.unit
          : c?.absolute_change_unit;
      const flag =
        [
          readableStatus(point.status),
          point.observation_freshness === "stale" && "Potentially stale",
        ]
          .filter(Boolean)
          .join(" · ") || undefined;
      return {
        cells: [
          {
            text: period(point.period, point.period_type === "reference_month"),
          },
          {
            text: displayValue(
              quoteValue(point, inverse),
              quoteUnit(point, inverse),
            ),
            exact: quoteValue(point, inverse) || undefined,
            note: flag,
          },
          {
            text:
              point.measurement_type === "reference_rate"
                ? quoteLabel(point, inverse)
                : measurement(point),
          },
          {
            text:
              c?.available && c.absolute_change !== null
                ? displayValue(c.absolute_change, changeUnit || point.unit)
                : "Comparison unavailable",
            note: c?.available
              ? `${baseline}${c.consecutive === false ? " · nonconsecutive observations" : ""}`
              : c?.unavailable_reason ||
                "No stored change for this quote direction",
            exact: c?.absolute_change || undefined,
          },
        ],
      };
    }),
    figures: [...latest.values()].flatMap(figure).slice(0, 3),
    context:
      points[0]?.measurement_type === "reference_rate"
        ? inverse
          ? "Derived inverse of ECB reference rates · original EUR quotes remain in evidence"
          : "ECB reference rates · official EUR base"
        : points[0]?.measurement_type === "price"
          ? "National fuel prices · tax basis shown per measurement"
          : "HICP · percentage rates or 2025-based indices",
  };
}
export function analystDisplay(result: AnalysisResponse): AnalystDisplay {
  const verified = result.verified_data;
  const empty: AnalystDisplay = {
    columns: [],
    rows: [],
    figures: [],
    context: "No tabular observations returned.",
  };
  if (!verified) return empty;
  if (
    verified.kind === "fuel" ||
    verified.kind === "inflation" ||
    verified.kind === "exchange-rates"
  )
    return observationDisplay(verified.data.items);
  if (verified.kind === "fuel_tax_comparison")
    return observationDisplay(verified.items);
  if (verified.kind === "supported_currencies")
    return {
      columns: ["Currency", "Name"],
      rows: verified.items.map((item) => ({
        cells: [{ text: item.code }, { text: item.name }],
      })),
      figures: [],
      context: "Supported ECB quotes · official base currency EUR",
    };
  const comparison = verified.data;
  const baseline = comparison.items.find(
    (item) => item.geography.code === comparison.base_geography,
  );
  return {
    columns: [
      "Country",
      "Value",
      `Difference from ${baseline?.geography.name || comparison.base_geography}`,
    ],
    rows: comparison.items.map((item) => ({
      cells: [
        { text: item.geography.name },
        {
          text: displayValue(item.value, comparison.unit),
          exact: item.value,
          note: readableStatus(item.status),
        },
        {
          text:
            item.geography.code === comparison.base_geography
              ? "Reference"
              : displayValue(item.difference_from_base, item.difference_unit),
          exact: item.difference_from_base,
        },
      ],
    })),
    figures: comparison.items.slice(0, 3).map((item) => ({
      label: item.geography.name,
      ...figureValue(item.value, comparison.unit),
      context: period(comparison.period, verified.domain === "inflation"),
      exact: item.value,
      flag: readableStatus(item.status),
    })),
    context: `${period(comparison.period, verified.domain === "inflation")} · same-period ${verified.domain === "fuel" ? `fuel prices, ${comparison.tax_basis === "with_tax" ? "including taxes" : "excluding taxes"}` : comparison.measurement_type === "monthly_rate" ? "monthly inflation rates" : "annual inflation rates"}`,
  };
}

/** Recompose only approved, typed results. Never search/replace numbers in model prose.
 * The original answer is retained in result details, including unknown/older shapes.
 */
export function analystAnswer(result: AnalysisResponse): string {
  const data = result.verified_data;
  if (!data || result.status !== "success") return result.answer;
  if (
    data.kind === "country_comparison" &&
    data.data.available &&
    data.data.period
  ) {
    const c = data.data;
    if (
      data.domain === "inflation" &&
      !["annual_rate", "monthly_rate"].includes(c.measurement_type)
    )
      return result.answer;
    if (
      data.domain === "fuel" &&
      !["automotive_diesel", "euro_super_95"].includes(c.category_or_product)
    )
      return result.answer;
    const base = c.items.find((i) => i.geography.code === c.base_geography);
    const other = c.items.find((i) => i.geography.code !== c.base_geography);
    const subject =
      data.domain === "fuel"
        ? `${c.category_or_product === "automotive_diesel" ? "Diesel" : "Petrol (95)"}, ${c.tax_basis === "with_tax" ? "including taxes" : "excluding taxes"}`
        : `${c.category_or_product} · ${c.measurement_type === "annual_rate" ? "annual inflation" : "monthly inflation"}`;
    if (base && other)
      return `${subject} in ${other.geography.name}: ${displayMeasurement(other.value, c.unit)} (${displayMeasurement(other.difference_from_base, other.difference_unit, true)} vs ${base.geography.name}), ${period(c.period, data.domain === "inflation")}.${c.items.length > 2 ? " Additional countries appear below." : ""}`;
    return `${subject} compared across ${c.items.length} countries for ${period(c.period, data.domain === "inflation")}.`;
  }
  const points =
    data.kind === "fuel_tax_comparison"
      ? data.items
      : data.kind === "fuel" ||
          data.kind === "inflation" ||
          data.kind === "exchange-rates"
        ? data.data.items
        : [];
  const latest = new Map<number, Metric>();
  points.forEach((p) => {
    if (!latest.has(p.series_id) || latest.get(p.series_id)!.period < p.period)
      latest.set(p.series_id, p);
  });
  if (!latest.size) return result.answer;
  if (latest.size > 1) {
    const values = [...latest.values()]
      .slice(0, 3)
      .map(
        (p) =>
          `${observationStatement(p)} (${period(p.period, p.period_type === "reference_month")})`,
      );
    const taxDifference =
      data.kind === "fuel_tax_comparison" &&
      data.difference_eur_per_litre !== null
        ? ` Reported tax-basis difference: ${displayMeasurement(data.difference_eur_per_litre, "EUR/litre")}.`
        : "";
    return `${latest.size > 3 ? "Selected returned measurements — " : ""}${values.join("; ")}.${taxDifference}`;
  }
  const point = [...latest.values()][0];
  const date = period(point.period, point.period_type === "reference_month");
  const inverse =
    point.measurement_type === "reference_rate" &&
    point.inverse_is_derived &&
    point.inverse_rate !== null;
  const description = observationStatement(point);
  const history =
    result.plan?.status === "ready" &&
    result.plan.operation.kind.endsWith("_history");
  const summary = result.summary_comparison;
  const c = summary?.comparison;
  const summaryUnit =
    point.measurement_type === "reference_rate" &&
    summary?.direction === "inverse"
      ? point.inverse_unit!
      : point.unit;
  const change =
    c?.available && c.absolute_change !== null
      ? ` Reported change: ${displayMeasurement(c.absolute_change, c.absolute_change_unit === "quote_currency_units_per_EUR" ? summaryUnit : c.absolute_change_unit || summaryUnit, true)} vs ${period(c.reference_period, point.period_type === "reference_month")}${c.consecutive === false ? " (nonconsecutive observations)" : ""}.`
      : !history && !inverse
        ? ` ${changeText(point)}.`
        : "";
  return `${history ? "Most recent returned observation — " : ""}${description}, ${date}.${change}`;
}
