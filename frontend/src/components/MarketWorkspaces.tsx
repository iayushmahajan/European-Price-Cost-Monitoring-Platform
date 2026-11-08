import { useState } from "react";
import { ArrowRight, CalendarDays, CheckCircle2, ExternalLink, Info, TrendingDown, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { RetailOverview } from "../types/query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";

const number = (value: number) => new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(value);
const monthDate = (value: string) => new Date(`${value}T00:00:00Z`).toLocaleDateString("en", { month: "short", year: "numeric", timeZone: "UTC" });
const fullDate = (value: string | null) => value ? new Date(value).toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "Unavailable";
const signed = (value: number | null, suffix = " pts") => value == null ? "—" : `${value > 0 ? "+" : ""}${number(value)}${suffix}`;

function State({ overview, failed, children }: { overview: RetailOverview | null; failed: boolean; children: (data: RetailOverview) => React.ReactNode }) {
  if (failed) return <div className="page-state"><strong>Market data unavailable</strong><p>The Eurostat overview could not be loaded. Check the backend and retry.</p></div>;
  if (!overview) return <div className="page-state is-loading"><span /><strong>Preparing market intelligence…</strong></div>;
  if (!overview.available) return <div className="page-state"><strong>Eurostat data is ready to import</strong><p>Run the eurostat-data command to populate this workspace.</p></div>;
  return <>{children(overview)}</>;
}

function TrendChart({ data, tone = "dark" }: { data: RetailOverview["history"]; tone?: "dark" | "light" }) {
  const light = tone === "light";
  const axisColor = light ? "#526f88" : "#a9cadb";
  return <figure className="market-figure" data-chart-ready="true"><figcaption className="sr-only">Germany and EU-27 monthly retail volume indices, with 2021 equal to 100.</figcaption><div className="trend-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{ top: 12, right: 10, left: -12, bottom: 0 }} accessibilityLayer><CartesianGrid stroke={light ? "#d6e7f0" : "rgba(219,242,252,.18)"} vertical={false}/><XAxis dataKey="period" tickFormatter={monthDate} tick={{ fill: axisColor, fontSize: 12 }} minTickGap={32} axisLine={false} tickLine={false}/><YAxis domain={["auto", "auto"]} tick={{ fill: axisColor, fontSize: 12 }} width={42} axisLine={false} tickLine={false}/><ReferenceLine y={100} stroke={axisColor} strokeOpacity={light ? .65 : .35} strokeDasharray="4 4"/><Tooltip labelFormatter={(value) => monthDate(String(value))} contentStyle={{ border: 0, borderRadius: 10, boxShadow: "0 14px 40px rgba(7,45,89,.18)", color: "#072D59", fontSize: 12 }}/><Line name="Germany" type="monotone" dataKey="germany" stroke="#FD6E88" strokeWidth={3} dot={false} connectNulls isAnimationActive={false}/><Line name="EU-27" type="monotone" dataKey="eu" stroke={light ? "#3283BE" : "#7DD3FC"} strokeWidth={2.4} dot={false} connectNulls isAnimationActive={false}/></LineChart></ResponsiveContainer></div><div className="trend-legend" aria-label="Chart legend"><span><i className="legend-line germany"/>Germany</span><span><i className="legend-line eu"/>EU-27</span></div></figure>;
}

function PageHeader({ title, description, meta }: { title: string; description: string; meta?: string }) {
  return <header className="page-header"><div><h1>{title}</h1><p>{description}</p></div>{meta && <span className="page-meta">{meta}</span>}</header>;
}

export function OverviewWorkspace({ overview, failed }: { overview: RetailOverview | null; failed: boolean }) {
  return <State overview={overview} failed={failed}>{(data) => {
    const lead = data.germany_yearly_change == null ? "Germany's latest annual movement is unavailable." : `Germany is ${Math.abs(data.germany_yearly_change).toFixed(1)} index points ${data.germany_yearly_change >= 0 ? "above" : "below"} its level a year earlier.`;
    return <div className="workspace-page overview-page page-enter">
      <section className="overview-hero">
        <div className="hero-copy"><div className="hero-period"><CalendarDays/><span>Latest reporting period</span><strong>{data.latest_period ? monthDate(data.latest_period) : "Latest data"}</strong></div><h1>Retail signals,<br/><em>made legible.</em></h1><p>{lead} Compare the current signal with the EU benchmark and explore what changed.</p><div className="hero-actions"><Link className="hero-button" to="/explore">Explore the market <ArrowRight /></Link><Link className="hero-link" to="/analyst">Ask a question</Link></div></div>
        <div className="hero-visual"><div className="hero-chart-head"><div><span>Retail volume index</span><strong>{data.germany_value == null ? "—" : number(data.germany_value)}</strong></div><span className={(data.germany_yearly_change ?? 0) < 0 ? "movement down" : "movement up"}>{(data.germany_yearly_change ?? 0) < 0 ? <TrendingDown/> : <TrendingUp/>}{signed(data.germany_yearly_change)} year on year</span></div><TrendChart data={data.history}/><div className="chart-baseline"><Info/> 100 represents average retail volume in 2021</div></div>
      </section>
      <section className="signal-strip" aria-label="Latest market indicators"><div><span>Germany</span><strong>{data.germany_value == null ? "—" : number(data.germany_value)}</strong><small>Retail volume index</small></div><div><span>Monthly move</span><strong>{signed(data.germany_monthly_change)}</strong><small>From previous month</small></div><div><span>Annual move</span><strong>{signed(data.germany_yearly_change)}</strong><small>From same month last year</small></div><div><span>EU position</span><strong>{data.germany_rank ? `${data.germany_rank} / ${data.ranked_country_count}` : "—"}</strong><small>By annual movement</small></div></section>
      <section className="overview-brief"><div><span className="section-label">Market brief</span><h2>Germany is trailing the EU-27 level, while category performance remains uneven.</h2></div><div className="brief-facts"><p><strong>{signed(data.eu_yearly_change)}</strong><span>EU-27 annual movement</span></p><p><strong>{data.categories.filter((item) => item.yearly_change != null && item.yearly_change > 0).length} of {data.categories.length}</strong><span>German categories growing annually</span></p><p><strong>{data.anomalies.length}</strong><span>Unusual recent movements flagged</span></p></div></section>
    </div>;
  }}</State>;
}

export function ExploreWorkspace({ overview, failed }: { overview: RetailOverview | null; failed: boolean }) {
  const [view, setView] = useState("performance");
  return <State overview={overview} failed={failed}>{(data) => {
    const categories = data.categories.map((category) => ({ ...category, deviation: category.value - 100 }));
    const extent = Math.max(5, Math.ceil(Math.max(...categories.map((item) => Math.abs(item.deviation))) / 5) * 5);
    const countries = data.countries.slice(0, 10); const germany = data.countries.find((country) => country.code === "DE"); if (germany && !countries.includes(germany)) countries.push(germany);
    return <div className="workspace-page page-enter"><PageHeader title="Explore markets" description="Compare performance, categories and countries without losing the meaning behind the index." meta={`${data.latest_period ? monthDate(data.latest_period) : "Latest"} · 2021=100`}/>
      <Tabs value={view} onValueChange={setView} className="explore-tabs"><TabsList aria-label="Market exploration views"><TabsTrigger value="performance">Performance</TabsTrigger><TabsTrigger value="categories">Categories</TabsTrigger><TabsTrigger value="countries">Countries</TabsTrigger><TabsTrigger value="changes">Change detection</TabsTrigger></TabsList>
        <TabsContent value="performance" className="explore-panel"><div className="panel-heading"><div><span className="section-label">Trend</span><h2>Germany and EU-27</h2></div><p>Seasonally adjusted retail volume. Values above 100 exceed the 2021 average.</p></div><div className="light-chart"><TrendChart data={data.history} tone="light"/></div><div className="inline-metrics"><p><span>Germany latest</span><strong>{data.germany_value == null ? "—" : number(data.germany_value)}</strong></p><p><span>EU-27 latest</span><strong>{data.eu_value == null ? "—" : number(data.eu_value)}</strong></p><p><span>Current gap</span><strong>{data.germany_value != null && data.eu_value != null ? signed(data.germany_value - data.eu_value) : "—"}</strong></p><p><span>Germany volatility</span><strong>{data.germany_volatility == null ? "—" : number(data.germany_volatility)}</strong></p></div></TabsContent>
        <TabsContent value="categories" className="explore-panel"><div className="panel-heading"><div><span className="section-label">Germany</span><h2>Category position</h2></div><p>Distance in index points from the 2021 average.</p></div><div className="category-explore-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={categories} layout="vertical" margin={{ left: 12, right: 22 }} accessibilityLayer><CartesianGrid stroke="#e4edf4" horizontal={false}/><XAxis type="number" domain={[-extent, extent]} tickFormatter={(value) => `${Number(value) > 0 ? "+" : ""}${value}`} axisLine={false} tickLine={false}/><YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 11, fill: "#36516e" }} axisLine={false} tickLine={false}/><ReferenceLine x={0} stroke="#072D59"/><Tooltip formatter={(value) => [`${signed(Number(value))} from 2021`, "Position"]}/><Bar dataKey="deviation" radius={4} isAnimationActive={false}>{categories.map((item) => <Cell key={item.code} fill={item.deviation < 0 ? "#FD6E88" : "#3283BE"}/>)}</Bar></BarChart></ResponsiveContainer></div><div className="data-list">{data.categories.map((item) => <div key={item.code}><span>{item.name}</span><strong>{number(item.value)}</strong><small className={(item.yearly_change ?? 0) < 0 ? "negative" : "positive"}>{signed(item.yearly_change)} annual</small></div>)}</div></TabsContent>
        <TabsContent value="countries" className="explore-panel">
          <div className="panel-heading"><div><span className="section-label">Benchmark</span><h2>Annual movement by country</h2></div><p>Leading countries plus Germany, ranked on the latest comparable month.</p></div>
          <div className="provisional-note"><Info/><span><strong>Provisional data</strong> — these values may be revised by Eurostat.</span></div>
          <div className="country-table" role="table" aria-label="Country benchmark">
            <div role="row" className="country-header"><span>Rank</span><span>Market</span><span>Index</span><span>Annual move</span></div>
            {countries.map((country) => <div role="row" className={country.code === "DE" ? "is-germany" : ""} key={country.code}>
              <span>{String(country.rank).padStart(2, "0")}</span>
              <strong className="country-name"><span>{country.name}</span>{country.provisional && <span className="provisional-status" aria-label="Provisional data; this value may be revised by Eurostat" title="Provisional data; this value may be revised by Eurostat">Provisional</span>}</strong>
              <span>{number(country.value)}</span>
              <span className={country.yearly_change < 0 ? "negative" : "positive"}>{signed(country.yearly_change)}</span>
            </div>)}
          </div>
        </TabsContent>
        <TabsContent value="changes" className="explore-panel"><div className="panel-heading"><div><span className="section-label">Change detection</span><h2>Unusual recent movements</h2></div><p>Statistical flags identify movements worth investigating; they do not claim a cause.</p></div>{data.anomalies.length ? <div className="change-list">{data.anomalies.map((item, index) => <article key={`${item.geography}-${index}`}><span className={`change-icon ${item.direction}`}>{item.direction === "increase" ? <TrendingUp/> : <TrendingDown/>}</span><div><strong>{item.geography}</strong><span>{item.category} · {monthDate(item.period)}</span></div><p><strong>{signed(item.monthly_change)}</strong><span>monthly · score {number(Math.abs(item.score))}</span></p></article>)}</div> : <div className="empty-message"><CheckCircle2/><strong>No unusual movements detected</strong><p>No recent change exceeded the robust anomaly threshold.</p></div>}<details className="method-detail"><summary>How change detection works</summary><p>A robust score compares each monthly change with up to 36 preceding changes. Absolute scores above 3.5 are flagged for review.</p></details></TabsContent>
      </Tabs>
    </div>;
  }}</State>;
}

export function DataWorkspace({ overview, failed }: { overview: RetailOverview | null; failed: boolean }) {
  return <State overview={overview} failed={failed}>{(data) => {
    const completeness = data.observation_count + data.missing_cells ? data.observation_count / (data.observation_count + data.missing_cells) * 100 : null;
    return <div className="workspace-page page-enter"><PageHeader title="Data & sources" description="Coverage, freshness and methodology for the evidence used throughout the platform." meta={`Updated ${fullDate(data.source_updated_at)}`}/>
      <section className="data-health"><div className="health-status"><span><CheckCircle2/></span><div><strong>Dataset operational</strong><p>The dashboard and AI analyst query the same imported Eurostat observations.</p></div></div><div className="health-grid"><p><strong>{data.observation_count.toLocaleString()}</strong><span>observations</span></p><p><strong>{completeness == null ? "—" : `${number(completeness)}%`}</strong><span>cell completeness</span></p><p><strong>{data.geography_count}</strong><span>geographies</span></p><p><strong>{data.category_count}</strong><span>categories</span></p></div></section>
      <div className="data-layout"><section className="data-section"><span className="section-label">Coverage</span><h2>What is included</h2><dl className="definition-list"><div><dt>Period</dt><dd>{fullDate(data.earliest_period)} — {fullDate(data.latest_period)}</dd></div><div><dt>Geographies</dt><dd>EU-27 aggregate and European Union member states</dd></div><div><dt>Measure</dt><dd>Seasonally and calendar-adjusted retail trade volume index</dd></div><div><dt>Reference</dt><dd>2021 average = 100; values are not currency or revenue</dd></div></dl></section><section className="data-section"><span className="section-label">Quality</span><h2>Known status</h2><dl className="definition-list"><div><dt>Provisional values</dt><dd>{data.provisional_count.toLocaleString()} observations may be revised</dd></div><div><dt>Unavailable cells</dt><dd>{data.missing_cells.toLocaleString()} retained as missing rather than imputed</dd></div><div><dt>Latest ranking</dt><dd>{data.ranked_country_count} of 27 countries available</dd></div><div><dt>Snapshot</dt><dd>{data.source_sha256 ? `${data.source_sha256.slice(0, 16)}…` : "Checksum unavailable"}</dd></div></dl></section></div>
      <section className="methodology-section"><div className="methodology-intro"><span className="section-label">Methodology</span><h2>Transparent calculations</h2><p>Monthly and annual changes are index-point differences. Country ranks use the latest comparable annual movement. Volatility and anomaly scores are calculated locally from imported observations.</p><a href="https://ec.europa.eu/eurostat/databrowser/view/sts_trtu_m/default/table" target="_blank" rel="noreferrer">Open Eurostat dataset <ExternalLink/></a></div><div className="methodology-details"><h3>How evidence is handled</h3><p>Source values remain traceable from import through every chart, table and analysis result.</p><details><summary>Technical methodology and safeguards</summary><p>The application preserves missing values, labels provisional observations, applies bounded result payloads, and validates generated read-only SQL before execution. Natural-language interpretation is separate from deterministic calculations.</p></details></div></section>
    </div>;
  }}</State>;
}
