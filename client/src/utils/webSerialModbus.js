/**
 * webSerialModbus.js
 * Browser-side Web Serial and Modbus RTU engine.
 * Fully compatible with standard Modbus RTU protocol, working natively in modern browsers.
 */

let activePort = null;

export const REGISTER_WIDTHS = {
  float32_be: 2,
  float32_le: 2,
  uint16: 1,
  int16: 1,
  uint32_be: 2,
  uint32_le: 2,
  int32_be: 2,
  int32_le: 2,
};

// ── Modbus Exception Messages ────────────────────────────────────────────────
const EXCEPTION_MESSAGES = {
  1: 'Illegal Function Code',
  2: 'Illegal Data Address (Register Offset out of bounds)',
  3: 'Illegal Data Value (Value out of range)',
  4: 'Slave Device Failure (Hardware error)',
};

function getExceptionMessage(code) {
  return EXCEPTION_MESSAGES[code] || `Unknown Modbus Exception (0x${code.toString(16).toUpperCase()})`;
}

// ── CRC16 Checksum ───────────────────────────────────────────────────────────
export function computeCRC(buffer) {
  let crc = 0xFFFF;
  for (let i = 0; i < buffer.length; i++) {
    crc ^= buffer[i];
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x0001) !== 0) {
        crc = (crc >> 1) ^ 0xA001;
      } else {
        crc = crc >> 1;
      }
    }
  }
  return crc;
}

// ── Frame Encoders ───────────────────────────────────────────────────────────
export function buildReadRequest(slaveId, fc, address, count) {
  const buf = new Uint8Array(8);
  buf[0] = slaveId;
  buf[1] = fc;
  buf[2] = (address >> 8) & 0xFF;
  buf[3] = address & 0xFF;
  buf[4] = (count >> 8) & 0xFF;
  buf[5] = count & 0xFF;
  const crc = computeCRC(buf.subarray(0, 6));
  buf[6] = crc & 0xFF;        // LSB
  buf[7] = (crc >> 8) & 0xFF; // MSB
  return buf;
}

export function buildWriteSingleRequest(slaveId, address, value) {
  const buf = new Uint8Array(8);
  buf[0] = slaveId;
  buf[1] = 6;
  buf[2] = (address >> 8) & 0xFF;
  buf[3] = address & 0xFF;
  buf[4] = (value >> 8) & 0xFF;
  buf[5] = value & 0xFF;
  const crc = computeCRC(buf.subarray(0, 6));
  buf[6] = crc & 0xFF;
  buf[7] = (crc >> 8) & 0xFF;
  return buf;
}

export function buildWriteMultipleRequest(slaveId, address, values) {
  const numRegisters = values.length;
  const byteCount = numRegisters * 2;
  const buf = new Uint8Array(9 + byteCount);
  buf[0] = slaveId;
  buf[1] = 16;
  buf[2] = (address >> 8) & 0xFF;
  buf[3] = address & 0xFF;
  buf[4] = (numRegisters >> 8) & 0xFF;
  buf[5] = numRegisters & 0xFF;
  buf[6] = byteCount;
  for (let i = 0; i < numRegisters; i++) {
    buf[7 + 2 * i] = (values[i] >> 8) & 0xFF;
    buf[8 + 2 * i] = values[i] & 0xFF;
  }
  const crc = computeCRC(buf.subarray(0, 7 + byteCount));
  buf[7 + byteCount] = crc & 0xFF;
  buf[8 + byteCount] = (crc >> 8) & 0xFF;
  return buf;
}

// ── Web Serial Connection Manager ───────────────────────────────────────────
export async function requestAndOpenPort(baudRate = 19200, parity = 'even', stopBits = 1, dataBits = 8, existingPort = null) {
  if (typeof navigator === 'undefined' || !navigator.serial) {
    throw new Error('Web Serial API is not supported in this browser.');
  }

  // Close any existing open port first
  await closeLocalPort();

  if (existingPort) {
    activePort = existingPort;
  } else {
    activePort = await navigator.serial.requestPort();
  }

  // Web Serial API option names
  // parity: "none" | "even" | "odd"
  // stopBits: 1 | 2
  // dataBits: 7 | 8
  await activePort.open({
    baudRate,
    parity,
    stopBits,
    dataBits,
  });

  return activePort;
}

export async function closeLocalPort() {
  if (activePort) {
    try {
      if (activePort.readable && !activePort.readable.locked) {
        // Let's release any locks if needed by writing or closing
      }
      await activePort.close();
    } catch (_) {
      // ignore
    }
    activePort = null;
  }
}

export function isLocalPortOpen() {
  return !!(activePort && activePort.readable);
}

