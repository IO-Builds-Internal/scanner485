import { useState, useEffect, useRef } from 'react';

/**
 * RegisterTable — live register display as a structured table.
 * Mirrors the Python Tkinter Treeview: Name | Group | FC | Address | Type | Unit | Value
 *
 * Props:
 *   readings  : Map<registerId, {label, value, unit, history}>
 *   registers : array of register definition objects from sql.js
 *   scanning  : boolean
 */
export default function RegisterTable({ readings, registers, scanning }) {
  if (!registers || registers.length === 0) {
    return (
      <div className="panel reg-table-wrap">
        <div className="panel-header">
          <span className="panel-title">Live Values</span>
        </div>
        <div className="empty-state">
          <div className="empty-icon">📋</div>
          <div className="empty-title">No active scan</div>
          <div className="empty-desc">
            Connect a serial port, select a device, and click <strong>Start Scan</strong>.
          </div>
        </div>
      </div>
    );
  }

  // Build rows, inserting group separator rows between groups
  const rows = [];
  let lastGroup = null;
  for (const reg of registers) {
    const g = reg.group_name || 'Other';
    if (g !== lastGroup) {
      rows.push({ type: 'sep', group: g });
      lastGroup = g;
    }
    rows.push({ type: 'reg', reg });
  }

  const readCount = [...readings.values()].filter(r => r.value !== undefined).length;

  return (
    <div className="panel reg-table-wrap">
      <div className="panel-header">
        <span className="panel-title">Live Values</span>
        <div className="flex-center gap-2" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {scanning && <span style={{ color: 'var(--green)', fontWeight: 700 }}>{readCount} / {registers.length} received</span>}
          {!scanning && <span>Scan stopped</span>}
        </div>
      </div>

      {/* Stats bar */}
      {scanning && (
        <div className="stats-bar">
          <div className="stats-item">
            <span>Total registers:</span>
            <span className="stats-value">{registers.length}</span>
          </div>
          <span className="stats-sep">|</span>
          {['Voltage','Current','Power','Energy','Frequency','Power Factor','Harmonics'].map(g => {
            const cnt = registers.filter(r => r.group_name === g).length;
            if (!cnt) return null;
            return (
              <div key={g} className="stats-item">
                <span>{g}:</span>
                <span className="stats-value">{cnt}</span>
              </div>
            );
          })}
        </div>
      )}

      <div className="reg-table-scroll">
        <table className="reg-table">
          <thead>
            <tr>
              <th className="col-idx">#</th>
              <th className="col-name">Register Name</th>
              <th className="col-group">Group</th>
              <th className="col-fc">FC</th>
              <th className="col-addr">Address</th>
              <th className="col-type">Data Type</th>
              <th className="col-unit">Unit</th>
              <th className="col-value">Value</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              if (row.type === 'sep') {
                return (
                  <tr key={`sep-${row.group}`} className="group-sep">
                    <td colSpan={8}>{row.group}</td>
                  </tr>
                );
              }
              const { reg } = row;
              const reading = readings.get(reg.id);
              return (
                <RegisterRow key={reg.id} reg={reg} reading={reading} index={i} />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RegisterRow({ reg, reading, index }) {
  const [flash, setFlash] = useState(false);
  const prevValue = useRef(undefined);
  const rowIndex = useRef(0);

  // Count actual reg rows before this one for the row number
  useEffect(() => {
    rowIndex.current = index;
  });

  useEffect(() => {
    if (!reading || reading.value === undefined) return;
    if (prevValue.current !== undefined && reading.value !== prevValue.current) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 500);
      return () => clearTimeout(t);
    }
    prevValue.current = reading.value;
  }, [reading?.value]);

  const hasValue = reading && reading.value !== undefined && reading.value !== null;
  const isError  = reading?.value === 'ERR' || reading?.value === 'EXC';

  let valClass = 'val-cell';
  if (!hasValue)  valClass += ' empty';
  else if (isError) valClass += ' err';
  else if (flash)   valClass += ' flash';

  return (
    <tr>
      <td className="col-idx mono" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
        {reg.display_order ?? '—'}
      </td>
      <td className="col-name" title={reg.label}>
        {reg.label}
      </td>
      <td className="col-group">
        {reg.group_name
          ? <span className="group-badge">{reg.group_name}</span>
          : <span style={{ color: 'var(--text-muted)' }}>—</span>}
      </td>
      <td className="col-fc mono" style={{ textAlign: 'center' }}>
        FC{reg.function_code || 3}
      </td>
      <td className="col-addr mono" style={{ textAlign: 'right' }}>
        {reg.address}
      </td>
      <td className="col-type mono" style={{ fontSize: 10 }}>
        {reg.data_type || 'float32_be'}
      </td>
      <td className="col-unit" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
        {reg.unit || '—'}
      </td>
      <td className={`col-value ${valClass}`}>
        {hasValue
          ? isError
            ? String(reading.value)
            : formatValue(reading.value) + (reg.unit ? '' : '')
          : '—'
        }
      </td>
    </tr>
  );
}

function formatValue(v) {
  if (v === null || v === undefined) return '—';
  const n = Number(v);
  if (isNaN(n)) return String(v);
  // Show 4 decimal places like the original Python app
  return n.toFixed(4);
}
