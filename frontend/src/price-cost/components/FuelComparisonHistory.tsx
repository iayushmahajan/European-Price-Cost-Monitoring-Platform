import { useState } from "react";
import { priceCost } from "../api";
import type { Selection } from "../selection";
import { useResource } from "../resource";
import { displayMeasurement, period } from "../format";
import { ResourceState, State } from "./Shared";
import EvidencePanel, { SourceWarnings, StatusFlags } from "./Evidence";
import { FuelComparisonChart } from "./FuelComparisonChart";
import "../insights.css";
import { ContextInsights } from "./ContextInsights";
export function FuelComparisonHistory({
  selection: s,
  onView,
}: {
  selection: Selection;
  onView: (table: boolean) => void;
}) {
  const [evidence, setEvidence] = useState<string | null>(null);
  const params = {
    countries: `${s.country},${s.compare}`,
    base_country: s.country,
    product: s.product,
    tax_basis: s.tax,
    as_of: s.end,
    ...(s.comparisonPeriod ? { period: s.comparisonPeriod } : {}),
  };
  const r = useResource(
    "fuel-history-comparison:" + JSON.stringify(params),
    (signal) => priceCost.fuelHistoryComparison(params, signal),
  );
  return (
    <section className="pc-canvas pc-analysis pc-fuel-comparison">
      <ResourceState resource={r}>
        {(d) => {
          const first = d.observations[0],
            last = d.observations.at(-1);
          if (!d.available || !first || !last)
            return (
              <>
                <State empty={d.latest.explanation.what_changed} />
                <SourceWarnings sources={d.latest.sources} />
              </>
            );
          return (
            <>
              <div className="pc-visual-toolbar">
                <div>
                  <h2>Fuel prices over time</h2>
                  <p className="pc-note">
                    {s.product === "automotive_diesel"
                      ? "Diesel"
                      : "Petrol (95)"}{" "}
                    ·{" "}
                    {s.tax === "with_tax"
                      ? "Including taxes"
                      : "Excluding taxes"}{" "}
                    · EUR/L
                  </p>
                </div>
                <div
                  className="pc-segments"
                  role="group"
                  aria-label="Presentation"
                >
                  <button
                    aria-pressed={s.view === "chart"}
                    onClick={() => onView(false)}
                  >
                    Chart
                  </button>
                  <button
                    aria-pressed={s.view === "table"}
                    onClick={() => onView(true)}
                  >
                    Table
                  </button>
                </div>
              </div>
              <div className="pc-comparison-current">
                {[last.base, last.peer].map((m) => (
                  <div key={m.geography.code}>
                    <span>{m.geography.name}</span>
                    <strong title={m.value}>
                      {displayMeasurement(m.value, m.unit)}
                    </strong>
                    <button
                      className="pc-text-link"
                      onClick={() => setEvidence(m.evidence_path)}
                      aria-label={`Inspect observation for ${m.geography.name}`}
                    >
                      Inspect observation ↗
                    </button>
                  </div>
                ))}
                <div>
                  <span>
                    {last.peer.geography.name} − {last.base.geography.name}
                  </span>
                  <strong>
                    {displayMeasurement(last.gap, "EUR/litre", true)}
                  </strong>
                  <span>Week of {period(last.period)}</span>
                </div>
              </div>
              <p className="pc-note">
                {d.observations.length === 12
                  ? "Latest 12 matched weeks"
                  : `${d.observations.length} matched weeks available`}{" "}
                · {period(first.period)} – {period(last.period)}. Only the same
                observation weeks are compared.
              </p>
              {s.view === "chart" ? (
                <FuelComparisonChart observations={d.observations} />
              ) : (
                <div
                  className="pc-table-scroll"
                  role="region"
                  aria-label="Matched weekly fuel prices"
                  tabIndex={0}
                >
                  <table>
                    <caption>Matched weeks · EUR/L</caption>
                    <thead>
                      <tr>
                        <th scope="col">Week of</th>
                        <th scope="col">{last.base.geography.name}</th>
                        <th scope="col">{last.peer.geography.name}</th>
                        <th scope="col">
                          {last.peer.geography.name} −{" "}
                          {last.base.geography.name}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.observations.map((row) => (
                        <tr key={row.period}>
                          <th scope="row">{period(row.period)}</th>
                          {[row.base, row.peer].map((m) => (
                            <td key={m.geography.code}>
                              <button
                                className="pc-text-link"
                                onClick={() => setEvidence(m.evidence_path)}
                                aria-label={`${m.geography.name} evidence for ${period(row.period)}`}
                              >
                                {displayMeasurement(m.value, m.unit)}
                              </button>
                              <StatusFlags status={m.status} />
                            </td>
                          ))}
                          <td>
                            {displayMeasurement(row.gap, "EUR/litre", true)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="pc-comparison-insights">
                <ContextInsights
                  insights={d.insights}
                  onEvidence={setEvidence}
                />
                <details className="pc-period-calculations">
                  <summary>Period calculations</summary>
                  <p className="pc-note">
                    Period averages describe the matched weeks, not the latest
                    ranking.
                  </p>
                  <dl>
                    {d.summaries.map((x) => (
                      <div key={x.geography.code}>
                        <dt>{x.geography.name}</dt>
                        <dd>
                          <strong>
                            {displayMeasurement(
                              x.history.change,
                              "EUR/litre",
                              true,
                            )}
                          </strong>{" "}
                          from first to last week · average{" "}
                          <strong>
                            {displayMeasurement(x.history.average, "EUR/litre")}
                          </strong>
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <p>
                    {d.gap_direction ? (
                      <>
                        The absolute price gap {d.gap_direction}
                        {d.gap_direction !== "unchanged" && (
                          <>
                            {" "}
                            by{" "}
                            {displayMeasurement(
                              d.absolute_gap_change?.startsWith("-")
                                ? d.absolute_gap_change.slice(1)
                                : d.absolute_gap_change,
                              "EUR/litre",
                            )}
                          </>
                        )}{" "}
                        between the first and last matched weeks.
                      </>
                    ) : (
                      "At least two matched weeks are needed to describe how the price gap changed."
                    )}
                  </p>
                  <p className="pc-note">
                    Averages give each matched week equal weight. National
                    averages may differ from station prices.
                  </p>
                </details>
              </div>
              {(d.unmatched_weeks.length > 0 ||
                d.observations.some((x) => x.consecutive === false)) && (
                <details className="pc-missing-weeks">
                  <summary>
                    Missing or unmatched weeks ({d.unmatched_weeks.length})
                  </summary>
                  <p>
                    These weeks are excluded from both averages and period
                    changes. Chart lines break across gaps; no prices are
                    filled.
                  </p>
                  <ul>
                    {d.unmatched_weeks.map((x) => (
                      <li key={x.period}>
                        {period(x.period)} · unavailable for{" "}
                        {x.missing_countries
                          .map(
                            (code) =>
                              [last.base, last.peer].find(
                                (m) => m.geography.code === code,
                              )?.geography.name || code,
                          )
                          .join(", ")}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <SourceWarnings sources={d.latest.sources} />
            </>
          );
        }}
      </ResourceState>
      {evidence && (
        <EvidencePanel path={evidence} onClose={() => setEvidence(null)} />
      )}
    </section>
  );
}
