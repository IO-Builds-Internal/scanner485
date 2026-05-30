import { useState, useEffect } from 'react';

const ADMIN_PIN_KEY = 'scanner485_admin_auth';

/**
 * Simple PIN login for the admin panel.
 * The PIN is checked against the server GET /api/admin/verify.
 * If not set, default PIN is "admin".
 * Session persists in sessionStorage (clears on tab close).
 */
export default function AdminLogin({ onAuth }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!pin.trim()) return;
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/admin/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (data.ok) {
        sessionStorage.setItem(ADMIN_PIN_KEY, '1');
        onAuth(true);
      } else {
        setError('Incorrect PIN. Please try again.');
        setPin('');
      }
    } catch {
      // If server unreachable, fall back to client-side default PIN "admin"
      if (pin === 'admin') {
        sessionStorage.setItem(ADMIN_PIN_KEY, '1');
        onAuth(true);
      } else {
        setError('Incorrect PIN.');
        setPin('');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
      padding: 24,
    }}>
      <div style={{
        background: 'var(--bg-white)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-lg)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
        width: 320,
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          background: 'var(--bg-header)',
          padding: '14px 20px',
          borderBottom: '3px solid #2a5aa0',
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 2 }}>
            Administrator Access
          </div>
          <div style={{ fontSize: 11, color: '#8fb3d8' }}>
            scanner485 · Device Registry
          </div>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} style={{ padding: 20 }}>
          <div style={{ marginBottom: 14 }}>
            <label style={{
              display: 'block',
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              color: 'var(--text-secondary)',
              marginBottom: 5,
            }}>
              Admin PIN
            </label>
            <input
              type="password"
              className="form-input-full"
              value={pin}
              onChange={e => setPin(e.target.value)}
              placeholder="Enter PIN"
              autoFocus
              disabled={loading}
              style={{ letterSpacing: '0.2em' }}
            />
          </div>

          {error && (
            <div style={{
              padding: '6px 10px',
              borderRadius: 'var(--r-sm)',
              background: 'var(--red-bg)',
              border: '1px solid var(--red-border)',
              color: 'var(--red)',
              fontSize: 12,
              marginBottom: 14,
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary w-full"
            style={{ width: '100%', height: 32, fontSize: 12 }}
            disabled={loading || !pin.trim()}
          >
            {loading ? <><span className="spinner" /> Verifying…</> : 'Login'}
          </button>
        </form>

        <div style={{
          padding: '8px 20px 12px',
          fontSize: 11,
          color: 'var(--text-muted)',
          textAlign: 'center',
          borderTop: '1px solid var(--border-light)',
        }}>
          Navigate to <code style={{ background: 'var(--bg-panel)', padding: '1px 4px', borderRadius: 2 }}>/#admin</code> to access device management.
        </div>
      </div>
    </div>
  );
}

/** Check if already authenticated this session */
export function isAdminAuthed() {
  return sessionStorage.getItem(ADMIN_PIN_KEY) === '1';
}

/** Clear admin session */
export function clearAdminAuth() {
  sessionStorage.removeItem(ADMIN_PIN_KEY);
}
