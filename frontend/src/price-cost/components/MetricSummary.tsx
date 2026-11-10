import {
  quoteValue,
  quoteUnit,
  quoteChange,
  quoteLabel,
  isInverse,
} from "../quote";
import { useState } from "react";
import { Info } from "lucide-react";
import type { Metric } from "../api";
import {
  changeText,
  displayNumber,
  displayMeasurement,
  metricUnit,
  metricValue,
  period,
} from "../format";
import { Definition, StatusFlags } from "./Evidence";
import EvidencePanel from "./Evidence";
export function MetricSummary({
  metric,
  inverse = false,
}: {
  metric: Metric;
  inverse?: boolean;
}) {
  const [panel, setPanel] = useState<"definition" | "evidence" | null>(null);
  const fx = metric.measurement_type === "reference_rate";
  const c = quoteChange(metric, inverse);
  return (
    <>
      <div className="pc-metric">
        <div className="pc-metric-header">
          <h2>{quoteLabel(metric, inverse)}</h2>
          <span>
            {period(metric.period, metric.period_type === "reference_month")}
          </span>
        </div>
        <p className="pc-note">
          {metric.measurement_type === "price"
            ? metric.tax_basis === "with_tax"
              ? "Including taxes"
              : "Excluding taxes"
            : metric.measurement_type !== "reference_rate"
              ? metric.category.name
              : null}
        </p>
        <div className="pc-value">
          {fx
            ? displayNumber(
                quoteValue(metric, inverse),
                quoteUnit(metric, inverse),
              )
            : metricValue(metric)}
          <span>{fx ? quoteUnit(metric, inverse) : metricUnit(metric)}</span>
        </div>
        {fx && (
          <p className="pc-note">
            {isInverse(metric, inverse)
              ? "Derived reciprocal of the ECB EUR reference rate."
              : "Official ECB EUR reference rate."}{" "}
            Reference rate, not a transaction quote.
          </p>
        )}
        <p className="pc-change">
          {fx
            ? c?.available && c.absolute_change !== null
              ? `${displayMeasurement(c.absolute_change, quoteUnit(metric, inverse), true)} vs ${period(c.reference_period)}`
              : "Comparison unavailable for this quote direction"
            : changeText(metric)}
        </p>
        <StatusFlags status={metric.status} />
        {metric.observation_freshness === "stale" && (
          <span className="pc-status">Potentially stale observation</span>
        )}
        {c?.consecutive === false && (
          <p className="pc-notice">
            Irregular comparison interval: {c?.elapsed_days} days. This is not
            an ordinary consecutive-period change.
          </p>
        )}
        <div className="pc-metric-actions">
          <button
            className="pc-text-link"
            onClick={() => setPanel("definition")}
          >
            <Info />
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
      </div>
      {panel === "definition" && (
        <Definition
          metric={metric}
          inverse={inverse}
          explanation={metric.explanation}
          onClose={() => setPanel(null)}
        />
      )}{" "}
      {panel === "evidence" && (
        <EvidencePanel
          path={metric.evidence_path}
          onClose={() => setPanel(null)}
        />
      )}
    </>
  );
}
