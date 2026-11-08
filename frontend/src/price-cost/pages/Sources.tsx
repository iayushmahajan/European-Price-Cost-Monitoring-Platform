import { useState } from "react";
import { priceCost } from "../api";
import { useResource } from "../resource";
import { period, safeExternal, timestamp } from "../format";
import type { Catalogue, SourceStatus } from "../contracts";
import { Panel, ResourceState } from "../components/Shared";
export default function SourcesPage() {
  const [revision, setRevision] = useState(0),
    [selected, setSelected] = useState<SourceStatus | null>(null);
  const sources = useResource("sources:" + revision, priceCost.sources);
  const catalogue = useResource("sources-catalogue", priceCost.catalogue);
  return (
    <>
      <header className="pc-heading">
        <div>
          <span className="pc-kicker">Data & Sources</span>
          <h1>Know the source.</h1>
        </div>
        <button
          className="pc-button pc-primary"
          onClick={() => {
            setSelected(null);
            setRevision((r) => r + 1);
          }}
          disabled={sources.loading}
        >
          Reload source status
        </button>
      </header>
      <section className="pc-canvas pc-sources">
        <ResourceState resource={sources}>
          {(items) =>
            items.length ? (
              <>
                <div className="pc-source-columns" aria-hidden="true">
                  <span>Official source</span>
                  <span>Observation freshness</span>
                  <span>Synchronization</span>
                </div>
                {items.map((s) => {
                  const coverage = catalogue.data?.coverage.filter(
                    (c) => c.source_code === s.source.code,
                  );
                  return (
                    <button
                      className="pc-source-row"
                      key={s.source.code}
                      onClick={() => setSelected(s)}
                    >
                      <span>
                        <strong>{s.source.name}</strong>
                        <small>
                          {s.expected_frequency === "daily"
                            ? "Working-day reference rates"
                            : s.expected_frequency + " observations"}{" "}
                          · Latest observation:{" "}
                          {period(
                            s.latest_observation,
                            s.expected_frequency === "monthly",
                          )}
                        </small>
                        <small>
                          {coverage
                            ? `${coverage.filter((c) => c.latest_period !== null).length} populated / ${coverage.length} registered series`
                            : catalogue.loading
                              ? "Coverage loading…"
                              : "Coverage unavailable"}
                        </small>
                      </span>
                      <span>
                        <small>Observation freshness</small>
                        {s.observation_freshness}
                      </span>
                      <span>
                        <small>Synchronization health</small>
                        {s.synchronization_status}
                        {s.running ? " · in progress" : ""}
                      </span>
                      <span aria-hidden="true">↗</span>
                    </button>
                  );
                })}
              </>
            ) : (
              <div className="pc-state">No source metadata available.</div>
            )
          }
        </ResourceState>
      </section>
      <section className="pc-methodology">
        <h2>
          Different dates.
          <br />
          Different meanings.
        </h2>
        <div>
          <details>
            <summary>Observation, publication and synchronization</summary>
            <p>
              An observation describes a reference week, month or day.
              Publication is when an official source released data, if known.
              Successful synchronization is when the platform last checked and
              stored a valid dataset. A successful check does not guarantee that
              every series has a fresh observation.
            </p>
          </details>
          <details>
            <summary>Measurement and coverage limitations</summary>
            <p>
              Fuel prices are national averages, HICP measures consumer-price
              movements, and ECB rates are informational references. None
              represents an individual business’s actual costs. Registered
              coverage and populated coverage are shown separately.
            </p>
          </details>
        </div>
      </section>
      {selected && (
        <Panel
          title="Source status & methodology"
          description={selected.source.name}
          onClose={() => setSelected(null)}
        >
          <SourceDetails source={selected} />
          <details>
            <summary>Series coverage</summary>
            <ResourceState resource={catalogue}>
              {(c) => <Coverage catalogue={c} source={selected.source.code} />}
            </ResourceState>
          </details>
        </Panel>
      )}
    </>
  );
}
function SourceDetails({ source: s }: { source: SourceStatus }) {
  return (
    <>
      <dl>
        <div>
          <dt>Observation freshness</dt>
          <dd>{s.observation_freshness}</dd>
        </div>
        <div>
          <dt>Synchronization health</dt>
          <dd>{s.synchronization_status}</dd>
        </div>
        <div>
          <dt>Latest observation</dt>
          <dd>
            {period(s.latest_observation, s.expected_frequency === "monthly")}
          </dd>
        </div>
        <div>
          <dt>Oldest series’ latest</dt>
          <dd>
            {period(s.oldest_series_latest, s.expected_frequency === "monthly")}
          </dd>
        </div>
        <div>
          <dt>Last successful sync</dt>
          <dd>{timestamp(s.last_success_at)}</dd>
        </div>
        <div>
          <dt>Last attempt</dt>
          <dd>{timestamp(s.last_attempt_at)}</dd>
        </div>
        <div>
          <dt>Artifact publication date</dt>
          <dd>{period(s.latest_artifact_publication_date)}</dd>
        </div>
        <div>
          <dt>Artifact published at</dt>
          <dd>{timestamp(s.latest_artifact_published_at)}</dd>
        </div>
        <div>
          <dt>Source updated at</dt>
          <dd>{timestamp(s.source_updated_at)}</dd>
        </div>
        <div>
          <dt>Availability</dt>
          <dd>
            {s.available
              ? "Some stored observations available"
              : "No stored observations available"}
          </dd>
        </div>
      </dl>
      <details>
        <summary>Freshness policy & methodology</summary>
        <p>{s.freshness_policy}</p>
        <p>{s.source.methodology}</p>
      </details>
      <details>
        <summary>Data quality indicators</summary>
        <dl>
          <div>
            <dt>Missing cells in last successful check</dt>
            <dd>
              {s.quality.missing_cells_in_last_successful_check ??
                "Not reported"}
            </dd>
          </div>
          <div>
            <dt>Revisions in last successful check</dt>
            <dd>
              {s.quality.revised_observations_in_last_successful_check ??
                "Not reported"}
            </dd>
          </div>
        </dl>
        <p>
          {s.quality.warning_or_error_codes.length
            ? s.quality.warning_or_error_codes.join(", ")
            : "No warning/error codes reported."}
        </p>
        {s.quality.sparse_absence_policy && (
          <p>{s.quality.sparse_absence_policy}</p>
        )}
      </details>
      {safeExternal(s.source.official_url) && (
        <a
          className="pc-button"
          href={safeExternal(s.source.official_url)}
          target="_blank"
          rel="noreferrer"
        >
          Open official source ↗
        </a>
      )}
    </>
  );
}
function Coverage({
  catalogue: c,
  source,
}: {
  catalogue: Catalogue;
  source: string;
}) {
  const rows = c.coverage.filter((r) => r.source_code === source);
  return (
    <div className="pc-table-scroll">
      <table>
        <caption>Registered series and actual stored coverage</caption>
        <thead>
          <tr>
            <th>Country / quote</th>
            <th>Category / measurement</th>
            <th>Unit</th>
            <th>First / latest period</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.series_id}>
              <th>
                {c.geographies.find((g) => g.code === r.geography_code)?.name ||
                  r.quote_currency ||
                  r.geography_code}
              </th>
              <td>
                {r.category_code} · {r.measurement_type}
                {r.tax_basis ? " · " + r.tax_basis : ""}
              </td>
              <td>{r.unit_code}</td>
              <td>
                {r.first_period
                  ? `${period(r.first_period)} – ${period(r.latest_period)}`
                  : "No stored observations"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <p>No registered series in this catalogue.</p>}
    </div>
  );
}
