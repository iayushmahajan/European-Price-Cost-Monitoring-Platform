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
import {
  numeric,
  period,
  displayMeasurement,
  displayUnit,
  axisNumber,
  chartPrecision,
} from "../format";
import type { ChartPoint } from "../chart-data";
export function TrendChart({
  points,
  unit,
  label,
  showPeriodRange = true,
}: {
  points: ChartPoint[];
  unit: string;
  label: string;
  showPeriodRange?: boolean;
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
  const monthly = points.some((p) => p.monthly);
  const fx = unit.includes("/") && unit !== "EUR/litre";
  const axisValues = data.flatMap((p) =>
    p.coordinate === null ? [] : [p.coordinate],
  );
  const axisWidth = Math.min(
    96,
    Math.max(
      fx ? 76 : 54,
      ...(axisValues.length
        ? [Math.min(...axisValues), Math.max(...axisValues)]
        : []
      ).map((v) => axisNumber(v, unit, axisValues).length * 7 + 24),
    ),
  );
  return (
    <figure className="pc-chart" aria-label={label}>
      <figcaption>
        {displayUnit(unit)}
        {showPeriodRange && (
          <span>
            {times.length
              ? `${period(points[0].period, monthly)} – ${period(points.at(-1)!.period, monthly)}`
              : ""}
          </span>
        )}
      </figcaption>
      <div className="pc-chart-frame">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <ComposedChart
            data={data}
            // Reserve a separate label band below the plot, including on narrow screens.
            margin={{ top: 18, right: 24, bottom: 16, left: 4 }}
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
                  ...(monthly
                    ? ({ year: "numeric" } as const)
                    : ({ day: "numeric" } as const)),
                  month: "short",
                  timeZone: "UTC",
                })
              }
              tick={{ fill: "#526B85", fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              height={40}
              tickMargin={12}
              padding={{ left: 8, right: 8 }}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis
              domain={["auto", "auto"]}
              width={axisWidth}
              tickMargin={10}
              padding={{ top: 4, bottom: 12 }}
              tick={{ fill: "#526B85", fontSize: 12 }}
              tickFormatter={(v) => axisNumber(v, unit, axisValues)}
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
                    {period(p.period, monthly)}
                    <strong>
                      {displayMeasurement(
                        p.value,
                        unit,
                        false,
                        chartPrecision(unit, axisValues),
                      )}
                    </strong>
                  </div>
                ) : null;
              }}
            />
            <Area
              dataKey="coordinate"
              name={displayUnit(unit)}
              fill="#DBF2FC"
              fillOpacity={0.65}
              stroke="none"
              baseValue="dataMin"
              connectNulls={false}
              isAnimationActive={false}
            />
            <Line
              dataKey="coordinate"
              name={displayUnit(unit)}
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
        Actual available observations. Switch to Table for values and evidence.
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
      <figcaption>{displayUnit(unit)} · common observation period</figcaption>
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
              tickFormatter={(v) => axisNumber(v, unit, [0, ...values])}
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
                      {displayMeasurement(
                        r.value,
                        unit,
                        false,
                        chartPrecision(unit, [0, ...values]),
                      )}
                    </strong>
                  </div>
                ) : null;
              }}
            />
            <Bar
              dataKey="coordinate"
              name={displayUnit(unit)}
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
