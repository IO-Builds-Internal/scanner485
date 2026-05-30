import { useState, useEffect } from 'react';

const DEFAULT = {
  name: '', manufacturer: '',
  slave_id: 1, baud_rate: 9600,
  parity: 'N', stop_bits: 1, data_bits: 8,
};

export default function DeviceAdmin({ db, onDeviceSelect, selectedDeviceId }) {
  const [devices, setDevices] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editDevice, setEditDevice] = useState(null);
  const [form, setForm] = useState(DEFAULT);
  const [msg, setMsg] = useState(null);  // { text, type }
  const [seeding, setSeeding] = useState(false);

  const reload = () => {
    if (!db.ready) return;
    setDevices(db.query('SELECT * FROM devices ORDER BY name ASC'));
  };

  useEffect(reload, [db.ready]);

  const showMsg = (text, type = 'ok') => {
    setMsg({ text, type });
    setTimeout(() => setMsg(null), 4000);
  };

  const handleSeed = async () => {
    setSeeding(true);
    try {
      await db.seedEm6400ng();
      reload();
      showMsg('EM6400NG seeded successfully — 28 registers added.', 'ok');
    } catch (e) {
      showMsg(e.message, 'err');
    } finally {
      setSeeding(false);
    }
  };

  const handleExport = () => db.exportDb();

  const handleImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    db.importDb(file).then(() => { reload(); showMsg('Database imported successfully.'); });
    e.target.value = '';
  };

  const openEdit = (d) => { setEditDevice(d); setForm({ ...d }); setShowForm(true); };
  const openNew  = ()  => { setEditDevice(null); setForm(DEFAULT); setShowForm(true); };

  const handleDelete = (id) => {
    if (!confirm('Delete this device and ALL its registers?')) return;
    db.exec('DELETE FROM registers WHERE device_id = ?', [id]);
    db.exec('DELETE FROM devices WHERE id = ?', [id]);
    reload();
    if (String(selectedDeviceId) === String(id)) onDeviceSelect(null);
  };

  const handleSave = () => {
    if (!form.name.trim()) return;
    if (editDevice) {
      db.exec(
        `UPDATE devices SET name=?,manufacturer=?,slave_id=?,baud_rate=?,parity=?,stop_bits=?,data_bits=? WHERE id=?`,
        [form.name, form.manufacturer, form.slave_id, form.baud_rate,
         form.parity, form.stop_bits, form.data_bits, editDevice.id]
      );
    } else {
      db.exec(
        `INSERT INTO devices (name,manufacturer,slave_id,baud_rate,parity,stop_bits,data_bits)
         VALUES (?,?,?,?,?,?,?)`,
        [form.name, form.manufacturer, form.slave_id, form.baud_rate,
         form.parity, form.stop_bits, form.data_bits]
      );
    }
    setShowForm(false);
    reload();
  };

  const f  = k => e => setForm(p => ({ ...p, [k]: e.target.value }));
  const fn = k => e => setForm(p => ({ ...p, [k]: +e.target.value }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <div className="db-bar">
        <button className="btn btn-primary btn-sm" onClick={handleSeed} disabled={seeding}>
          {seeding ? <><span className="spinner" /> Seeding…</> : 'Seed EM6400NG'}
        </button>
        <div className="toolbar-sep" />
        <button className="btn btn-default btn-sm" onClick={handleExport}>↓ Export .sqlite</button>
        <label className="btn btn-default btn-sm" style={{ cursor: 'pointer', height: 24 }}>
          ↑ Import .sqlite
          <input type="file" accept=".sqlite,.db" style={{ display: 'none' }} onChange={handleImport} />
        </label>
        <div className="toolbar-spacer" />
        <button className="btn btn-default btn-sm" onClick={openNew}>+ New Device</button>
      </div>

      {msg && (
        <div style={{
          padding: '6px 12px', fontSize: 12, margin: '0',
          background: msg.type === 'ok' ? 'var(--green-bg)' : 'var(--red-bg)',
          border: `1px solid ${msg.type === 'ok' ? 'var(--green-border)' : 'var(--red-border)'}`,
          color: msg.type === 'ok' ? 'var(--green)' : 'var(--red)',
        }}>
          {msg.text}
        </div>
      )}

      {/* Device list */}
      <div className="admin-device-list" style={{ flex: 1, overflowY: 'auto' }}>
        {devices.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🔌</div>
            <div className="empty-title">No devices</div>
            <div className="empty-desc">Click "Seed EM6400NG" to load the default energy meter, or add a device manually.</div>
          </div>
        ) : (
          devices.map(d => (
            <div
              key={d.id}
              className={`device-row${String(d.id) === String(selectedDeviceId) ? ' selected' : ''}`}
              onClick={() => onDeviceSelect(d)}
            >
              <div style={{ flex: 1 }}>
                <div className="device-row-name">{d.name}</div>
                <div className="device-row-meta">{d.manufacturer || '—'} · {d.baud_rate} {d.parity} · Slave {d.slave_id}</div>
              </div>
              <button className="btn btn-default btn-sm" onClick={e => { e.stopPropagation(); openEdit(d); }} title="Edit">✎</button>
              <button className="btn btn-sm" style={{ color: 'var(--red)', background: 'none', border: '1px solid rgba(185,28,28,0.2)' }}
                onClick={e => { e.stopPropagation(); handleDelete(d.id); }} title="Delete">✕</button>
            </div>
          ))
        )}
      </div>

      {showForm && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{editDevice ? 'Edit Device' : 'New Device'}</span>
              <button className="modal-close" onClick={() => setShowForm(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group full">
                  <label className="form-label">Name *</label>
                  <input className="form-input-full" value={form.name} onChange={f('name')} placeholder="EM6400NG" />
                </div>
                <div className="form-group full">
                  <label className="form-label">Manufacturer</label>
                  <input className="form-input-full" value={form.manufacturer} onChange={f('manufacturer')} placeholder="Schneider Electric" />
                </div>
                <div className="form-group">
                  <label className="form-label">Slave ID</label>
                  <input type="number" className="form-input-full" value={form.slave_id} onChange={fn('slave_id')} min={1} max={247} />
                </div>
                <div className="form-group">
                  <label className="form-label">Baud Rate</label>
                  <select className="form-select-full" value={form.baud_rate} onChange={fn('baud_rate')}>
                    {[1200,2400,4800,9600,19200,38400,57600,115200].map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Parity</label>
                  <select className="form-select-full" value={form.parity} onChange={f('parity')}>
                    <option value="N">None (N)</option>
                    <option value="E">Even (E)</option>
                    <option value="O">Odd (O)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Stop Bits</label>
                  <select className="form-select-full" value={form.stop_bits} onChange={fn('stop_bits')}>
                    <option value={1}>1</option><option value={2}>2</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-default" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={!form.name.trim()}>
                {editDevice ? 'Save Changes' : 'Create Device'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
