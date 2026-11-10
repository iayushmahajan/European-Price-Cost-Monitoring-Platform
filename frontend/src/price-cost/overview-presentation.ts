import type { Metric } from "./api";
import { period } from "./format";
export function overviewLabel(m: Metric): string {
  if (m.measurement_type === "price")
    return m.product === "automotive_diesel" ? "Diesel" : "Petrol (95)";
  if (m.measurement_type === "reference_rate")
    return `Euro to ${m.quote_currency}`;
  return m.measurement_type === "annual_rate"
    ? "Annual inflation"
    : m.measurement_type === "monthly_rate"
      ? "Monthly inflation"
      : "Consumer price index";
}
export function overviewPeriod(m: Metric): string {
  const date = period(m.period, m.period_type === "reference_month");
  return m.period_type === "reference_week"
    ? `Week of ${date}`
    : m.period_type === "reference_month"
      ? date
      : `Reference date · ${date}`;
}

/** Titles describe the returned observations, never the requested date window. */
export function overviewHistoryTitle(metric: Metric, items: Metric[]): string {
  const label =
    metric.measurement_type === "annual_rate"
      ? "Annual inflation rate"
      : metric.measurement_type === "monthly_rate"
        ? "Monthly inflation rate"
        : metric.measurement_type === "index"
          ? "HICP index"
          : metric.measurement_type === "price"
            ? `${overviewLabel(metric)} prices`
            : metric.measurement_type === "reference_rate"
              ? `Euro to ${metric.quote_currency} reference rate`
              : overviewLabel(metric);
  const dates = items
    .map((m) => m.period)
    .filter(
      (p) =>
        /^\d{4}-\d{2}-\d{2}$/.test(p) &&
        Number.isFinite(Date.parse(p + "T12:00:00Z")) &&
        new Date(p + "T12:00:00Z").toISOString().slice(0, 10) === p,
    )
    .sort();
  if (!dates.length) return label;
  const first = dates[0],
    last = dates[dates.length - 1];
  const monthly = metric.period_type === "reference_month";
  const format = (date: string, year: boolean) =>
    new Intl.DateTimeFormat("en-GB", {
      month: "short",
      ...(!monthly ? { day: "numeric" as const } : {}),
      ...(year ? { year: "numeric" as const } : {}),
      timeZone: "UTC",
    }).format(new Date(date + "T12:00:00Z"));
  const span =
    first === last
      ? format(first, true)
      : `${format(first, first.slice(0, 4) !== last.slice(0, 4))}–${format(last, true)}`;
  return `${label} · ${span}`;
}
export function overviewHistoryDescription(metric: Metric): string | undefined {
  if (metric.measurement_type === "annual_rate")
    return "Each monthly observation compares prices with the same month one year earlier.";
  if (metric.measurement_type === "monthly_rate")
    return "Each observation compares prices with the preceding month.";
  if (metric.measurement_type === "index")
    return `HICP index points${metric.index_base_year === null ? "" : ` (${metric.index_base_year} = 100)`}, not percentage changes or shopping-basket costs in euros.`;
}
