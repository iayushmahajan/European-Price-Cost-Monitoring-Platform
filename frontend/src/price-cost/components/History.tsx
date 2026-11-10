import type { ReactNode } from "react";
import type { ObservationStatus } from "../contracts";
import { useEffect, useRef, useState } from "react";
import type { Domain, Metric, Metrics } from "../api";
import { priceCost, requestError } from "../api";
import { useResource } from "../resource";
import { displayMeasurement, displayUnit, period } from "../format";
import { quoteValue, quoteUnit } from "../quote";
import { metricPoints } from "../chart-data";
import { TrendChart } from "./Charts";
import { ResourceState } from "./Shared";
import { StatusFlags } from "./Evidence";
import EvidencePanel from "./Evidence";
export function History({
  domain,
  params,
  table,
  inverse,
  onView,
  heading = "Historical observations",
  renderStatus,
  description,
  showPeriodRange = true,
  load,
  renderAfter,
  renderBefore,
}: {
  domain: Domain;
  params: Record<string, string>;
  table: boolean;
  inverse: boolean;
  onView: (table: boolean) => void;
  load?: (signal: AbortSignal) => Promise<Metrics>;
  renderAfter?: (items: Metric[], response: Metrics) => ReactNode;
  renderBefore?: (items: Metric[], response: Metrics) => ReactNode;
  heading?: string | ((items: Metric[]) => string);
  description?: string;
  showPeriodRange?: boolean;
  renderStatus?: (status: ObservationStatus) => ReactNode;
}) {
  const key = domain + JSON.stringify(params);
  const r = useResource(key, (signal) =>
    load ? load(signal) : priceCost.metrics(domain, "history", params, signal),
  );
  const toolbar = (items: Metric[]) => (
    <>
      <div className="pc-visual-toolbar">
        <h3>{typeof heading === "function" ? heading(items) : heading}</h3>
        <div role="group" aria-label="Presentation" className="pc-segments">
          <button aria-pressed={!table} onClick={() => onView(false)}>
            Chart
          </button>
          <button aria-pressed={table} onClick={() => onView(true)}>
            Table
          </button>
        </div>
      </div>
      {description && (
        <p className="pc-history-description pc-note">{description}</p>
      )}
    </>
  );
  return (
    <div className={"pc-history" + (renderBefore ? " pc-series-history" : "")}>
      {typeof heading === "string" && !renderBefore && toolbar([])}
      <ResourceState resource={r}>
        {(data) => (
          <HistoryData
            key={key}
            response={data}
            domain={domain}
            params={params}
            table={table}
            inverse={inverse}
            renderStatus={renderStatus}
            renderHeader={
              typeof heading === "function" || renderBefore
                ? toolbar
                : undefined
            }
            showPeriodRange={showPeriodRange}
            renderAfter={renderAfter}
            renderBefore={renderBefore}
          />
        )}
      </ResourceState>
    </div>
  );
}
function HistoryData({
  response,
  domain,
  params,
  table,
  inverse,
  renderStatus,
  renderHeader,
  showPeriodRange,
  renderAfter,
  renderBefore,
}: {
  response: Metrics;
  domain: Domain;
  params: Record<string, string>;
  table: boolean;
  inverse: boolean;
  renderStatus?: (status: ObservationStatus) => ReactNode;
  renderHeader?: (items: Metric[]) => ReactNode;
  showPeriodRange: boolean;
  renderAfter?: (items: Metric[], response: Metrics) => ReactNode;
  renderBefore?: (items: Metric[], response: Metrics) => ReactNode;
}) {
  const [extra, setExtra] = useState<Metric[]>([]),
    [page, setPage] = useState(response.page),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [evidence, setEvidence] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const backwards = params.order === "desc";
  const items = [...response.items, ...extra].sort((a, b) =>
    a.period.localeCompare(b.period),
  );
  async function more() {
    if (
      !page.has_more ||
      !(backwards ? page.previous_end : page.next_start) ||
      busy ||
      items.length >= 2000
    )
      return;
    const next = (backwards ? page.previous_end : page.next_start)!;
    setBusy(true);
    setError("");
    const c = new AbortController();
    controller.current = c;
    try {
      const data = await priceCost.metrics(
        domain,
        "history",
        {
          ...params,
          ...(backwards ? { end: next } : { start: next }),
          limit: String(Math.min(260, 2000 - items.length)),
        },
        c.signal,
      );
      if (c.signal.aborted) return;
      if (
        data.page.has_more &&
        (backwards
          ? !data.page.previous_end || data.page.previous_end >= next
          : !data.page.next_start || data.page.next_start <= next)
      )
        throw new Error("Pagination did not advance");
      setExtra((old) => [
        ...old,
        ...data.items.filter(
          (m) => !items.some((i) => i.observation_id === m.observation_id),
        ),
      ]);
      setPage(data.page);
    } catch (e) {
      if (!c.signal.aborted) setError(requestError(e));
    } finally {
      if (!c.signal.aborted) setBusy(false);
    }
  }
  if (!items.length)
    return (
      <>
        {renderHeader?.(items)}
        <div className="pc-state">
          <p>
            No observations in the selected date range. Missing observations are
            not zero. Try another range.
          </p>
        </div>
        {renderBefore && renderAfter?.([], response)}
      </>
    );
  const unit = quoteUnit(items[0], inverse);
  const points = metricPoints(items, inverse);
  return (
    <>
      {renderBefore?.(items, response)}
      {renderHeader?.(items)}
      {backwards && (
        <p className="pc-note">
          Selected calendar range:{" "}
          {period(params.start, domain === "inflation")} –{" "}
          {period(params.end, domain === "inflation")}. Showing {items.length}{" "}
          available observations,{" "}
          {period(items[0].period, domain === "inflation")} –{" "}
          {period(items.at(-1)!.period, domain === "inflation")}.
          {page.has_more ? " Older observations are available below." : ""}
        </p>
      )}
      {items.some((m) => m.comparison.consecutive === false) && (
        <p className="pc-notice">
          Nonconsecutive observations are separated in the chart. No missing
          values have been interpolated.
        </p>
      )}
      {table ? (
        <div
          className="pc-table-scroll"
          role="region"
          aria-label="Historical observations table"
          tabIndex={0}
        >
          <table>
            <caption>Historical observations · {displayUnit(unit)}</caption>
            <thead>
              <tr>
                <th scope="col">Observation period</th>
                <th scope="col">Value</th>

                <th scope="col">Status & evidence</th>
              </tr>
            </thead>
            <tbody>
              {items.map((m) => (
                <tr key={m.observation_id}>
                  <th scope="row">
                    {period(m.period, m.period_type === "reference_month")}
                  </th>
                  <td title={quoteValue(m, inverse) ?? undefined}>
                    {displayMeasurement(
                      quoteValue(m, inverse),
                      quoteUnit(m, inverse),
                    )}
                  </td>
                  <td>
                    {renderStatus ? (
                      renderStatus(m.status)
                    ) : (
                      <StatusFlags status={m.status} />
                    )}
                    <button
                      className="pc-text-link"
                      onClick={() => setEvidence(m.evidence_path)}
                    >
                      Observation evidence
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <TrendChart
          points={points}
          unit={unit}
          label="Historical trend of actual observations"
          showPeriodRange={showPeriodRange}
        />
      )}
      {renderAfter?.(items, response)}
      {response.missing_selections.length > 0 && (
        <p className="pc-notice">
          Missing selections: {response.missing_selections.join(", ")}.
        </p>
      )}
      {page.has_more && (
        <div className="pc-pagination">
          <p className="pc-note">
            Showing {items.length} observations.{" "}
            {backwards ? "Older history" : "Additional history"} is available
            {items.length >= 2000 ? "; narrow the date range to view more" : ""}
            .
          </p>
          <button
            className="pc-button"
            disabled={busy || items.length >= 2000}
            onClick={() => void more()}
          >
            {busy
              ? "Loading history…"
              : backwards
                ? "Load older observations"
                : "Load more observations"}
          </button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      {evidence && (
        <EvidencePanel path={evidence} onClose={() => setEvidence(null)} />
      )}
    </>
  );
}
