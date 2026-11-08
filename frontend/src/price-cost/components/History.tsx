import { useEffect, useRef, useState } from "react";
import type { Domain, Metric, Metrics } from "../api";
import { priceCost, requestError } from "../api";
import { useResource } from "../resource";
import { decimal, metricUnit, period } from "../format";
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
}: {
  domain: Domain;
  params: Record<string, string>;
  table: boolean;
  inverse: boolean;
  onView: (table: boolean) => void;
}) {
  const key = domain + JSON.stringify(params);
  const r = useResource(key, (signal) =>
    priceCost.metrics(domain, "history", params, signal),
  );
  return (
    <div className="pc-history">
      <div className="pc-visual-toolbar">
        <h3>Historical observations</h3>
        <div role="group" aria-label="Presentation" className="pc-segments">
          <button aria-pressed={!table} onClick={() => onView(false)}>
            Chart
          </button>
          <button aria-pressed={table} onClick={() => onView(true)}>
            Table
          </button>
        </div>
      </div>
      <ResourceState resource={r}>
        {(data) => (
          <HistoryData
            key={key}
            response={data}
            domain={domain}
            params={params}
            table={table}
            inverse={inverse}
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
}: {
  response: Metrics;
  domain: Domain;
  params: Record<string, string>;
  table: boolean;
  inverse: boolean;
}) {
  const [extra, setExtra] = useState<Metric[]>([]),
    [page, setPage] = useState(response.page),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [evidence, setEvidence] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const items = [...response.items, ...extra];
  async function more() {
    if (!page.has_more || !page.next_start || busy || items.length >= 2000)
      return;
    const next = page.next_start;
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
          start: next,
          limit: String(Math.min(260, 2000 - items.length)),
        },
        c.signal,
      );
      if (c.signal.aborted) return;
      if (
        data.page.has_more &&
        (!data.page.next_start || data.page.next_start <= next)
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
      <div className="pc-state">
        <p>
          No historical observations in this window. Missing observations are
          not zero. Try another range.
        </p>
      </div>
    );
  const unit =
    inverse && items[0].measurement_type === "reference_rate"
      ? items[0].inverse_unit || items[0].unit
      : metricUnit(items[0]);
  const points = metricPoints(items, inverse);
  return (
    <>
      {items.some((m) => m.comparison.consecutive === false) && (
        <p className="pc-notice">
          Nonconsecutive observations are separated in the chart. No missing
          values have been interpolated.
        </p>
      )}
      {table ? (
        <div className="pc-table-scroll">
          <table>
            <caption>Exact historical observations · {unit}</caption>
            <thead>
              <tr>
                <th scope="col">Observation period</th>
                <th scope="col">Value</th>
                {inverse && domain === "exchange-rates" && (
                  <th scope="col">Derived inverse</th>
                )}
                <th scope="col">Status & evidence</th>
              </tr>
            </thead>
            <tbody>
              {items.map((m) => (
                <tr key={m.observation_id}>
                  <th scope="row">
                    {period(m.period, m.period_type === "reference_month")}
                  </th>
                  <td>
                    {m.value} {m.unit}
                  </td>
                  {inverse && m.measurement_type === "reference_rate" && (
                    <td>
                      {decimal(m.inverse_rate)} {m.inverse_unit}
                    </td>
                  )}
                  <td>
                    <StatusFlags status={m.status} />
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
        />
      )}
      {response.missing_selections.length > 0 && (
        <p className="pc-notice">
          Missing selections: {response.missing_selections.join(", ")}.
        </p>
      )}
      {page.has_more && (
        <div className="pc-pagination">
          <p className="pc-note">
            Showing {items.length} observations. Additional history is available
            {items.length >= 2000 ? "; narrow the date range to view more" : ""}
            .
          </p>
          <button
            className="pc-button"
            disabled={busy || items.length >= 2000}
            onClick={() => void more()}
          >
            {busy ? "Loading history…" : "Load more observations"}
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
