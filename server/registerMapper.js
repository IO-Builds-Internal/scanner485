/**
 * registerMapper.js
 * Decodes raw uint16[] Modbus register values into typed, scaled readings.
 *
 * Supported data_type values:
 *   float32_be  — IEEE 754 32-bit float, big-endian word order (2 registers)
 *   uint16      — unsigned 16-bit integer (1 register)
 *   int16       — signed 16-bit integer (1 register)
 *   uint32_be   — unsigned 32-bit integer, big-endian word order (2 registers)
 *   int32_be    — signed 32-bit integer, big-endian word order (2 registers)
 */

/**
 * Number of 16-bit registers consumed by each data_type.
 */
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

/**
 * Decode a uint16 pair (or single) into a number per data_type.
 * @param {number[]} words  — slice of raw uint16 values
 * @param {string}   dataType
 * @returns {number}
 */
export function decodeWords(words, dataType) {
  switch (dataType) {
    case 'float32_be': {
      // high word first (big-endian)
      const buf = Buffer.alloc(4);
      buf.writeUInt16BE(words[0], 0);
      buf.writeUInt16BE(words[1], 2);
      return buf.readFloatBE(0);
    }
    case 'float32_le': {
      // low word first (word-swapped)
      const buf = Buffer.alloc(4);
      buf.writeUInt16BE(words[1], 0);
      buf.writeUInt16BE(words[0], 2);
      return buf.readFloatBE(0);
    }
    case 'uint32_be': {
      const buf = Buffer.alloc(4);
      buf.writeUInt16BE(words[0], 0);
      buf.writeUInt16BE(words[1], 2);
      return buf.readUInt32BE(0);
    }
    case 'uint32_le': {
      const buf = Buffer.alloc(4);
      buf.writeUInt16BE(words[1], 0);
      buf.writeUInt16BE(words[0], 2);
      return buf.readUInt32BE(0);
    }
    case 'int32_be': {
      const buf = Buffer.alloc(4);
      buf.writeUInt16BE(words[0], 0);
      buf.writeUInt16BE(words[1], 2);
      return buf.readInt32BE(0);
    }
    case 'int32_le': {
      const buf = Buffer.alloc(4);
      buf.writeUInt16BE(words[1], 0);
      buf.writeUInt16BE(words[0], 2);
      return buf.readInt32BE(0);
    }
    case 'uint16':
      return words[0] >>> 0; // ensure unsigned
    case 'int16':
      return words[0] > 0x7fff ? words[0] - 0x10000 : words[0];
    default:
      throw new Error(`Unknown data_type: ${dataType}`);
  }
}

/**
 * Map a batch of raw registers to labelled readings.
 *
 * @param {number[]} rawWords   — full uint16[] array returned from Modbus read
 * @param {number}   baseAddress — the Modbus start address used for the read
 * @param {Array<{
 *   id: number,
 *   address: number,
 *   label: string,
 *   data_type: string,
 *   scale: number,
 *   unit: string,
 * }>} registerDefs
 *
 * @returns {Array<{registerId, label, value, unit, ts}>}
 */
export function mapReadings(rawWords, baseAddress, registerDefs) {
  const ts = new Date().toISOString();
  const results = [];

  for (const reg of registerDefs) {
    const offset = reg.address - baseAddress;
    const width = REGISTER_WIDTHS[reg.data_type] ?? 1;

    if (offset < 0 || offset + width > rawWords.length) {
      console.warn(`[mapper] register ${reg.address} (${reg.label}) out of range — skipping`);
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
      console.error(`[mapper] decode error for ${reg.label}:`, err.message);
    }
  }

  return results;
}

/**
 * Group register definitions by contiguous address blocks for batch FC reads.
 * Contiguous = next address immediately follows the last (accounting for width).
 *
 * @param {Array<{address:number, data_type:string, function_code:number}>} registers
 * @returns {Array<{fc:number, startAddress:number, count:number, registers:Array}>}
 */
export function groupIntoBlocks(registers) {
  if (!registers.length) return [];

  // Sort by FC then by address
  const sorted = [...registers].sort((a, b) => {
    if (a.function_code !== b.function_code) return a.function_code - b.function_code;
    return a.address - b.address;
  });

  const MAX_BLOCK_REGISTERS = 8;
  const blocks = [];
  let current = null;

  for (const reg of sorted) {
    const width = REGISTER_WIDTHS[reg.data_type] ?? 1;
    const endAddress = reg.address + width;

    if (
      !current ||
      current.fc !== reg.function_code ||
      reg.address > current.startAddress + current.count ||
      (endAddress - current.startAddress) > MAX_BLOCK_REGISTERS
    ) {
      // Start a new block
      current = {
        fc: reg.function_code,
        startAddress: reg.address,
        count: width,
        registers: [reg],
      };
      blocks.push(current);
    } else {
      // Extend the current block
      current.count = endAddress - current.startAddress;
      current.registers.push(reg);
    }
  }

  return blocks;
}

/**
 * Encode a number/value into raw 16-bit registers (uint16[]) based on dataType.
 * @param {number} value
 * @param {string} dataType
 * @returns {number[]}
 */
export function encodeWords(value, dataType) {
  switch (dataType) {
    case 'float32_be': {
      const buf = Buffer.alloc(4);
      buf.writeFloatBE(Number(value), 0);
      return [buf.readUInt16BE(0), buf.readUInt16BE(2)];
    }
    case 'float32_le': {
      const buf = Buffer.alloc(4);
      buf.writeFloatBE(Number(value), 0);
      return [buf.readUInt16BE(2), buf.readUInt16BE(0)];
    }
    case 'uint32_be': {
      const buf = Buffer.alloc(4);
      buf.writeUInt32BE(Number(value), 0);
      return [buf.readUInt16BE(0), buf.readUInt16BE(2)];
    }
    case 'uint32_le': {
      const buf = Buffer.alloc(4);
      buf.writeUInt32BE(Number(value), 0);
      return [buf.readUInt16BE(2), buf.readUInt16BE(0)];
    }
    case 'int32_be': {
      const buf = Buffer.alloc(4);
      buf.writeInt32BE(Number(value), 0);
      return [buf.readUInt16BE(0), buf.readUInt16BE(2)];
    }
    case 'int32_le': {
      const buf = Buffer.alloc(4);
      buf.writeInt32BE(Number(value), 0);
      return [buf.readUInt16BE(2), buf.readUInt16BE(0)];
    }
    case 'uint16': {
      const v = Math.max(0, Math.min(0xffff, Math.round(Number(value))));
      return [v];
    }
    case 'int16': {
      let v = Math.round(Number(value));
      if (v < 0) v = 0x10000 + v;
      v = Math.max(0, Math.min(0xffff, v));
      return [v];
    }
    default:
      throw new Error(`Unknown data_type for encoding: ${dataType}`);
  }
}

