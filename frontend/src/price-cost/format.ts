import type { SourceStatus } from "./contracts";
import type { Metric } from "./api";
/** Display rounding uses decimal string digits, never binary floats or business calculations. */
export function decimal(
  value: string | null | undefined,
  places?: number,
): string {
  if (value == null || !/^[+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value))
    return "—";
  if (/[eE]/.test(value)) {
    const [coefficient, exponent] = value.toLowerCase().split("e");
    const offset = Number(exponent);
    if (!Number.isSafeInteger(offset) || Math.abs(offset) > 128)
      return places === undefined ? value : "—";
    const sign = coefficient.startsWith("-") ? "-" : "";
    const [whole, fraction = ""] = coefficient.replace(/^[+-]/, "").split(".");
    const digits = whole + fraction;
    const point = whole.length + offset;
    value =
      sign +
      (point <= 0
        ? "0." + "0".repeat(-point) + digits
        : point >= digits.length
          ? digits + "0".repeat(point - digits.length)
          : digits.slice(0, point) + "." + digits.slice(point));
  }
  if (places === undefined) return value;
  const negative = value.startsWith("-");
  const [integer, fraction = ""] = value.replace(/^[+-]/, "").split(".");
  const digits = fraction.padEnd(places + 1, "0");
  let rounded = BigInt(integer + digits.slice(0, places));
  if (Number(digits[places]) >= 5) rounded++;
  const text = rounded.toString().padStart(places + 1, "0");
  return (
    (negative && rounded !== 0n ? "−" : "") +
    (places ? text.slice(0, -places) + "." + text.slice(-places) : text)
  );
}
/** Presentation only: fuel thousandths and currency quotes benefit from a third digit.
 * Tiny nonzero values use explicit extra precision (or scientific notation), never zero.
 * Exact API strings remain untouched in evidence and all calculations.
 */
export function displayNumber(
  value: string | null | undefined,
  unit = "",
  places?: number,
): string {
  const expanded = decimal(value);
  if (expanded === "—") return expanded;
  const precision =
    places ??
    (unit === "EUR/litre" || unit === "EUR/L" || unit.includes("/") ? 3 : 2);
  // If expansion is intentionally bounded, keep an explicit exponent rather than lose the value.
  if (/[eE]/.test(expanded)) return expanded;
  const rounded = decimal(expanded, precision);
  const negative = expanded.startsWith("-");
  const [whole, fraction = ""] = expanded.replace(/^[+-]/, "").split(".");
  const first = fraction.search(/[1-9]/);
  const small = /^0+$/.test(whole) && first >= 2;
  const roundedToZero = /^[-−+]?0(?:\.0+)?$/.test(rounded) && first >= 0;
  if (!(places === undefined && small) && !roundedToZero) return rounded;
  if (first < 0) return rounded;
  if (first + 3 <= 8)
    return decimal(expanded, first + 3)
      .replace(/0+$/, "")
      .replace(/\.$/, "");
  const significant = fraction.slice(first);
  let mantissa = decimal(
    significant[0] + "." + (significant.slice(1) || "0"),
    2,
  );
  let exponent = -(first + 1);
  if (mantissa === "10.00") {
    mantissa = "1.00";
    exponent++;
  }
  return `${negative ? "−" : ""}${mantissa} × 10^${exponent}`;
}

export function displayUnit(unit: string, quoteCurrency?: string): string {
  if (unit === "FOREIGN_CURRENCY_PER_EUR")
    return quoteCurrency ? `${quoteCurrency}/EUR` : "Currency units per EUR";
  return (
    (
      {
        "EUR/litre": "EUR/L",
        EUR_PER_LITRE: "EUR/L",
        PERCENT: "%",
        INDEX_2025_100: "Index (2025=100)",
        percent: "%",
        percentage_points: "percentage points",
        index_points: "index points",
      } as Record<string, string>
    )[unit] || unit
  );
}
export function displayMeasurement(
  value: string | null | undefined,
  unit: string,
  signed = false,
  places?: number,
): string {
  const number = displayNumber(value, unit, places);
  if (number === "—") return number;
  const sign =
    signed &&
    !number.startsWith("−") &&
    !number.startsWith("-") &&
    !/^0(?:\.0+)?$/.test(number)
      ? "+"
      : "";
  return `${sign}${number}${unit === "percent" ? "" : " "}${displayUnit(unit)}`;
}
/** Charts may need extra axis precision so adjacent ticks do not collapse to one label. */
export function chartPrecision(unit: string, values: number[]): number {
  const base = unit.includes("/") ? 3 : 2;
  const range = values.length ? Math.max(...values) - Math.min(...values) : 0;
  return range > 0
    ? Math.max(base, Math.min(8, -Math.floor(Math.log10(range / 5))))
    : base;
}
export function axisNumber(
  value: number,
  unit: string,
  values: number[],
): string {
  return displayNumber(String(value), unit, chartPrecision(unit, values));
}
export function numeric(value: string): number | null {
  if (!/^[+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value)) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
export function period(value: string | null, monthly = false): string {
  if (!value) return "Not available";
  const date = new Date(value.length === 10 ? value + "T12:00:00Z" : value);
  if (!Number.isFinite(date.getTime())) return "Not available";
  return new Intl.DateTimeFormat(
    "en-GB",
    monthly
      ? { month: "long", year: "numeric", timeZone: "UTC" }
      : {
          day: "numeric",
          month: "short",
          year: "numeric",
          timeZone: "Europe/Brussels",
        },
  ).format(date);
}
export function timestamp(value: string | null): string {
  return value
    ? new Intl.DateTimeFormat("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Europe/Brussels",
      }).format(new Date(value)) + " (Brussels)"
    : "Not provided";
}
export function metricValue(m: Metric): string {
  return m.measurement_type === "price"
    ? "€" + displayNumber(m.value, m.unit)
    : m.measurement_type === "reference_rate"
      ? displayNumber(m.value, m.unit)
      : displayNumber(m.value, m.unit) + (m.unit === "percent" ? "%" : "");
}
export function metricUnit(m: Metric): string {
  return m.measurement_type === "price"
    ? "EUR/L"
    : m.measurement_type === "index"
      ? `Index · ${m.index_base_year}=100`
      : m.unit === "percent"
        ? m.measurement_type === "annual_rate"
          ? "Annual rate · percent"
          : "Monthly rate · percent"
        : m.unit;
}
export function changeText(m: Metric): string {
  const c = m.comparison;
  if (!c.available || c.absolute_change == null)
    return c.unavailable_reason || "Comparison unavailable";
  const unit =
    c.absolute_change_unit === "quote_currency_units_per_EUR"
      ? m.unit
      : c.absolute_change_unit || m.unit;
  return `${displayMeasurement(c.absolute_change, unit, true)} vs ${period(c.reference_period, m.period_type === "reference_month")}`;
}
export function today(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Brussels",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export function safeExternal(value: string): string | undefined {
  try {
    const u = new URL(value);
    return ["https:", "http:"].includes(u.protocol) ? u.href : undefined;
  } catch {
    return undefined;
  }
}

/** Both current/stale ingestion states mean a successful check; age is separate. */
export function synchronizationLabel(source: SourceStatus): string {
  return source.last_success_at &&
    ["current", "stale"].includes(source.synchronization_status)
    ? "Succeeded"
    : source.synchronization_status;
}
