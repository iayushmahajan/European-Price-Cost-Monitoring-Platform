import type { Cell } from "../types/query";

export function analysisPresentation(answer: string, findings: string[], trends: string[], anomalies: string[]) {
  const conclusion = answer.length > 180 && findings.length ? findings[0] : answer;
  const highlights = [...findings, ...trends, ...anomalies]
    .filter((item) => item !== conclusion)
    .slice(0, 3);
  return { conclusion, highlights, showFullAnswer: conclusion !== answer };
}

export function numeric(value: Cell): number | null {
  if (value === null || typeof value === "boolean" || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
export const label = (value: string) => value.replaceAll("_", " ");
export function formatCell(value: Cell, column: string, currency?: string | null): string {
  if (value === null) return "—";
  const number = numeric(value);
  if (number !== null) {
    if (currency && /revenue|sales|amount|price|aov|average_order_value/i.test(column))
      return new Intl.NumberFormat("en", {
        style: "currency",
        currency,
      }).format(number);
    if (/percent|pct|rate|share|coverage/i.test(column))
      return `${new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(number)}%`;
    if (/monthly_change|yearly_change|annual_change|index_point|gap|minus|difference/i.test(column))
      return `${new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(number)} pts`;
    return new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(
      number,
    );
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}(T.*)?$/.test(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.valueOf()))
      return date.toLocaleDateString("en", {
        year: "numeric",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      });
  }
  return String(value);
}
export function toCsv(columns: string[], rows: Cell[][]): string {
  const escape = (value: Cell): string => {
    let text = value === null ? "" : String(value);
    // Neutralize spreadsheet formulas in text while retaining real numeric values.
    if (
      typeof value === "string" &&
      /^[\s]*[=+\-@\t\r]/.test(text) &&
      numeric(value) === null
    )
      text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  return [columns, ...rows]
    .map((row) => row.map(escape).join(","))
    .join("\r\n");
}
export function downloadCsv(columns: string[], rows: Cell[][]) {
  const url = URL.createObjectURL(
    new Blob([toCsv(columns, rows)], { type: "text/csv;charset=utf-8;" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "eurostat-analysis.csv";
  link.click();
  URL.revokeObjectURL(url);
}
export function chartShape(columns: string[], rows: Cell[][]) {
  if (rows.length < 2 || columns.length < 2) return null;
  if (
    !rows.every(
      (row) =>
        typeof row[0] === "string" &&
        row.slice(1).every((value) => numeric(value) !== null),
    )
  )
    return null;
  if (rows.some((row) => numeric(row[0]) !== null)) return null;
  const time = rows.every((row) =>
    /^\d{4}-\d{2}(-\d{2})?/.test(String(row[0])),
  );
  return {
    kind: time ? ("line" as const) : ("bar" as const),
    dimension: columns[0],
    measures: columns.slice(1),
    data: rows
      .map((row) => ({
        name: String(row[0]),
        ...Object.fromEntries(
          columns.slice(1).map((column, index) => [column, numeric(row[index + 1])!]),
        ),
      }))
      .sort((a, b) => (time ? a.name.localeCompare(b.name) : 0)),
  };
}
