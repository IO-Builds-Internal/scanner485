import { openPort, closePort, listPorts, isPortOpen } from './serialManager.js';
import {
  connectModbus,
  disconnectModbus,
  readHoldingRegisters,
  readInputRegisters,
  setSlaveId,
  writeSingleRegister,
  writeMultipleRegisters,
  autoDetectSettings,
} from './modbusEngine.js';
import { mapReadings, groupIntoBlocks, decodeWords, encodeWords } from './registerMapper.js';

/**
 * Per-socket state: scan interval handle.
 * Keyed by socket.id.
 * @type {Map<string, ReturnType<typeof setInterval>>}
 */
const scanIntervals = new Map();

/**
 * Register all Socket.io handlers for a connected client.
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
export function registerSocketHandlers(io, socket) {
  // ── port:refresh ────────────────────────────────────────────────────────
  socket.on('port:refresh', async () => {
    try {
      const ports = await listPorts();
      socket.emit('ports:list', ports);
    } catch (err) {
      socket.emit('scan:error', { code: 'PORT_LIST_FAIL', message: err.message });
    }
  });

  // ── port:connect ─────────────────────────────────────────────────────────
  socket.on('port:connect', async (config) => {
    const { port, baudRate = 9600, parity = 'none', stopBits = 1, dataBits = 8, slaveId = 1 } = config;

    if (!port) {
      socket.emit('port:connected', { status: 'error', message: 'No port specified.' });
      return;
    }

    try {
      const serialPort = await openPort({ path: port, baudRate, parity, stopBits, dataBits });
      await connectModbus(serialPort, slaveId);
      socket.emit('port:connected', { port, status: 'ok' });
      console.log(`[handler] port connected for socket ${socket.id}`);
    } catch (err) {
      console.error('[handler] port:connect error:', err.message);
      socket.emit('port:connected', { port, status: 'error', message: err.message });
      // Try to clean up
      try { await disconnectModbus(); } catch (_) {}
      try { await closePort(); } catch (_) {}
    }
  });

  // ── port:disconnect ───────────────────────────────────────────────────────
  socket.on('port:disconnect', async () => {
    _stopScan(socket.id);
    try { await disconnectModbus(); } catch (_) {}
    try { await closePort(); } catch (_) {}
    socket.emit('port:connected', { status: 'disconnected' });
    console.log(`[handler] port disconnected for socket ${socket.id}`);
  });

  // ── scan:start ────────────────────────────────────────────────────────────
  socket.on('scan:start', (payload) => {
    const { registers = [], intervalMs = 5000, slaveId = 1 } = payload;

    if (!registers.length) {
      socket.emit('scan:error', { code: 'NO_REGISTERS', message: 'No registers provided for scan.' });
      return;
    }
    if (!isPortOpen()) {
      socket.emit('scan:error', { code: 'PORT_NOT_OPEN', message: 'Serial port is not open.' });
      return;
    }

    _stopScan(socket.id); // clear any existing interval

    const blocks = groupIntoBlocks(registers);
    console.log(`[scan] starting for socket ${socket.id}, ${registers.length} registers, ${intervalMs}ms interval`);

    const doScan = async () => {
      const allReadings = [];
      setSlaveId(slaveId);

      for (const block of blocks) {
        try {
          let rawWords;
          if (block.fc === 4) {
            rawWords = await readInputRegisters(block.startAddress, block.count);
          } else {
            rawWords = await readHoldingRegisters(block.startAddress, block.count);
          }

          const readings = mapReadings(rawWords, block.startAddress, block.registers);
          allReadings.push(...readings);
        } catch (err) {
          const code = classifyModbusError(err);
          console.error(`[scan] block FC${block.fc} @${block.startAddress} error:`, err.message);
          socket.emit('scan:error', {
            code,
            message: `FC${block.fc} read at address ${block.startAddress}: ${err.message}`,
          });
          // Don't stop the scan on a single block error — continue with next block
        }
      }

      if (allReadings.length > 0) {
        socket.emit('scan:reading', allReadings);
      }
    };

    // Run immediately, then on interval
    doScan();
    const handle = setInterval(doScan, intervalMs);
    scanIntervals.set(socket.id, handle);
  });

  // ── scan:stop ─────────────────────────────────────────────────────────────
  socket.on('scan:stop', () => {
    _stopScan(socket.id);
    console.log(`[scan] stopped for socket ${socket.id}`);
    socket.emit('scan:stopped');
  });

  // ── port:autodetect ───────────────────────────────────────────────────────
  socket.on('port:autodetect', async (payload) => {
    const { port, slaveId = 1, address = 0, fc = 3 } = payload;
    if (!port) {
      socket.emit('port:autodetected', { status: 'error', message: 'No port specified.' });
      return;
    }

    try {
      // Temporarily disconnect active Modbus / port if open, to avoid locks
      const wasOpen = isPortOpen();
      if (wasOpen) {
        try { await disconnectModbus(); } catch (_) {}
        try { await closePort(); } catch (_) {}
      }

      console.log(`[handler] starting autodetect on port ${port}`);
      const config = await autoDetectSettings(port, { slaveId, address, fc });
      
      socket.emit('port:autodetected', { status: 'ok', ...config });
    } catch (err) {
      console.error('[handler] autodetect error:', err.message);
      socket.emit('port:autodetected', { status: 'error', message: err.message });
    }
  });

  // ── modbus:manual ────────────────────────────────────────────────────────
  socket.on('modbus:manual', async (payload) => {
    const { fc, address, value, count = 1, dataType = 'uint16', slaveId } = payload;

    if (!isPortOpen()) {
      socket.emit('modbus:manual:result', { status: 'error', message: 'Serial port is not open.' });
      return;
    }

    try {
      if (slaveId !== undefined) {
        setSlaveId(slaveId);
      }

      if (fc === 3 || fc === 4) {
        // Read operation
        let rawWords;
        if (fc === 4) {
          rawWords = await readInputRegisters(address, count);
        } else {
          rawWords = await readHoldingRegisters(address, count);
        }

        let decoded = null;
        try {
          decoded = decodeWords(rawWords, dataType);
        } catch (e) {
          // If decoding fails, or is partial, just return null decoded
        }

        socket.emit('modbus:manual:result', {
          status: 'ok',
          operation: 'read',
          raw: rawWords,
          decoded,
          ts: new Date().toLocaleTimeString(),
        });
      } else if (fc === 6 || fc === 16) {
        // Write operation
        let wordsToWrite;
        if (dataType === 'raw') {
          // Parse values as comma-separated integers if raw array
          wordsToWrite = String(value).split(',').map(x => parseInt(x.trim(), 10)).filter(x => !isNaN(x));
        } else {
          wordsToWrite = encodeWords(value, dataType);
        }

        if (wordsToWrite.length === 0) {
          throw new Error('No valid values to write.');
        }

        if (wordsToWrite.length === 1 && fc === 6) {
          await writeSingleRegister(address, wordsToWrite[0]);
        } else {
          await writeMultipleRegisters(address, wordsToWrite);
        }

        socket.emit('modbus:manual:result', {
          status: 'ok',
          operation: 'write',
          wrote: wordsToWrite,
          ts: new Date().toLocaleTimeString(),
        });
      } else {
        throw new Error(`Unsupported Function Code: FC${fc}`);
      }
    } catch (err) {
      console.error('[handler] manual Modbus error:', err.message);
      socket.emit('modbus:manual:result', { status: 'error', message: err.message });
    }
  });

  // ── disconnect (socket level) ─────────────────────────────────────────────
  socket.on('disconnect', () => {
    _stopScan(socket.id);
    // Only close the serial port if no other clients are still connected
    // (io.engine.clientsCount counts connected sockets)
    const remaining = io.engine.clientsCount;
    if (remaining === 0 && isPortOpen()) {
      console.log('[handler] last client disconnected — closing serial port');
      disconnectModbus().catch(() => {});
      closePort().catch(() => {});
    }
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function _stopScan(socketId) {
  const handle = scanIntervals.get(socketId);
  if (handle) {
    clearInterval(handle);
    scanIntervals.delete(socketId);
  }
}

/**
 * Map modbus-serial error messages to short error codes.
 * @param {Error} err
 * @returns {string}
 */
function classifyModbusError(err) {
  const msg = (err.message || '').toLowerCase();
  if (msg.includes('timeout')) return 'MODBUS_TIMEOUT';
  if (msg.includes('crc')) return 'MODBUS_CRC_ERROR';
  if (msg.includes('illegal function')) return 'MODBUS_ILLEGAL_FUNCTION';
  if (msg.includes('illegal data address')) return 'MODBUS_ILLEGAL_ADDRESS';
  if (msg.includes('illegal data value')) return 'MODBUS_ILLEGAL_VALUE';
  if (msg.includes('slave device failure')) return 'MODBUS_SLAVE_FAILURE';
  if (msg.includes('not connected') || msg.includes('port is not open')) return 'PORT_NOT_OPEN';
  return 'MODBUS_ERROR';
}
