import type { Selection } from "../selection";
import { filters } from "../selection";
import { priceCost, type Metric } from "../api";
import { useResource } from "../resource";
import { ResourceState } from "./Shared";
import { MetricSummary } from "./MetricSummary";
import { SourceWarnings } from "./Evidence";
import { History } from "./History";

function Summary({
  metric,
  selection: s,
}: {
  metric: Metric;
  selection: Selection;
}) {
  if (s.domain === "exchange-rates" && s.comparisonDate)
    return <RequestedReference metric={metric} selection={s} />;
  return (
    <>
      <MetricSummary metric={metric} inverse={s.inverse} />
      {metric.comparison.reference_period &&
        metric.comparison.reference_period < s.start && (
          <p className="pc-note">
            The comparison reference is before the selected calendar range.
          </p>
        )}
    </>
  );
}
function RequestedReference({
  metric,
  selection: s,
}: {
  metric: Metric;
  selection: Selection;
}) {
  const query = {
    ...filters(s),
    as_of: s.end,
    comparison_date: s.comparisonDate,
  };
  const r = useResource(
    "range-reference:" + JSON.stringify(query),
    async (signal) => {
      const d = await priceCost.metrics(s.domain, "latest", query, signal);
      const same = d.items.find(
        (m) =>
          m.observation_id === metric.observation_id &&
          m.period === metric.period,
      );
      if (!same)
        throw new Error(
          "The latest observation changed while loading. Retry to align this range.",
        );
      return same;
    },
  );
  return (
    <ResourceState resource={r}>
      {(m) => (
        <>
          <MetricSummary metric={m} inverse={s.inverse} />
          {m.comparison.reference_period &&
            m.comparison.reference_period < s.start && (
              <p className="pc-note">
                The requested comparison reference is before the selected
                calendar range.
              </p>
            )}
        </>
      )}
    </ResourceState>
  );
}
export function SeriesView({
  selection: s,
  onView,
}: {
  selection: Selection;
  onView: (table: boolean) => void;
}) {
  return (
    <section className="pc-canvas pc-analysis">
      <History
        domain={s.domain}
        params={{
          ...filters(s, true),
          start: s.start,
          end: s.end,
          limit: "260",
          order: "desc",
        }}
        table={s.view === "table"}
        inverse={s.inverse}
        onView={onView}
        renderBefore={(items) => (
          <Summary metric={items.at(-1)!} selection={s} />
        )}
        renderAfter={(_, response) => (
          <SourceWarnings sources={response.sources} />
        )}
      />
    </section>
  );
}
