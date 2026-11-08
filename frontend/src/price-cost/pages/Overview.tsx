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
import { metricValue, metricUnit, period, today } from "../format";
import { useSelectionUpdate } from "../use-selection";
import { CountrySelect, DomainTabs } from "../components/Controls";
import { ResourceState, State, Field } from "../components/Shared";
import { MetricSummary } from "../components/MetricSummary";
import { SourceWarnings } from "../components/Evidence";
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
    start: shiftMonths(end, -3),
    end,
    tax: "with_tax",
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
    <>
      <header className="pc-heading">
        <div>
          <span className="pc-kicker">Overview</span>
          <h1>
            {s.domain === "exchange-rates"
              ? "The euro, in focus."
              : `Prices in ${name}.`}
          </h1>
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
      {!params.has("country") && s.domain !== "exchange-rates" && (
        <p className="pc-note">
          Application default: {name}. Choose your country above.
        </p>
      )}
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
              m !== undefined && m.observation_id !== primary?.observation_id,
          );
          return (
            <>
              <section className="pc-canvas pc-analysis pc-overview-canvas">
                <SourceWarnings sources={response.sources} />
                {primary ? (
                  <>
                    <MetricSummary metric={primary} />
                    <History
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
                  </>
                ) : (
                  <State
                    empty={
                      "No observation for the selected indicator. " +
                      response.missing_selections.join(", ")
                    }
                  />
                )}
              </section>
              <div
                className="pc-reference-rows"
                aria-label="Other measurements, each with its own reference period"
              >
                {supporting.map((m) => (
                  <button
                    key={m.observation_id}
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
                      {m.indicator_name}
                      <small>
                        {period(m.period, m.period_type === "reference_month")}
                      </small>
                    </span>
                    <strong>
                      {metricValue(m)}
                      <small>{metricUnit(m)}</small>
                    </strong>
                    <span aria-hidden="true">↗</span>
                  </button>
                ))}
              </div>
            </>
          );
        }}
      </ResourceState>
    </>
  );
}
