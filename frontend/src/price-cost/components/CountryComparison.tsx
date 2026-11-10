import { FuelComparisonHistory } from "./FuelComparisonHistory";
import { useState } from "react";
import type { Selection } from "../selection";
import { filters } from "../selection";
import { priceCost } from "../api";
import { useResource } from "../resource";
import { displayMeasurement, period } from "../format";
import { ResourceState, State } from "./Shared";
import { ComparisonChart } from "./Charts";
import { Definition, SourceWarnings, StatusFlags } from "./Evidence";
import EvidencePanel from "./Evidence";
function RateCountryComparison({
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
    countries: `${s.country},${s.compare}`,
    base_country: s.country,
    as_of: s.end,
    ...(s.comparisonPeriod ? { period: s.comparisonPeriod } : {}),
  };
  const r = useResource("compare:" + JSON.stringify(params), (signal) =>
    priceCost.compare("inflation", params, signal),
  );
  return (
    <section className="pc-canvas pc-analysis">
      <ResourceState resource={r}>
        {(d) => {
          const outsideRange = Boolean(
            d.period && (d.period < s.start || d.period > s.end),
          );
          const reference = d.items.find(
            (i) => i.geography.code === d.base_geography,
          );
          const peers = d.items.filter(
            (i) => i.geography.code !== d.base_geography,
          );
          return (
            <>
              <h2>Same-period country comparison</h2>
              {!outsideRange && (
                <p className="pc-note">
                  {period(d.period, true)} ·{" "}
                  {s.measurement === "annual_rate"
                    ? "Annual inflation"
                    : "Monthly inflation"}
                  . Differences are percentage points, not changes over time.
                </p>
              )}
              {outsideRange || !d.available || !reference ? (
                <State
                  empty={
                    outsideRange
                      ? "No shared observation is available within the selected date range. Choose another range or comparison month."
                      : d.explanation.what_changed +
                        " " +
                        d.missing_selections.join(", ")
                  }
                />
              ) : (
                <>
                  <p className="pc-comparison-reference">
                    Reference:{" "}
                    <strong>
                      {reference.geography.name} ·{" "}
                      {displayMeasurement(reference.value, d.unit)}
                    </strong>{" "}
                    <StatusFlags status={reference.status} />
                  </p>
                  <button
                    className="pc-text-link"
                    onClick={() =>
                      setEvidence(
                        `/v1/price-cost/evidence/inflation/${reference.observation_id}`,
                      )
                    }
                  >
                    Reference country evidence ↗
                  </button>
                  <div className="pc-visual-toolbar">
                    <h3>Difference from {reference.geography.name}</h3>
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
                  {s.view === "chart" ? (
                    <>
                      <ComparisonChart
                        rows={peers.map((i) => ({
                          name: i.geography.name,
                          value: i.difference_from_base,
                        }))}
                        unit="percentage_points"
                      />
                      <div className="pc-actions">
                        {peers.map((i) => (
                          <button
                            key={i.geography.code}
                            className="pc-text-link"
                            onClick={() =>
                              setEvidence(
                                `/v1/price-cost/evidence/inflation/${i.observation_id}`,
                              )
                            }
                          >
                            {i.geography.name} observation evidence ↗
                          </button>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div
                      className="pc-table-scroll"
                      role="region"
                      aria-label="Country comparison table"
                      tabIndex={0}
                    >
                      <table>
                        <caption>
                          Inflation rates and signed differences from{" "}
                          {reference.geography.name} · {period(d.period, true)}
                        </caption>
                        <thead>
                          <tr>
                            <th scope="col">Country</th>
                            <th scope="col">Rate (%)</th>
                            <th scope="col">Difference (percentage points)</th>
                            <th scope="col">Evidence</th>
                          </tr>
                        </thead>
                        <tbody>
                          {peers.map((i) => (
                            <tr key={i.geography.code}>
                              <th scope="row">{i.geography.name}</th>
                              <td>
                                {displayMeasurement(i.value, d.unit)}
                                <StatusFlags status={i.status} />
                              </td>
                              <td>
                                {displayMeasurement(
                                  i.difference_from_base,
                                  i.difference_unit,
                                  true,
                                )}
                              </td>
                              <td>
                                <button
                                  className="pc-text-link"
                                  onClick={() =>
                                    setEvidence(
                                      `/v1/price-cost/evidence/inflation/${i.observation_id}`,
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
                  )}
                  <p className="pc-note">
                    Positive means higher than {reference.geography.name};
                    negative means lower.
                  </p>
                </>
              )}
              <SourceWarnings sources={d.sources} />
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
          );
        }}
      </ResourceState>
      {evidence && (
        <EvidencePanel path={evidence} onClose={() => setEvidence(null)} />
      )}
    </section>
  );
}
export function CountryComparison(props: {
  selection: Selection;
  onView: (table: boolean) => void;
}) {
  return props.selection.domain === "fuel" ? (
    <FuelComparisonHistory {...props} />
  ) : (
    <RateCountryComparison {...props} />
  );
}
