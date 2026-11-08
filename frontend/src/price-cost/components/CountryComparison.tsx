import { useState } from "react";
import type { Selection } from "../selection";
import { filters } from "../selection";
import { priceCost } from "../api";
import { useResource } from "../resource";
import { decimal, period } from "../format";
import { ResourceState, State } from "./Shared";
import { ComparisonChart } from "./Charts";
import { Definition, SourceWarnings, StatusFlags } from "./Evidence";
import EvidencePanel from "./Evidence";
export function CountryComparison({
  selection: s,
  onView,
}: {
  selection: Selection;
  onView: (table: boolean) => void;
}) {
  const [evidence, setEvidence] = useState<string | null>(null),
    [definition, setDefinition] = useState(false);
  const params = {
    ...filters(s),
    countries: s.country + "," + s.compare,
    base_country: s.country,
    as_of: s.end,
    ...(s.comparisonPeriod ? { period: s.comparisonPeriod } : {}),
  };
  const r = useResource(
    "compare:" + s.domain + JSON.stringify(params),
    (signal) =>
      s.error
        ? Promise.resolve(null)
        : priceCost.compare(s.domain as "fuel" | "inflation", params, signal),
  );
  return (
    <section className="pc-canvas pc-analysis">
      <ResourceState resource={r}>
        {(d) =>
          d ? (
            <>
              <h2>Same-period country comparison</h2>
              <p className="pc-note">
                {period(d.period, s.domain === "inflation")} ·{" "}
                {s.domain === "fuel"
                  ? s.tax === "with_tax"
                    ? "Including taxes"
                    : "Excluding taxes"
                  : s.measurement === "annual_rate"
                    ? "Annual inflation"
                    : "Monthly inflation"}{" "}
                · Differences from {d.base_geography}
              </p>
              <SourceWarnings sources={d.sources} />
              {!d.available ? (
                <State
                  empty={
                    d.explanation.what_changed +
                    " " +
                    d.missing_selections.join(", ")
                  }
                />
              ) : (
                <>
                  <div className="pc-visual-toolbar">
                    <p>{d.unit}</p>
                    <div
                      role="group"
                      aria-label="Presentation"
                      className="pc-segments"
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
                  {s.view === "chart" && (
                    <ComparisonChart
                      rows={d.items.map((i) => ({
                        name: i.geography.name,
                        value: i.value,
                      }))}
                      unit={d.unit}
                    />
                  )}
                  <div
                    className="pc-table-scroll"
                    role="region"
                    aria-label="Country comparison table"
                    tabIndex={0}
                  >
                    <table>
                      <caption>
                        Common-period values and backend-calculated differences
                      </caption>
                      <thead>
                        <tr>
                          <th>Country</th>
                          <th>Value</th>
                          <th>Difference from {d.base_geography}</th>
                          <th>Evidence</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.items.map((i) => (
                          <tr key={i.geography.code}>
                            <th>{i.geography.name}</th>
                            <td>
                              {decimal(i.value)} {d.unit}
                              <StatusFlags status={i.status} />
                            </td>
                            <td>
                              {decimal(i.difference_from_base)}{" "}
                              {i.difference_unit === "percentage_points"
                                ? "percentage points"
                                : i.difference_unit}
                            </td>
                            <td>
                              <button
                                className="pc-text-link"
                                onClick={() =>
                                  setEvidence(
                                    `/v1/price-cost/evidence/${s.domain}/${i.observation_id}`,
                                  )
                                }
                              >
                                Inspect observation
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              <p className="pc-note">{d.explanation.what_it_means}</p>
              <button
                className="pc-text-link"
                onClick={() => setDefinition(true)}
              >
                Comparison definition ↗
              </button>
              {definition && (
                <Definition
                  explanation={d.explanation}
                  onClose={() => setDefinition(false)}
                />
              )}
            </>
          ) : null
        }
      </ResourceState>
      {evidence && (
        <EvidencePanel path={evidence} onClose={() => setEvidence(null)} />
      )}
    </section>
  );
}
