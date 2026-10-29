"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";

type TooltipProps = TooltipContentProps<ValueType, NameType>;

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usdCompact = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 });
const fmt = (cents: number) => usd.format(cents / 100);
const tick = (cents: number) => (Math.abs(cents) >= 100_000 ? usdCompact.format(cents / 100) : usd.format(cents / 100));

const AXIS = {
  tickLine: false,
  axisLine: false,
  tick: { fill: "var(--muted)", fontSize: 12 },
} as const;

function TooltipBox({ title, rows }: { title: string; rows: { name: string; color?: string; cents: number }[] }) {
  return (
    <div className="card px-3 py-2 text-xs shadow-sm">
      <div className="text-ink mb-1 font-medium">{title}</div>
      {rows.map((r) => (
        <div key={r.name} className="flex items-center justify-between gap-4">
          <span className="text-ink-2 flex items-center gap-1.5">
            {r.color && <span className="inline-block size-2 rounded-full" style={{ background: r.color }} />}
            {r.name}
          </span>
          <span className="num text-ink">{fmt(r.cents)}</span>
        </div>
      ))}
    </div>
  );
}

export interface ColumnDatum { label: string; cents: number }

/**
 * One series of monthly columns. Positive and negative values are drawn as two stacked
 * bars so each keeps its rounded end away from the baseline.
 */
export function ColumnChart({ data, name, height = 220 }: { data: ColumnDatum[]; name: string; height?: number }) {
  const rows = data.map((d) => ({ label: d.label, pos: Math.max(d.cents, 0), neg: Math.min(d.cents, 0), cents: d.cents }));
  const hasNegative = rows.some((r) => r.neg < 0);
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} stackOffset="sign">
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="label" {...AXIS} />
          <YAxis {...AXIS} width={60} tickFormatter={tick} />
          <Tooltip
            cursor={{ fill: "var(--surface-2)" }}
            content={(p: TooltipProps) =>
              p.active && p.payload?.length ? (
                <TooltipBox title={String(p.label)} rows={[{ name, cents: (p.payload[0].payload as { cents: number }).cents }]} />
              ) : null
            }
          />
          <Bar dataKey="pos" stackId="v" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
          {hasNegative && <Bar dataKey="neg" stackId="v" fill="var(--series-1)" radius={[0, 0, 4, 4]} maxBarSize={24} isAnimationActive={false} />}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export interface StackSeries { name: string; color: string; values: number[] }

/** Monthly columns stacked by series (categories). Series order is fixed by the caller. */
export function StackedColumns({ labels, series, height = 280 }: { labels: string[]; series: StackSeries[]; height?: number }) {
  const rows = labels.map((label, i) => {
    const r: Record<string, number | string> = { label };
    series.forEach((s) => { r[s.name] = Math.max(s.values[i] ?? 0, 0); });
    return r;
  });
  return (
    <div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <XAxis dataKey="label" {...AXIS} />
            <YAxis {...AXIS} width={60} tickFormatter={tick} />
            <Tooltip
              cursor={{ fill: "var(--surface-2)" }}
              content={(p: TooltipProps) => {
                if (!p.active || !p.payload?.length) return null;
                const items = [...p.payload].reverse()
                  .filter((x) => Number(x.value) > 0)
                  .map((x) => ({ name: String(x.dataKey), color: String(x.color), cents: Number(x.value) }));
                const total = items.reduce((s, x) => s + x.cents, 0);
                return <TooltipBox title={`${p.label} · ${fmt(total)}`} rows={items} />;
              }}
            />
            {series.map((s, i) => (
              <Bar
                key={s.name}
                dataKey={s.name}
                stackId="s"
                fill={s.color}
                stroke="var(--surface)"
                strokeWidth={2}
                radius={i === series.length - 1 ? [4, 4, 0, 0] : 0}
                maxBarSize={28}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <Legend items={series.map((s) => ({ name: s.name, color: s.color }))} />
    </div>
  );
}

export function Legend({ items }: { items: { name: string; color: string }[] }) {
  return (
    <ul className="text-ink-2 mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {items.map((i) => (
        <li key={i.name} className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-sm" style={{ background: i.color }} />
          {i.name}
        </li>
      ))}
    </ul>
  );
}

/** A single running-total line with a crosshair tooltip. */
export function TrendLine({ data, name, height = 220 }: { data: ColumnDatum[]; name: string; height?: number }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="label" {...AXIS} />
          <YAxis {...AXIS} width={60} tickFormatter={tick} />
          <Tooltip
            cursor={{ stroke: "var(--axis)" }}
            content={(p: TooltipProps) =>
              p.active && p.payload?.length ? <TooltipBox title={String(p.label)} rows={[{ name, cents: Number(p.payload[0].value) }]} /> : null
            }
          />
          <Line
            type="monotone"
            dataKey="cents"
            stroke="var(--series-1)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            dot={false}
            activeDot={{ r: 4, fill: "var(--series-1)", stroke: "var(--surface)", strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
