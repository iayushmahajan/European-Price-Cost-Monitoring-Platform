import { lazy, Suspense, useState } from "react";
import { ArrowUpRight, CheckCircle2, Clock3, Database, ShieldCheck } from "lucide-react";
import type { QueryResponse } from "../types/query";
import { analysisPresentation, chartShape, formatCell, label, numeric } from "../lib/results";
import { ResultsTableCard } from "./ResultsTableCard";
import { SqlPreviewCard } from "./SqlPreviewCard";
import { Button } from "./ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";

const Visualization = lazy(() => import("./Visualization").then((module) => ({ default: module.Visualization })));

export function AnalysisResult({ result, onFollowUp, disabled }: { result: QueryResponse; onFollowUp: (question: string) => void; disabled: boolean }) {
  const [view, setView] = useState<"chart" | "table">(chartShape(result.columns, result.rows) ? "chart" : "table");
  const { plan, analysis, metric_definition: metric } = result;
  const chart = chartShape(result.columns, result.rows);
  const presentation = analysisPresentation(analysis?.answer ?? (result.row_count ? "Query complete." : "No matching records were returned."), analysis?.findings ?? [], analysis?.trends ?? [], analysis?.anomalies ?? []);
  const scopeItems = [["Metric", metric?.calculation], ["Date range", plan?.date_range], ["Unit", "Retail volume index, 2021=100"], ["Observation status", metric?.included_statuses.join(", ") || "Official and provisional values"], ["Filters", plan?.filters.join("; ") || "No additional filters"], ["Source", plan?.source_tables.join(", ")]];
  return <div className="analysis-result">
    <section className="answer-hero" aria-label="Analysis answer">
      <div className="answer-status"><span><CheckCircle2/> Answer ready</span><small>{(result.timings.total_ms / 1000).toFixed(1)}s · {result.row_count} {result.row_count === 1 ? "row" : "rows"}</small></div>
      <h2>{presentation.conclusion}</h2>
      {result.rows.length === 1 && <div className="answer-values">{result.columns.map((column, index) => numeric(result.rows[0][index]) !== null && <div key={column}><span>{label(column)}</span><strong>{formatCell(result.rows[0][index], column, metric?.currency)}</strong></div>)}</div>}
      {!!presentation.highlights.length && <div className="answer-highlights"><span>What matters</span><ul>{presentation.highlights.map((item) => <li key={item}>{item}</li>)}</ul></div>}
      {result.possibly_truncated && <p className="analysis-warning">The result reached the row cap and may be incomplete. Narrow the question before drawing conclusions.</p>}
      {result.warnings.map((warning) => <p role="status" className="analysis-warning" key={warning}>{warning}</p>)}
    </section>

    <section className="result-surface" aria-label="Analysis data">
      {chart ? <Tabs value={view} onValueChange={(value) => setView(value as "chart" | "table")}><div className="result-toolbar"><h2>Result</h2><TabsList aria-label="Result view"><TabsTrigger value="chart">Chart</TabsTrigger><TabsTrigger value="table">Table</TabsTrigger></TabsList></div><TabsContent value="chart"><Suspense fallback={<p role="status" className="chart-loading">Drawing chart…</p>}><Visualization columns={result.columns} rows={result.rows}/></Suspense></TabsContent><TabsContent value="table"><ResultsTableCard columns={result.columns} rows={result.rows} currency={metric?.currency}/></TabsContent></Tabs> : <><div className="result-toolbar"><h2>Result</h2></div><ResultsTableCard columns={result.columns} rows={result.rows} currency={metric?.currency}/></>}
    </section>

    {!!analysis?.follow_up_questions.length && <section className="follow-up-section"><span>Continue exploring</span><div>{analysis.follow_up_questions.map((question) => <Button variant="outline" key={question} disabled={disabled} onClick={() => onFollowUp(question)}>{question}<ArrowUpRight/></Button>)}</div></section>}

    <details className="evidence-disclosure">
      <summary><span><ShieldCheck/> Evidence & methodology</span><small>Interpretation, filters and SQL</small></summary>
      <div className="evidence-content"><div className="evidence-overview">{presentation.showFullAnswer && <div className="full-answer"><span>Full calculated explanation</span><p>{analysis?.answer}</p></div>}<div><span>Question interpreted as</span><p>{plan?.interpretation}</p></div><dl>{scopeItems.map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl>{!!analysis?.caveats.length && <div className="caveat-list"><span>Caveats</span><ul>{analysis.caveats.map((item) => <li key={item}>{item}</li>)}</ul></div>}<p className="evidence-trust"><CheckCircle2/> SQL passed structural safety checks. Model interpretation may still contain errors.</p><div className="evidence-meta"><span><Clock3/> Generation {(result.timings.generation_ms / 1000).toFixed(1)}s</span><span><Database/> Query {result.timings.execution_ms}ms</span></div></div><SqlPreviewCard sql={result.generated_sql}/></div>
    </details>
  </div>;
}
