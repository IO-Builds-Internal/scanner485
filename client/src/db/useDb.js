import { useEffect, useRef, useState, useCallback } from 'react';

const DB_KEY = 'scanner485_db';
const MAX_SCAN_LOG = 10000;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  manufacturer TEXT,
  slave_id INTEGER DEFAULT 1,
  baud_rate INTEGER DEFAULT 9600,
  parity TEXT DEFAULT 'N',
  stop_bits INTEGER DEFAULT 1,
  data_bits INTEGER DEFAULT 8,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS registers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id INTEGER REFERENCES devices(id) ON DELETE CASCADE,
  address INTEGER NOT NULL,
  function_code INTEGER DEFAULT 3,
  label TEXT NOT NULL,
  data_type TEXT DEFAULT 'float32_be',
  scale REAL DEFAULT 1.0,
  unit TEXT,
  group_name TEXT,
  display_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS scan_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id INTEGER,
  register_id INTEGER,
  raw_value TEXT,
  scaled_value REAL,
  ts DATETIME DEFAULT CURRENT_TIMESTAMP
);
`;

/**
 * Load sql.js WASM (from CDN) and initialise the in-browser SQLite DB.
 * Persists to localStorage on every write; restores on page load.
 */
export function useDb() {
  const dbRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  const saveTimeoutRef = useRef(null);

  // ── Save ───────────────────────────────────────────────────────────────
  const save = useCallback(() => {
    if (!dbRef.current) return;
    // Debounce saves by 300 ms
    clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      try {
        const data = dbRef.current.export();
        const b64 = btoa(String.fromCharCode(...data));
        localStorage.setItem(DB_KEY, b64);
      } catch (e) {
        console.error('[db] save error:', e);
      }
    }, 300);
  }, []);

  // ── Init ───────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // Dynamically import sql.js from CDN via script injection
        const SQL = await loadSqlJs();
        if (cancelled) return;

        let db;
        const saved = localStorage.getItem(DB_KEY);
        if (saved) {
          const binary = Uint8Array.from(atob(saved), (c) => c.charCodeAt(0));
          db = new SQL.Database(binary);
        } else {
          db = new SQL.Database();
        }

        db.run(SCHEMA);
        dbRef.current = db;

        // Migration check: If the database contains old wrong registers (e.g. 3901),
        // delete the old EM6400NG entry so it gets cleanly re-seeded with correct registers.
        let hasOldRegs = false;
        try {
          const stmtCheck = db.prepare("SELECT id FROM registers WHERE address = 3901 LIMIT 1");
          if (stmtCheck.step()) {
            hasOldRegs = true;
          }
          stmtCheck.free();
        } catch (_) {}

        if (hasOldRegs) {
          console.log('[db] Detected old/incorrect EM6400NG registers. Performing auto-migration/re-seed...');
          try {
            db.run("DELETE FROM devices WHERE name = 'EM6400NG'");
          } catch (err) {
            console.error('[db] Auto-migration cleanup failed:', err);
          }
        }

        // Auto-seed EM6400NG if devices table is empty
        const stmt = db.prepare('SELECT COUNT(*) as cnt FROM devices');
        stmt.step();
        const { cnt } = stmt.getAsObject();
        stmt.free();

        if (cnt === 0) {
          console.log('[db] No devices found in DB. Auto-seeding EM6400NG device...');
          try {
            const res = await fetch('/api/seed/em6400ng');
            if (res.ok) {
              const seed = await res.json();
              const { device, registers } = seed;
              
              db.run(
                `INSERT INTO devices (name, manufacturer, slave_id, baud_rate, parity, stop_bits, data_bits)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [device.name, device.manufacturer, device.slave_id, device.baud_rate,
                 device.parity, device.stop_bits, device.data_bits]
              );
              
              const rows = [];
              const stmt2 = db.prepare('SELECT id FROM devices WHERE name = ?');
              stmt2.bind([device.name]);
              while (stmt2.step()) {
                rows.push(stmt2.getAsObject());
              }
              stmt2.free();
              
              if (rows.length > 0) {
                const deviceId = rows[rows.length - 1].id;
                for (const [i, reg] of registers.entries()) {
                  db.run(
                    `INSERT INTO registers (device_id, address, function_code, label, data_type, scale, unit, group_name, display_order)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [deviceId, reg.address, reg.function_code, reg.label, reg.data_type,
                     reg.scale, reg.unit, reg.group_name, reg.display_order ?? i]
                  );
                }
                
                // Export and save immediately
                const data = db.export();
                const b64 = btoa(String.fromCharCode(...data));
                localStorage.setItem(DB_KEY, b64);
                console.log('[db] Auto-seeded EM6400NG successfully.');
              }
            }
          } catch (err) {
            console.error('[db] Auto-seeding failed:', err);
          }
        }

        setReady(true);
      } catch (e) {
        if (!cancelled) setError(e.message);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  // ── exec: run SQL that modifies data ─────────────────────────────────
  const exec = useCallback((sql, params = []) => {
    if (!dbRef.current) throw new Error('DB not ready');
    dbRef.current.run(sql, params);
    save();
  }, [save]);

  // ── query: run SELECT and return rows as objects ────────────────────
  const query = useCallback((sql, params = []) => {
    if (!dbRef.current) return [];
    const stmt = dbRef.current.prepare(sql);
    if (params.length) stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  }, []);

  // ── insert and return last insert rowid ──────────────────────────────
  const insert = useCallback((sql, params = []) => {
    if (!dbRef.current) throw new Error('DB not ready');
    dbRef.current.run(sql, params);
    const [{ id }] = dbRef.current.exec('SELECT last_insert_rowid() as id')[0]
      ? dbRef.current.exec('SELECT last_insert_rowid() as id').flatMap(r =>
          r.values.map(v => Object.fromEntries(r.columns.map((c, i) => [c, v[i]])))
        )
      : [{ id: null }];
    save();
    return id;
  }, [save]);

  // ── Prune scan_log ────────────────────────────────────────────────────
  const pruneScanLog = useCallback(() => {
    if (!dbRef.current) return;
    const [{ cnt }] = query('SELECT COUNT(*) as cnt FROM scan_log');
    if (cnt > MAX_SCAN_LOG) {
      exec(`DELETE FROM scan_log WHERE id IN (
        SELECT id FROM scan_log ORDER BY id ASC LIMIT ${cnt - MAX_SCAN_LOG}
      )`);
    }
  }, [query, exec]);

  // ── Export .sqlite file ───────────────────────────────────────────────
  const exportDb = useCallback(() => {
    if (!dbRef.current) return;
    const data = dbRef.current.export();
    const blob = new Blob([data], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scanner485-${new Date().toISOString().slice(0,10)}.sqlite`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  // ── Import .sqlite file ───────────────────────────────────────────────
  const importDb = useCallback((file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const SQL = await loadSqlJs();
          const binary = new Uint8Array(e.target.result);
          const newDb = new SQL.Database(binary);
          newDb.run(SCHEMA); // ensure schema exists
          dbRef.current = newDb;
          save();
          setReady(true);
          resolve();
        } catch (err) { reject(err); }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }, [save]);

  // ── Convenience: seed EM6400NG ────────────────────────────────────────
  const seedEm6400ng = useCallback(async () => {
    const res = await fetch('/api/seed/em6400ng');
    if (!res.ok) throw new Error('Failed to fetch seed data');
    const seed = await res.json();

    const { device, registers } = seed;

    // Upsert device
    exec(
      `INSERT INTO devices (name, manufacturer, slave_id, baud_rate, parity, stop_bits, data_bits)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [device.name, device.manufacturer, device.slave_id, device.baud_rate,
       device.parity, device.stop_bits, device.data_bits]
    );
    const rows = query('SELECT id FROM devices WHERE name = ?', [device.name]);
    const deviceId = rows[rows.length - 1].id;

    for (const [i, reg] of registers.entries()) {
      exec(
        `INSERT INTO registers (device_id, address, function_code, label, data_type, scale, unit, group_name, display_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [deviceId, reg.address, reg.function_code, reg.label, reg.data_type,
         reg.scale, reg.unit, reg.group_name, reg.display_order ?? i]
      );
    }
    return deviceId;
  }, [exec, query]);

  return { ready, error, exec, query, insert, exportDb, importDb, seedEm6400ng, pruneScanLog, db: dbRef };
}

// ── Load sql.js from CDN ───────────────────────────────────────────────────
let sqlPromise = null;

function loadSqlJs() {
  if (sqlPromise) return sqlPromise;

  sqlPromise = new Promise((resolve, reject) => {
    if (window.initSqlJs) {
      window.initSqlJs({ locateFile: f => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/${f}` })
        .then(resolve).catch(reject);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/sql-wasm.js';
    script.onload = () => {
      window.initSqlJs({ locateFile: f => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/${f}` })
        .then(resolve).catch(reject);
    };
    script.onerror = () => reject(new Error('Failed to load sql.js from CDN'));
    document.head.appendChild(script);
  });

  return sqlPromise;
}
