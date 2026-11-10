import type { Catalogue, Evidence } from "./contracts";
import { displayMeasurement } from "./format";
export function evidencePresentation(e: Evidence, c: Catalogue | null) {
  const raw = e.original_values;
  const status =
    typeof (raw.status ?? raw.source_status) === "string"
      ? String(raw.status ?? raw.source_status)
      : null;
  const eurostat = e.source.code === "eurostat_prc_hicp_minr";
  const known =
    eurostat && status !== null && ["e", "p", "ep", "pe"].includes(status);
  const estimated = Boolean(known && status!.includes("e"));
  const provisional = Boolean(known && status!.includes("p"));
  const statusLabel =
    [estimated && "Estimated", provisional && "Provisional"]
      .filter(Boolean)
      .join(" · ") || (status ? "Source annotation" : "Status not supplied");
  const statusMeaning = known
    ? `Eurostat marks this observation as ${estimated && provisional ? "an estimated and provisional value" : estimated ? "an estimated value" : "a provisional value"}.`
    : status
      ? "An additional source flag is preserved in Exact values."
      : "No observation status is recorded.";
  const measurement =
    e.domain === "inflation"
      ? (
          {
            annual_rate: "Annual inflation rate",
            monthly_rate: "Monthly inflation rate",
            index: "HICP index",
          } as Record<string, string>
        )[String(raw.measurement_type)] ||
        (e.unit_code.includes("INDEX") || e.unit_code === "index_points"
          ? "HICP index"
          : "Consumer inflation")
      : e.domain === "fuel"
        ? e.category_code?.toUpperCase() === "AUTOMOTIVE_DIESEL"
          ? "Diesel price"
          : e.category_code?.toUpperCase() === "EURO_SUPER_95"
            ? "Petrol (95) price"
            : "Fuel price"
        : "ECB euro reference rate";
  const value =
    raw.value ?? raw.normalized_price_eur_per_litre ?? raw.reference_rate;
  const unit =
    e.domain === "fuel"
      ? "EUR/litre"
      : e.domain === "inflation"
        ? raw.measurement_type === "index" ||
          e.unit_code.includes("INDEX") ||
          e.unit_code === "index_points"
          ? "index_points"
          : "percent"
        : typeof raw.quote_currency === "string"
          ? `${raw.quote_currency}/EUR`
          : "Currency units per EUR";
  const source =
    (
      {
        ec_weekly_oil_bulletin: "European Commission · Weekly Oil Bulletin",
        eurostat_prc_hicp_minr: "Eurostat · HICP",
        ecb_exr: "European Central Bank",
      } as Record<string, string>
    )[e.source.code] || e.source.name;
  const geography =
    c?.geographies.find((g) => g.code === e.geography_code)?.name ||
    e.geography_code;
  const category =
    e.domain === "inflation"
      ? c?.inflation_categories.find((g) => g.code === e.category_code)?.name ||
        e.category_code
      : null;
  return {
    source,
    measurement,
    statusLabel,
    statusMeaning,
    value:
      typeof value === "string" || typeof value === "number"
        ? displayMeasurement(String(value), unit)
        : "Value available in Exact values",
    exact: value,
    unit,
    context: [
      geography,
      category,
      typeof raw.index_base_year === "number"
        ? `Index base ${raw.index_base_year} = 100`
        : null,
      e.tax_basis === "with_tax"
        ? "Including taxes"
        : e.tax_basis === "without_tax"
          ? "Excluding taxes"
          : null,
    ]
      .filter(Boolean)
      .join(" · "),
  };
}
