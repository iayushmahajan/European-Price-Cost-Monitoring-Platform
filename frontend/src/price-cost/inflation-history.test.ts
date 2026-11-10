import { beforeEach, expect, it, vi } from "vitest";
import { pcFixture } from "../test/price-cost-fixtures";
import { priceCost } from "./api";
import type { InflationMetric, InflationResponse } from "./contracts";
import { latestInflationObservations } from "./inflation-history";
import { shiftMonths } from "./selection";
const base = pcFixture.histories[
  "inflation:DE:TOTAL:annual_rate"
] as InflationResponse;
const metric = base.items.at(-1)!;
const request = vi.fn<typeof priceCost.metrics>();
beforeEach(() => {
  request.mockReset();
  vi.spyOn(priceCost, "metrics").mockImplementation(request);
});
function points(periods: string[]): InflationMetric[] {
  return periods.map((period, i) => ({
    ...metric,
    period,
    observation_id: i + 100,
    value: `${i}.123456789000000000`,
  }));
}
it("selects the last 12 available observations including gaps without rewriting values", async () => {
  const items = points(
    Array.from({ length: 18 }, (_, i) =>
      shiftMonths(metric.period, i - 20),
    ).filter((_, i) => i !== 13),
  );
  items.push(metric);
  const data = { ...base, items };
  const before = JSON.stringify(data);
  request.mockResolvedValue(data);
  const signal = new AbortController().signal;
  const result = await latestInflationObservations(
    metric,
    "2025-01-01",
    signal,
  );
  expect(result.items).toEqual(items.slice(-12));
  expect(JSON.stringify(data)).toBe(before);
  expect(result.items).toHaveLength(12);
  expect(request).toHaveBeenCalledWith(
    "inflation",
    "history",
    expect.objectContaining({
      measurement: "annual_rate",
      end: metric.period,
      limit: "2000",
    }),
    signal,
  );
});
it("searches earlier bounded windows when sparse monthly coverage needs them", async () => {
  const newest = points(["2026-02-01", "2026-06-01", metric.period]);
  const older = points(
    Array.from(
      { length: 10 },
      (_, i) => `2015-${String(i + 1).padStart(2, "0")}-01`,
    ),
  );
  request
    .mockResolvedValueOnce({ ...base, items: newest })
    .mockResolvedValueOnce({ ...base, items: older });
  const result = await latestInflationObservations(
    metric,
    "2010-01-01",
    new AbortController().signal,
  );
  expect(request).toHaveBeenCalledTimes(2);
  expect(result.items).toHaveLength(12);
  expect(result.items.at(-1)!.period).toBe(metric.period);
  for (const call of request.mock.calls) {
    const p = call[2];
    expect(
      (Date.parse(p.end) - Date.parse(p.start)) / 86400000,
    ).toBeLessThanOrEqual(3660);
  }
});
it("returns genuinely short or empty coverage and propagates failures", async () => {
  request
    .mockResolvedValueOnce({ ...base, items: [metric] })
    .mockResolvedValueOnce({ ...base, items: [] })
    .mockRejectedValueOnce(new Error("source unavailable"));
  expect(
    (
      await latestInflationObservations(
        metric,
        "2025-01-01",
        new AbortController().signal,
      )
    ).items,
  ).toHaveLength(1);
  expect(
    (
      await latestInflationObservations(
        metric,
        "2025-01-01",
        new AbortController().signal,
      )
    ).items,
  ).toEqual([]);
  await expect(
    latestInflationObservations(
      metric,
      "2025-01-01",
      new AbortController().signal,
    ),
  ).rejects.toThrow("source unavailable");
});
