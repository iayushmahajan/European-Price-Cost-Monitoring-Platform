import { describe, expect, it } from "vitest";
import {
  axisNumber,
  chartPrecision,
  decimal,
  displayMeasurement,
  displayNumber,
  displayUnit,
} from "./format";

describe("consistent display numbers, independent of exact source strings", () => {
  it.each([
    ["2.8", "percent", "2.80"],
    ["-0.125", "percentage_points", "−0.13"],
    ["103.845", "index_points", "103.85"],
    ["2.370620000000000000", "EUR/litre", "2.371"],
    ["0.83358", "GBP/EUR", "0.834"],
    ["1.199645", "EUR/GBP", "1.200"],
    ["0.0006", "GBP/EUR", "0.0006"],
    ["-0.004567", "percentage_points", "−0.00457"],
    ["0E-18", "EUR/litre", "0.000"],
    ["-0.000123456789", "EUR/litre", "−0.000123"],
    ["0.00000000000123", "USD/EUR", "1.23 × 10^-12"],
    ["-0.000000000009999", "percentage_points", "−1.00 × 10^-11"],
    ["1234567890123456789.125", "percent", "1234567890123456789.13"],
    [null, "percent", "—"],
    ["NaN", "percent", "—"],
  ])("%s %s → %s", (value, unit, expected) => {
    expect(displayNumber(value, unit)).toBe(expected);
  });
  it("preserves tiny signs, precision, explicit units and missingness", () => {
    expect(displayMeasurement("0.00001", "percentage_points", true)).toBe(
      "+0.00001 percentage points",
    );
    expect(displayMeasurement("-0.004", "percent", true)).toBe("−0.004%");
    expect(displayMeasurement("0", "EUR/litre", true)).toBe("0.000 EUR/L");
    expect(displayMeasurement(null, "GBP/EUR")).toBe("—");
    expect(displayUnit("index_points")).toBe("index points");
    expect(displayUnit("EUR_PER_LITRE")).toBe("EUR/L");
    expect(displayUnit("PERCENT")).toBe("%");
    expect(displayUnit("INDEX_2025_100")).toBe("Index (2025=100)");
    expect(displayUnit("FOREIGN_CURRENCY_PER_EUR", "GBP")).toBe("GBP/EUR");
    expect(displayUnit("FOREIGN_CURRENCY_PER_EUR")).toBe(
      "Currency units per EUR",
    );
    expect(decimal("2.370620000000000000")).toBe("2.370620000000000000");
  });
  it("keeps adjacent narrow-range chart ticks distinguishable", () => {
    const values = [0.83351, 0.83359];
    expect(axisNumber(0.83352, "GBP/EUR", values)).toBe("0.83352");
    expect(axisNumber(0.83354, "GBP/EUR", values)).toBe("0.83354");
    expect(
      displayMeasurement(
        "0.833580000000000000",
        "GBP/EUR",
        false,
        chartPrecision("GBP/EUR", values),
      ),
    ).toBe("0.83358 GBP/EUR");
    expect(axisNumber(2.4, "EUR/litre", [1, 3])).toBe("2.400");
  });
});
