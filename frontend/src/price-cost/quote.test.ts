import { expect, it } from "vitest";
import { pcFixture } from "../test/price-cost-fixtures";
import type { ExchangeMetric } from "./contracts";
import { quoteChange, quoteLabel, quoteUnit, quoteValue } from "./quote";
import { analystDisplay } from "./analyst-presentation";
it("selects exact server values and comparisons without reinterpreting official evidence", () => {
  const m = structuredClone(
    pcFixture.histories["exchange-rates:GBP"].items.at(-1)!,
  ) as ExchangeMetric;
  const before = JSON.stringify(m);
  expect(quoteValue(m)).toBe(m.value);
  expect(quoteValue(m, true)).toBe(m.inverse_rate);
  expect(quoteChange(m)).toEqual(m.comparison);
  expect(quoteChange(m, true)).toEqual(m.inverse_comparison);
  expect(quoteUnit(m, true)).toBe("EUR/GBP");
  expect(quoteLabel(m, true)).toBe("1 GBP in EUR · derived inverse");
  expect(JSON.stringify(m)).toBe(before);
});
it("restores old inverse snapshots without inventing a directional comparison", () => {
  const data = structuredClone(pcFixture.histories["exchange-rates:GBP"]);
  data.items = data.items.slice(-1);
  const m = data.items[0] as ExchangeMetric;
  delete (m as Partial<ExchangeMetric>).inverse_comparison;
  expect(quoteChange(m, true)).toBeNull();
  const display = analystDisplay({
    ...pcFixture.analysis,
    verified_data: {
      kind: "exchange-rates",
      data: data as import("./contracts").ExchangeResponse,
    },
  });
  expect(display.rows[0].cells.at(-1)?.text).toBe("Comparison unavailable");
  expect(display.figures[0].exact).toBe(m.inverse_rate);
});
