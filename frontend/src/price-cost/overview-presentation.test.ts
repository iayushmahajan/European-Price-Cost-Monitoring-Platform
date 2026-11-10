import { expect, it } from "vitest";
import { pcFixture } from "../test/price-cost-fixtures";
import {
  overviewHistoryDescription,
  overviewHistoryTitle,
} from "./overview-presentation";

const annual = pcFixture.histories["inflation:DE:TOTAL:annual_rate"].items;
const monthly = pcFixture.histories["inflation:DE:TOTAL:monthly_rate"].items;
const indices = pcFixture.histories["inflation:DE:TOTAL:index"].items;
it("distinguishes the annual measurement from the actual monthly observation span", () => {
  const items = annual.filter((m) => m.period >= "2026-08-01");
  expect(overviewHistoryTitle(items[0], items)).toBe(
    "Annual inflation rate · Aug–Oct 2026",
  );
  expect(overviewHistoryDescription(items[0])).toBe(
    "Each monthly observation compares prices with the same month one year earlier.",
  );
  expect(overviewHistoryTitle(monthly[0], monthly.slice(-2))).toBe(
    "Monthly inflation rate · Sept–Oct 2026",
  );
  expect(overviewHistoryDescription(monthly[0])).toContain("preceding month");
  expect(overviewHistoryTitle(indices[0], indices.slice(-1))).toBe(
    "HICP index · Oct 2026",
  );
  expect(overviewHistoryDescription(indices[0])).toContain(
    "index points (2025 = 100), not percentage changes",
  );
});
it("uses extrema of actual returned dates without assuming complete/consecutive months", () => {
  const points = [
    { ...annual[0], period: "2026-02-01" },
    { ...annual[0], period: "2025-12-01" },
  ];
  const before = JSON.stringify(points);
  expect(overviewHistoryTitle(annual[0], points)).toBe(
    "Annual inflation rate · Dec 2025–Feb 2026",
  );
  expect(JSON.stringify(points)).toBe(before);
  expect(overviewHistoryTitle(annual[0], [])).toBe("Annual inflation rate");
  expect(
    overviewHistoryTitle(annual[0], [{ ...annual[0], period: "2026-02-30" }]),
  ).toBe("Annual inflation rate");
});
it("labels real weekly and working-day spans without inventing observation dates", () => {
  const fuel = pcFixture.histories["fuel:DE:automotive_diesel:with_tax"].items;
  const fx = pcFixture.histories["exchange-rates:GBP"].items;
  expect(overviewHistoryTitle(fuel[0], fuel)).toBe(
    "Diesel prices · 12 Oct–2 Nov 2026",
  );
  expect(overviewHistoryTitle(fx[0], fx)).toBe(
    "Euro to GBP reference rate · 30 Oct–3 Nov 2026",
  );
});
