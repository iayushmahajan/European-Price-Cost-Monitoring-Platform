import { lazy, Suspense, useState } from "react";
import { ArrowUpRight, CheckCircle2, Clock3, Database, SlidersHorizontal } from "lucide-react";
import type { QueryResponse } from "../types/query";
import { chartShape, formatCell, label, numeric } from "../lib/results";
import { ResultsTableCard } from "./ResultsTableCard";
import { SqlPreviewCard } from "./SqlPreviewCard";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";

const Visualization = lazy(() =>
  import("./Visualization").then((module) => ({ default: module.Visualization })),
);

export function AnalysisResult({ result, onFollowUp, disabled }: {
  result: QueryResponse;
  onFollowUp: (question: string) => void;
  disabled: boolean;
}) {
  const [view, setView] = useState<"chart" | "table">(
    chartShape(result.columns, result.rows) ? "chart" : "table",
  );
  const { plan, analysis, metric_definition: metric } = result;
  const chart = chartShape(result.columns, result.rows);
  const scopeItems = [
    ["Metric", metric?.calculation],
    ["Date range", plan?.date_range],
    ["Unit", "Retail volume index, 2021=100"],
    ["Observation status", metric?.included_statuses.join(", ") || "Official and provisional values"],
    ["Applied filters", plan?.filters.join("; ") || "No additional filters"],
    ["Source", plan?.source_tables.join(", ")],
  ];

  return (
    <div className="analysis-workbench">
      <div className="analysis-primary">
        <section className="analysis-answer" aria-label="Analysis answer">
          <div className="analysis-answer-heading">
            <div><p className="eyebrow">Analysis result</p><h2>{metric?.name ?? "Analysis"}</h2></div>
            <Badge variant="outline">{result.row_count} {result.row_count === 1 ? "row" : "rows"} · {(result.timings.total_ms / 1000).toFixed(1)}s</Badge>
          </div>
          <p className="analysis-summary">{analysis?.answer ?? (result.row_count ? "Query complete. Explore the returned data below." : "No matching records were returned.")}</p>
          <p className="analysis-trust"><CheckCircle2 aria-hidden="true" /> SQL passed structural checks. Insights are calculated from the returned rows; interpretation may contain model errors.</p>
          {result.rows.length === 1 && (
            <div className="single-value-grid">
              {result.columns.map((column, index) => numeric(result.rows[0][index]) !== null && (
                <div key={column}><span>{label(column)}</span><strong>{formatCell(result.rows[0][index], column, metric?.currency)}</strong></div>
              ))}
            </div>
          )}
          {result.possibly_truncated && <p className="analysis-warning">The result reached the row cap and may be incomplete. Narrow the question before drawing conclusions.</p>}
          {result.warnings.map((warning) => <p role="status" className="analysis-warning" key={warning}>{warning}</p>)}
        </section>

        <section className="result-surface" aria-label="Explore results">
          {chart ? (
            <Tabs value={view} onValueChange={(value) => setView(value as "chart" | "table")}>
              <div className="result-toolbar"><div><p className="eyebrow">Evidence</p><h2>Explore returned data</h2></div><TabsList aria-label="Result view"><TabsTrigger value="chart">Chart</TabsTrigger><TabsTrigger value="table">Table</TabsTrigger></TabsList></div>
              <TabsContent value="chart"><Suspense fallback={<p role="status" className="text-sm text-muted-foreground">Loading chart…</p>}><Visualization columns={result.columns} rows={result.rows} /></Suspense></TabsContent>
              <TabsContent value="table"><ResultsTableCard columns={result.columns} rows={result.rows} currency={metric?.currency} /></TabsContent>
            </Tabs>
          ) : (
            <><div className="result-toolbar"><div><p className="eyebrow">Evidence</p><h2>Returned data</h2></div></div><ResultsTableCard columns={result.columns} rows={result.rows} currency={metric?.currency} /></>
          )}
        </section>

        {analysis && (
          <section className="insights-section">
            <div className="section-heading"><p className="eyebrow">Calculated from the result</p><h2>Result insights</h2></div>
            <div className="insight-columns">
              {([ ["Key findings", analysis.findings], ["Trends", analysis.trends], ["Notable observations", analysis.anomalies], ["Caveats", analysis.caveats] ] as const)
                .filter(([, items]) => items.length)
                .map(([title, items]) => <div key={title}><h3>{title}</h3><ul>{items.map((item) => <li key={item}>{item}</li>)}</ul></div>)}
            </div>
            {!!analysis.follow_up_questions.length && <div className="follow-up-list"><span>Continue exploring</span>{analysis.follow_up_questions.map((question) => <Button variant="outline" size="sm" key={question} disabled={disabled} onClick={() => onFollowUp(question)}>{question}<ArrowUpRight /></Button>)}</div>}
          </section>
        )}
      </div>

      <aside className="evidence-panel" aria-label="Query evidence">
        <div className="evidence-heading"><SlidersHorizontal aria-hidden="true" /><div><strong>Query evidence</strong><span>Interpretation and scope</span></div></div>
        <p className="evidence-interpretation">{plan?.interpretation}</p>
        <dl>{scopeItems.map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl>
        <div className="evidence-meta"><span><Clock3 />Generation {(result.timings.generation_ms / 1000).toFixed(1)}s</span><span><Database />SQL {result.timings.execution_ms}ms</span></div>
        <p className="evidence-saved">Saved {new Date(result.created_at).toLocaleString()}</p>
        <SqlPreviewCard sql={result.generated_sql} />
      </aside>
    </div>
  );
}
