import { useState } from "react";
import type { AnalysisResponse } from "../contracts";
import type { Metric } from "../api";
import { decimal, period, timestamp } from "../format";
import { ComparisonChart, TrendChart } from "./Charts";
import { metricPoints } from "../chart-data";
import { SourceWarnings } from "./Evidence";
import EvidencePanel from "./Evidence";
import { analystDisplay, analystAnswer } from "../analyst-presentation";
export function AnalystResult({
  result: r,
  onFollowUp,
  restored,
}: {
  result: AnalysisResponse;
  onFollowUp: (q: string) => void;
  restored: boolean;
}) {
  const [table, setTable] = useState(false),
    [evidence, setEvidence] = useState<string | null>(null);
  const data = r.verified_data;
  const display = analystDisplay(r);
  const history =
    r.plan?.status === "ready" && r.plan.operation.kind.endsWith("_history");
  let points: Metric[] = [];
  if (
    data &&
    (data.kind === "fuel" ||
      data.kind === "inflation" ||
      data.kind === "exchange-rates")
  )
    points = data.data.items;
  const singleSeries =
    points.length > 0 && new Set(points.map((p) => p.series_id)).size === 1;
  const inverse =
    points[0]?.measurement_type === "reference_rate" &&
    points[0].inverse_is_derived === true;
  const comparison =
    data?.kind === "country_comparison" && data.data.available
      ? data.data
      : null;
  const tax =
    data?.kind === "fuel_tax_comparison" && data.available ? data : null;
  const hasChart = Boolean((history && singleSeries) || comparison || tax);
  const sources = data
    ? "sources" in data
      ? data.sources
      : "data" in data
        ? data.data.sources
        : []
    : [];
  return (
    <section className="pc-canvas pc-analyst-result">
      <p className="pc-note">
        {restored ? "Saved analysis" : "Analysis"} · assessed{" "}
        {period(r.assessment_date)}
      </p>
      <h2 tabIndex={-1} id="pc-answer">
        {analystAnswer(r) || "No analytical answer available."}
      </h2>
      {display.figures.length > 0 && (
        <dl className="pc-answer-figures" aria-label="Key verified figures">
          {display.figures.map((f, i) => (
            <div key={i}>
              <dt>{f.label}</dt>
              <dd title={f.exact}>
                <span className="pc-key-value">
                  {f.value}
                  {f.unit && <small>{f.unit}</small>}
                </span>
                <span className="pc-key-context">{f.context}</span>
                {f.flag && <span className="pc-key-flag">{f.flag}</span>}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {r.findings.length > 0 && (
        <ul className="pc-findings">
          {r.findings.map((f, i) => (
            <li key={i}>{f}</li>
          ))}
        </ul>
      )}
      {r.warnings.map((w, i) => (
        <p key={i} className="pc-notice">
          {w}
        </p>
      ))}
      {r.possibly_truncated && (
        <p className="pc-notice">
          This answer covers only the returned observations. Narrow the question
          to inspect additional history.
        </p>
      )}
      <div className="pc-visual-toolbar">
        <h3>Verified observations</h3>
        {hasChart && (
          <div
            className="pc-segments"
            role="group"
            aria-label="Analysis presentation"
          >
            <button aria-pressed={!table} onClick={() => setTable(false)}>
              Chart
            </button>
            <button aria-pressed={table} onClick={() => setTable(true)}>
              Table
            </button>
          </div>
        )}
      </div>
      <p className="pc-result-context">{display.context}</p>
      {(table || !hasChart) && display.columns.length > 3 && (
        <p className="pc-reader-hint">Scroll the table to see all columns →</p>
      )}
      {!table && hasChart ? (
        comparison ? (
          <ComparisonChart
            rows={comparison.items.map((i) => ({
              name: i.geography.name,
              value: i.value,
            }))}
            unit={comparison.unit}
          />
        ) : tax ? (
          <ComparisonChart
            rows={tax.items.map((m) => ({
              name: m.tax_basis === "with_tax" ? "With taxes" : "Without taxes",
              value: m.value,
            }))}
            unit="EUR/litre"
          />
        ) : (
          <TrendChart
            points={metricPoints(points, inverse)}
            unit={
              inverse && points[0].measurement_type === "reference_rate"
                ? points[0].inverse_unit!
                : points[0].unit
            }
            label="Verified analysis history"
          />
        )
      ) : (
        <div
          className="pc-table-scroll pc-reader-table"
          role="region"
          aria-label="Verified analysis table"
          tabIndex={0}
        >
          <table
            className={
              display.columns.length <= 3 ? "pc-short-table" : undefined
            }
          >
            <caption className="sr-only">Verified observations</caption>
            <thead>
              <tr>
                {display.columns.map((column) => (
                  <th scope="col" key={column}>
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {display.rows.map((row, i) => (
                <tr key={i}>
                  {row.cells.map((cell, j) => (
                    <td key={j} title={cell.exact}>
                      {cell.text}
                      {cell.note && <small>{cell.note}</small>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {display.rows.length === 0 && (
            <p>No tabular observations returned.</p>
          )}
        </div>
      )}
      {r.summary_comparison &&
        !r.findings.includes(r.summary_comparison.explanation.what_changed) && (
          <p className="pc-note">
            {r.summary_comparison.explanation.what_changed}{" "}
            {r.summary_comparison.direction === "inverse"
              ? "This summary uses the derived inverse; original observations keep the EUR base."
              : ""}
          </p>
        )}
      {r.explanation &&
        !r.findings.includes(r.explanation.why_it_might_matter) && (
          <p className="pc-note">{r.explanation.why_it_might_matter}</p>
        )}
      {r.follow_up_questions.length > 0 && (
        <div className="pc-followups">
          <span>Follow-up questions</span>
          {r.follow_up_questions.map((q, i) => (
            <button key={i} onClick={() => onFollowUp(q)}>
              {q}
              <span aria-hidden="true">→</span>
            </button>
          ))}
        </div>
      )}
      <details>
        <summary>Sources, evidence & details</summary>
        <p className="pc-result-question">Question: {r.question}</p>
        <details>
          <summary>Original backend answer</summary>
          <p>{r.answer}</p>
        </details>
        <p className="pc-note">
          Frozen snapshot created {timestamp(r.created_at)}. Source health below
          is as assessed on {period(r.assessment_date)}.
        </p>
        <SourceWarnings sources={sources} />
        {r.assumptions.map((a, i) => (
          <p key={i}>{a}</p>
        ))}
        {r.explanation?.limitations.map((l, i) => (
          <p key={i}>{l}</p>
        ))}
        <h3>Saved observation evidence</h3>
        <p className="pc-note">
          These captured values stay unchanged when restored. Current stored
          details may include subsequent revisions.
        </p>
        {r.evidence.map((e, i) => (
          <details key={e.observation_id + ":" + i}>
            <summary>
              {period(e.period)} · {e.value} {e.unit} · {e.source_code}
            </summary>
            <dl>
              <div>
                <dt>Exact captured value</dt>
                <dd>
                  {e.value} {e.unit}
                </dd>
              </div>
              <div>
                <dt>Raw source value</dt>
                <dd>
                  {e.raw_value === null
                    ? "Not applicable"
                    : e.raw_value + " " + e.raw_unit}
                </dd>
              </div>
              <div>
                <dt>Official status</dt>
                <dd>{e.status ?? "No flag supplied"}</dd>
              </div>
              <div>
                <dt>Observation publication</dt>
                <dd>{period(e.observation_publication_date)}</dd>
              </div>
              <div>
                <dt>Artifact publication</dt>
                <dd>{period(e.artifact_publication_date)}</dd>
              </div>
              <div>
                <dt>Retrieved</dt>
                <dd>{timestamp(e.retrieved_at)}</dd>
              </div>
              <div>
                <dt>Imported</dt>
                <dd>{timestamp(e.imported_at)}</dd>
              </div>
              <div>
                <dt>Artifact hash</dt>
                <dd>{e.sha256}</dd>
              </div>
            </dl>
            <button
              className="pc-text-link"
              onClick={() => setEvidence(e.evidence_path)}
            >
              Current stored details & revisions ↗
            </button>
          </details>
        ))}
        <details>
          <summary>Full data & source precision</summary>
          <div
            className="pc-table-scroll pc-raw-table"
            role="region"
            aria-label="Full analysis data"
            tabIndex={0}
          >
            <table>
              <caption>Complete saved result · exact backend values</caption>
              <thead>
                <tr>
                  {r.table.columns.map((c) => (
                    <th scope="col" key={c.key}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {r.table.rows.map((row, i) => (
                  <tr key={i}>
                    {r.table.columns.map((c) => (
                      <td key={c.key}>
                        {row[c.key] == null
                          ? "—"
                          : typeof row[c.key] === "boolean"
                            ? row[c.key]
                              ? "Yes"
                              : "No"
                            : c.value_type === "decimal"
                              ? decimal(String(row[c.key]))
                              : String(row[c.key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
        <details>
          <summary>Validated operation</summary>
          <pre>{JSON.stringify(r.plan, null, 2)}</pre>
        </details>
        <p className="pc-note">
          {r.dataset} schema v{r.schema_version} · {r.row_count} returned rows ·
          Request {r.request_id}
        </p>
      </details>
      {evidence && (
        <EvidencePanel path={evidence} onClose={() => setEvidence(null)} />
      )}
    </section>
  );
}
