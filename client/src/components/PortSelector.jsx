import { useState, useEffect } from 'react';
import { useSocket } from '../hooks/useSocket';

const PARITY_OPTIONS = [
  { value: 'none', label: 'None (N)' },
  { value: 'even', label: 'Even (E)' },
  { value: 'odd',  label: 'Odd (O)'  },
];
const BAUD_OPTIONS    = [1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200];
const STOP_OPTIONS    = [1, 2];
const DATA_OPTIONS    = [7, 8];

export default function PortSelector({ portStatus, onStatusChange }) {
  const { emit, on, connected } = useSocket();

  const [ports,        setPorts]       = useState([]);
  const [selectedPort, setSelectedPort]= useState('');
  const [baudRate,     setBaudRate]    = useState(19200);
  const [parity,       setParity]      = useState('even');
  const [stopBits,     setStopBits]    = useState(1);
  const [dataBits,     setDataBits]    = useState(8);
  const [connecting,   setConnecting]  = useState(false);
  const [detecting,    setDetecting]   = useState(false);
  const [detectError,  setDetectError] = useState('');

  useEffect(() => {
    const unsub = on('ports:list', (data) => {
      setPorts(data);
      if (data.length > 0 && !selectedPort) setSelectedPort(data[0].path);
    });
    return unsub;
  }, [on, selectedPort]);

  useEffect(() => {
    const unsub = on('port:connected', (data) => {
      setConnecting(false);
      onStatusChange(data);
    });
    return unsub;
  }, [on, onStatusChange]);

  useEffect(() => {
    const unsub = on('port:autodetected', (data) => {
      setDetecting(false);
      if (data.status === 'ok') {
        setBaudRate(data.baudRate);
        setParity(data.parity);
        setStopBits(data.stopBits);
        setDetectError('');
        
        // Auto-connect with the discovered correct parameters
        setConnecting(true);
        emit('port:connect', {
          port: selectedPort,
          baudRate: data.baudRate,
          parity: data.parity,
          stopBits: data.stopBits,
          dataBits: data.dataBits || 8,
        });
      } else {
        setDetectError(data.message || 'Auto-detection failed.');
      }
    });
    return unsub;
  }, [on, selectedPort, emit]);

  const handleRefresh    = () => emit('port:refresh');
  const handleConnect    = () => {
    if (!selectedPort) return;
    setConnecting(true);
    setDetectError('');
    emit('port:connect', { port: selectedPort, baudRate, parity, stopBits, dataBits });
  };
  const handleAutoDetect = () => {
    if (!selectedPort) return;
    setDetecting(true);
    setDetectError('');
    onStatusChange({ status: 'disconnected' });
    // Try to detect by reading the EM6400NG delivered active energy register (address 2698, holding)
    emit('port:autodetect', {
      port: selectedPort,
      slaveId: 1,
      address: 2698,
      fc: 3
    });
  };
  const handleDisconnect = () => {
    emit('port:disconnect');
    onStatusChange({ status: 'disconnected' });
  };

  const isConnected = portStatus?.status === 'ok';
  const isError     = portStatus?.status === 'error';

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">Serial Port Connection</span>
        <div className="flex-center gap-1">
          {isConnected && <span style={pill('var(--green)', 'var(--green-bg)', 'var(--green-border)')}>● Connected — {portStatus.port}</span>}
          {isError     && <span style={pill('var(--red)',   'var(--red-bg)',   'var(--red-border)'  )}>✕ Error</span>}
          {!isConnected && !isError && <span style={pill('var(--text-muted)', 'var(--bg-panel)', 'var(--border)')}>Not connected</span>}
        </div>
      </div>

      <div className="panel-body">
        {!connected && (
          <div className="status-strip warn" style={{ marginBottom: 10 }}>
            <span className="indicator">⚠</span> Server socket not connected — check the Node.js server is running.
          </div>
        )}

        <div className="conn-grid">
          {/* Port */}
          <div className="conn-field" style={{ flex: '0 0 220px' }}>
            <span className="conn-label">Port</span>
            <div className="flex-center gap-1">
              <select
                className="form-select"
                style={{ flex: 1 }}
                value={selectedPort}
                onChange={e => setSelectedPort(e.target.value)}
                disabled={isConnected}
              >
                {ports.length === 0 && <option value="">No ports found</option>}
                {ports.map(p => (
                  <option key={p.path} value={p.path}>
                    {p.path}{p.manufacturer ? ` (${p.manufacturer})` : ''}
                  </option>
                ))}
              </select>
              <button className="btn btn-default btn-sm" onClick={handleRefresh} disabled={!connected} title="Refresh port list">
                ↺
              </button>
            </div>
          </div>

          {/* Baud */}
          <div className="conn-field">
            <span className="conn-label">Baud Rate</span>
            <select className="form-select form-input-md" value={baudRate} onChange={e => setBaudRate(+e.target.value)} disabled={isConnected}>
              {BAUD_OPTIONS.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>

          {/* Parity */}
          <div className="conn-field">
            <span className="conn-label">Parity</span>
            <select className="form-select form-input-sm" value={parity} onChange={e => setParity(e.target.value)} disabled={isConnected}>
              {PARITY_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>

          {/* Stop bits */}
          <div className="conn-field">
            <span className="conn-label">Stop Bits</span>
            <select className="form-select form-input-sm" value={stopBits} onChange={e => setStopBits(+e.target.value)} disabled={isConnected}>
              {STOP_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Data bits */}
          <div className="conn-field">
            <span className="conn-label">Data Bits</span>
            <select className="form-select form-input-sm" value={dataBits} onChange={e => setDataBits(+e.target.value)} disabled={isConnected}>
              {DATA_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          {/* Buttons */}
          <div className="conn-field" style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6 }}>
            {!isConnected ? (
              <>
                <button
                  className="btn btn-success"
                  onClick={handleConnect}
                  disabled={!connected || !selectedPort || connecting || detecting}
                >
                  {connecting ? <><span className="spinner" /> Connecting…</> : 'Connect'}
                </button>
                <button
                  className="btn btn-default"
                  style={{ background: 'var(--accent-pale)', color: 'var(--accent)', borderColor: '#c5d6ee' }}
                  onClick={handleAutoDetect}
                  disabled={!connected || !selectedPort || connecting || detecting}
                  title="Auto-scan and detect correct Baud Rate, Parity, and Stop Bits"
                >
                  {detecting ? <><span className="spinner" /> Scanning…</> : '🔍 Auto Mode'}
                </button>
              </>
            ) : (
              <button className="btn btn-danger" onClick={handleDisconnect}>
                Disconnect
              </button>
            )}
          </div>
        </div>

        {isError && portStatus.message && (
          <div className="status-strip error" style={{ marginTop: 8 }}>
            <span className="indicator">✕</span> {portStatus.message}
          </div>
        )}

        {detectError && (
          <div className="status-strip error" style={{ marginTop: 8 }}>
            <span className="indicator">✕</span> {detectError}
          </div>
        )}

        {detecting && (
          <div className="status-strip warn" style={{ marginTop: 8 }}>
            <span className="spinner" /> <strong>Auto Mode Active:</strong> Scanning serial configurations (4800-115200 baud, Even/None/Odd parity, 1-2 stop bits). Please wait...
          </div>
        )}
      </div>
    </div>
  );
}

function pill(color, bg, border) {
  return {
    display: 'inline-flex', alignItems: 'center',
    padding: '2px 9px', borderRadius: 'var(--r-sm)',
    fontSize: 11, fontWeight: 600,
    color, background: bg,
    border: `1px solid ${border}`,
  };
}
