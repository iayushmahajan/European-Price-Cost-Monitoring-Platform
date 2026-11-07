import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { RetailOverview } from "../types/query";

const number = (value: number) =>
  new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(value);
const monthDate = (value: string) =>
  new Date(`${value}T00:00:00Z`).toLocaleDateString("en", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
const fullDate = (value: string | null) =>
  value
    ? new Date(value).toLocaleDateString("en", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      })
    : "Unavailable";
const signed = (value: number | null, suffix = " pts") =>
  value == null ? "—" : `${value > 0 ? "+" : ""}${number(value)}${suffix}`;

function Empty({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="dashboard-empty">
      <strong>{title}</strong>
      <p>{detail}</p>
    </div>
  );
}

function CardHeading({ eyebrow, title, meta }: { eyebrow: string; title: string; meta: string }) {
  return (
    <div className="card-head">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      <span>{meta}</span>
    </div>
  );
}

export function RetailDashboard({ overview, failed }: { overview: RetailOverview | null; failed: boolean }) {
  if (failed)
    return <Empty title="Market dashboard unavailable" detail="The database could not load the Eurostat overview. Check the backend and retry." />;
  if (!overview)
    return <Empty title="Loading retail market data" detail="Preparing the latest Eurostat indicators…" />;
  if (!overview.available)
    return <Empty title="Eurostat data is ready to import" detail="Run the eurostat-data command to populate the market intelligence workspace." />;

  const visibleCountries = overview.countries.slice(0, 7);
  const completeness = overview.observation_count + overview.missing_cells
    ? (overview.observation_count / (overview.observation_count + overview.missing_cells)) * 100
    : null;
  const germany = overview.countries.find((country) => country.code === "DE");
  if (germany && !visibleCountries.some((country) => country.code === "DE")) visibleCountries.push(germany);
  const categories = overview.categories.map((category) => ({
    ...category,
    deviation: category.value - 100,
  }));
  const categoryExtent = Math.max(
    5,
    Math.ceil(Math.max(...categories.map((category) => Math.abs(category.deviation))) / 5) * 5,
  );

  return (
    <section className="workspace-section dashboard-stack" id="overview">
      <div className="dashboard-title-row">
        <div>
          <p className="eyebrow">Market overview</p>
          <h1>European retail intelligence</h1>
          <p className="dashboard-subtitle">
            Monthly retail-volume indicators for Germany, the EU-27 and every European Union member state.
          </p>
        </div>
        <span className="source-pill">Eurostat · 2021=100</span>
      </div>

      <div className="scope-banner">
        <strong>One governed dataset</strong>
        <span>Dashboard metrics, anomaly flags and natural-language results use the same imported Eurostat observations.</span>
      </div>

      <div className="kpi-grid" aria-label="Latest Germany indicators">
        <div className="kpi-card"><span>Germany retail index</span><strong>{overview.germany_value == null ? "—" : number(overview.germany_value)}</strong><small>{overview.latest_period ? monthDate(overview.latest_period) : "Latest month"}{overview.germany_provisional ? " · provisional" : ""}</small></div>
        <div className="kpi-card"><span>Monthly movement</span><strong className={(overview.germany_monthly_change ?? 0) < 0 ? "negative" : "positive"}>{signed(overview.germany_monthly_change)}</strong><small>Versus the previous month</small></div>
        <div className="kpi-card"><span>Annual movement</span><strong className={(overview.germany_yearly_change ?? 0) < 0 ? "negative" : "positive"}>{signed(overview.germany_yearly_change)}</strong><small>Versus the same month last year</small></div>
        <div className="kpi-card"><span>EU country rank</span><strong>{overview.germany_rank ? `${overview.germany_rank} of ${overview.ranked_country_count}` : "—"}</strong><small>Latest annual movement</small></div>
      </div>

      <div className="dashboard-grid-main">
        <section className="dashboard-card chart-card">
          <CardHeading eyebrow="Performance" title="Germany and EU-27" meta="Retail volume index" />
          <figure>
            <figcaption className="sr-only">Germany and EU-27 monthly retail volume index, with 2021 average equal to 100.</figcaption>
            <div className="large-chart">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={overview.history} margin={{ top: 12, right: 12, left: 0, bottom: 0 }} accessibilityLayer>
                  <CartesianGrid stroke="#e8ebf0" vertical={false} />
                  <XAxis dataKey="period" tickFormatter={monthDate} tick={{ fill: "#5f6878", fontSize: 11 }} minTickGap={30} axisLine={false} tickLine={false} />
                  <YAxis domain={["auto", "auto"]} tick={{ fill: "#5f6878", fontSize: 11 }} width={42} axisLine={false} tickLine={false} />
                  <ReferenceLine y={100} stroke="#8992a1" strokeDasharray="4 4" label={{ value: "2021 average", fill: "#667085", fontSize: 10, position: "insideTopLeft" }} />
                  <Tooltip labelFormatter={(value) => monthDate(String(value))} contentStyle={{ borderColor: "#dce0e7", borderRadius: 8, boxShadow: "0 8px 24px rgb(15 23 42 / .08)" }} />
                  <Legend iconType="plainline" />
                  <Line name="Germany" type="monotone" dataKey="germany" stroke="var(--series-germany)" strokeWidth={2.4} dot={false} connectNulls isAnimationActive={false} />
                  <Line name="EU-27" type="monotone" dataKey="eu" stroke="var(--series-eu)" strokeWidth={2.2} dot={false} connectNulls isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </figure>
          <p className="card-note">A value of 105 means retail volume is 5% above the 2021 average. The series is seasonally and calendar adjusted and does not represent revenue in euros.</p>
        </section>

        <section className="dashboard-card">
          <CardHeading eyebrow="Category view" title="Distance from 2021" meta="Germany · latest month" />
          <figure>
            <figcaption className="sr-only">Germany retail categories shown as index-point distance above or below the 2021 average.</figcaption>
            <div className="category-chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categories} layout="vertical" margin={{ left: 8, right: 12 }} accessibilityLayer>
                  <CartesianGrid stroke="#e8ebf0" horizontal={false} />
                  <XAxis type="number" domain={[-categoryExtent, categoryExtent]} tick={{ fill: "#5f6878", fontSize: 10 }} tickFormatter={(value) => `${Number(value) > 0 ? "+" : ""}${value}`} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={126} tick={{ fill: "#525d6d", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <ReferenceLine x={0} stroke="#667085" />
                  <Tooltip formatter={(value) => [`${signed(Number(value))} from 2021`, "Difference"]} contentStyle={{ borderColor: "#dce0e7", borderRadius: 8 }} />
                  <Bar dataKey="deviation" radius={3} isAnimationActive={false}>
                    {categories.map((category) => <Cell key={category.code} fill={category.deviation < 0 ? "#b65362" : "#247d68"} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </figure>
          <div className="category-movements">
            {overview.categories.map((category) => <div key={category.code}><span>{category.name}</span><strong className={(category.yearly_change ?? 0) < 0 ? "negative" : "positive"}>{signed(category.yearly_change)} annually</strong></div>)}
          </div>
        </section>
      </div>

      <div className="dashboard-grid-lower">
        <section className="dashboard-card">
          <CardHeading eyebrow="Benchmark" title="Leading annual movers" meta="Total retail · same month" />
          <div className="ranking-list">{visibleCountries.map((country) => <div className={`ranking-row ${country.code === "DE" ? "current" : ""}`} key={country.code}><span className="rank">{String(country.rank).padStart(2, "0")}</span><span className="country-name">{country.name}{country.provisional ? " *" : ""}</span><strong className={country.yearly_change < 0 ? "negative" : "positive"}>{signed(country.yearly_change)}</strong></div>)}</div>
          <p className="card-note">The view shows the leading countries plus Germany. An asterisk marks a provisional observation.</p>
        </section>
        <section className="dashboard-card">
          <CardHeading eyebrow="Change detection" title="Unusual movements" meta="Most extreme recent scores" />
          {overview.anomalies.length ? <div className="anomaly-list">{overview.anomalies.slice(0, 6).map((item, index) => <div className="anomaly-row" key={`${item.geography}-${item.category}-${item.period}-${index}`}><span className={`anomaly-direction ${item.direction}`}>{item.direction === "increase" ? "↑" : "↓"}</span><div><strong>{item.geography} · {item.category}</strong><small>{monthDate(item.period)} · {signed(item.monthly_change)} · robust score {number(Math.abs(item.score))}{item.provisional ? " · provisional" : ""}</small></div></div>)}</div> : <p className="quality-copy">No movements exceeded the robust anomaly threshold during the latest 24 months.</p>}
          <p className="card-note">A score above 3.5 identifies an unusual movement against up to 36 preceding monthly changes. It does not establish a cause.</p>
        </section>
      </div>

      <section className="dashboard-card data-scope-card" id="quality">
        <CardHeading eyebrow="Data quality" title="Coverage and provenance" meta={`Updated ${fullDate(overview.source_updated_at)}`} />
        <div className="scope-stats">
          <div><strong>{overview.observation_count.toLocaleString()}</strong><span>observations</span></div>
          <div><strong>{overview.geography_count}</strong><span>geographies</span></div>
          <div><strong>{overview.category_count}</strong><span>retail categories</span></div>
          <div><strong>{overview.provisional_count.toLocaleString()}</strong><span>provisional observations</span></div>
          <div><strong>{completeness == null ? "—" : `${number(completeness)}%`}</strong><span>requested-cell completeness</span></div>
          <div><strong>{overview.ranked_country_count} / 27</strong><span>countries in latest ranking</span></div>
        </div>
        <p className="quality-copy">Coverage runs from {fullDate(overview.earliest_period)} to {fullDate(overview.latest_period)}. Monthly and annual changes are index-point differences. Volatility and anomaly scores are derived locally from imported observations.</p>
        {overview.source_sha256 && <p className="card-note">Snapshot SHA-256 {overview.source_sha256.slice(0, 16)}… · {overview.missing_cells.toLocaleString()} unavailable source cells retained as missing</p>}
        <a className="source-link" href="https://ec.europa.eu/eurostat/databrowser/view/sts_trtu_m/default/table" target="_blank" rel="noreferrer">Open the Eurostat dataset and methodology ↗</a>
      </section>
    </section>
  );
}
