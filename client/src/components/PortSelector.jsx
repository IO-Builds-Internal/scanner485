import { useState, useEffect } from 'react';
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
  const hasWebSerial = typeof navigator !== 'undefined' && 'serial' in navigator;

  const [authorizedPorts, setAuthorizedPorts] = useState([]);
  const [selectedIdx,      setSelectedIdx]      = useState(-1);
  const [baudRate,         setBaudRate]         = useState(19200);
  const [parity,           setParity]           = useState('even');
  const [stopBits,         setStopBits]         = useState(1);
  const [dataBits,         setDataBits]         = useState(8);
  const [connecting,       setConnecting]       = useState(false);
  const [detecting,        setDetecting]        = useState(false);
  const [detectError,      setDetectError]      = useState('');

  // Load previously authorized local ports
  const loadPorts = async () => {
    if (hasWebSerial) {
      try {
        const list = await navigator.serial.getPorts();
        setAuthorizedPorts(list);
        if (list.length > 0) {
          setSelectedIdx(0);
        } else {
          setSelectedIdx(-1);
        }
      } catch (err) {
        console.error('[web serial] getPorts error:', err.message);
      }
    }
  };

  useEffect(() => {
    loadPorts();
  }, []);

  const handleAuthorizeNew = async () => {
    setDetectError('');
    try {
      const port = await navigator.serial.requestPort();
      const list = await navigator.serial.getPorts();
      setAuthorizedPorts(list);
      const idx = list.indexOf(port);
      setSelectedIdx(idx !== -1 ? idx : list.length - 1);
    } catch (err) {
      setDetectError(err.message || 'Port selection cancelled.');
    }
  };

  const handleConnect = async () => {
    setDetectError('');
    setConnecting(true);

    try {
      let targetPort = authorizedPorts[selectedIdx];
      if (!targetPort) {
        // Automatically request port if list is empty
        targetPort = await navigator.serial.requestPort();
        const list = await navigator.serial.getPorts();
        setAuthorizedPorts(list);
        setSelectedIdx(list.indexOf(targetPort));
      }

      await requestAndOpenPort(baudRate, parity, stopBits, dataBits, targetPort);
      setConnecting(false);
      onStatusChange({
        status: 'ok',
        port: 'Web Serial Device',
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
  };

  const handleAutoDetect = async () => {
    setDetecting(true);
    setDetectError('');
    onStatusChange({ status: 'disconnected' });

    try {
      let targetPort = authorizedPorts[selectedIdx];
      if (!targetPort) {
        targetPort = await navigator.serial.requestPort();
        const list = await navigator.serial.getPorts();
        setAuthorizedPorts(list);
        setSelectedIdx(list.indexOf(targetPort));
      }

      // Open port first using default config
      await requestAndOpenPort(19200, 'even', 1, 8, targetPort);
      
      // Auto Mode parameters scanning
      const config = await autoDetectLocalSettings(1, 2698, 3);
      
      setDetecting(false);
      setBaudRate(config.baudRate);
      setParity(config.parity);
      setStopBits(config.stopBits);
      
      // Auto connect with discovered parameters
      onStatusChange({
        status: 'ok',
        port: 'Web Serial Device',
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
  };

  const handleDisconnect = async () => {
    await closeLocalPort();
    onStatusChange({ status: 'disconnected' });
  };

  const getPortLabel = (port, idx) => {
    const info = port.getInfo();
    if (info.usbVendorId !== undefined) {
      const vid = '0x' + info.usbVendorId.toString(16).toUpperCase().padStart(4, '0');
      const pid = '0x' + info.usbProductId.toString(16).toUpperCase().padStart(4, '0');
      return `USB Serial Port #${idx + 1} (VID: ${vid}, PID: ${pid})`;
    }
    return `Serial Device #${idx + 1}`;
  };

  const isConnected = portStatus?.status === 'ok';
  const isError     = portStatus?.status === 'error';

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">Serial Port Connection</span>
        <div className="flex-center gap-1">
          {isConnected && <span style={pill('var(--green)', 'var(--green-bg)', 'var(--green-border)')}>● Connected — Local Computer</span>}
          {isError     && <span style={pill('var(--red)',   'var(--red-bg)',   'var(--red-border)'  )}>✕ Error</span>}
          {!isConnected && !isError && <span style={pill('var(--text-muted)', 'var(--bg-panel)', 'var(--border)')}>Not connected</span>}
        </div>
      </div>

      <div className="panel-body">
        {!hasWebSerial && (
          <div className="status-strip error" style={{ marginBottom: 10 }}>
            <span className="indicator">✕</span> <strong>Browser Compatibility Error:</strong> Web Serial is not supported in this browser. Please use Google Chrome, Microsoft Edge, or Opera on your computer.
          </div>
        )}

        <div className="conn-grid">
          {/* Port Source / dropdown of local ports */}
          <div className="conn-field" style={{ flex: '0 0 240px' }}>
            <span className="conn-label">Authorized USB Port</span>
            <div className="flex-center gap-1">
              <select
                className="form-select"
                style={{ flex: 1 }}
                value={selectedIdx}
                onChange={e => setSelectedIdx(+e.target.value)}
                disabled={isConnected || authorizedPorts.length === 0}
              >
                {authorizedPorts.length === 0 && <option value={-1}>No ports authorized yet</option>}
                {authorizedPorts.map((p, i) => (
                  <option key={i} value={i}>
                    {getPortLabel(p, i)}
                  </option>
                ))}
              </select>
              <button
                className="btn btn-default btn-sm"
                onClick={handleAuthorizeNew}
                disabled={isConnected || !hasWebSerial}
                title="Authorize a new USB / Serial device"
                style={{ padding: '0 8px', height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                ➕ Add
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
                  disabled={!hasWebSerial || connecting || detecting}
                >
                  {connecting ? <><span className="spinner" /> Connecting…</> : 'Connect'}
                </button>
                <button
                  className="btn btn-default"
                  style={{ background: 'var(--accent-pale)', color: 'var(--accent)', borderColor: '#c5d6ee' }}
                  onClick={handleAutoDetect}
                  disabled={!hasWebSerial || connecting || detecting}
                  title="Auto-scan local ports and detect Baud Rate, Parity, and Stop Bits"
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
