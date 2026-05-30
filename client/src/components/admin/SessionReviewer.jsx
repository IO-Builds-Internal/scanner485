import { useState } from 'react';

export default function SessionReviewer() {
  const [session, setSession] = useState(null);
  const [error, setError] = useState('');

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setError('');
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        
        // Basic schema validation
        if (!parsed.metadata || !parsed.connection || !parsed.device || !parsed.readings || !parsed.logs) {
          throw new Error('Invalid session report format. Missing essential session metrics.');
        }
        
        setSession(parsed);
      } catch (err) {
        setError(`Failed to parse session document: ${err.message}`);
        setSession(null);
      }
    };
    reader.onerror = () => {
      setError('Failed to read the file.');
      setSession(null);
    };
    reader.readAsText(file);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, padding: '10px 12px', gap: 10, overflow: 'hidden' }}>
      {/* Upload area */}
      <div 
        className="panel" 
        style={{ 
          padding: 16, 
          textAlign: 'center', 
          background: 'var(--accent-pale)', 
          border: '1px dashed var(--accent)',
          borderRadius: 'var(--r-md)'
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)', display: 'block', marginBottom: 6 }}>
          🔍 Drag and drop or upload a Session Document (.json) to review diagnostic data
        </span>
        <input 
          type="file" 
          accept=".json" 
          onChange={handleFileUpload} 
          style={{ display: 'inline-block', fontSize: 11, fontFamily: 'var(--font)' }} 
        />
        {error && (
          <div className="status-strip error" style={{ marginTop: 10, justifyContent: 'center' }}>
            <span className="indicator">✕</span> {error}
          </div>
        )}
      </div>

      {session ? (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, gap: 8, overflowY: 'auto', paddingBottom: 10 }}>
          {/* Metadata Bar */}
          <div className="stats-bar" style={{ borderRadius: 'var(--r-sm)', background: 'var(--bg-panel)' }}>
            <span>Report Created: <strong>{new Date(session.metadata.timestamp).toLocaleString()}</strong></span>
            <span className="stats-sep">|</span>
            <span>Version: <strong>{session.metadata.version || '1.0.0'}</strong></span>
            <span className="stats-sep">|</span>
            <span>Generator: <strong>{session.metadata.generator || 'scanner485'}</strong></span>
          </div>

          {/* Row 1: Connection & Device Info */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, flexShrink: 0 }}>
            {/* Connection settings */}
            <div className="panel">
              <div className="panel-header"><span className="panel-title">Serial Connection Settings</span></div>
              <div className="panel-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '8px 12px' }}>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Port Path</div>
                  <div style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{session.connection.port}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Baud Rate</div>
                  <div style={{ fontWeight: 600 }}>{session.connection.baudRate} bps</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Parity</div>
                  <div style={{ fontWeight: 600, textTransform: 'capitalize' }}>{session.connection.parity}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Stop / Data Bits</div>
                  <div style={{ fontWeight: 600 }}>{session.connection.stopBits} stop / {session.connection.dataBits || 8} data</div>
                </div>
              </div>
            </div>

            {/* Device Info */}
            <div className="panel">
              <div className="panel-header"><span className="panel-title">Connected Modbus Device</span></div>
              <div className="panel-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '8px 12px' }}>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Device Name</div>
                  <div style={{ fontWeight: 600, color: 'var(--accent)' }}>{session.device.name}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Manufacturer</div>
                  <div style={{ fontWeight: 600 }}>{session.device.manufacturer}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Registers Scanned</div>
                  <div style={{ fontWeight: 600 }}>{session.readings.length} parameters</div>
                </div>
              </div>
            </div>
          </div>

          {/* Row 2: Scanned Readings Snapshot */}
          <div className="panel" style={{ display: 'flex', flexDirection: 'column', minHeight: '200px', flex: 1 }}>
            <div className="panel-header"><span className="panel-title">Captured Register Values Snapshot</span></div>
            <div className="reg-table-scroll" style={{ flex: 1, minHeight: 0 }}>
              <table className="reg-table" style={{ tableLayout: 'auto' }}>
                <thead>
                  <tr style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                    <th>Register Label</th>
                    <th style={{ width: '100px', textAlign: 'right' }}>Address</th>
                    <th style={{ width: '160px', textAlign: 'right' }}>Logged Value</th>
                    <th style={{ width: '80px', textAlign: 'center' }}>Unit</th>
                    <th style={{ width: '120px' }}>Last Read</th>
                  </tr>
                </thead>
                <tbody>
                  {session.readings.map((reg, idx) => (
                    <tr key={idx}>
                      <td style={{ fontWeight: 600 }}>{reg.label}</td>
                      <td className="mono" style={{ textAlign: 'right', color: 'var(--text-mono)' }}>{reg.address !== undefined ? reg.address : '—'}</td>
                      <td className="mono" style={{ textAlign: 'right', fontWeight: 700, color: 'var(--accent)' }}>
                        {typeof reg.value === 'number' ? reg.value.toFixed(4) : reg.value === undefined ? '—' : String(reg.value)}
                      </td>
                      <td style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>{reg.unit || '—'}</td>
                      <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{reg.ts ? new Date(reg.ts).toLocaleTimeString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Row 3: Session Logs */}
          <div className="panel" style={{ display: 'flex', flexDirection: 'column', height: '140px', flexShrink: 0 }}>
            <div className="panel-header"><span className="panel-title">Captured Operator Console Logs</span></div>
            <div className="log-body" style={{ flex: 1, overflowY: 'auto', background: '#f7f8fa', padding: '6px 10px', borderTop: '1px solid var(--border-light)' }}>
              {session.logs.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No console logs were captured in this session.</div>
              ) : (
                session.logs.map((log, idx) => (
                  <div key={idx} className="log-line" style={{ 
                    color: log.level === 'err' ? 'var(--red)' : log.level === 'ok' ? 'var(--green)' : log.level === 'warn' ? 'var(--orange)' : 'var(--text)'
                  }}>
                    <span className="ts">[{log.ts}]</span>
                    <span className="msg">{log.msg}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="empty-state" style={{ padding: '80px 24px', flex: 1 }}>
          <div className="empty-icon">📁</div>
          <div className="empty-title">No session document loaded</div>
          <div className="empty-desc">
            Upload an exported session JSON file using the selector above to reconstruct, inspect, and review all of the diagnostics recorded during that run.
          </div>
        </div>
      )}
    </div>
  );
}
