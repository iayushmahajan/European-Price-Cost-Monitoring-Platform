import type { ContextInsight } from "../contracts";
import { displayMeasurement, period } from "../format";
export function ContextInsights({
  insights,
  monthly = false,
  onEvidence,
}: {
  insights: ContextInsight[];
  monthly?: boolean;
  onEvidence: (path: string) => void;
}) {
  return (
    <div className="pc-context-insights">
      {insights.slice(0, 2).map((fact, index) => (
        <section key={index}>
          <h3>{fact.title}</h3>
          {fact.value !== null && fact.unit && (
            <p className="pc-context-value" title={fact.value}>
              {displayMeasurement(fact.value, fact.unit, true)}
            </p>
          )}
          <p>{fact.detail}</p>
          <p className="pc-note">
            {fact.reference_period && fact.reference_period !== fact.period && (
              <>{period(fact.reference_period, monthly)} → </>
            )}
            {period(fact.period, monthly)}
          </p>
          {(fact.estimated || fact.provisional) && (
            <p className="pc-note">
              Includes{" "}
              {[
                fact.estimated && "estimated",
                fact.provisional && "provisional",
              ]
                .filter(Boolean)
                .join(" and ")}{" "}
              observations; the source may revise them.
            </p>
          )}
          <SupportingEvidence fact={fact} onEvidence={onEvidence} />
        </section>
      ))}
    </div>
  );
}

function SupportingEvidence({
  fact,
  onEvidence,
}: {
  fact: ContextInsight;
  onEvidence: (path: string) => void;
}) {
  const links = (
    <div className="pc-context-evidence">
      {fact.evidence_paths.map((path, i) => (
        <button
          key={path}
          className="pc-text-link"
          onClick={() => onEvidence(path)}
        >
          {fact.evidence_paths.length === 1
            ? "Supporting source"
            : fact.evidence_paths.length === 2
              ? fact.kind === "eu_rate_gap"
                ? ["Country evidence", "EU-27 evidence"][i]
                : fact.kind === "fifty_litre_gap"
                  ? [
                      "Reference country evidence",
                      "Comparison country evidence",
                    ][i]
                  : ["Earlier source evidence", "Later source evidence"][i]
              : `Source observation ${i + 1}`}
        </button>
      ))}
    </div>
  );
  return fact.evidence_paths.length > 2 ? (
    <details className="pc-context-sources">
      <summary>Supporting evidence ({fact.evidence_paths.length})</summary>
      {links}
    </details>
  ) : (
    links
  );
}
