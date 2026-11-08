import type { Catalogue } from "./contracts";
import type { Domain } from "./api";
import { today } from "./format";
export interface Selection {
  domain: Domain;
  country: string;
  product: string;
  tax: string;
  category: string;
  measurement: string;
  currency: string;
  inverse: boolean;
  start: string;
  end: string;
  compare: string;
  comparisonDate: string;
  comparisonPeriod: string;
  view: "chart" | "table";
  error: string;
}
const pick = (value: string | null, allowed: string[], fallback: string) =>
  value && allowed.includes(value)
    ? value
    : allowed.includes(fallback)
      ? fallback
      : allowed[0] || fallback;
export function isoDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value + "T12:00:00Z").toISOString().slice(0, 10) === value
  );
}
export function shiftMonths(date: string, months: number): string {
  const d = new Date(date + "T12:00:00Z");
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}
export function parseSelection(
  params: URLSearchParams,
  catalogue: Catalogue,
): Selection {
  const domain = pick(
    params.get("domain"),
    ["fuel", "inflation", "exchange-rates"],
    "fuel",
  ) as Domain;
  const geos = catalogue.geographies
    .filter((g) => domain !== "fuel" || g.code !== "EU27_2020")
    .map((g) => g.code);
  const country = pick(params.get("country"), geos, "DE");
  const measurement = pick(
    params.get("measurement"),
    catalogue.inflation_measurements.map((m) => m.code),
    "annual_rate",
  );
  const day = today();
  const month = domain === "inflation";
  const endDefault = month ? day.slice(0, 7) + "-01" : day;
  const end = params.get("end") || endDefault;
  const start = params.get("start") || shiftMonths(endDefault, -3);
  const compare =
    domain !== "exchange-rates" &&
    (domain !== "inflation" || measurement !== "index") &&
    params.get("compare") !== country &&
    geos.includes(params.get("compare") || "")
      ? params.get("compare")!
      : "";
  const comparisonDate = params.get("comparison_date") || "";
  const comparisonPeriod = params.get("period") || "";
  let error = "";
  if (
    !isoDate(start) ||
    !isoDate(end) ||
    start > end ||
    end > day ||
    (Date.parse(end) - Date.parse(start)) / 86400000 > 3660
  )
    error =
      "Choose a valid range: start before end, at most 3,660 days, ending no later than today.";
  else if (month && (!start.endsWith("-01") || !end.endsWith("-01")))
    error =
      "Inflation ranges must start on the first day of each reference month.";
  else if (
    domain === "exchange-rates" &&
    comparisonDate &&
    (!isoDate(comparisonDate) ||
      comparisonDate >= end ||
      (Date.parse(end) - Date.parse(comparisonDate)) / 86400000 > 3660)
  )
    error =
      "The exchange comparison date must precede the end date by at most 3,660 days.";
  else if (
    compare &&
    comparisonPeriod &&
    (!isoDate(comparisonPeriod) ||
      comparisonPeriod > end ||
      (month && !comparisonPeriod.endsWith("-01")))
  )
    error =
      "Choose a comparison period on or before the end date (first day of the month for inflation).";
  return {
    domain,
    country,
    product: pick(
      params.get("product"),
      catalogue.fuel_products.map((p) => p.code),
      "automotive_diesel",
    ),
    tax: pick(params.get("tax_basis"), ["with_tax", "without_tax"], "with_tax"),
    category: pick(
      params.get("category"),
      catalogue.inflation_categories.map((c) => c.code),
      "TOTAL",
    ),
    measurement,
    currency: pick(
      params.get("currency"),
      catalogue.quote_currencies.map((c) => c.code),
      "GBP",
    ),
    inverse: params.get("inverse") === "true",
    start,
    end,
    compare,
    comparisonDate,
    comparisonPeriod,
    view: params.get("view") === "table" ? "table" : "chart",
    error,
  };
}
export function selectionParams(s: Selection): URLSearchParams {
  const p = new URLSearchParams({
    domain: s.domain,
    country: s.country,
    product: s.product,
    tax_basis: s.tax,
    category: s.category,
    measurement: s.measurement,
    currency: s.currency,
    inverse: String(s.inverse),
    start: s.start,
    end: s.end,
    view: s.view,
  });
  if (s.compare) p.set("compare", s.compare);
  if (s.comparisonDate) p.set("comparison_date", s.comparisonDate);
  if (s.comparisonPeriod) p.set("period", s.comparisonPeriod);
  return p;
}
export function filters(s: Selection, history = false): Record<string, string> {
  if (s.domain === "fuel")
    return {
      [history ? "country" : "countries"]: s.country,
      product: s.product,
      tax_basis: s.tax,
    };
  if (s.domain === "inflation")
    return {
      [history ? "country" : "countries"]: s.country,
      category: s.category,
      measurement: s.measurement,
    };
  return {
    [history ? "currency" : "currencies"]: s.currency,
    inverse: String(s.inverse),
  };
}
