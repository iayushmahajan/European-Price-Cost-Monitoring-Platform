import { quoteLabel, quoteUnit } from "../quote";
import { useState } from "react";
import { priceCost, type Metric, type Domain } from "../api";
import { useResource } from "../resource";
import { displayUnit, period } from "../format";
import { Panel, ResourceState } from "./Shared";
import EvidencePanel, { StatusFlags } from "./Evidence";
import { ContextInsights } from "./ContextInsights";
import "../insights.css";
export function MeasurementInsightPanel({
  metric: m,
  inverse = false,
  onClose,
}: {
  metric: Metric;
  inverse?: boolean;
  onClose: () => void;
}) {
  const domain: Domain =
    m.measurement_type === "price"
      ? "fuel"
      : m.measurement_type === "reference_rate"
        ? "exchange-rates"
        : "inflation";
  const requested =
    domain === "exchange-rates" ? m.comparison.requested_period : null;
  const r = useResource(
    `insights:${domain}:${m.observation_id}:${inverse}:${requested}`,
    (signal) =>
      priceCost.insights(
        domain,
        m.observation_id,
        signal,
        inverse,
        requested || undefined,
      ),
  );
  const [evidence, setEvidence] = useState<string | null>(null);
  return (
    <Panel
      title="Read this number"
      description="Context from recorded observations."
      className="pc-insight-panel"
      onClose={onClose}
    >
      <ResourceState resource={r}>
        {(d) => (
          <div className="pc-measurement-insights">
            <header className="pc-insight-identity">
              {d.metric.measurement_type !== "reference_rate" && (
                <p>{d.metric.geography.name}</p>
              )}
              <h3>{quoteLabel(d.metric, inverse)}</h3>
              <p className="pc-note">
                {d.metric.measurement_type === "price"
                  ? d.metric.tax_basis === "with_tax"
                    ? "Including taxes · "
                    : "Excluding taxes · "
                  : d.metric.measurement_type !== "reference_rate"
                    ? `${d.metric.category.name} · `
                    : ""}
                {displayUnit(quoteUnit(d.metric, inverse))} ·{" "}
                {period(d.metric.period, domain === "inflation")}
              </p>
              <StatusFlags status={d.metric.status} />
            </header>
            <p>{d.meaning}</p>
            <ContextInsights
              insights={d.insights}
              monthly={domain === "inflation"}
              onEvidence={setEvidence}
            />
            <p className="pc-note pc-insight-limitation">{d.limitation}</p>
            <button
              className="pc-text-link"
              onClick={() => setEvidence(m.evidence_path)}
            >
              Inspect source evidence ↗
            </button>
          </div>
        )}
      </ResourceState>
      {evidence && (
        <EvidencePanel path={evidence} onClose={() => setEvidence(null)} />
      )}
    </Panel>
  );
}
