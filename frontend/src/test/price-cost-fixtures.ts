/** Only test/browser code imports this module. Values are illustrative, validated by Pydantic. */
import raw from "./price-cost.json" with { type: "json" };
import type {
  AnalysisResponse,
  Catalogue,
  CountryComparison,
  Evidence,
  Overview,
  SourceStatus,
  FuelResponse,
  InflationResponse,
  ExchangeResponse,
} from "../price-cost/contracts";
import type { Domain, Metrics, Metric } from "../price-cost/api";
export const pcFixture = raw as unknown as {
  catalogue: Catalogue;
  sources: SourceStatus[];
  histories: Record<string, Omit<Metrics, "items"> & { items: Metric[] }>;
  comparisons: Record<string, CountryComparison>;
  evidence: Record<string, Evidence>;
  analysis: AnalysisResponse;
};
export function fixtureResponse(url: string): unknown {
  const u = new URL(url, "http://test");
  const q = u.searchParams;
  const path = u.pathname.replace(/^.*\/v1\/price-cost/, "");
  const country = q.get("country") || q.get("countries")?.split(",")[0] || "DE";
  const product = q.get("product") || "automotive_diesel",
    tax = q.get("tax_basis") || "with_tax",
    category = q.get("category") || "TOTAL",
    measure = q.get("measurement") || "annual_rate",
    currency = q.get("currency") || q.get("currencies")?.split(",")[0] || "GBP";
  if (path === "/catalogue") return pcFixture.catalogue;
  if (path === "/sources") return pcFixture.sources;
  if (path === "/overview") {
    const fuel = structuredClone(
      pcFixture.histories[`fuel:${country}:automotive_diesel:with_tax`],
    ) as FuelResponse;
    fuel.items = ["automotive_diesel", "euro_super_95"].flatMap(
      (p) =>
        (
          pcFixture.histories[`fuel:${country}:${p}:with_tax`] as FuelResponse
        )?.items.slice(-1) || [],
    );
    const inflation = structuredClone(
      pcFixture.histories[`inflation:${country}:TOTAL:annual_rate`],
    ) as InflationResponse;
    inflation.items = ["annual_rate", "monthly_rate", "index"].flatMap(
      (m) =>
        (
          pcFixture.histories[
            `inflation:${country}:TOTAL:${m}`
          ] as InflationResponse
        )?.items.slice(-1) || [],
    );
    const exchange_rates = structuredClone(
      pcFixture.histories[`exchange-rates:${currency}`],
    ) as ExchangeResponse;
    exchange_rates.items = exchange_rates.items.slice(-1);
    return {
      geography: pcFixture.catalogue.geographies.find(
        (g) => g.code === country,
      )!,
      fuel,
      inflation,
      exchange_rates,
    } satisfies Overview;
  }
  if (path.startsWith("/evidence/"))
    return pcFixture.evidence[path.split("/").at(-1)!];
  if (path === "/analyst/history")
    return [
      {
        id: 1,
        dataset: "price_cost",
        schema_version: 1,
        domain: "fuel",
        question: pcFixture.analysis.question,
        status: "success",
        operation: "fuel_compare",
        row_count: 2,
        created_at: pcFixture.analysis.created_at,
      },
    ];
  if (path === "/analyst/history/1" || path === "/analyst/query")
    return pcFixture.analysis;
  const domain = path.split("/")[1] as Domain;
  if (path.endsWith("/compare")) {
    const [base, peer] = (q.get("countries") || "DE,FR").split(",");
    const key = `${domain}:${q.get("base_country") || base}:${peer}:${domain === "fuel" ? product : category}:${domain === "fuel" ? tax : measure}`;
    const comparison = structuredClone(pcFixture.comparisons[key]);
    if (!comparison) throw new Error("Unsupported comparison fixture");
    if (q.get("period") && q.get("period") !== comparison.period)
      return {
        ...comparison,
        available: false,
        items: [],
        missing_selections: [peer],
        explanation: {
          ...comparison.explanation,
          what_changed:
            "No exact shared observation in this fixture selection.",
        },
      };
    return comparison;
  }
  const key =
    domain === "fuel"
      ? `fuel:${country}:${product}:${tax}`
      : domain === "inflation"
        ? `inflation:${country}:${category}:${measure}`
        : `exchange-rates:${currency}`;
  const data = structuredClone(pcFixture.histories[key]);
  if (!data) throw new Error("Unknown fixture query " + url);
  if (path.endsWith("/history"))
    data.items = data.items.filter(
      (m) =>
        (!q.get("start") || m.period >= q.get("start")!) &&
        (!q.get("end") || m.period <= q.get("end")!),
    );
  else
    data.items = data.items
      .filter((m) => !q.get("as_of") || m.period <= q.get("as_of")!)
      .slice(-1);
  if (domain === "exchange-rates" && q.get("inverse") !== "true")
    data.items = data.items.map((m) =>
      m.measurement_type === "reference_rate"
        ? {
            ...m,
            inverse_rate: null,
            inverse_unit: null,
            inverse_is_derived: null,
          }
        : m,
    );
  data.available = data.items.length > 0;
  return data;
}
