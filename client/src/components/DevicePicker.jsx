import { useState, useEffect } from 'react';
import { useSocket } from '../hooks/useSocket';

const INTERVALS = [
  { label: '500 ms', ms: 500  },
  { label: '1 s',   ms: 1000 },
  { label: '2 s',   ms: 2000 },
  { label: '5 s',   ms: 5000 },
  { label: '10 s',  ms: 10000},
];

export default function DevicePicker({ db, portStatus, onScanChange }) {
  const { emit, on } = useSocket();

  const [devices,          setDevices]         = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [slaveId,          setSlaveId]          = useState(1);
  const [intervalMs,       setIntervalMs]       = useState(1000);
  const [scanning,         setScanning]         = useState(false);

  const isPortConnected = portStatus?.status === 'ok';
  const isLocalMode = portStatus?.mode === 'local';

  const loadDevices = () => {
    if (!db.ready) return;
    const rows = db.query('SELECT * FROM devices ORDER BY name ASC');
    setDevices(rows);
    if (rows.length > 0 && !selectedDeviceId) {
      setSelectedDeviceId(String(rows[0].id));
      setSlaveId(rows[0].slave_id || 1);
    }
  };

  useEffect(loadDevices, [db.ready, db]);

  useEffect(() => {
    const unsub = on('scan:stopped', () => {
      setScanning(false);
      onScanChange(false, null, null);
    });
    return unsub;
  }, [on, onScanChange]);

  const selectedDevice = devices.find(d => String(d.id) === selectedDeviceId);

  const handleDeviceChange = (e) => {
    setSelectedDeviceId(e.target.value);
    const dev = devices.find(d => String(d.id) === e.target.value);
    if (dev) setSlaveId(dev.slave_id || 1);
  };

  const handleStart = () => {
    if (!selectedDevice) return;
    const registers = db.query(
      'SELECT * FROM registers WHERE device_id = ? ORDER BY display_order ASC, address ASC',
      [selectedDevice.id]
    );
    if (!registers.length) {
      alert('No registers defined for this device.\nGo to /#admin to add registers.');
      return;
    }

    const regPayload = registers.map(r => ({
      id:            r.id,
      address:       r.address,
      function_code: r.function_code || 3,
      label:         r.label,
      data_type:     r.data_type || 'float32_be',
      scale:         r.scale ?? 1.0,
      unit:          r.unit || '',
      group_name:    r.group_name || '',
    }));

    if (isLocalMode) {
      // Direct browser-side scanning, update parents with interval
      setScanning(true);
      onScanChange(true, selectedDevice, regPayload, intervalMs);
    } else {
      // Remote server-side scanning
      emit('scan:start', {
        registers: regPayload,
        intervalMs,
      });
      setScanning(true);
      onScanChange(true, selectedDevice, regPayload, intervalMs);
    }
  };

  const handleStop = () => {
    if (!isLocalMode) {
      emit('scan:stop');
    }
    setScanning(false);
    onScanChange(false, null, null);
  };

  const regCount = selectedDevice
    ? (db.query('SELECT COUNT(*) as n FROM registers WHERE device_id=?', [selectedDevice.id])[0]?.n ?? 0)
    : 0;

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">Device & Scan Control</span>
        {scanning && <span style={{
          fontSize: 11, fontWeight: 700,
          color: 'var(--green)',
          display: 'flex', alignItems: 'center', gap: 5,
        }}>
          <span style={{ animation: 'blink-dot 1s step-start infinite', display:'inline-block', width:7, height:7, borderRadius:'50%', background:'var(--green)' }} />
          SCANNING
        </span>}
      </div>

      <div className="panel-body">
        {!isPortConnected && (
          <div className="status-strip warn" style={{ marginBottom: 10 }}>
            <span className="indicator">⚠</span> Connect a serial port first (see above).
          </div>
        )}

        <div className="conn-grid">
          {/* Device */}
          <div className="conn-field" style={{ flex: '0 0 240px' }}>
            <span className="conn-label">Device</span>
            <select
              className="form-select"
              style={{ width: '100%' }}
              value={selectedDeviceId}
              onChange={handleDeviceChange}
              disabled={scanning}
            >
              {devices.length === 0 && <option value="">No devices — login to Admin to seed</option>}
              {devices.map(d => (
                <option key={d.id} value={String(d.id)}>
                  {d.name}{d.manufacturer ? ` — ${d.manufacturer}` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Slave ID */}
          <div className="conn-field">
            <span className="conn-label">Slave ID</span>
            <input
              type="number"
              className="form-input form-input-sm"
              min={1} max={247}
              value={slaveId}
              onChange={e => setSlaveId(+e.target.value)}
              disabled={scanning}
            />
          </div>

          {/* Poll interval */}
          <div className="conn-field">
            <span className="conn-label">Poll Interval</span>
            <select
              className="form-select form-input-md"
              value={intervalMs}
              onChange={e => setIntervalMs(+e.target.value)}
              disabled={scanning}
            >
              {INTERVALS.map(i => <option key={i.ms} value={i.ms}>{i.label}</option>)}
            </select>
          </div>

          {/* Reg count info */}
          {selectedDevice && (
            <div className="conn-field" style={{ justifyContent: 'flex-end' }}>
              <span className="conn-label">&nbsp;</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', paddingBottom: 5 }}>
                {regCount} register{regCount !== 1 ? 's' : ''} · {selectedDevice.baud_rate} {selectedDevice.parity}
              </span>
            </div>
          )}

          {/* Start/Stop */}
          <div className="conn-field" style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6 }}>
            {!scanning ? (
              <button
                className="btn btn-primary"
                onClick={handleStart}
                disabled={!isPortConnected || !selectedDevice || devices.length === 0}
              >
                ▶ Start Scan
              </button>
            ) : (
              <button className="btn btn-danger" onClick={handleStop}>
                ■ Stop Scan
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
