import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Download } from "lucide-react";
import type { Cell } from "../types/query";
import { downloadCsv, formatCell, label, numeric } from "../lib/results";
import { Button } from "./ui/button";

type Props = { columns: string[]; rows: Cell[][]; currency?: string | null };
export function ResultsTableCard({ columns, rows, currency }: Props) {
  const [sort, setSort] = useState<{
    index: number;
    ascending: boolean;
  } | null>(null);
  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) => {
        if (!sort) return 0;
        const av = a[sort.index],
          bv = b[sort.index];
        const an = numeric(av),
          bn = numeric(bv);
        const order =
          an !== null && bn !== null
            ? an - bn
            : String(av ?? "").localeCompare(String(bv ?? ""));
        return sort.ascending ? order : -order;
      }),
    [rows, sort],
  );
  return (
    <section aria-label="Result table">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {rows.length} returned {rows.length === 1 ? "row" : "rows"}
        </p>
        <Button
          variant="outline"
          size="sm"
          disabled={!rows.length}
          onClick={() => downloadCsv(columns, sorted)}
        >
          <Download /> Export CSV
        </Button>
      </div>
      {!rows.length ? (
        <p className="rounded-lg bg-muted p-6 text-sm text-muted-foreground">
          No matching data for these filters. Try a different date range.
        </p>
      ) : (
        <div className="result-table-wrap">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">
              Query results, sortable by column
            </caption>
            <thead>
              <tr>
                {columns.map((column, index) => (
                  <th
                    key={column}
                    aria-sort={
                      sort?.index === index
                        ? sort.ascending
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                    className="px-3 py-2.5"
                  >
                    <button
                      className="inline-flex items-center gap-1.5 whitespace-nowrap capitalize"
                      onClick={() =>
                        setSort({
                          index,
                          ascending:
                            sort?.index === index ? !sort.ascending : true,
                        })
                      }
                    >
                      {label(column)}
                      {sort?.index === index
                        ? sort.ascending
                          ? <ArrowUp aria-label="Sorted ascending" />
                          : <ArrowDown aria-label="Sorted descending" />
                        : <ArrowUpDown aria-label="Sort column" />}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((row, index) => (
                <tr key={index}>
                  {row.map((cell, cellIndex) => (
                    <td
                      key={cellIndex}
                      className="whitespace-nowrap px-3 py-2.5 tabular-nums text-foreground"
                    >
                      {formatCell(cell, columns[cellIndex], currency)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
