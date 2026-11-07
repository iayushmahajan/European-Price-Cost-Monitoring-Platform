import { describe, expect, it } from "vitest";
import { analysisPresentation, chartShape, formatCell, toCsv } from "./results";

describe("result presentation", () => {
  it("chooses charts only for supported shapes", () => {
    expect(chartShape(["period", "retail_index"], [["2026-01-01", "100"], ["2026-02-01", "101"]])?.kind).toBe("line");
    expect(chartShape(["geography", "yearly_change"], [["France", "1"], ["Germany", "2"]])?.kind).toBe("bar");
    expect(chartShape(["id", "value"], [[1, 100], [2, 200]])).toBeNull();
    expect(chartShape(["a", "b", "c"], [["x", 1, "unknown"], ["y", 3, 4]])).toBeNull();
  });

  it("builds aligned multi-series comparison charts", () => {
    const shape = chartShape(
      ["period", "germany_index", "eu_27_index", "germany_minus_eu_27_gap"],
      [["2026-07-01", "98.6", "104.9", "-6.3"], ["2026-08-01", "99.9", "105", "-5.1"]],
    );
    expect(shape?.kind).toBe("line");
    expect(shape?.measures).toEqual(["germany_index", "eu_27_index", "germany_minus_eu_27_gap"]);
    expect(shape?.data[1]).toMatchObject({ germany_index: 99.9, eu_27_index: 105 });
  });

  it("formats indices, index-point changes, percentages, currencies and nulls", () => {
    expect(formatCell("104.2", "retail_index")).toBe("104.2");
    expect(formatCell("-1.25", "yearly_change")).toBe("-1.25 pts");
    expect(formatCell("-5.1", "germany_minus_eu_27_gap")).toBe("-5.1 pts");
    expect(formatCell("79.4", "coverage")).toBe("79.4%");
    expect(formatCell("1234.5", "sales", "EUR")).toBe("€1,234.50");
    expect(formatCell("1234.5", "sales")).toBe("1,234.5");
    expect(formatCell(null, "value")).toBe("—");
  });

  it("quotes CSV and neutralizes spreadsheet formulas", () => {
    expect(toCsv(["name", "value"], [['a,"b', 1], ['=HYPERLINK("bad")', null]])).toContain('"a,""b"');
    expect(toCsv(["name"], [["=cmd"]])).toContain("'=cmd");
  });

  it("uses a calculated finding for an unusually long answer and preserves the full answer", () => {
    const answer = "From September 2025 to August 2026, Germany changed from one validated value to another while the EU-27 changed across the same period, including a deliberately long deterministic explanation of both movements and their relative percentages.";
    const finding = "Germany finished 5.1 index points below the EU-27.";
    expect(analysisPresentation(answer, [finding, "Germany was never above the EU-27."], ["The gap widened."], [])).toEqual({
      conclusion: finding,
      highlights: ["Germany was never above the EU-27.", "The gap widened."],
      showFullAnswer: true,
    });
  });

  it("keeps an already concise answer as the conclusion", () => {
    const answer = "Germany's latest retail index is 104.2.";
    expect(analysisPresentation(answer, ["It is 4.2 points above 2021."], [], [])).toEqual({
      conclusion: answer,
      highlights: ["It is 4.2 points above 2021."],
      showFullAnswer: false,
    });
  });
});
