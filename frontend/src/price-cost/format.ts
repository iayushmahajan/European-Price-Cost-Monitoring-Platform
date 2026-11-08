import type { Metric } from './api';
/** Display rounding uses decimal string digits, never binary floats or business calculations. */
export function decimal(value: string | null | undefined, places?: number): string {
  if (value == null || !/^[+-]?\d+(?:\.\d+)?$/.test(value)) return '—';
  if (places === undefined) return value;
  const negative = value.startsWith('-');
  const [integer, fraction = ''] = value.replace(/^[+-]/, '').split('.');
  const digits = fraction.padEnd(places + 1, '0');
  let rounded = BigInt(integer + digits.slice(0, places));
  if (Number(digits[places]) >= 5) rounded++;
  const text = rounded.toString().padStart(places + 1, '0');
  return (negative && rounded !== 0n ? '−' : '') + (places ? text.slice(0, -places) + '.' + text.slice(-places) : text);
}
export function numeric(value: string): number | null { const n = Number(value); return Number.isFinite(n) ? n : null; }
export function period(value: string | null, monthly = false): string {
  if (!value) return 'Not available';
  const date = new Date(value.length === 10 ? value + 'T12:00:00Z' : value);
  if (!Number.isFinite(date.getTime())) return 'Not available';
  return new Intl.DateTimeFormat('en-GB', monthly ? { month: 'long', year: 'numeric', timeZone: 'UTC' } : { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Brussels' }).format(date);
}
export function timestamp(value: string | null): string {
  return value ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Brussels' }).format(new Date(value)) + ' (Brussels)' : 'Not provided';
}
export function metricValue(m: Metric): string { return m.measurement_type === 'price' ? '€' + decimal(m.value, 3) : m.measurement_type === 'reference_rate' ? decimal(m.value) : decimal(m.value, 1) + (m.unit === 'percent' ? '%' : ''); }
export function metricUnit(m: Metric): string { return m.measurement_type === 'price' ? 'EUR/litre' : m.measurement_type === 'index' ? `Index · ${m.index_base_year}=100` : m.unit === 'percent' ? (m.measurement_type === 'annual_rate' ? 'Annual rate · percent' : 'Monthly rate · percent') : m.unit; }
export function changeText(m: Metric): string {
  const c = m.comparison;
  if (!c.available || c.absolute_change == null) return c.unavailable_reason || 'Comparison unavailable';
  return `${c.absolute_change.startsWith('-') ? '' : '+'}${decimal(c.absolute_change)} ${c.absolute_change_unit === 'percentage_points' ? 'percentage points' : c.absolute_change_unit === 'index_points' ? 'index points' : c.absolute_change_unit === 'quote_currency_units_per_EUR' ? m.unit : c.absolute_change_unit} vs ${period(c.reference_period, m.period_type === 'reference_month')}`;
}
export function today(): string { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
export function safeExternal(value: string): string | undefined { try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) ? u.href : undefined; } catch { return undefined; } }
