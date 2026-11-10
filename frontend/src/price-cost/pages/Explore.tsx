import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useCatalogue } from "../catalogue-context";
import { parseSelection, shiftMonths } from "../selection";
import { today, period } from "../format";
import "../explore.css";
import { useSelectionUpdate } from "../use-selection";
import { CountrySelect, DomainTabs } from "../components/Controls";
import { Field, Panel, State } from "../components/Shared";
import { SeriesView } from "../components/SeriesView";
import { CountryComparison } from "../components/CountryComparison";
export default function ExplorePage() {
  const c = useCatalogue();
  const [params] = useSearchParams();
  const s = parseSelection(params, c);
  const update = useSelectionUpdate(s);
  const [compareOpen, setCompareOpen] = useState(false),
    [peer, setPeer] = useState("");
  const geo =
    c.geographies.find((g) => g.code === s.country)?.name || s.country;
  const compareName =
    c.geographies.find((g) => g.code === s.compare)?.name || s.compare;
  const noCompare =
    s.domain === "exchange-rates" ||
    (s.domain === "inflation" && s.measurement === "index");
  const presetEnd =
    s.domain === "inflation" ? today().slice(0, 7) + "-01" : today();
  const activePreset = [3, 12, 60].find(
    (months) =>
      s.end === presetEnd && s.start === shiftMonths(presetEnd, -months),
  );
  function preset(months: number) {
    const end =
      s.domain === "inflation" ? today().slice(0, 7) + "-01" : today();
    update({ end, start: shiftMonths(end, -months) });
  }
  return (
    <div className="pc-explore-page">
      <header className="pc-heading">
        <div>
          <h1>Explore</h1>
        </div>
        <div className="pc-heading-actions">
          {!noCompare && (
            <button
              className="pc-button pc-primary"
              onClick={() => {
                setPeer(
                  s.compare ||
                    c.geographies.find(
                      (g) =>
                        g.code !== s.country &&
                        (s.domain !== "fuel" || g.code !== "EU27_2020"),
                    )?.code ||
                    "",
                );
                setCompareOpen(true);
              }}
            >
              Compare countries
            </button>
          )}
        </div>
      </header>
      <DomainTabs domain={s.domain} onChange={(domain) => update({ domain })} />
      <div className="pc-filters" role="group" aria-label="Series selection">
        <CountrySelect
          country={s.country}
          domain={s.domain}
          onChange={(country) => update({ country })}
        />
        {s.domain === "fuel" ? (
          <>
            <Field label="Fuel product">
              <select
                value={s.product}
                onChange={(e) => update({ product: e.target.value })}
              >
                {c.fuel_products.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Tax basis">
              <select
                value={s.tax}
                onChange={(e) => update({ tax: e.target.value })}
              >
                <option value="with_tax">Including taxes</option>
                <option value="without_tax">Excluding taxes</option>
              </select>
            </Field>
          </>
        ) : s.domain === "inflation" ? (
          <>
            <Field label="Measurement">
              <select
                value={s.measurement}
                onChange={(e) => update({ measurement: e.target.value })}
              >
                {c.inflation_measurements.map((m) => (
                  <option key={m.code} value={m.code}>
                    {m.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Consumer category">
              <select
                value={s.category}
                onChange={(e) => update({ category: e.target.value })}
              >
                {c.inflation_categories.map((cat) => (
                  <option key={cat.code} value={cat.code}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </Field>
          </>
        ) : (
          <>
            <Field label="EUR quote currency">
              <select
                value={s.currency}
                onChange={(e) => update({ currency: e.target.value })}
              >
                {c.quote_currencies.map((cur) => (
                  <option key={cur.code} value={cur.code}>
                    {cur.code} · {cur.name}
                  </option>
                ))}
              </select>
            </Field>
            <label className="pc-checkbox">
              <input
                type="checkbox"
                checked={s.inverse}
                onChange={(e) => update({ inverse: e.target.checked })}
              />
              Show derived inverse
            </label>
            <details
              className="pc-explore-advanced"
              open={s.comparisonDate ? true : undefined}
            >
              <summary>Rate comparison date</summary>
              <Field label="Optional comparison on/before">
                <input
                  type="date"
                  value={s.comparisonDate}
                  max={s.end}
                  onChange={(e) => update({ comparisonDate: e.target.value })}
                />
              </Field>
            </details>
          </>
        )}
        {s.compare && (
          <button
            className="pc-button"
            onClick={() => update({ compare: "", comparisonPeriod: "" })}
          >
            Remove {compareName} comparison
          </button>
        )}
      </div>
      <div className="pc-explore-periods">
        {s.compare ? (
          <>
            <p className="pc-note">
              Comparing {geo} and {compareName}
              {s.comparisonPeriod
                ? " at the selected reference period."
                : " at the latest shared reference period."}
            </p>
            <details
              className="pc-explore-custom"
              open={s.comparisonPeriod ? true : undefined}
            >
              <summary>Choose comparison period</summary>
              <div className="pc-date-controls">
                <Field
                  label={
                    s.domain === "inflation"
                      ? "Exact reference month (first day), optional"
                      : "Exact reference week, optional"
                  }
                >
                  <input
                    type="date"
                    value={s.comparisonPeriod}
                    max={s.end}
                    onChange={(e) =>
                      update({ comparisonPeriod: e.target.value })
                    }
                  />
                </Field>
                <p className="pc-note">
                  Without a period, the backend selects the latest exact shared
                  period within 400 days.
                </p>
              </div>
            </details>
          </>
        ) : (
          <>
            <div className="pc-presets" role="group" aria-label="Date presets">
              {[
                [3, "3 months"],
                [12, "1 year"],
                [60, "5 years"],
              ].map(([months, label]) => (
                <button
                  className="pc-button"
                  aria-pressed={activePreset === months}
                  key={label}
                  onClick={() => preset(Number(months))}
                >
                  {label}
                </button>
              ))}
            </div>
            <details
              className="pc-explore-custom"
              open={!activePreset || s.error ? true : undefined}
            >
              <summary>
                Custom range
                {!activePreset && (
                  <span>
                    {period(s.start, s.domain === "inflation")} –{" "}
                    {period(s.end, s.domain === "inflation")}
                  </span>
                )}
              </summary>
              <div className="pc-date-controls">
                <Field
                  label={
                    s.domain === "inflation"
                      ? "Start month (first day)"
                      : "Start date"
                  }
                >
                  <input
                    type="date"
                    value={s.start}
                    max={s.end}
                    onChange={(e) => update({ start: e.target.value })}
                  />
                </Field>
                <Field
                  label={
                    s.domain === "inflation"
                      ? "End month (first day)"
                      : "End date"
                  }
                >
                  <input
                    type="date"
                    value={s.end}
                    max={today()}
                    onChange={(e) => update({ end: e.target.value })}
                  />
                </Field>
              </div>
            </details>
          </>
        )}
      </div>
      {s.domain === "inflation" && s.measurement === "index" && (
        <p className="pc-notice">
          Country index levels are not comparable basket costs. Country
          comparison is available for inflation rates.
        </p>
      )}
      <div className="pc-explore-results">
        <div className="pc-workspace-main">
          {s.error ? (
            <section className="pc-canvas">
              <State error={s.error} />
            </section>
          ) : s.compare ? (
            <CountryComparison
              selection={s}
              onView={(table) => update({ view: table ? "table" : "chart" })}
            />
          ) : (
            <SeriesView
              selection={s}
              onView={(table) => update({ view: table ? "table" : "chart" })}
            />
          )}
        </div>
      </div>
      {compareOpen && (
        <Panel
          title="Compare countries"
          description="Use the same product, measurement and reference period."
          onClose={() => setCompareOpen(false)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              update({ compare: peer });
              setCompareOpen(false);
            }}
          >
            <Field label={"Compare with " + geo}>
              <select value={peer} onChange={(e) => setPeer(e.target.value)}>
                {c.geographies
                  .filter(
                    (g) =>
                      g.code !== s.country &&
                      (s.domain !== "fuel" || g.code !== "EU27_2020"),
                  )
                  .map((g) => (
                    <option key={g.code} value={g.code}>
                      {g.name}
                    </option>
                  ))}
              </select>
            </Field>
            <button
              className="pc-button pc-primary"
              type="submit"
              disabled={!peer}
            >
              Apply country comparison
            </button>
          </form>
        </Panel>
      )}
    </div>
  );
}
