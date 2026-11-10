/** Bounded display retrieval. Official values/comparisons are never recalculated. */
import type { InflationMetric, InflationResponse } from "./contracts";
import { priceCost } from "./api";
import { shiftMonths } from "./selection";

export async function latestInflationObservations(
  metric: InflationMetric,
  firstPeriod: string | null,
  signal: AbortSignal,
): Promise<InflationResponse> {
  let end = metric.period;
  let firstResponse: InflationResponse | undefined;
  const found = new Map<string, InflationMetric>();
  for (let window = 0; window < 4; window++) {
    const boundary = shiftMonths(end, -120);
    const start =
      firstPeriod && firstPeriod > boundary ? firstPeriod : boundary;
    const data = (await priceCost.metrics(
      "inflation",
      "history",
      {
        country: metric.geography.code,
        category: metric.category.code,
        measurement: metric.measurement_type,
        start,
        end,
        limit: "2000",
      },
      signal,
    )) as InflationResponse;
    if (data.page.has_more)
      throw new Error(
        "The monthly history exceeded its bounded retrieval window.",
      );
    firstResponse ??= data;
    for (const item of data.items) found.set(item.period, item);
    if (found.size >= 12 || !firstPeriod || start <= firstPeriod) {
      // This is a 12-observation Overview projection, not a claim that no older data exists.
      return {
        ...firstResponse,
        items: [...found.values()]
          .sort((a, b) => a.period.localeCompare(b.period))
          .slice(-12),
        page: { has_more: false, next_start: null, previous_end: null, limit: 12 },
      };
    }
    end = shiftMonths(start, -1);
  }
  throw new Error(
    "The latest available months could not be established within the bounded history search. Use Explore.",
  );
}
