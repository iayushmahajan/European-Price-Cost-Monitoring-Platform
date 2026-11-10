import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MatchedFuelWeek } from "../contracts";
import { axisNumber, displayMeasurement, numeric, period } from "../format";
export function FuelComparisonChart({
  observations,
}: {
  observations: MatchedFuelWeek[];
}) {
  const first = observations[0];
  const data = observations.flatMap((row) => {
    const point = {
      time: Date.parse(row.period + "T12:00:00Z"),
      base: numeric(row.base.value),
      peer: numeric(row.peer.value),
      row,
    };
    return row.consecutive === false
      ? [{ ...point, base: null, peer: null }, point]
      : [point];
  });
  const values = observations
    .flatMap((r) => [numeric(r.base.value), numeric(r.peer.value)])
    .filter((v): v is number => v !== null);
  const times = observations.map((r) => Date.parse(r.period + "T12:00:00Z"));
  return (
    <figure
      className="pc-chart"
      aria-label="Historical fuel prices for both countries in EUR per litre"
    >
      <figcaption>
        <span className="pc-series-legend">
          <span>
            <i />
            {first.base.geography.name}
          </span>
          <span>
            <i />
            {first.peer.geography.name}
          </span>
        </span>
        <span>EUR/L</span>
      </figcaption>
      <div className="pc-chart-frame">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <LineChart
            data={data}
            margin={{ top: 18, right: 24, bottom: 16, left: 4 }}
            accessibilityLayer
          >
            <CartesianGrid
              stroke="rgba(7,45,89,.12)"
              strokeDasharray="3 6"
              vertical={false}
            />
            <XAxis
              dataKey="time"
              type="number"
              domain={["dataMin", "dataMax"]}
              ticks={[
                ...new Set([
                  times[0],
                  times[Math.floor((times.length - 1) / 2)],
                  times.at(-1)!,
                ]),
              ]}
              tickFormatter={(v) =>
                new Intl.DateTimeFormat("en-GB", {
                  day: "numeric",
                  month: "short",
                  timeZone: "UTC",
                }).format(v)
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
              width={72}
              tickMargin={10}
              padding={{ top: 4, bottom: 12 }}
              domain={["auto", "auto"]}
              tickFormatter={(v) => axisNumber(v, "EUR/litre", values)}
              tick={{ fill: "#526B85", fontSize: 12 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              content={({ active, payload }) => {
                const row = (
                  payload?.find((p) => p.value !== null)?.payload as
                    | { row: MatchedFuelWeek }
                    | undefined
                )?.row;
                return active && row ? (
                  <div className="pc-chart-tooltip">
                    Week of {period(row.period)}
                    <strong>
                      {row.base.geography.name}:{" "}
                      {displayMeasurement(row.base.value, "EUR/litre")}
                    </strong>
                    <strong>
                      {row.peer.geography.name}:{" "}
                      {displayMeasurement(row.peer.value, "EUR/litre")}
                    </strong>
                  </div>
                ) : null;
              }}
            />
            <Line
              dataKey="base"
              name={first.base.geography.name}
              stroke="#072D59"
              strokeWidth={2.6}
              dot={{ r: 3 }}
              connectNulls={false}
              isAnimationActive={false}
            />
            <Line
              dataKey="peer"
              name={first.peer.geography.name}
              stroke="#526B85"
              strokeWidth={2.6}
              strokeDasharray="7 4"
              dot={{ r: 3, fill: "#FEFDFE" }}
              connectNulls={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
