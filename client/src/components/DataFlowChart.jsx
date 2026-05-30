import { useState, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

const COLORS = ['#3b82f6','#10b981','#f59e0b','#8b5cf6','#06b6d4','#ec4899','#f87171','#a3e635'];

/**
 * DataFlowChart — full-width multi-line chart for selected registers.
 *
 * Props:
 *   readings: Map<registerId, {label, value, unit, history: number[], timestamps: string[]}>
 *   registers: array of register definitions
 */
export default function DataFlowChart({ readings, registers }) {
  const [selected, setSelected] = useState(new Set());

  // Toggle selected register
  const toggle = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Build unified chart data array
  const chartData = useMemo(() => {
    if (!selected.size) return [];

    // Use the longest history as the time axis
    let maxLen = 0;
    for (const id of selected) {
      const r = readings.get(id);
      if (r?.history) maxLen = Math.max(maxLen, r.history.length);
    }
    if (!maxLen) return [];

    return Array.from({ length: maxLen }, (_, i) => {
      const point = { i };
      for (const id of selected) {
        const r = readings.get(id);
        if (r?.history) point[id] = r.history[i] ?? null;
      }
      return point;
    });
  }, [readings, selected]);

  if (!registers || registers.length === 0) return null;

  const activeRegs = registers.filter(r => selected.has(r.id));

  return (
    <div className="chart-section card">
      <div className="card-header">
        <div className="card-title">Trend Chart</div>
        <span className="text-xs text-muted">Select registers to plot</span>
      </div>

      <div className="chart-select-bar">
        {registers.map((reg, i) => (
          <button
            key={reg.id}
            className={`chart-tag${selected.has(reg.id) ? ' active' : ''}`}
            style={selected.has(reg.id) ? { background: COLORS[i % COLORS.length], borderColor: COLORS[i % COLORS.length] } : {}}
            onClick={() => toggle(reg.id)}
          >
            {reg.label}
          </button>
        ))}
      </div>

      {selected.size === 0 ? (
        <div className="empty-state" style={{ padding: '24px' }}>
          <div className="empty-icon" style={{ fontSize: 28 }}>📈</div>
          <div className="empty-title">Pick registers above to chart them</div>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="i" hide />
            <YAxis
              width={50}
              tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                fontSize: 12,
                color: 'var(--text-primary)',
              }}
              formatter={(value, name) => {
                const reg = registers.find(r => String(r.id) === String(name));
                return [`${Number(value).toFixed(3)} ${reg?.unit || ''}`, reg?.label || name];
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: 11, color: 'var(--text-secondary)' }}
              formatter={(value) => {
                const reg = registers.find(r => String(r.id) === String(value));
                return reg?.label || value;
              }}
            />
            {activeRegs.map((reg, i) => (
              <Line
                key={reg.id}
                type="monotone"
                dataKey={reg.id}
                stroke={COLORS[registers.indexOf(reg) % COLORS.length]}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
