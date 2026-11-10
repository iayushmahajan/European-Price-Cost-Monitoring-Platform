import { expect, it } from "vitest";
import { analystDisplay, analystAnswer } from "./analyst-presentation";
import type {
  AnalysisResponse,
  ExchangeResponse,
  FuelResponse,
  InflationResponse,
} from "./contracts";
import { pcFixture } from "../test/price-cost-fixtures";

function result(
  verified_data: AnalysisResponse["verified_data"],
): AnalysisResponse {
  return { ...pcFixture.analysis, verified_data };
}
it("formats observations without mutating exact data", () => {
  const data = structuredClone(
    pcFixture.histories["fuel:DE:automotive_diesel:with_tax"],
  ) as FuelResponse;
  data.items = data.items.slice(-1);
  data.items[0].comparison.absolute_change = "0.123456789012345678";
  const before = JSON.stringify(data);
  const display = analystDisplay(result({ kind: "fuel", data }));
  expect(display.figures[0].value).toBe("€2.282");
  expect(display.rows[0].cells.at(-1)?.text).toBe("0.123 EUR/L");
  expect(JSON.stringify(data)).toBe(before);
});
it("distinguishes HICP percentages, percentage-point changes and 2025-based indices", () => {
  const data = structuredClone(
    pcFixture.histories["inflation:DE:TOTAL:annual_rate"],
  ) as InflationResponse;
  data.items = data.items.slice(-1);
  const display = analystDisplay(result({ kind: "inflation", data }));
  expect(display.figures[0].value).toBe("2.80%");
  expect(display.rows[0].cells[2].text).toContain("annual rate");
  expect(display.rows[0].cells.at(-1)?.text).toContain("percentage points");
  expect(display.rows[0].cells[1].note).toContain("Estimated");
  const indices = structuredClone(
    pcFixture.histories["inflation:DE:TOTAL:index"],
  ) as InflationResponse;
  const index = analystDisplay(result({ kind: "inflation", data: indices }));
  expect(index.rows[0].cells[2].text).toContain("2025=100");
  expect(index.rows[0].cells[1].text).toContain("index points");
});
it("keeps official EUR quotes and backend-derived inverses separate", () => {
  const data = structuredClone(
    pcFixture.histories["exchange-rates:GBP"],
  ) as ExchangeResponse;
  data.items = data.items.slice(-1);
  const display = analystDisplay(result({ kind: "exchange-rates", data }));
  expect(display.rows[0].cells[1].text).toContain("EUR/GBP");
  expect(display.rows[0].cells[1].exact).toBe(data.items[0].inverse_rate);
  expect(display.figures[0].label).toContain("derived inverse");
  expect(display.figures[0].exact).toBe(data.items[0].inverse_rate);
  expect(display.figures[0].value).toBe("1.200");
  data.items[0].inverse_rate = "0.000000000001";
  const small = analystDisplay(result({ kind: "exchange-rates", data }));
  expect(small.figures[0].value).toBe("1.00 × 10^-12");
});
it("uses backend country differences with human country names", () => {
  const display = analystDisplay(pcFixture.analysis);
  expect(display.columns).toEqual([
    "Country",
    "Value",
    "Difference from Germany",
  ]);
  expect(display.rows[0].cells[2].text).toBe("Reference");
  expect(display.rows[1].cells[0].text).toBe("France");
  expect(display.rows[1].cells[2].text).toBe("−0.120 EUR/L");
  expect(display.context).toContain("same-period");
});
it("labels unavailable comparisons and nonconsecutive intervals without inserting values", () => {
  const data = structuredClone(
    pcFixture.histories["fuel:DE:automotive_diesel:with_tax"],
  ) as FuelResponse;
  data.items = data.items.slice(-2);
  data.items[0].comparison = {
    ...data.items[0].comparison,
    available: false,
    absolute_change: null,
  };
  data.items[1].comparison.consecutive = false;
  const display = analystDisplay(result({ kind: "fuel", data }));
  expect(display.rows[0].cells.at(-1)?.text).toBe("Comparison unavailable");
  expect(display.rows[1].cells.at(-1)?.note).toContain("nonconsecutive");
});
it("supports tax-basis evidence and the supported-currency list without ranking unlike units", () => {
  const withTax = pcFixture.histories[
    "fuel:DE:automotive_diesel:with_tax"
  ] as FuelResponse;
  const withoutTax = pcFixture.histories[
    "fuel:DE:automotive_diesel:without_tax"
  ] as FuelResponse;
  const tax = analystDisplay(
    result({
      kind: "fuel_tax_comparison",
      available: true,
      items: [withTax.items.at(-1)!, withoutTax.items.at(-1)!],
      difference_eur_per_litre: "1",
      relative_difference_percent: null,
      sources: [],
    }),
  );
  expect(tax.rows[0].cells[2].text).toContain("including taxes");
  expect(tax.rows[1].cells[2].text).toContain("excluding taxes");
  const currencies = analystDisplay(
    result({
      kind: "supported_currencies",
      sources: [],
      items: [
        { code: "GBP", name: "Pound sterling" },
        { code: "USD", name: "US dollar" },
      ],
    }),
  );
  expect(currencies.columns).toEqual(["Currency", "Name"]);
  expect(currencies.figures).toEqual([]);
});

it("composes only verified measurements and preserves the unmodified backend answer", () => {
  const input = structuredClone(pcFixture.analysis);
  const original = input.answer;
  const text = analystAnswer(input);
  expect(text).toContain("−0.120 EUR/L vs Germany");
  expect(text).toContain("including taxes");
  expect(text).not.toContain("000000000000");
  expect(input.answer).toBe(original);
  input.verified_data = null;
  input.answer = "Provider prose: 1234.56789; version 1.2345; 2026-11-02.";
  expect(analystAnswer(input)).toBe(input.answer);
});

it("formats typed inflation and derived exchange answers without changing their meaning", () => {
  const rates = structuredClone(
    pcFixture.histories["inflation:DE:TOTAL:annual_rate"],
  ) as InflationResponse;
  rates.items = rates.items.slice(-1);
  const inflation = analystAnswer(result({ kind: "inflation", data: rates }));
  expect(inflation).toContain("2.80%");
  expect(inflation).toContain("percentage points");
  const quotes = structuredClone(
    pcFixture.histories["exchange-rates:GBP"],
  ) as ExchangeResponse;
  quotes.items = quotes.items.slice(-1);
  quotes.items[0].inverse_is_derived = true;
  const fx = analystAnswer(result({ kind: "exchange-rates", data: quotes }));
  expect(fx).toContain("1 GBP ≈ 1.200 EUR (derived inverse)");
  expect(fx).not.toContain("1.1996449");
});
