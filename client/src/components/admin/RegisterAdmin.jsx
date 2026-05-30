import { useState, useEffect } from 'react';

const DATA_TYPES = ['float32_be','uint16','int16','uint32_be','int32_be'];

const DEFAULT = {
  address: '', function_code: 3, label: '',
  data_type: 'float32_be', scale: 1.0, unit: '', group_name: '', display_order: 0,
};

export default function RegisterAdmin({ db, device }) {
  const [registers, setRegisters] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editReg, setEditReg] = useState(null);
  const [form, setForm] = useState(DEFAULT);

  const reload = () => {
    if (!db.ready || !device) { setRegisters([]); return; }
    setRegisters(db.query(
      'SELECT * FROM registers WHERE device_id=? ORDER BY display_order ASC, address ASC',
      [device.id]
    ));
  };

  useEffect(reload, [db.ready, device?.id]);

  const openNew  = () => { setEditReg(null); setForm({ ...DEFAULT, display_order: registers.length }); setShowForm(true); };
  const openEdit = r  => { setEditReg(r); setForm({ ...r }); setShowForm(true); };

  const handleDelete = id => {
    if (!confirm('Delete this register?')) return;
    db.exec('DELETE FROM registers WHERE id=?', [id]);
    reload();
  };

  const handleSave = () => {
    if (!form.label.trim() || !String(form.address).trim()) return;
    if (editReg) {
      db.exec(
        `UPDATE registers SET address=?,function_code=?,label=?,data_type=?,scale=?,unit=?,group_name=?,display_order=? WHERE id=?`,
        [+form.address,+form.function_code,form.label,form.data_type,+form.scale,form.unit,form.group_name,+form.display_order,editReg.id]
      );
    } else {
      db.exec(
        `INSERT INTO registers (device_id,address,function_code,label,data_type,scale,unit,group_name,display_order)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [device.id,+form.address,+form.function_code,form.label,form.data_type,+form.scale,form.unit,form.group_name,+form.display_order]
      );
    }
    setShowForm(false);
    reload();
  };

  const f  = k => e => setForm(p => ({ ...p, [k]: e.target.value }));
  const fn = k => e => setForm(p => ({ ...p, [k]: e.target.value }));

  if (!device) {
    return (
      <div className="empty-state">
        <div className="empty-icon">👈</div>
        <div className="empty-title">Select a device</div>
        <div className="empty-desc">Choose a device from the left panel to view and edit its Modbus register map.</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <div className="db-bar">
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{device.name}</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>— {registers.length} register{registers.length !== 1 ? 's' : ''}</span>
        <div className="toolbar-spacer" />
        <button className="btn btn-primary btn-sm" onClick={openNew}>+ Add Register</button>
      </div>

      {registers.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📊</div>
          <div className="empty-title">No registers</div>
          <div className="empty-desc">Use "Seed EM6400NG" on the left, or add registers manually.</div>
        </div>
      ) : (
        <div className="overflow-auto" style={{ flex: 1 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Address</th>
                <th>FC</th>
                <th>Label</th>
                <th>Data Type</th>
                <th>Scale</th>
                <th>Unit</th>
                <th>Group</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {registers.map(r => (
                <tr key={r.id}>
                  <td className="mono">{r.display_order}</td>
                  <td className="mono">{r.address}</td>
                  <td className="mono">FC{r.function_code}</td>
                  <td>{r.label}</td>
                  <td className="mono" style={{ fontSize: 11 }}>{r.data_type}</td>
                  <td className="mono">{r.scale}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{r.unit || '—'}</td>
                  <td style={{ fontSize: 11 }}>{r.group_name || '—'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-default btn-sm" onClick={() => openEdit(r)}>✎</button>
                      <button className="btn btn-sm" style={{ color: 'var(--red)', background: 'none', border: '1px solid rgba(185,28,28,0.2)' }}
                        onClick={() => handleDelete(r.id)}>✕</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{editReg ? 'Edit Register' : 'New Register'}</span>
              <button className="modal-close" onClick={() => setShowForm(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group full">
                  <label className="form-label">Label *</label>
                  <input className="form-input-full" value={form.label} onChange={f('label')} placeholder="Voltage L1-N" />
                </div>
                <div className="form-group">
                  <label className="form-label">Address *</label>
                  <input type="number" className="form-input-full" value={form.address} onChange={fn('address')} placeholder="3901" min={0} />
                </div>
                <div className="form-group">
                  <label className="form-label">Function Code</label>
                  <select className="form-select-full" value={form.function_code} onChange={fn('function_code')}>
                    <option value={3}>FC03 — Holding Regs</option>
                    <option value={4}>FC04 — Input Regs</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Data Type</label>
                  <select className="form-select-full" value={form.data_type} onChange={f('data_type')}>
                    {DATA_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Scale</label>
                  <input type="number" step="any" className="form-input-full" value={form.scale} onChange={fn('scale')} />
                </div>
                <div className="form-group">
                  <label className="form-label">Unit</label>
                  <input className="form-input-full" value={form.unit} onChange={f('unit')} placeholder="V, A, kW…" />
                </div>
                <div className="form-group">
                  <label className="form-label">Group</label>
                  <input className="form-input-full" value={form.group_name} onChange={f('group_name')} placeholder="Voltage, Current…" />
                </div>
                <div className="form-group">
                  <label className="form-label">Display Order</label>
                  <input type="number" className="form-input-full" value={form.display_order} onChange={fn('display_order')} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-default" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave}
                disabled={!form.label.trim() || !String(form.address).trim()}>
                {editReg ? 'Save Changes' : 'Add Register'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
