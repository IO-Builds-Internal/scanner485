import { useState, useEffect, useCallback, useRef } from 'react';
import { useDb } from './db/useDb';
import { useSocket } from './hooks/useSocket';
import PortSelector from './components/PortSelector';
import DevicePicker from './components/DevicePicker';
import RegisterTable from './components/RegisterTable';
import LogPanel from './components/LogPanel';
import LiveDataFeed from './components/LiveDataFeed';
import ManualOperations from './components/ManualOperations';
import AdminLogin, { isAdminAuthed, clearAdminAuth } from './components/AdminLogin';
import DeviceAdmin from './components/admin/DeviceAdmin';
import RegisterAdmin from './components/admin/RegisterAdmin';
import SessionReviewer from './components/admin/SessionReviewer';

const SPARKLINE_MAX = 60;
const LOG_MAX = 300;

// ── Simple hash router ──────────────────────────────────────────────────────
function useHashRoute() {
  const [hash, setHash] = useState(window.location.hash || '#');
  useEffect(() => {
    const handler = () => setHash(window.location.hash || '#');
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);
  return hash;
}

function now() {
  return new Date().toLocaleTimeString('en-GB', { hour12: false });
}

// ── App ─────────────────────────────────────────────────────────────────────
export default function App() {
  const db = useDb();
  const { on, emit, connected } = useSocket();
  const hash = useHashRoute();

  // Automatic redirect if user types standard '/admin' in URL bar instead of '/#admin'
  useEffect(() => {
    if (window.location.pathname === '/admin' || window.location.pathname === '/admin/') {
      window.location.replace('/#admin');
    }
  }, []);

  const isAdmin = hash === '#admin';

  // ── Auth state ─────────────────────────────────────────────────────────────
  const [adminAuthed, setAdminAuthed] = useState(isAdminAuthed);

  // ── Monitor state ──────────────────────────────────────────────────────────
  const [portStatus,    setPortStatus]    = useState(null);
  const [scanning,      setScanning]      = useState(false);
  const [scanDevice,    setScanDevice]    = useState(null);
  const [scanRegisters, setScanRegisters] = useState([]);
  const [readings,      setReadings]      = useState(new Map());
  
  const [activeTab,     setActiveTab]     = useState('values'); // 'values' | 'feed' | 'manual'
  const [feedEntries,   setFeedEntries]   = useState([]);
  
  const [adminTab,      setAdminTab]      = useState('registry'); // 'registry' | 'reviewer'

  const scanRegistersRef = useRef([]);
  useEffect(() => {
    scanRegistersRef.current = scanRegisters;
  }, [scanRegisters]);

  // ── Log ────────────────────────────────────────────────────────────────────
  const [logEntries, setLogEntries] = useState([]);
  const addLog = useCallback((msg, level = 'info') => {
    setLogEntries(prev => {
      const next = [...prev, { ts: now(), msg, level }];
      return next.length > LOG_MAX ? next.slice(-LOG_MAX) : next;
    });
  }, []);

  // ── Session Report Compiler & Exporter ──────────────────────────────────────
  const handleExportSession = useCallback(() => {
    const sessionReport = {
      metadata: {
        generator: 'scanner485',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
      },
      connection: {
        port: portStatus?.port || 'N/A',
        baudRate: portStatus?.baudRate || 19200,
        parity: portStatus?.parity || 'even',
        stopBits: portStatus?.stopBits || 1,
        dataBits: portStatus?.dataBits || 8,
      },
      device: {
        name: scanDevice?.name || 'Generic Device',
        manufacturer: scanDevice?.manufacturer || 'Unknown',
      },
      readings: Array.from(readings.values()),
      logs: logEntries,
    };

    const blob = new Blob([JSON.stringify(sessionReport, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scanner485-session-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    addLog('Session report document exported successfully.', 'ok');
  }, [portStatus, scanDevice, readings, logEntries, addLog]);

  // ── Admin state ────────────────────────────────────────────────────────────
  const [adminDevice, setAdminDevice] = useState(null);

  // ── Toast ──────────────────────────────────────────────────────────────────
  const [toasts, setToasts] = useState([]);
  const toastId = useRef(0);

  const addToast = useCallback((text, type = 'warn') => {
    const id = ++toastId.current;
    setToasts(p => [...p, { id, text, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 5000);
  }, []);

  // ── Socket events ──────────────────────────────────────────────────────────
  useEffect(() => on('scan:reading', (batch) => {
    // 1. Update readings map (table display, history sparklines)
    setReadings(prev => {
      const next = new Map(prev);
      for (const item of batch) {
        const ex = next.get(item.registerId) ?? { history: [] };
        const history = [...ex.history, item.value].slice(-SPARKLINE_MAX);
        next.set(item.registerId, { ...item, history });
      }
      return next;
    });

    // 2. Append to Live Data Feed entries (CSV export, sequential history log)
    setFeedEntries(prev => {
      const timestamp = new Date().toLocaleTimeString();
      const newEntries = batch.map(item => {
        const def = scanRegistersRef.current.find(r => r.id === item.registerId);
        return {
          ts: timestamp,
          label: item.label,
          address: def ? def.address : '—',
          value: item.value,
          unit: item.unit
        };
      });
      const next = [...prev, ...newEntries];
      return next.length > 5000 ? next.slice(-5000) : next;
    });
  }), [on]);

  useEffect(() => on('scan:error', ({ code, message }) => {
    addLog(`${code}: ${message}`, 'err');
    addToast(`${code} — ${message}`, 'error');
  }), [on, addLog, addToast]);

  useEffect(() => on('port:connected', () => {
    addLog(`Socket server connected`, 'ok');
  }), [on, addLog]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handlePortStatus = useCallback((status) => {
    setPortStatus(status);
    if (status.status === 'ok') {
      addLog(`Port opened: ${status.port}`, 'ok');
    } else if (status.status === 'error') {
      addLog(`Port error: ${status.message}`, 'err');
      addToast(status.message, 'error');
    } else if (status.status === 'disconnected') {
      addLog('Port disconnected.', 'info');
      setScanning(false);
      setScanRegisters([]);
      setReadings(new Map());
    }
  }, [addLog, addToast]);

  const handleScanChange = useCallback((isScanning, device, registers) => {
    setScanning(isScanning);
    setScanDevice(device);
    setScanRegisters(registers ?? []);
    if (isScanning) {
      addLog(`Scan started — ${device?.name}, ${registers?.length} registers`, 'ok');
    } else {
      addLog('Scan stopped.', 'info');
      setReadings(new Map());
    }
  }, [addLog]);

  const handleLogout = () => {
    clearAdminAuth();
    setAdminAuthed(false);
    window.location.hash = '#';
  };

  // ── Status for header pill ─────────────────────────────────────────────────
  const isConnected = portStatus?.status === 'ok';
  const isError     = portStatus?.status === 'error';
  const dotClass    = scanning ? 'scan' : isConnected ? 'ok' : isError ? 'err' : '';
  const statusText  = !connected          ? 'Server offline'
                    : scanning            ? `Scanning · ${scanRegisters.length} regs`
                    : isConnected         ? `${portStatus.port}`
                    : 'Not connected';

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="app-shell">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="app-header">
        <div className="header-logo-area">
          <img src="/logo.png" alt="IO Builds" />
        </div>

        <div className="header-title-area">
          <span className="header-title">scanner485 — RS-485 Reader</span>
          <div className="header-divider" />
          <span className="header-subtitle">Modbus RTU · EM6400NG</span>
        </div>

        <div className="header-spacer" />

        {/* Only show nav in admin view */}
        {isAdmin && adminAuthed && (
          <div className="header-tabs">
            <button className="header-tab" onClick={() => { window.location.hash = '#'; }}>
              ← Monitor
            </button>
            <button className="header-tab active">
              Admin
            </button>
          </div>
        )}

        {/* Export Session button (only when active session has feed entries) */}
        {feedEntries.length > 0 && (
          <button
            onClick={handleExportSession}
            className="btn btn-success btn-sm"
            style={{ marginRight: 12, height: 24, fontSize: 11 }}
            title="Export and download complete session diagnostics report"
          >
            📥 Export Session
          </button>
        )}

        {/* Status pill */}
        <div className="header-status-pill">
          <span className={`dot ${dotClass}`} />
          <span>{statusText}</span>
        </div>

        {/* Logout button (admin only) */}
        {isAdmin && adminAuthed && (
          <button
            onClick={handleLogout}
            style={{
              marginRight: 16,
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 'var(--r-sm)',
              color: '#8fb3d8',
              fontSize: 11,
              padding: '4px 10px',
              cursor: 'pointer',
              fontFamily: 'var(--font)',
            }}
          >
            Logout
          </button>
        )}
      </header>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      {isAdmin ? (
        /* ── ADMIN VIEW ───────────────────────────────────────────────── */
        adminAuthed ? (
          <div className="app-body" style={{ overflow: 'hidden' }}>
            {/* Admin Controls Panel with Tab selectors */}
            <div style={{ marginBottom: 4, flexShrink: 0 }}>
              <div className="panel">
                <div className="panel-header" style={{ justifyContent: 'space-between', padding: '6px 12px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span className="panel-title">Admin Diagnostic Dashboard</span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                      Manage hardware device maps or upload & inspect diagnostic session documents
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      className={`btn ${adminTab === 'registry' ? 'btn-primary' : 'btn-default'} btn-sm`}
                      onClick={() => setAdminTab('registry')}
                    >
                      📁 Device Registry
                    </button>
                    <button
                      className={`btn ${adminTab === 'reviewer' ? 'btn-primary' : 'btn-default'} btn-sm`}
                      onClick={() => setAdminTab('reviewer')}
                    >
                      🔍 Session Reviewer
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Tab Content rendering */}
            {adminTab === 'registry' ? (
              <div className="admin-wrap" style={{ flex: 1, minHeight: 0 }}>
                {/* Left — device list */}
                <div className="panel" style={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                  <div className="panel-header">
                    <span className="panel-title">Devices</span>
                  </div>
                  <DeviceAdmin
                    db={db}
                    selectedDeviceId={adminDevice?.id}
                    onDeviceSelect={setAdminDevice}
                  />
                </div>

                {/* Right — register map */}
                <div className="panel" style={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                  <div className="panel-header">
                    <span className="panel-title">
                      Registers{adminDevice ? ` — ${adminDevice.name}` : ''}
                    </span>
                  </div>
                  <RegisterAdmin db={db} device={adminDevice} />
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }} className="panel">
                <SessionReviewer />
              </div>
            )}
          </div>
        ) : (
          /* ── ADMIN LOGIN ──────────────────────────────────────────────── */
          <AdminLogin onAuth={setAdminAuthed} />
        )
      ) : (
        /* ── MONITOR VIEW ─────────────────────────────────────────────── */
        <div className="app-body">
          {/* Row 1: Connection + Device controls */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, flexShrink: 0 }}>
            <PortSelector portStatus={portStatus} onStatusChange={handlePortStatus} />
            <DevicePicker db={db} portConnected={isConnected} onScanChange={handleScanChange} />
          </div>

          {/* Row 2: Tab Bar + Component */}
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, gap: 8 }}>
            {/* Tab Bar */}
            <div style={{ display: 'flex', gap: 6, background: 'var(--bg-panel)', padding: '6px 10px', borderRadius: 'var(--r-md)', border: '1px solid var(--border)', flexShrink: 0 }}>
              <button 
                className={`btn ${activeTab === 'values' ? 'btn-primary' : 'btn-default'} btn-sm`} 
                onClick={() => setActiveTab('values')}
              >
                📊 Live Values
              </button>
              <button 
                className={`btn ${activeTab === 'feed' ? 'btn-primary' : 'btn-default'} btn-sm`} 
                onClick={() => setActiveTab('feed')}
              >
                🕒 Live Data Feed
              </button>
              <button 
                className={`btn ${activeTab === 'manual' ? 'btn-primary' : 'btn-default'} btn-sm`} 
                onClick={() => setActiveTab('manual')}
              >
                ⌨️ Manual Operations
              </button>
            </div>
            
            {/* Active Tab Component */}
            {activeTab === 'values' && (
              <RegisterTable readings={readings} registers={scanRegisters} scanning={scanning} />
            )}
            {activeTab === 'feed' && (
              <LiveDataFeed feedEntries={feedEntries} onClear={() => setFeedEntries([])} />
            )}
            {activeTab === 'manual' && (
              <ManualOperations isConnected={isConnected} />
            )}
          </div>

          {/* Row 3: Log panel (fixed height) */}
          <LogPanel entries={logEntries} onClear={() => setLogEntries([])} />
        </div>
      )}

      {/* ── Toast stack ─────────────────────────────────────────────────── */}
      <div className="toast-stack">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            <div>
              <div className="toast-title">{t.type === 'error' ? 'Error' : 'Warning'}</div>
              <div className="toast-msg">{t.text}</div>
            </div>
            <button className="toast-close" onClick={() => setToasts(p => p.filter(x => x.id !== t.id))}>×</button>
          </div>
        ))}
      </div>
    </div>
  );
}
