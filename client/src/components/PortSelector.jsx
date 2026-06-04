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

export default function PortSelector({ db, portStatus, onStatusChange }) {
  const hasWebSerial = typeof navigator !== 'undefined' && 'serial' in navigator;

  const [authorizedPorts, setAuthorizedPorts] = useState([]);
  const [selectedIdx,      setSelectedIdx]      = useState(-1);
  const [baudRate,         setBaudRate]         = useState(19200);
  const [parity,           setParity]           = useState('even');
  const [stopBits,         setStopBits]         = useState(1);
  const [dataBits,         setDataBits]         = useState(8);
  const [slaveId,          setSlaveId]          = useState(1);
  const [connecting,       setConnecting]       = useState(false);
  const [detecting,        setDetecting]        = useState(false);
  const [detectError,      setDetectError]      = useState('');

  const [newProfileName, setNewProfileName] = useState('');

  const PRESETS = [
    { name: 'Conzerv EM6400NG Default (19200, E, 1, ID 1)', baudRate: 19200, parity: 'even', stopBits: 1, dataBits: 8, slaveId: 1 },
    { name: 'ABB M1M12 Default (9600, E, 1, ID 1)', baudRate: 9600, parity: 'even', stopBits: 1, dataBits: 8, slaveId: 1 },
    { name: 'ABB M1M12 Swapped (2400, O, 2, ID 2)', baudRate: 2400, parity: 'odd', stopBits: 2, dataBits: 8, slaveId: 2 }
  ];

  const [profiles, setProfiles] = useState(() => {
    try {
      const saved = localStorage.getItem('scanner485_connection_profiles');
      return saved ? JSON.parse(saved) : PRESETS;
    } catch (_) {
      return PRESETS;
    }
  });

  const [showAutoDetectPanel, setShowAutoDetectPanel] = useState(false);
  const [autoDetectDeviceId, setAutoDetectDeviceId] = useState('');
  const [autoDetectSlaveId, setAutoDetectSlaveId] = useState(1);
  const [devices, setDevices] = useState([]);
  const [customTestAddress, setCustomTestAddress] = useState(0);
  const [customTestFc, setCustomTestFc] = useState(3);

  useEffect(() => {
    if (db?.ready) {
      const rows = db.query('SELECT * FROM devices ORDER BY name ASC');
      setDevices(rows);
      if (rows.length > 0) {
        setAutoDetectDeviceId(String(rows[0].id));
        setAutoDetectSlaveId(rows[0].slave_id || 1);
      } else {
        setAutoDetectDeviceId('not_listed');
        setAutoDetectSlaveId(1);
      }
    }
  }, [db?.ready, db]);

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

  // Listen for physical USB connection/disconnection events natively in real-time
  useEffect(() => {
    if (!hasWebSerial) return;

    const handleDisconnect = async (event) => {
      console.log('[web serial] physical disconnect event fired for port:', event.target);
      // Close the active Web Serial port connection
      await closeLocalPort();
      onStatusChange({ status: 'disconnected' });
      // Refresh authorized ports dropdown list
      loadPorts();
    };

    const handleConnect = () => {
      // Refresh authorized ports list when a new device is plugged in
      loadPorts();
    };

    navigator.serial.addEventListener('disconnect', handleDisconnect);
    navigator.serial.addEventListener('connect', handleConnect);

    return () => {
      navigator.serial.removeEventListener('disconnect', handleDisconnect);
      navigator.serial.removeEventListener('connect', handleConnect);
    };
  }, [hasWebSerial, onStatusChange]);

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

  const handleSaveProfile = () => {
    if (!newProfileName.trim()) return;
    const newProfile = {
      name: newProfileName.trim(),
      baudRate,
      parity,
      stopBits,
      dataBits,
      slaveId
    };
    const updated = [...profiles, newProfile];
    setProfiles(updated);
    localStorage.setItem('scanner485_connection_profiles', JSON.stringify(updated));
    setNewProfileName('');
  };

  const handleLoadProfile = (profile) => {
    setBaudRate(profile.baudRate);
    setParity(profile.parity);
    setStopBits(profile.stopBits);
    setDataBits(profile.dataBits);
    setSlaveId(profile.slaveId);
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
        slaveId: Number(slaveId)
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
      
      // Determine test address and FC from selected device
      let testAddress = 2698;
      let testFc = 3;
      if (autoDetectDeviceId === 'not_listed') {
        testAddress = customTestAddress;
        testFc = customTestFc;
      } else if (autoDetectDeviceId && db?.ready) {
        const regs = db.query(
          'SELECT address, function_code FROM registers WHERE device_id = ? ORDER BY address ASC LIMIT 1',
          [autoDetectDeviceId]
        );
        if (regs.length > 0) {
          testAddress = regs[0].address;
          testFc = regs[0].function_code || 3;
        }
      }

      // Auto Mode parameters scanning
      const config = await autoDetectLocalSettings(Number(autoDetectSlaveId), testAddress, testFc);
      
      setDetecting(false);
      setBaudRate(config.baudRate);
      setParity(config.parity);
      setStopBits(config.stopBits);
      setSlaveId(Number(autoDetectSlaveId));
      
      // Auto connect with discovered parameters
      onStatusChange({
        status: 'ok',
        port: 'Web Serial Device',
        mode: 'local',
        baudRate: config.baudRate,
        parity: config.parity,
        stopBits: config.stopBits,
        dataBits: 8,
        slaveId: Number(autoDetectSlaveId)
      });
      setShowAutoDetectPanel(false);
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

        {/* Connection Profiles Row */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, borderBottom: '1px dashed var(--border)', paddingBottom: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 200px' }}>
            <span className="conn-label" style={{ fontWeight: 600 }}>Quick Profile</span>
            <select
              className="form-select w-full"
              onChange={(e) => {
                const idx = Number(e.target.value);
                if (idx >= 0) handleLoadProfile(profiles[idx]);
              }}
              defaultValue="-1"
              disabled={isConnected}
            >
              <option value="-1" disabled>-- Choose a saved profile --</option>
              {profiles.map((p, i) => (
                <option key={i} value={i}>{p.name}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', flex: '1.2 1 240px' }}>
            <div style={{ flex: 1 }}>
              <span className="conn-label" style={{ fontWeight: 600 }}>Save Current Config</span>
              <input
                type="text"
                placeholder="Profile name (e.g. ABB Swapped)..."
                className="form-input w-full"
                value={newProfileName}
                onChange={e => setNewProfileName(e.target.value)}
                disabled={isConnected}
              />
            </div>
            <button
              className="btn btn-default"
              onClick={handleSaveProfile}
              disabled={isConnected || !newProfileName.trim()}
              style={{ height: 32, padding: '0 12px' }}
            >
              💾 Save
            </button>
          </div>
        </div>

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

          {/* Slave ID */}
          <div className="conn-field">
            <span className="conn-label">Slave ID</span>
            <input
              type="number"
              className="form-input form-input-sm"
              style={{ width: 55, textAlign: 'center' }}
              min={1} max={247}
              value={slaveId}
              onChange={e => setSlaveId(+e.target.value)}
              disabled={isConnected}
            />
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
                  onClick={() => setShowAutoDetectPanel(!showAutoDetectPanel)}
                  disabled={!hasWebSerial || connecting || detecting}
                  title="Configure and run Auto-detection Mode"
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

        {/* Custom Auto-Detect Panel */}
        {showAutoDetectPanel && !isConnected && (
          <div style={{
            marginTop: 14,
            padding: 12,
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-md)',
          }}>
            <span className="conn-label" style={{ fontWeight: 600, fontSize: 12, marginBottom: 8, display: 'block', color: 'var(--accent)' }}>🔍 Custom Auto-Detection Setup</span>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 200px' }}>
                <span className="conn-label">Device Type to Scan</span>
                <select
                  className="form-select w-full"
                  value={autoDetectDeviceId}
                  onChange={e => {
                    setAutoDetectDeviceId(e.target.value);
                    const dev = devices.find(d => String(d.id) === e.target.value);
                    if (dev) setAutoDetectSlaveId(dev.slave_id || 1);
                  }}
                  disabled={detecting}
                >
                  {devices.map(d => (
                    <option key={d.id} value={d.id}>{d.name} ({d.manufacturer || 'Generic'})</option>
                  ))}
                  <option value="not_listed">Not Listed / Custom</option>
                </select>
              </div>
              {autoDetectDeviceId === 'not_listed' && (
                <>
                  <div style={{ width: 110 }}>
                    <span className="conn-label">Test Address</span>
                    <input
                      type="number"
                      className="form-input w-full"
                      min={0} max={65535}
                      value={customTestAddress}
                      onChange={e => setCustomTestAddress(Number(e.target.value))}
                      disabled={detecting}
                    />
                  </div>
                  <div style={{ width: 120 }}>
                    <span className="conn-label">Test FC</span>
                    <select
                      className="form-select w-full"
                      value={customTestFc}
                      onChange={e => setCustomTestFc(Number(e.target.value))}
                      disabled={detecting}
                    >
                      <option value={3}>FC 03 (Holding)</option>
                      <option value={4}>FC 04 (Input)</option>
                    </select>
                  </div>
                </>
              )}
              <div style={{ width: 80 }}>
                <span className="conn-label">Slave ID</span>
                <input
                  type="number"
                  className="form-input w-full"
                  min={1} max={247}
                  value={autoDetectSlaveId}
                  onChange={e => setAutoDetectSlaveId(+e.target.value)}
                  disabled={detecting}
                />
              </div>
              <div style={{ display: 'flex', gap: 6, height: 32 }}>
                <button
                  className="btn btn-primary"
                  onClick={handleAutoDetect}
                  disabled={detecting}
                  style={{ padding: '0 16px' }}
                >
                  {detecting ? 'Detecting...' : 'Start Detect'}
                </button>
                <button
                  className="btn btn-default"
                  onClick={() => setShowAutoDetectPanel(false)}
                  disabled={detecting}
                >
                  Cancel
                </button>
              </div>
            </div>
            <span style={{ display: 'block', fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>
              Auto Mode will cycle through serial settings (baud, parity, stop bits) using a valid test register from the selected device's map.
            </span>
          </div>
        )}

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
