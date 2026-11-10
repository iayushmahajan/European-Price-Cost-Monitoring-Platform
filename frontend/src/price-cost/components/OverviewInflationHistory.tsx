import { useState } from "react";
import type { InflationMetric, InflationResponse } from "../contracts";
import { priceCost } from "../api";
import { useCatalogue } from "../catalogue-context";
import { useResource } from "../resource";
import { latestInflationObservations } from "../inflation-history";
import {
  overviewHistoryTitle,
  overviewHistoryDescription,
} from "../overview-presentation";
import { displayNumber, period } from "../format";
import { shiftMonths } from "../selection";
import { History } from "./History";
import { OverviewStatus } from "./OverviewMetric";
import { ResourceState } from "./Shared";
import EvidencePanel from "./Evidence";

export function OverviewInflationHistory({
  metric,
  table,
  onView,
}: {
  metric: InflationMetric;
  table: boolean;
  onView: (table: boolean) => void;
}) {
  const catalogue = useCatalogue();
  const coverage = catalogue.coverage.find(
    (c) => c.series_id === metric.series_id,
  );
  return (
    <History
      domain="inflation"
      params={{
        country: metric.geography.code,
        category: metric.category.code,
        measurement: metric.measurement_type,
        start: coverage?.first_period || shiftMonths(metric.period, -120),
        end: metric.period,
        limit: "12",
      }}
      load={(signal) =>
        latestInflationObservations(
          metric,
          coverage?.first_period || null,
          signal,
        )
      }
      heading={(items) => overviewHistoryTitle(metric, items)}
      description={overviewHistoryDescription(metric)}
      showPeriodRange={false}
      renderStatus={(status) => <OverviewStatus status={status} annotation />}
      table={table}
      inverse={false}
      onView={onView}
      renderAfter={(items) => (
        <div className="pc-overview-history-context">
          <p className="pc-note pc-inflation-count">
            {items.length === 12
              ? "Latest 12 available monthly observations."
              : `${items.length} monthly observations available in this view.`}{" "}
            Missing months are not filled. Open Explore for more history.
          </p>
          {metric.measurement_type === "annual_rate" && items.length > 0 && (
            <IndexComparison
              metric={metric}
              items={items as InflationMetric[]}
            />
          )}
        </div>
      )}
    />
  );
}
function IndexComparison({
  metric,
  items,
}: {
  metric: InflationMetric;
  items: InflationMetric[];
}) {
  const [opened, setOpened] = useState(false);
  return (
    <details
      className="pc-index-comparison"
      onToggle={(event) => {
        if (event.currentTarget.open) setOpened(true);
      }}
    >
      <summary>Inspect matching HICP index months</summary>
      {opened && <IndexComparisonData metric={metric} items={items} />}
    </details>
  );
}
function IndexComparisonData({
  metric,
  items,
}: {
  metric: InflationMetric;
  items: InflationMetric[];
}) {
  const years = [
    ...new Set(items.map((m) => Number(m.period.slice(0, 4)))),
  ].sort((a, b) => b - a);
  const [year, setYear] = useState(years[0]);
  const [evidence, setEvidence] = useState<string | null>(null);
  const start = shiftMonths(items[0].period, -12),
    end = items.at(-1)!.period;
  const resource = useResource(
    `index-pairs:${metric.series_id}:${start}:${end}`,
    (signal) =>
      priceCost.metrics(
        "inflation",
        "history",
        {
          country: metric.geography.code,
          category: metric.category.code,
          measurement: "index",
          start,
          end,
          limit: "2000",
        },
        signal,
      ) as Promise<InflationResponse>,
  );
  return (
    <div className="pc-index-comparison-content">
      <p className="pc-note">
        Published index levels for the same country, category and base year. The
        annual inflation rate is published separately; no rate is recalculated
        here.
      </p>
      {years.length > 1 && (
        <label className="pc-field">
          Index comparison year
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y} compared with {y - 1}
              </option>
            ))}
          </select>
        </label>
      )}
      <ResourceState resource={resource}>
        {(data) => {
          const points = new Map(
            data.items
              .filter(
                (m) =>
                  m.measurement_type === "index" &&
                  m.geography.code === metric.geography.code &&
                  m.category.code === metric.category.code,
              )
              .map((m) => [m.period, m]),
          );
          const rows = items
            .filter((m) => Number(m.period.slice(0, 4)) === year)
            .map((m) => ({
              period: m.period,
              current: points.get(m.period),
              previous: points.get(shiftMonths(m.period, -12)),
            }));
          const bases = new Set(
            rows
              .flatMap((r) => [
                r.current?.index_base_year,
                r.previous?.index_base_year,
              ])
              .filter((b) => b != null),
          );
          const compatible = bases.size === 1;
          return (
            <>
              <p className="pc-note">
                HICP index points
                {compatible
                  ? ` · ${[...bases][0]} = 100`
                  : " · a common index base is unavailable"}
                . These are not basket costs in euros.
              </p>
              {rows.some((r) => !r.current || !r.previous) && (
                <p className="pc-notice">
                  Some matching index months are not available. The published
                  annual rate is shown independently of missing supporting index
                  observations.
                </p>
              )}
              <div
                className="pc-table-scroll"
                role="region"
                aria-label="Matching HICP index months"
                tabIndex={0}
              >
                <table>
                  <caption>
                    Same calendar months in {year - 1} and {year} · index points
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Month</th>
                      <th scope="col">{year - 1} index</th>
                      <th scope="col">{year} index</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.period}>
                        <th scope="row">
                          {new Intl.DateTimeFormat("en-GB", {
                            month: "long",
                            timeZone: "UTC",
                          }).format(new Date(row.period + "T12:00:00Z"))}
                        </th>
                        {[row.previous, row.current].map((point, i) => (
                          <td key={i}>
                            {point &&
                            compatible &&
                            point.index_base_year === [...bases][0] ? (
                              <button
                                className="pc-text-link"
                                title={point.value}
                                aria-label={`Inspect ${period(point.period, true)} index evidence`}
                                onClick={() => setEvidence(point.evidence_path)}
                              >
                                {displayNumber(point.value, point.unit)}
                                <OverviewStatus status={point.status} />
                              </button>
                            ) : (
                              <span className="pc-note">Not available</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          );
        }}
      </ResourceState>
      {evidence && (
        <EvidencePanel path={evidence} onClose={() => setEvidence(null)} />
      )}
    </div>
  );
}
