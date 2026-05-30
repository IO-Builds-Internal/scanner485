import { useState, useEffect } from 'react';
import { useSocket } from '../hooks/useSocket';
import {
  requestAndOpenPort,
  closeLocalPort,
  isLocalPortOpen,
  autoDetectLocalSettings
} from '../utils/webSerialModbus';

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

  const hasWebSerial = typeof navigator !== 'undefined' && 'serial' in navigator;

  // Initialize connection mode: default to local browser if supported
  const [connMode,     setConnMode]    = useState(hasWebSerial ? 'local' : 'server');
  const [ports,        setPorts]       = useState([]);
  const [selectedPort, setSelectedPort]= useState('');
  const [baudRate,     setBaudRate]    = useState(19200);
  const [parity,       setParity]      = useState('even');
  const [stopBits,     setStopBits]    = useState(1);
  const [dataBits,     setDataBits]    = useState(8);
  const [connecting,   setConnecting]  = useState(false);
  const [detecting,    setDetecting]   = useState(false);
  const [detectError,  setDetectError] = useState('');

  // Handle server-side ports list
  useEffect(() => {
    const unsub = on('ports:list', (data) => {
      setPorts(data);
      if (data.length > 0 && !selectedPort) setSelectedPort(data[0].path);
    });
    return unsub;
  }, [on, selectedPort]);

  // Handle server-side connect success/fail
  useEffect(() => {
    const unsub = on('port:connected', (data) => {
      if (connMode === 'server') {
        setConnecting(false);
        onStatusChange({ ...data, mode: 'server' });
      }
    });
    return unsub;
  }, [on, onStatusChange, connMode]);

  // Handle server-side autodetect success/fail
  useEffect(() => {
    const unsub = on('port:autodetected', (data) => {
      if (connMode === 'server') {
        setDetecting(false);
        if (data.status === 'ok') {
          setBaudRate(data.baudRate);
          setParity(data.parity);
          setStopBits(data.stopBits);
          setDetectError('');
          
          // Auto-connect server-side
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
      }
    });
    return unsub;
  }, [on, selectedPort, emit, connMode]);

  const handleRefresh = () => {
    if (connMode === 'server') {
      emit('port:refresh');
    }
  };

  const handleConnect = async () => {
    setDetectError('');
    setConnecting(true);

    if (connMode === 'local') {
      try {
        await requestAndOpenPort(baudRate, parity, stopBits, dataBits);
        setConnecting(false);
        onStatusChange({
          status: 'ok',
          port: 'Web Serial (Local Port)',
          mode: 'local',
          baudRate,
          parity,
          stopBits,
          dataBits,
          slaveId: 1
        });
      } catch (err) {
        setConnecting(false);
        setDetectError(err.message);
        onStatusChange({ status: 'error', message: err.message });
      }
    } else {
      if (!selectedPort) {
        setConnecting(false);
        return;
      }
      emit('port:connect', { port: selectedPort, baudRate, parity, stopBits, dataBits });
    }
  };

  const handleAutoDetect = async () => {
    setDetecting(true);
    setDetectError('');
    onStatusChange({ status: 'disconnected' });

    if (connMode === 'local') {
      try {
        // Prompts user for local serial port selection
        await requestAndOpenPort(19200, 'even', 1, 8);
        
        // Scan common configurations using holding register 2698 (Delivered active energy)
        const config = await autoDetectLocalSettings(1, 2698, 3);
        
        setDetecting(false);
        setBaudRate(config.baudRate);
        setParity(config.parity);
        setStopBits(config.stopBits);
        
        // Connect with the discovered correct parameters
        onStatusChange({
          status: 'ok',
          port: 'Web Serial (Local Port)',
          mode: 'local',
          baudRate: config.baudRate,
          parity: config.parity,
          stopBits: config.stopBits,
          dataBits: 8,
          slaveId: 1
        });
      } catch (err) {
        setDetecting(false);
        setDetectError(err.message || 'Auto-detection failed.');
        await closeLocalPort();
      }
    } else {
      if (!selectedPort) {
        setDetecting(false);
        return;
      }
      // Try to detect by reading the EM6400NG holding register 2698
      emit('port:autodetect', {
        port: selectedPort,
        slaveId: 1,
        address: 2698,
        fc: 3
      });
    }
  };

  const handleDisconnect = async () => {
    if (connMode === 'local') {
      await closeLocalPort();
      onStatusChange({ status: 'disconnected' });
    } else {
      emit('port:disconnect');
      onStatusChange({ status: 'disconnected' });
    }
  };

  const isConnected = portStatus?.status === 'ok';
  const isError     = portStatus?.status === 'error';

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">Serial Port Connection</span>
        <div className="flex-center gap-1">
          {isConnected && <span style={pill('var(--green)', 'var(--green-bg)', 'var(--green-border)')}>● Connected — {portStatus.port} ({portStatus.mode === 'local' ? 'Local' : 'Remote'})</span>}
          {isError     && <span style={pill('var(--red)',   'var(--red-bg)',   'var(--red-border)'  )}>✕ Error</span>}
          {!isConnected && !isError && <span style={pill('var(--text-muted)', 'var(--bg-panel)', 'var(--border)')}>Not connected</span>}
        </div>
      </div>

      <div className="panel-body">
        {/* Connection Mode Selector Toggle */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
          <span className="conn-label" style={{ marginBottom: 0 }}>Connection Mode:</span>
          <div style={{ display: 'inline-flex', background: 'var(--bg-card)', borderRadius: 'var(--r-md)', padding: 2, border: '1px solid var(--border)' }}>
            <button
              className={`btn btn-sm ${connMode === 'local' ? 'btn-primary' : 'btn-default'}`}
              style={{ border: 'none', borderRadius: 'var(--r-sm)', padding: '4px 12px', fontSize: 11, fontWeight: 600 }}
              onClick={() => {
                if (!hasWebSerial) {
                  alert('Web Serial is not supported in this browser. Please use Chrome, Edge, or Opera.');
                  return;
                }
                setConnMode('local');
              }}
              disabled={isConnected}
            >
              🖥️ Local Browser (Web Serial)
            </button>
            <button
              className={`btn btn-sm ${connMode === 'server' ? 'btn-primary' : 'btn-default'}`}
              style={{ border: 'none', borderRadius: 'var(--r-sm)', padding: '4px 12px', fontSize: 11, fontWeight: 600 }}
              onClick={() => setConnMode('server')}
              disabled={isConnected}
            >
              🌐 Remote Server (Socket.io)
            </button>
          </div>
          {!hasWebSerial && (
            <span style={{ fontSize: 10, color: 'var(--red)', fontWeight: 500 }}>
              ⚠️ Web Serial unsupported in Safari/Firefox (use Chrome/Edge)
            </span>
          )}
        </div>

        {connMode === 'server' && !connected && (
          <div className="status-strip warn" style={{ marginBottom: 10 }}>
            <span className="indicator">⚠</span> Server socket not connected — check the Node.js server is running.
          </div>
        )}

        <div className="conn-grid">
          {/* Port Field */}
          <div className="conn-field" style={{ flex: '0 0 220px' }}>
            <span className="conn-label">Port Source</span>
            {connMode === 'local' ? (
              <div className="flex-center" style={{ height: 32, background: 'var(--bg-card)', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', padding: '0 10px', fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>
                🔌 Local USB Port (Browser)
              </div>
            ) : (
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
            )}
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
                  disabled={(connMode === 'server' && (!connected || !selectedPort)) || connecting || detecting}
                >
                  {connecting ? <><span className="spinner" /> Connecting…</> : 'Connect'}
                </button>
                <button
                  className="btn btn-default"
                  style={{ background: 'var(--accent-pale)', color: 'var(--accent)', borderColor: '#c5d6ee' }}
                  onClick={handleAutoDetect}
                  disabled={(connMode === 'server' && (!connected || !selectedPort)) || connecting || detecting}
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
