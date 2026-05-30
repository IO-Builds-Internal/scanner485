import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import apiRouter from './routes/api.js';
import { registerSocketHandlers } from './socketHandlers.js';
import { listPorts } from './serialManager.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

// ── Express ─────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

const corsOptions = {
  origin: NODE_ENV === 'production' ? CORS_ORIGIN : '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
};
app.use(cors(corsOptions));

// REST routes
app.use('/api', apiRouter);

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// Serving static assets in production
if (NODE_ENV === 'production') {
  const clientDist = join(__dirname, '../client/dist');
  app.use(express.static(clientDist));
  // Fallback to React index.html for unmatched path routes
  app.get('*', (req, res) => {
    // Avoid intercepting API or health requests
    if (req.path.startsWith('/api') || req.path.startsWith('/health')) {
      return res.status(404).json({ error: 'Not found' });
    }
    res.sendFile(join(clientDist, 'index.html'));
  });
}

// ── HTTP + Socket.io ─────────────────────────────────────────────────────────
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: corsOptions,
  transports: ['websocket', 'polling'],
});

io.on('connection', (socket) => {
  console.log(`[socket] client connected: ${socket.id}`);

  // Immediately send available ports to the newly connected client
  listPorts()
    .then((ports) => socket.emit('ports:list', ports))
    .catch((err) => {
      console.error('[ports] list error:', err.message);
      socket.emit('ports:list', []);
    });

  registerSocketHandlers(io, socket);

  socket.on('disconnect', (reason) => {
    console.log(`[socket] client disconnected: ${socket.id} (${reason})`);
  });
});

// ── Start ────────────────────────────────────────────────────────────────────
httpServer.listen(PORT, () => {
  console.log(`\n🚀  scanner485 server running on http://localhost:${PORT}`);
  console.log(`   ENV: ${NODE_ENV}`);
  console.log(`   CORS origin: ${corsOptions.origin}\n`);
});
