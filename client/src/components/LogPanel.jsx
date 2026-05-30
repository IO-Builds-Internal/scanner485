import { useRef, useEffect } from 'react';

/**
 * LogPanel — matches the Python Tkinter log Text widget.
 * Props:
 *   entries: [{ts, msg, level}]  level = 'info' | 'ok' | 'err' | 'warn'
 *   onClear: () => void
 */
export default function LogPanel({ entries, onClear }) {
  const bodyRef = useRef(null);

  // Auto-scroll to bottom on new entries
  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [entries]);

  return (
    <div className="panel log-panel">
      <div className="panel-header">
        <span className="panel-title">Log</span>
        <button className="btn btn-default btn-sm" onClick={onClear}>Clear</button>
      </div>
      <div className="log-body" ref={bodyRef}>
        {entries.length === 0 && (
          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>No log entries.</span>
        )}
        {entries.map((e, i) => (
          <div key={i} className={`log-line log-${e.level || 'info'}`}>
            <span className="ts">[{e.ts}]</span>
            <span className="msg">{e.msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
