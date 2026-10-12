import { useState } from 'react';

export interface Datum {
  label: string;
  /** Longer label for the tooltip. */
  title?: string;
  value: number;
}

function niceStep(raw: number): number {
  if (raw <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
}

/**
 * Single-series column chart: one color, rounded data-end, hairline grid,
 * value labelled on the peak only, hover/focus tooltip on every column.
 */
export function ColumnChart({ data, format, ariaLabel }: { data: Datum[]; format: (v: number) => string; ariaLabel: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(0, ...data.map((d) => d.value));
  const step = niceStep(max / 4);
  const top = Math.max(step * Math.ceil(max / step), step);
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const peak = data.findIndex((d) => d.value === max && max > 0);
  const every = Math.max(1, Math.ceil(data.length / 10));
  return (
    <div className="chart" role="group" aria-label={ariaLabel}>
      <div className="chart-plot">
        <div className="chart-grid" aria-hidden="true">
          {ticks.map((t) => (
            <div key={t} className="gl" style={{ bottom: `${(t / top) * 100}%` }}>
              <span>{format(t)}</span>
            </div>
          ))}
        </div>
        {data.map((d, i) => (
          <div
            key={i}
            className="col-slot"
            tabIndex={0}
            aria-label={`${d.title ?? d.label}: ${format(d.value)}`}
            onPointerEnter={() => setHover(i)}
            onPointerLeave={() => setHover(null)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
          >
            {i === peak && hover === null && <div className="col-value">{format(d.value)}</div>}
            <div className="col" style={{ height: `${(d.value / top) * 100}%` }} />
            {hover === i && (
              <div className="chart-tip" role="tooltip">
                <strong>{format(d.value)}</strong>
                <span className="muted">{d.title ?? d.label}</span>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="chart-x" aria-hidden="true">
        {data.map((d, i) => (
          <span key={i}>{i % every === 0 ? d.label : ''}</span>
        ))}
      </div>
    </div>
  );
}

/** Single-series horizontal bars with the value at each bar's tip. */
export function BarList({ data, format }: { data: Datum[]; format: (v: number) => string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div>
      {data.map((d) => (
        <div key={d.label} className="hbar" title={`${d.title ?? d.label}: ${format(d.value)}`}>
          <span className="hbar-label">{d.label}</span>
          <span className="hbar-track">
            <span className="hbar-fill" style={{ width: `${Math.max(1, (d.value / max) * 85)}%` }} />
            <span className="hbar-value">{format(d.value)}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
