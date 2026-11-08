import { useResource } from "../resource";
import { priceCost } from "../api";
import { period, safeExternal, timestamp } from "../format";
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
            {s.synchronization_status}. Last successful sync:{" "}
            {timestamp(s.last_success_at)}.
          </p>
        </div>
      ))}
    </>
  );
}
export function Definition({
  explanation,
  onClose,
}: {
  explanation: Explanation;
  onClose: () => void;
}) {
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
  const resource = useResource("evidence:" + path, (signal) =>
    priceCost.evidence(path, signal),
  );
  return (
    <Panel
      title="Source evidence"
      description="Exact source values, publication information and stored revisions."
      onClose={onClose}
    >
      <ResourceState resource={resource}>
        {(e) => (
          <>
            <h3>{e.source.name}</h3>
            <dl>
              <div>
                <dt>Observation period</dt>
                <dd>{period(e.period, e.domain === "inflation")}</dd>
              </div>
              <div>
                <dt>Observation publication</dt>
                <dd>{period(e.observation_publication_date)}</dd>
              </div>
              <div>
                <dt>Artifact publication</dt>
                <dd>{period(e.artifact.publication_date)}</dd>
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
                <dt>Unit</dt>
                <dd>{e.unit_code}</dd>
              </div>
            </dl>
            <details open>
              <summary>Exact values</summary>
              <pre>{JSON.stringify(e.original_values, null, 2)}</pre>
            </details>
            <details>
              <summary>Methodology & provenance</summary>
              <p>{e.source.methodology}</p>
              <dl>
                <div>
                  <dt>Source series</dt>
                  <dd>{e.source_series_key}</dd>
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
              {e.revisions_has_more && (
                <p>Additional revisions exist beyond this bounded response.</p>
              )}
            </details>
            {safeExternal(e.source.official_url) && (
              <a
                className="pc-button"
                href={safeExternal(e.source.official_url)}
                target="_blank"
                rel="noreferrer"
              >
                Official source ↗
              </a>
            )}
          </>
        )}
      </ResourceState>
    </Panel>
  );
}
