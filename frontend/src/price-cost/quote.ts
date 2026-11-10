/** Direction selection only. Values, reciprocals and changes are calculated by the backend. */
import type { Metric } from "./api";
export function isInverse(m: Metric, selected = false) {
  return (
    selected &&
    m.measurement_type === "reference_rate" &&
    m.inverse_rate !== null
  );
}
export function quoteValue(m: Metric, inverse = false) {
  return isInverse(m, inverse) && m.measurement_type === "reference_rate"
    ? m.inverse_rate
    : m.value;
}
export function quoteUnit(m: Metric, inverse = false) {
  return isInverse(m, inverse) && m.measurement_type === "reference_rate"
    ? m.inverse_unit!
    : m.unit;
}
export function quoteChange(m: Metric, inverse = false) {
  return isInverse(m, inverse) && m.measurement_type === "reference_rate"
    ? (m.inverse_comparison ?? null)
    : m.comparison;
}
export function quoteLabel(m: Metric, inverse = false) {
  if (m.measurement_type !== "reference_rate") return m.indicator_name;
  return isInverse(m, inverse)
    ? `1 ${m.quote_currency} in EUR · derived inverse`
    : `1 EUR in ${m.quote_currency} · ECB reference rate`;
}
