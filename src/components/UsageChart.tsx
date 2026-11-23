import { useState } from 'react';
import type { DailySeriesPoint } from '../types';

interface UsageChartProps {
  data: DailySeriesPoint[];
  metric: 'requests' | 'tokens';
  title: string;
  subtitle: string;
}

export function UsageChart({ data, metric, title, subtitle }: UsageChartProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const values = data.map((d) => (metric === 'requests' ? d.requests : d.tokens));
  const maxValue = Math.max(1, ...values);
  const totalValue = values.reduce((acc, v) => acc + v, 0);

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-4 mb-6">
        <div>
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
        </div>
        <div className="text-right">
          <div className="text-xs text-slate-500">14-day total</div>
          <div className="text-lg font-semibold text-slate-900 font-mono tabular-nums">
            {totalValue.toLocaleString()} {metric === 'requests' ? 'reqs' : 'tokens'}
          </div>
        </div>
      </div>

      <div className="relative h-44 flex items-end gap-2 pt-6 pb-6 border-b border-slate-100">
        {data.map((point, idx) => {
          const val = metric === 'requests' ? point.requests : point.tokens;
          const heightPct = val === 0 ? 3 : Math.max(8, Math.round((val / maxValue) * 100));
          const isHovered = hoveredIdx === idx;
          const shortDate = point.date.slice(5);

          return (
            <div
              key={point.date}
              className="relative flex-1 h-full flex flex-col justify-end items-center group"
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              {isHovered && (
                <div className="absolute -top-2 z-10 px-2.5 py-1.5 rounded-md bg-slate-900 text-white text-[11px] whitespace-nowrap shadow-sm pointer-events-none">
                  <div className="font-medium text-slate-300">{point.date}</div>
                  <div className="font-mono tabular-nums">
                    {point.requests.toLocaleString()} reqs · {point.tokens.toLocaleString()} tok
                  </div>
                </div>
              )}

              <div
                style={{ height: `${heightPct}%` }}
                className={`w-full max-w-[28px] rounded-t transition-colors duration-150 ${
                  val === 0
                    ? 'bg-slate-100'
                    : isHovered
                      ? 'bg-blue-700'
                      : 'bg-blue-600'
                }`}
              />

              <span className="absolute -bottom-5 text-[10px] text-slate-400 font-mono tabular-nums">
                {idx % 2 === 0 || idx === data.length - 1 ? shortDate : ''}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
