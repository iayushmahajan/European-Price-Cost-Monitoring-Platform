import type { Metric } from "./api";
export interface ChartPoint {
  period: string;
  value: string;
  label: string;
  gap?: boolean;
  monthly?: boolean;
}
export function metricPoints(items: Metric[], inverse = false): ChartPoint[] {
  return items.flatMap((m) => {
    const v =
      inverse && m.measurement_type === "reference_rate"
        ? m.inverse_rate
        : m.value;
    if (v === null) return [];
    const p = {
      period: m.period,
      value: v,
      label: v,
      monthly: m.period_type === "reference_month",
    };
    return m.comparison.consecutive === false ? [{ ...p, gap: true }, p] : [p];
  });
}
