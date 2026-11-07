import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { chartShape, label } from "../lib/results";
import type { Cell } from "../types/query";

const differenceMeasure = (measure: string) =>
  /gap|minus|difference|change|movement|point/i.test(measure);
const palette = ["#5b50e6", "#158f89", "#b66728", "#a24772"];
const seriesLabel = (value: string) =>
  label(value)
    .replace(/eu ?27/gi, "EU-27")
    .replace(/germany/gi, "Germany")
    .replace(/ value$/i, " index")
    .replace(/ difference$/i, " gap");

const tooltipStyle = {
  background: "#ffffff",
  border: "1px solid #dce0e7",
  borderRadius: 8,
  color: "#172033",
  boxShadow: "0 8px 24px rgb(15 23 42 / .08)",
};

export function Visualization({ columns, rows }: { columns: string[]; rows: Cell[][] }) {
  const shape = chartShape(columns, rows);
  if (!shape) return null;
  const levelMeasures = shape.measures.filter((measure) => !differenceMeasure(measure));
  const differenceMeasures = shape.measures.filter(differenceMeasure);
  const mainMeasures = levelMeasures.length ? levelMeasures : shape.measures;
  const splitDifference = levelMeasures.length > 0 && differenceMeasures.length > 0;
  const indexSeries = mainMeasures.some((measure) => /index/i.test(measure));

  const axes = (focused = false) => (
    <>
      <CartesianGrid stroke="#e8ebf0" vertical={false} />
      <XAxis dataKey="name" tick={{ fill: "#5f6878", fontSize: 11 }} minTickGap={26} axisLine={false} tickLine={false} />
      <YAxis domain={focused ? ["auto", "auto"] : undefined} tick={{ fill: "#5f6878", fontSize: 11 }} width={54} axisLine={false} tickLine={false} />
      <Tooltip contentStyle={tooltipStyle} />
    </>
  );

  return (
    <figure aria-label={`${shape.kind === "line" ? "Line" : "Bar"} chart of ${shape.measures.map(label).join(" and ")} by ${label(shape.dimension)}`}>
      <figcaption className="chart-caption">
        <strong>{mainMeasures.map(seriesLabel).join(" and ")}</strong>
        <span>by {label(shape.dimension)} · values from returned rows</span>
      </figcaption>
      <div className="result-chart">
        <ResponsiveContainer width="100%" height="100%">
          {shape.kind === "line" ? (
            <LineChart data={shape.data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }} accessibilityLayer>
              {axes(true)}
              {indexSeries && <ReferenceLine y={100} stroke="#8992a1" strokeDasharray="4 4" label={{ value: "2021 average", fill: "#667085", fontSize: 10, position: "insideTopLeft" }} />}
              <Legend iconType="plainline" />
              {mainMeasures.map((measure, index) => <Line key={measure} type="monotone" dataKey={measure} name={seriesLabel(measure)} stroke={palette[index % palette.length]} strokeWidth={2.35} dot={false} isAnimationActive={false} />)}
            </LineChart>
          ) : (
            <BarChart data={shape.data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }} accessibilityLayer>
              {axes()}
              <ReferenceLine y={0} stroke="#8992a1" />
              <Legend />
              {mainMeasures.map((measure, index) => <Bar key={measure} dataKey={measure} name={seriesLabel(measure)} fill={palette[index % palette.length]} radius={[3, 3, 0, 0]} isAnimationActive={false} />)}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
      {splitDifference && (
        <div className="difference-chart">
          <div className="chart-caption"><strong>{differenceMeasures.map(seriesLabel).join(" and ")}</strong><span>shown separately to preserve the index scale</span></div>
          <div className="difference-chart-canvas">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={shape.data} margin={{ top: 4, right: 12, left: 0, bottom: 0 }} accessibilityLayer>
                {axes(true)}
                <ReferenceLine y={0} stroke="#8992a1" />
                {differenceMeasures.map((measure, index) => <Line key={measure} type="monotone" dataKey={measure} name={seriesLabel(measure)} stroke={palette[(index + 2) % palette.length]} strokeWidth={2} dot={false} isAnimationActive={false} />)}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </figure>
  );
}
