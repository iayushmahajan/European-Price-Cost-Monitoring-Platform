/** Overview presentation only; every value and comparison comes from the API. */
import { useId, useState } from "react";
import { ChevronDown, Info } from "lucide-react";
import { Link } from "react-router-dom";
import type { Metric } from "../api";
import type { ObservationStatus, SourceStatus } from "../contracts";
import {
  displayMeasurement,
  displayNumber,
  metricValue,
  metricUnit,
  period,
  timestamp,
} from "../format";
import { overviewLabel, overviewPeriod } from "../overview-presentation";
import EvidencePanel, { Definition } from "./Evidence";

export function OverviewStatus({
  status,
  annotation = false,
}: {
  status: ObservationStatus;
  annotation?: boolean;
}) {
  return (
    <>
      {status.estimated && <span>Estimated</span>}
      {status.provisional && <span>Provisional</span>}
      {annotation &&
        status.source_status &&
        !status.estimated &&
        !status.provisional && <span>Source annotation</span>}
    </>
  );
}
export function OverviewMetric({ metric: m }: { metric: Metric }) {
  const [panel, setPanel] = useState<"definition" | "evidence" | null>(null);
  const c = m.comparison;
  const monthly = m.period_type === "reference_month";
  const unit =
    c.absolute_change_unit === "quote_currency_units_per_EUR"
      ? m.unit
      : c.absolute_change_unit || m.unit;
  const description =
    m.measurement_type === "price"
      ? `${m.geography.name} · ${m.tax_basis === "with_tax" ? "Including taxes" : "Excluding taxes"}`
      : m.measurement_type === "reference_rate"
        ? "ECB reference rate · 1 EUR"
        : `${m.geography.name} · ${m.category.name}`;
  return (
    <div className="pc-overview-metric">
      <p className="pc-overview-period">{overviewPeriod(m)}</p>
      <h2>{overviewLabel(m)}</h2>
      <p className="pc-note">{description}</p>
      <div className="pc-value" title={m.value}>
        {metricValue(m)}
        {m.unit !== "percent" && <span>{metricUnit(m)}</span>}
      </div>
      {m.measurement_type === "reference_rate" && (
        <p className="pc-overview-meaning">
          1 EUR ≈ {displayNumber(m.value, m.unit)} {m.quote_currency}. Reference
          rates are not transaction quotes.
        </p>
      )}
      <div className="pc-overview-flags">
        <OverviewStatus status={m.status} />
        {m.observation_freshness === "stale" && (
          <span>Older than expected</span>
        )}
        {m.status.source_status &&
          !m.status.estimated &&
          !m.status.provisional && <span>Source annotation in evidence</span>}
      </div>
      <div className="pc-overview-change">
        {c.available && c.absolute_change !== null && c.reference_period ? (
          <>
            <span>
              {c.consecutive === false
                ? "Earlier available observation"
                : c.basis === "on_or_before_requested_date"
                  ? "Reference observation"
                  : m.period_type === "reference_week"
                    ? "Previous available week"
                    : monthly
                      ? "Previous available month"
                      : "Previous available reference date"}
            </span>
            <p className="pc-change">
              {displayMeasurement(c.absolute_change, unit, true)}
            </p>
            <span>Compared with {period(c.reference_period, monthly)}</span>
            <div className="pc-overview-reference-meta">
              {c.reference_value !== null && (
                <span className="pc-overview-reference-value">
                  Reference value:{" "}
                  {displayMeasurement(c.reference_value, m.unit)}
                </span>
              )}
              {c.relative_change_percent !== null &&
                m.measurement_type !== "annual_rate" &&
                m.measurement_type !== "monthly_rate" && (
                  <span>
                    {displayMeasurement(
                      c.relative_change_percent,
                      "percent",
                      true,
                    )}{" "}
                    relative change
                  </span>
                )}
            </div>
            {c.consecutive === false && (
              <p className="pc-notice">
                Nonconsecutive observations
                {c.elapsed_days !== null
                  ? ` · ${c.elapsed_days} days apart`
                  : ""}
                .
              </p>
            )}
            {(c.reference_status?.estimated ||
              c.reference_status?.provisional) && (
              <span>
                Reference: <OverviewStatus status={c.reference_status} />
              </span>
            )}
          </>
        ) : (
          <p className="pc-note">
            {c.unavailable_reason ||
              "No comparable earlier observation is available."}
          </p>
        )}
      </div>
      <div className="pc-metric-actions">
        <button className="pc-text-link" onClick={() => setPanel("definition")}>
          <Info aria-hidden="true" />
          Read this number
        </button>
        <button
          className="pc-text-link"
          aria-label="Inspect source evidence"
          onClick={() => setPanel("evidence")}
        >
          Source evidence ↗
        </button>
      </div>
      {panel === "definition" && (
        <Definition
          metric={m}
          explanation={m.explanation}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === "evidence" && (
        <EvidencePanel path={m.evidence_path} onClose={() => setPanel(null)} />
      )}
    </div>
  );
}
export function OverviewSourceNotes({ sources }: { sources: SourceStatus[] }) {
  return (
    <div className="pc-overview-sources">
      {sources.map((source) => (
        <OverviewSourceNote key={source.source.code} source={source} />
      ))}
    </div>
  );
}
function OverviewSourceNote({ source: s }: { source: SourceStatus }) {
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  const warnings = [
    s.observation_freshness === "stale" &&
      "Latest observations may be older than expected.",
    s.observation_freshness === "unavailable" &&
      "No observations are available for some monitored coverage.",
    s.synchronization_status === "failed" &&
      "The latest source check failed. Any displayed observations retain their original dates.",
    s.synchronization_status === "never_run" &&
      "This source has not been synchronized yet.",
    s.synchronization_status === "stale" &&
      s.observation_freshness === "current" &&
      "Some registered series have older observations.",
  ].filter(Boolean);
  return (
    <div className="pc-overview-source">
      <div
        className={
          "pc-overview-source-row" +
          (warnings.length ? " pc-overview-source-row--warning" : "")
        }
      >
        <p className="pc-overview-attribution">{s.source.name}</p>
        {warnings.length > 0 && (
          <p className="pc-notice">{warnings.join(" ")}</p>
        )}
        <button
          type="button"
          className="pc-overview-source-toggle"
          aria-expanded={open}
          aria-controls={detailsId}
          onClick={() => setOpen((value) => !value)}
        >
          <ChevronDown aria-hidden="true" />
          <span>Source dates & checks</span>
        </button>
      </div>
      <div
        id={detailsId}
        hidden={!open}
        className="pc-overview-source-details"
        role="region"
        aria-label={`Source dates & checks for ${s.source.name}`}
      >
        <dl>
          <div>
            <dt>Last successful source check</dt>
            <dd>{timestamp(s.last_success_at)}</dd>
          </div>
          <div>
            <dt>Latest check attempted</dt>
            <dd>{timestamp(s.last_attempt_at)}</dd>
          </div>
          <div>
            <dt>Latest source publication date</dt>
            <dd>{period(s.latest_artifact_publication_date)}</dd>
          </div>
        </dl>
        <Link to="/app/sources">Coverage & methodology ↗</Link>
      </div>
    </div>
  );
}
