import { MeasurementInsightPanel } from "./MeasurementInsights";
import type { Metric } from "../api";
import { useContext } from "react";
import { CatalogueContext } from "../catalogue-context";
import { evidencePresentation } from "../evidence-presentation";
import "../evidence.css";
import { useResource } from "../resource";
import { priceCost } from "../api";
import {
  period,
  safeExternal,
  timestamp,
  synchronizationLabel,
} from "../format";
import type {
  Explanation,
  ObservationStatus,
  SourceStatus,
} from "../contracts";
import { Panel, ResourceState } from "./Shared";
export function StatusFlags({ status }: { status: ObservationStatus }) {
  return (
    <>
      {status.estimated && <span className="pc-status">Estimated</span>}
      {status.provisional && <span className="pc-status">Provisional</span>}
      {status.source_status && (
        <span className="pc-status">Source status: {status.source_status}</span>
      )}
    </>
  );
}
export function SourceWarnings({ sources }: { sources: SourceStatus[] }) {
  const warnings = sources.filter(
    (s) =>
      s.observation_freshness !== "current" ||
      s.synchronization_status !== "current",
  );
  return (
    <>
      {warnings.map((s) => (
        <div className="pc-notice" key={s.source.code}>
          <p>
            <strong>{s.source.name}</strong> · Observation freshness:{" "}
            {s.observation_freshness}. Synchronization:{" "}
            {synchronizationLabel(s)}. Last successful sync:{" "}
            {timestamp(s.last_success_at)}.
          </p>
        </div>
      ))}
    </>
  );
}
export function Definition({
  explanation,
  metric,
  inverse = false,
  onClose,
}: {
  explanation: Explanation;
  metric?: Metric;
  inverse?: boolean;
  onClose: () => void;
}) {
  if (metric)
    return (
      <MeasurementInsightPanel
        metric={metric}
        inverse={inverse}
        onClose={onClose}
      />
    );
  return (
    <Panel
      title="Read this measurement"
      description="Deterministic interpretation from the verified observations."
      onClose={onClose}
    >
      <h3>What changed</h3>
      <p>{explanation.what_changed}</p>
      <h3>What it means</h3>
      <p>{explanation.what_it_means}</p>
      <h3>Why it might matter</h3>
      <p>{explanation.why_it_might_matter}</p>
      {explanation.limitations.map((l, i) => (
        <p className="pc-note" key={i}>
          {l}
        </p>
      ))}
    </Panel>
  );
}
export default function EvidencePanel({
  path,
  onClose,
}: {
  path: string;
  onClose: () => void;
}) {
  const catalogue = useContext(CatalogueContext);
  const resource = useResource("evidence:" + path, (signal) =>
    priceCost.evidence(path, signal),
  );
  return (
    <Panel
      title="Source evidence"
      description="Official observation and its source record."
      className="pc-evidence-panel"
      onClose={onClose}
    >
      <ResourceState resource={resource}>
        {(e) => {
          const view = evidencePresentation(e, catalogue);
          return (
            <div className="pc-evidence-content">
              <header className="pc-evidence-summary">
                <p className="pc-evidence-source">{view.source}</p>
                <h3>{view.measurement}</h3>
                {view.context && (
                  <p className="pc-evidence-context">{view.context}</p>
                )}
                <p className="pc-evidence-period">
                  {e.domain === "fuel"
                    ? "Week of "
                    : e.domain === "exchange-rates"
                      ? "Reference date · "
                      : ""}
                  {period(e.period, e.domain === "inflation")}
                </p>
                <p
                  className="pc-evidence-value"
                  title={String(view.exact ?? "")}
                >
                  {view.value}
                </p>
                <p className="pc-evidence-status">
                  <strong>{view.statusLabel}</strong>
                  <span>{view.statusMeaning}</span>
                </p>
              </header>
              <div className="pc-evidence-disclosures">
                <details>
                  <summary>Exact values</summary>
                  <p>
                    Original stored values and source flags, without display
                    rounding.
                  </p>
                  <pre>{JSON.stringify(e.original_values, null, 2)}</pre>
                </details>
                <details>
                  <summary>Methodology & provenance</summary>
                  <p>{e.source.methodology}</p>
                  <dl>
                    <div>
                      <dt>Observation publication date</dt>
                      <dd>
                        {e.observation_publication_date
                          ? period(e.observation_publication_date)
                          : "Not available in this record"}
                      </dd>
                    </div>
                    <div>
                      <dt>Artifact publication date</dt>
                      <dd>
                        {e.artifact.publication_date
                          ? period(e.artifact.publication_date)
                          : "Not available in this record"}
                      </dd>
                    </div>
                    <div>
                      <dt>Artifact publication timestamp</dt>
                      <dd>{timestamp(e.artifact.published_at)}</dd>
                    </div>
                    <div>
                      <dt>Source updated</dt>
                      <dd>{timestamp(e.artifact.source_updated_at)}</dd>
                    </div>
                    <div>
                      <dt>Retrieved</dt>
                      <dd>{timestamp(e.artifact.retrieved_at)}</dd>
                    </div>
                    <div>
                      <dt>Imported</dt>
                      <dd>{timestamp(e.imported_at)}</dd>
                    </div>
                    <div>
                      <dt>Source catalogue entry</dt>
                      <dd>{e.source.name}</dd>
                    </div>
                    <div>
                      <dt>Dataset / series</dt>
                      <dd>{e.source_series_key}</dd>
                    </div>
                    <div>
                      <dt>Stored unit code</dt>
                      <dd>{e.unit_code}</dd>
                    </div>
                    <div>
                      <dt>Artifact hash</dt>
                      <dd>{e.artifact.sha256}</dd>
                    </div>
                    <div>
                      <dt>Ingestion run</dt>
                      <dd>{e.ingestion_run_id}</dd>
                    </div>
                  </dl>
                  {safeExternal(e.artifact.url) && (
                    <a
                      href={safeExternal(e.artifact.url)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Original source artifact ↗
                    </a>
                  )}
                  {e.domain === "inflation" && (
                    <p>
                      <a
                        href="https://ec.europa.eu/eurostat/web/user-guides/data-browser/data-selection-display/tables"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Eurostat status definitions ↗
                      </a>
                    </p>
                  )}
                </details>
                <details>
                  <summary>
                    Revisions ({e.revisions.length}
                    {e.revisions_has_more ? "+" : ""})
                  </summary>
                  {!e.revisions.length && (
                    <p>No stored revisions for this observation.</p>
                  )}
                  {e.revisions.map((r, i) => (
                    <div key={i}>
                      <p>Detected {timestamp(r.detected_at)}</p>
                      <pre>
                        {JSON.stringify(
                          { previous: r.previous, replacement: r.replacement },
                          null,
                          2,
                        )}
                      </pre>
                    </div>
                  ))}
                  {e.revision_artifacts.length > 0 && (
                    <details>
                      <summary>Revision artifact records</summary>
                      <pre>{JSON.stringify(e.revision_artifacts, null, 2)}</pre>
                    </details>
                  )}
                  {e.revisions_has_more && (
                    <p>
                      Additional revisions exist beyond this bounded response.
                    </p>
                  )}
                </details>
              </div>
              {safeExternal(e.source.official_url) && (
                <a
                  className="pc-button pc-evidence-official"
                  href={safeExternal(e.source.official_url)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Official source ↗
                </a>
              )}
            </div>
          );
        }}
      </ResourceState>
    </Panel>
  );
}
