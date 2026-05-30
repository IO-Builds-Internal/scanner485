import { Router } from 'express';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { listPorts } from '../serialManager.js';

const ADMIN_PIN = process.env.ADMIN_PIN || 'admin';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED_PATH = join(__dirname, '../../seed/em6400ng.json');

const router = Router();

// ── GET /api/ports ────────────────────────────────────────────────────────────
router.get('/ports', async (_req, res) => {
  try {
    const ports = await listPorts();
    res.json(ports);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/seed/em6400ng ────────────────────────────────────────────────────
router.get('/seed/em6400ng', async (_req, res) => {
  try {
    const raw = await readFile(SEED_PATH, 'utf-8');
    const seed = JSON.parse(raw);
    res.json(seed);
  } catch (err) {
    res.status(500).json({ error: `Failed to load seed: ${err.message}` });
  }
});

// ── GET /api/seed/:name (generic seed endpoint for future devices) ─────────────
router.get('/seed/:name', async (req, res) => {
  const name = req.params.name.replace(/[^a-z0-9_-]/gi, ''); // sanitize
  const filePath = join(__dirname, `../../seed/${name}.json`);
  try {
    const raw = await readFile(filePath, 'utf-8');
    res.json(JSON.parse(raw));
  } catch (_) {
    res.status(404).json({ error: `No seed file found for '${name}'` });
  }
});

// ── POST /api/admin/verify ────────────────────────────────────────────────────
// Body: { pin: string }
// Returns: { ok: true } or { ok: false }
router.post('/admin/verify', (req, res) => {
  const { pin } = req.body || {};
  if (typeof pin === 'string' && pin === ADMIN_PIN) {
    res.json({ ok: true });
  } else {
    res.status(401).json({ ok: false });
  }
});

export default router;
