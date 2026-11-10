import { useSearchParams, Link } from "react-router-dom";
import { useCatalogue } from "../catalogue-context";
import { priceCost, type Metric } from "../api";
import { useResource } from "../resource";
import {
  parseSelection,
  selectionParams,
  filters,
  shiftMonths,
} from "../selection";
import { metricValue, metricUnit, today } from "../format";
import { useSelectionUpdate } from "../use-selection";
import { CountrySelect, DomainTabs } from "../components/Controls";
import { ResourceState, State, Field } from "../components/Shared";
import {
  OverviewMetric,
  OverviewSourceNotes,
  OverviewStatus,
} from "../components/OverviewMetric";
import {
  overviewLabel,
  overviewPeriod,
  overviewHistoryTitle,
  overviewHistoryDescription,
} from "../overview-presentation";
import "../overview.css";
import { OverviewInflationHistory } from "../components/OverviewInflationHistory";
import { History } from "../components/History";
export default function OverviewPage() {
  const catalogue = useCatalogue();
  const [params] = useSearchParams();
  const initial = parseSelection(params, catalogue);
  const end =
    initial.domain === "inflation" ? today().slice(0, 7) + "-01" : today();
  const s = {
    ...initial,
    country: initial.country === "EU27_2020" ? "DE" : initial.country,
    start: shiftMonths(end, initial.domain === "inflation" ? -12 : -3),
    end,
    tax: "with_tax",
    category: "TOTAL",
    compare: "",
    comparisonDate: "",
    comparisonPeriod: "",
  };
  const update = useSelectionUpdate(s);
  const resource = useResource(
    "overview:" + s.country + ":" + s.currency,
    (signal) =>
      priceCost.overview(
        s.country === "EU27_2020" ? "DE" : s.country,
        s.currency,
        signal,
      ),
  );
  const name =
    catalogue.geographies.find((g) => g.code === s.country)?.name || s.country;
  return (
    <div className="pc-overview-page" data-domain={s.domain}>
      <header className="pc-heading">
        <div>
          <h1>Overview</h1>
          {!params.has("country") && s.domain !== "exchange-rates" && (
            <p className="pc-note">
              Showing {name} by default. Choose another country above.
            </p>
          )}
        </div>
        <div className="pc-heading-actions">
          <CountrySelect
            country={s.country}
            domain={s.domain === "exchange-rates" ? "exchange-rates" : "fuel"}
            onChange={(country) => update({ country })}
          />
          {s.domain === "exchange-rates" && (
            <Field label="EUR quote">
              <select
                value={s.currency}
                onChange={(e) => update({ currency: e.target.value })}
              >
                {catalogue.quote_currencies.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} · {c.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Link
            className="pc-button pc-primary"
            to={"/app/explore?" + selectionParams(s)}
          >
            Investigate in Explore ↗
          </Link>
        </div>
      </header>

      {initial.country === "EU27_2020" && (
        <p className="pc-notice">
          Overview uses a country summary. Open Explore for the EU-27 inflation
          aggregate.
        </p>
      )}
      <DomainTabs domain={s.domain} onChange={(domain) => update({ domain })} />
      <ResourceState resource={resource}>
        {(data) => {
          const primary: Metric | undefined =
            s.domain === "fuel"
              ? data.fuel.items.find((m) => m.product === s.product)
              : s.domain === "inflation"
                ? data.inflation.items.find(
                    (m) => m.measurement_type === s.measurement,
                  )
                : data.exchange_rates.items[0];
          const response =
            s.domain === "fuel"
              ? data.fuel
              : s.domain === "inflation"
                ? data.inflation
                : data.exchange_rates;
          const otherInflation = data.inflation.items.find(
            (m) =>
              m.measurement_type ===
              (s.domain === "inflation" && s.measurement === "annual_rate"
                ? "monthly_rate"
                : "annual_rate"),
          );
          const supporting: Metric[] = [
            data.fuel.items.find(
              (m) =>
                m.product !==
                (primary?.measurement_type === "price"
                  ? primary.product
                  : "automotive_diesel"),
            ),
            otherInflation,
            data.exchange_rates.items[0],
          ].filter(
            (m): m is Metric =>
              m !== undefined &&
              (m.source_code !== primary?.source_code ||
                m.observation_id !== primary?.observation_id),
          );
          return (
            <>
              <section className="pc-canvas pc-analysis pc-overview-canvas">
                {primary ? (
                  <>
                    <div className="pc-overview-analysis">
                      <OverviewMetric metric={primary} />
                      <div className="pc-overview-trend">
                        {primary.period_type === "reference_month" ? (
                          <OverviewInflationHistory
                            metric={primary}
                            table={s.view === "table"}
                            onView={(table) =>
                              update({ view: table ? "table" : "chart" })
                            }
                          />
                        ) : (
                          <History
                            heading={(items) =>
                              overviewHistoryTitle(primary, items)
                            }
                            description={overviewHistoryDescription(primary)}
                            showPeriodRange={false}
                            renderStatus={(status) => (
                              <OverviewStatus status={status} annotation />
                            )}
                            domain={s.domain}
                            params={{
                              ...filters(s, true),
                              start: s.start,
                              end: s.end,
                              limit: "260",
                            }}
                            table={s.view === "table"}
                            inverse={false}
                            onView={(table) =>
                              update({ view: table ? "table" : "chart" })
                            }
                          />
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <State
                    empty={
                      "No observation for the selected indicator. " +
                      response.missing_selections.join(", ")
                    }
                  />
                )}
                <OverviewSourceNotes sources={response.sources} />
              </section>
              {supporting.length > 0 && (
                <section
                  className="pc-overview-supporting"
                  aria-label="Other measurements"
                >
                  <h2>Also worth a look</h2>
                  <div
                    className="pc-reference-rows"
                    aria-label="Other measurements, each with its own reference period"
                  >
                    {supporting.map((m) => (
                      <button
                        key={`${m.source_code}:${m.observation_id}`}
                        onClick={() => {
                          if (m.measurement_type === "price")
                            update({ domain: "fuel", product: m.product });
                          else if (m.measurement_type === "reference_rate")
                            update({
                              domain: "exchange-rates",
                              currency: m.quote_currency,
                            });
                          else
                            update({
                              domain: "inflation",
                              measurement: m.measurement_type,
                            });
                        }}
                      >
                        <span>
                          {overviewLabel(m)}
                          <small>{overviewPeriod(m)}</small>
                          <small className="pc-overview-support-flags">
                            <OverviewStatus status={m.status} />
                            {m.observation_freshness === "stale" && (
                              <span>Older than expected</span>
                            )}
                          </small>
                        </span>
                        <strong>
                          {metricValue(m)}
                          {m.unit !== "percent" && (
                            <small>{metricUnit(m)}</small>
                          )}
                        </strong>
                        <span aria-hidden="true">↗</span>
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </>
          );
        }}
      </ResourceState>
    </div>
  );
}