// ── Modbus Transmit/Receive ──────────────────────────────────────────────────
async function sendAndReceive(requestFrame, expectedLength, timeoutMs = 1000) {
  if (!activePort || !activePort.writable || !activePort.readable) {
    throw new Error('Local serial port is not open.');
  }

  // 1. Write frame
  const writer = activePort.writable.getWriter();
  await writer.write(requestFrame);
  writer.releaseLock();

  // 2. Read response sequentially with timeout protection
  const reader = activePort.readable.getReader();
  let received = new Uint8Array(256);
  let receivedLength = 0;
  const startTime = Date.now();

  try {
    while (true) {
      if (Date.now() - startTime > timeoutMs) {
        throw new Error('Modbus response timeout (no response from device)');
      }

      // Race reader.read against a manual interval timeout
      const readPromise = reader.read();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Read chunk timeout')), timeoutMs)
      );

      const { value, done } = await Promise.race([readPromise, timeoutPromise]);
      if (done) break;

      if (value) {
        if (receivedLength + value.length > received.length) {
          const temp = new Uint8Array((receivedLength + value.length) * 2);
          temp.set(received);
          received = temp;
        }
        received.set(value, receivedLength);
        receivedLength += value.length;

        // Check for Exception response (always 5 bytes)
        if (receivedLength >= 5) {
          const fcByte = received[1];
          const reqFc = requestFrame[1];
          if (fcByte === (reqFc | 0x80)) {
            const crc = computeCRC(received.subarray(0, 3));
            const receivedCrc = received[3] | (received[4] << 8);
            if (crc === receivedCrc) {
              const errCode = received[2];
              throw new Error(`Modbus Exception: ${getExceptionMessage(errCode)}`);
            }
          }
        }

        // Reached expected length
        if (receivedLength >= expectedLength) {
          break;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  // 3. Process frame
  const finalFrame = received.subarray(0, expectedLength);
  const calculatedCrc = computeCRC(received.subarray(0, expectedLength - 2));
  const receivedCrc = finalFrame[expectedLength - 2] | (finalFrame[expectedLength - 1] << 8);

  if (calculatedCrc !== receivedCrc) {
    throw new Error(`CRC Mismatch: Calculated 0x${calculatedCrc.toString(16).toUpperCase()}, Received 0x${receivedCrc.toString(16).toUpperCase()}`);
  }

  return finalFrame;
}

// ── Modbus Queries ───────────────────────────────────────────────────────────
export async function readLocalHoldingRegisters(slaveId, address, count, timeoutMs = 1000) {
  const req = buildReadRequest(slaveId, 3, address, count);
  const resp = await sendAndReceive(req, 5 + count * 2, timeoutMs);
  const words = [];
  for (let i = 0; i < count; i++) {
    words.push((resp[3 + 2 * i] << 8) | resp[4 + 2 * i]);
  }
  return words;
}

export async function readLocalInputRegisters(slaveId, address, count, timeoutMs = 1000) {
  const req = buildReadRequest(slaveId, 4, address, count);
  const resp = await sendAndReceive(req, 5 + count * 2, timeoutMs);
  const words = [];
  for (let i = 0; i < count; i++) {
    words.push((resp[3 + 2 * i] << 8) | resp[4 + 2 * i]);
  }
  return words;
}

export async function writeLocalSingleRegister(slaveId, address, value) {
  const req = buildWriteSingleRequest(slaveId, address, value);
  await sendAndReceive(req, 8);
}

export async function writeLocalMultipleRegisters(slaveId, address, values) {
  const req = buildWriteMultipleRequest(slaveId, address, values);
  await sendAndReceive(req, 8);
}

// ── AutoMode Settings Local Scanner ──────────────────────────────────────────
export async function autoDetectLocalSettings(slaveId = 1, address = 2698, fc = 3) {
  const bauds = [19200, 9600, 115200, 4800, 38400, 57600];
  const parities = ['even', 'none', 'odd'];
  const stopBitsOpts = [1, 2];

  if (!activePort) throw new Error('No serial port requested or open.');

  for (const baudRate of bauds) {
    for (const parity of parities) {
      for (const stopBits of stopBitsOpts) {
        try {
          console.log(`[autodetect local] Testing: ${baudRate} baud, parity: ${parity}, stopBits: ${stopBits}`);

          // Close active port to reset configurations
          try {
            await activePort.close();
          } catch (_) {}

          await activePort.open({
            baudRate,
            parity,
            stopBits,
            dataBits: 8,
          });

          // Test read with extremely fast timeout
          const req = buildReadRequest(slaveId, fc, address, 1);
          await sendAndReceive(req, 7, 250);

          console.log(`[autodetect local] SUCCESS: Found device at ${baudRate}-${parity}-${stopBits}`);
          return { baudRate, parity, stopBits, dataBits: 8 };
        } catch (err) {
          const msg = (err.message || '').toLowerCase();
          // CRC errors or Exception responses mean we got a response (baudrate & parity are correct!)
          if (
            msg.includes('exception') ||
            msg.includes('crc mismatch') ||
            msg.includes('illegal')
          ) {
            console.log(`[autodetect local] SUCCESS (via device response): Found device at ${baudRate}-${parity}-${stopBits}`);
            return { baudRate, parity, stopBits, dataBits: 8 };
          }
        }
      }
    }
  }

  throw new Error('Auto-detect failed. Ensure device is powered, connected, and using a supported Modbus configuration.');
}

// ── Word Decoders ────────────────────────────────────────────────────────────
export function decodeWords(words, dataType) {
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);

  if (dataType === 'float32_be') {
    view.setUint16(0, words[0], false);
    view.setUint16(2, words[1], false);
    return view.getFloat32(0, false);
  }
  if (dataType === 'float32_le') {
    view.setUint16(0, words[1], false);
    view.setUint16(2, words[0], false);
    return view.getFloat32(0, false);
  }
  if (dataType === 'uint32_be') {
    view.setUint16(0, words[0], false);
    view.setUint16(2, words[1], false);
    return view.getUint32(0, false);
  }
  if (dataType === 'uint32_le') {
    view.setUint16(0, words[1], false);
    view.setUint16(2, words[0], false);
    return view.getUint32(0, false);
  }
  if (dataType === 'int32_be') {
    view.setUint16(0, words[0], false);
    view.setUint16(2, words[1], false);
    return view.getInt32(0, false);
  }
  if (dataType === 'int32_le') {
    view.setUint16(0, words[1], false);
    view.setUint16(2, words[0], false);
    return view.getInt32(0, false);
  }
  if (dataType === 'uint16') {
    return words[0] >>> 0;
  }
  if (dataType === 'int16') {
    return words[0] > 0x7fff ? words[0] - 0x10000 : words[0];
  }
  throw new Error(`Unknown data_type: ${dataType}`);
}

export function encodeWords(value, dataType) {
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);

  if (dataType === 'float32_be') {
    view.setFloat32(0, Number(value), false);
    return [view.getUint16(0, false), view.getUint16(2, false)];
  }
  if (dataType === 'float32_le') {
    view.setFloat32(0, Number(value), false);
    return [view.getUint16(2, false), view.getUint16(0, false)];
  }
  if (dataType === 'uint32_be') {
    view.setUint32(0, Number(value), false);
    return [view.getUint16(0, false), view.getUint16(2, false)];
  }
  if (dataType === 'uint32_le') {
    view.setUint32(0, Number(value), false);
    return [view.getUint16(2, false), view.getUint16(0, false)];
  }
  if (dataType === 'int32_be') {
    view.setInt32(0, Number(value), false);
    return [view.getUint16(0, false), view.getUint16(2, false)];
  }
  if (dataType === 'int32_le') {
    view.setInt32(0, Number(value), false);
    return [view.getUint16(2, false), view.getUint16(0, false)];
  }
  if (dataType === 'uint16') {
    const v = Math.max(0, Math.min(0xffff, Math.round(Number(value))));
    return [v];
  }
  if (dataType === 'int16') {
    let v = Math.round(Number(value));
    if (v < 0) v = 0x10000 + v;
    v = Math.max(0, Math.min(0xffff, v));
    return [v];
  }
  throw new Error(`Unknown data_type for encoding: ${dataType}`);
}

// ── Reading Mapper ───────────────────────────────────────────────────────────
export function mapLocalReadings(rawWords, baseAddress, registerDefs) {
  const ts = new Date().toISOString();
  const results = [];

  for (const reg of registerDefs) {
    const offset = reg.address - baseAddress;
    const width = REGISTER_WIDTHS[reg.data_type] ?? 1;

    if (offset < 0 || offset + width > rawWords.length) {
      console.warn(`[local mapper] register ${reg.address} (${reg.label}) out of range — skipping`);
      continue;
    }

    try {
      const words = rawWords.slice(offset, offset + width);
      const raw = decodeWords(words, reg.data_type);
      const scale = reg.scale ?? 1.0;
      const value = parseFloat((raw * scale).toFixed(6));

      results.push({
        registerId: reg.id,
        label: reg.label,
        value,
        unit: reg.unit || '',
        ts,
      });
    } catch (err) {
      console.error(`[local mapper] decode error for ${reg.label}:`, err.message);
    }
  }

  return results;
}

// ── Group Block Calculation ──────────────────────────────────────────────────
export function groupIntoBlocks(registers) {
  if (!registers.length) return [];

  // Sort by FC then by address
  const sorted = [...registers].sort((a, b) => {
    const fcA = a.function_code || a.fc || 3;
    const fcB = b.function_code || b.fc || 3;
    if (fcA !== fcB) return fcA - fcB;
    return a.address - b.address;
  });

  const MAX_BLOCK_REGISTERS = 8;
  const blocks = [];
  let current = null;

  for (const reg of sorted) {
    const width = REGISTER_WIDTHS[reg.data_type] ?? 1;
    const endAddress = reg.address + width;
    const fc = reg.function_code || reg.fc || 3;

    if (
      !current ||
      current.fc !== fc ||
      reg.address > current.startAddress + current.count ||
      (endAddress - current.startAddress) > MAX_BLOCK_REGISTERS
    ) {
      current = {
        fc,
        startAddress: reg.address,
        count: width,
        registers: [reg],
      };
      blocks.push(current);
    } else {
      current.count = endAddress - current.startAddress;
      current.registers.push(reg);
    }
  }

  return blocks;
}
