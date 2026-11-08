import {
  CartesianGrid,
  Line,
  ComposedChart,
  Area,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  BarChart,
  Bar,
  ReferenceLine,
} from "recharts";
import { numeric, period } from "../format";
import type { ChartPoint } from "../chart-data";
export function TrendChart({
  points,
  unit,
  label,
}: {
  points: ChartPoint[];
  unit: string;
  label: string;
}) {
  const data = points.map((p) => ({
    ...p,
    time: Date.parse(p.period + "T12:00:00Z"),
    coordinate: p.gap ? null : numeric(p.value),
  }));
  const times = [...new Set(data.filter((p) => !p.gap).map((p) => p.time))];
  const ticks = [
    times[0],
    times[Math.floor((times.length - 1) / 2)],
    times.at(-1),
  ].filter((v): v is number => v !== undefined);
  const fx = unit.includes("/") && unit !== "EUR/litre";
  return (
    <figure className="pc-chart" aria-label={label}>
      <figcaption>
        {unit}
        <span>
          {times.length
            ? `${period(points[0].period)} – ${period(points.at(-1)!.period)}`
            : ""}
        </span>
      </figcaption>
      <div className="pc-chart-frame">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <ComposedChart
            data={data}
            margin={{ top: 18, right: 18, bottom: 10, left: 0 }}
            accessibilityLayer
          >
            <CartesianGrid
              vertical={false}
              stroke="rgba(7,45,89,.12)"
              strokeDasharray="3 6"
            />
            <XAxis
              dataKey="time"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              ticks={[...new Set(ticks)]}
              tickFormatter={(v) =>
                new Date(v).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  timeZone: "UTC",
                })
              }
              tick={{ fill: "#526B85", fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              minTickGap={20}
            />
            <YAxis
              domain={["auto", "auto"]}
              width={fx ? 76 : 54}
              tick={{ fill: "#526B85", fontSize: 12 }}
              tickFormatter={(v) =>
                new Intl.NumberFormat("en-GB", {
                  maximumFractionDigits: fx ? 5 : 2,
                }).format(v)
              }
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              content={({ active, payload }) => {
                const p = payload?.[0]?.payload as
                  | (typeof data)[number]
                  | undefined;
                return active && p && !p.gap ? (
                  <div className="pc-chart-tooltip">
                    {period(p.period)}
                    <strong>
                      {p.label} {unit}
                    </strong>
                  </div>
                ) : null;
              }}
            />
            <Area
              dataKey="coordinate"
              name={unit}
              fill="#DBF2FC"
              fillOpacity={0.65}
              stroke="none"
              baseValue="dataMin"
              connectNulls={false}
              isAnimationActive={false}
            />
            <Line
              dataKey="coordinate"
              name={unit}
              stroke="#072D59"
              strokeWidth={2.6}
              dot={(props) => {
                const i = props.index ?? 0;
                const p = data[i];
                const isolated =
                  (i === 0 || data[i - 1]?.gap) &&
                  (i === data.length - 1 || data[i + 1]?.gap);
                if (
                  !p ||
                  p.gap ||
                  p.coordinate === null ||
                  (data.length > 100 && !isolated)
                )
                  return <g key={i} />;
                return (
                  <circle
                    key={i}
                    cx={props.cx}
                    cy={props.cy}
                    r={data.length === 1 ? 4 : 2}
                    fill="#072D59"
                  />
                );
              }}
              activeDot={{ r: 5, fill: "#FD6E88", stroke: "#072D59" }}
              connectNulls={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="pc-note">
        Actual available observations. Switch to Table for exact values and
        evidence.
      </p>
    </figure>
  );
}
export function ComparisonChart({
  rows,
  unit,
}: {
  rows: { name: string; value: string }[];
  unit: string;
}) {
  const data = rows.map((r) => ({ ...r, coordinate: numeric(r.value) }));
  const values = data
    .map((d) => d.coordinate)
    .filter((n): n is number => n !== null);
  const low = Math.min(0, ...values),
    high = Math.max(0, ...values);
  return (
    <figure className="pc-chart" aria-label={"Same-period comparison, " + unit}>
      <figcaption>{unit} · common observation period</figcaption>
      <div
        className="pc-comparison-frame"
        style={{ height: Math.max(210, rows.length * 55) }}
      >
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 15, right: 20, bottom: 10, left: 0 }}
            accessibilityLayer
          >
            <CartesianGrid horizontal={false} stroke="rgba(7,45,89,.12)" />
            <XAxis
              type="number"
              domain={[low, high === low ? low + 1 : high]}
              tick={{ fill: "#526B85", fontSize: 12 }}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={96}
              tick={{ fill: "#072D59", fontSize: 12 }}
              tickLine={false}
              axisLine={false}
            />
            <ReferenceLine x={0} stroke="#526B85" />
            <Tooltip
              content={({ active, payload }) => {
                const r = payload?.[0]?.payload as
                  | (typeof data)[number]
                  | undefined;
                return active && r ? (
                  <div className="pc-chart-tooltip">
                    {r.name}
                    <strong>
                      {r.value} {unit}
                    </strong>
                  </div>
                ) : null;
              }}
            />
            <Bar
              dataKey="coordinate"
              name={unit}
              fill="#072D59"
              barSize={22}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
