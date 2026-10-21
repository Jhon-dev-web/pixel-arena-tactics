// Small SVG charts (no chart library): a line chart and a bar chart (grouped or stacked). Colors come from CSS classes (s1..s6), so both themes work.
// Every point carries a <title>, so hovering (or a screen reader) gives the exact value. Below each chart a toggle opens the SAME numbers as a table (exact values, no hover needed, works on a phone and with a screen reader). Line series also differ by dash pattern, not only by color.
import { fmtCompact } from '../lib/format';

export interface ChartSeries {
  name: string;
  tone: 1 | 2 | 3 | 4 | 5 | 6;
  values: number[];
}

interface Common {
  labels: string[];
  series: ChartSeries[];
  /** Formats a value for the axis (compact) and the tooltip (full). */
  axis?: (n: number) => string;
  tip?: (n: number) => string;
  height?: number;
  label: string;
}

const W = 640;
const M = { l: 46, r: 10, t: 10, b: 24 };

/** A "nice" top for the y axis and 4 ticks. */
export function niceScale(max: number): { top: number; ticks: number[] } {
  if (!Number.isFinite(max) || max <= 0) return { top: 4, ticks: [0, 1, 2, 3, 4] };
  const rough = max / 4;
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  const f = rough / pow;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * pow;
  const top = step * Math.ceil(max / step);
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 1000; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return { top, ticks };
}

function Axes({ labels, ticks, top, H, axis, xAt }: { labels: string[]; ticks: number[]; top: number; H: number; axis: (n: number) => string; xAt: (i: number) => number }) {
  const ih = H - M.t - M.b;
  const y = (v: number) => M.t + ih - (v / top) * ih;
  const every = Math.max(1, Math.ceil(labels.length / 8));
  return (
    <g>
      {ticks.map((t) => (
        <g key={t}>
          <line className="grid" x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} />
          <text x={M.l - 6} y={y(t) + 3.5} textAnchor="end">
            {axis(t)}
          </text>
        </g>
      ))}
      {labels.map((l, i) =>
        (i % every === 0 && labels.length - 1 - i >= Math.ceil(every / 2)) || i === labels.length - 1 ? (
          <text key={i} x={xAt(i)} y={H - 6} textAnchor={i === 0 ? 'start' : i === labels.length - 1 ? 'end' : 'middle'}>
            {l}
          </text>
        ) : null,
      )}
    </g>
  );
}

/** Dash patterns for the line series (the first stays solid), so two lines are told apart without color. */
export const DASHES = ['', '7 4', '2 3', '9 3 2 3', '4 2', '1 3'];

export function Legend({ series, lines = false }: { series: ChartSeries[]; lines?: boolean }) {
  if (series.length < 2) return null;
  return (
    <div className="legend">
      {series.map((s, i) => (
        <span key={s.name}>
          {lines ? (
            <svg className={`legend-line s${s.tone}`} width="22" height="8" viewBox="0 0 22 8" aria-hidden="true">
              <line x1="0" y1="4" x2="22" y2="4" strokeDasharray={DASHES[i % DASHES.length] || undefined} />
            </svg>
          ) : (
            <i className={`s${s.tone}`} />
          )}
          {s.name}
        </span>
      ))}
    </div>
  );
}

/** The numbers behind a chart, as a table inside a native <details> (closed by default). Same formatting as the tooltips. */
export function ChartData({ label, labels, series, tip }: { label: string; labels: string[]; series: ChartSeries[]; tip: (n: number) => string }) {
  return (
    <details className="chart-data">
      <summary>Ver os valores em tabela</summary>
      <div className="table-wrap">
        <table className="data">
          <caption className="sr-only">{label}: valores por dia</caption>
          <thead>
            <tr>
              <th scope="col">Dia</th>
              {series.map((s) => (
                <th scope="col" key={s.name} className="num">
                  {s.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {labels.map((l, i) => (
              <tr key={i}>
                <th scope="row">{l}</th>
                {series.map((s) => (
                  <td key={s.name} className="num">
                    {tip(s.values[i] ?? 0)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function LineChart({ labels, series, axis = fmtCompact, tip = (n) => String(n), height = 210, label }: Common) {
  const H = height;
  const iw = W - M.l - M.r;
  const ih = H - M.t - M.b;
  const max = Math.max(0, ...series.flatMap((s) => s.values));
  const { top, ticks } = niceScale(max);
  const x = (i: number) => M.l + (labels.length <= 1 ? iw / 2 : (i / (labels.length - 1)) * iw);
  const y = (v: number) => M.t + ih - (v / top) * ih;
  return (
    <div>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        <Axes labels={labels} ticks={ticks} top={top} H={H} axis={axis} xAt={x} />
        {series.map((s, si) => {
          const pts = s.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
          return (
            <g key={s.name}>
              {s.values.length > 1 ? <path className={`area s${s.tone}`} d={`M${x(0).toFixed(1)},${y(0)} L${pts.join(' L')} L${x(s.values.length - 1).toFixed(1)},${y(0)} Z`} stroke="none" /> : null}
              <polyline className={`line s${s.tone}`} points={pts.join(' ')} strokeDasharray={DASHES[si % DASHES.length] || undefined} />
              {s.values.map((v, i) => (
                <circle key={i} className={`s${s.tone}`} cx={x(i)} cy={y(v)} r={labels.length > 40 ? 2 : 3} stroke="none">
                  <title>{`${labels[i]} · ${s.name}: ${tip(v)}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
      <Legend series={series} lines />
      <ChartData label={label} labels={labels} series={series} tip={tip} />
    </div>
  );
}

export function BarChart({ labels, series, axis = fmtCompact, tip = (n) => String(n), height = 210, label, stacked = false }: Common & { stacked?: boolean }) {
  const H = height;
  const iw = W - M.l - M.r;
  const ih = H - M.t - M.b;
  const n = Math.max(1, labels.length);
  const totals = labels.map((_, i) => (stacked ? series.reduce((a, s) => a + (s.values[i] ?? 0), 0) : Math.max(0, ...series.map((s) => s.values[i] ?? 0))));
  const { top, ticks } = niceScale(Math.max(0, ...totals));
  const slot = iw / n;
  const bw = Math.max(2, Math.min(28, slot * 0.7));
  const y = (v: number) => M.t + ih - (v / top) * ih;
  const sub = stacked ? 1 : series.length;
  return (
    <div>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        <Axes labels={labels} ticks={ticks} top={top} H={H} axis={axis} xAt={(i) => M.l + slot * i + slot / 2} />
        {labels.map((l, i) => {
          const cx = M.l + slot * i + slot / 2;
          let acc = 0;
          return (
            <g key={i}>
              {series.map((s, si) => {
                const v = Math.max(0, s.values[i] ?? 0);
                const h = (v / top) * ih;
                const w = bw / sub;
                const bx = stacked ? cx - bw / 2 : cx - bw / 2 + si * w;
                const by = stacked ? y(acc + v) : y(v);
                acc += v;
                return (
                  <rect key={s.name} className={`bar s${s.tone}`} x={bx} y={by} width={Math.max(1, w - (sub > 1 ? 1 : 0))} height={Math.max(0, h)}>
                    <title>{`${l} · ${s.name}: ${tip(v)}`}</title>
                  </rect>
                );
              })}
            </g>
          );
        })}
      </svg>
      <Legend series={series} />
      <ChartData label={label} labels={labels} series={series} tip={tip} />
    </div>
  );
}
