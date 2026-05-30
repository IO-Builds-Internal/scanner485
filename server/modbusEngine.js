import ModbusRTU from 'modbus-serial';

/** @type {ModbusRTU|null} */
let client = null;

/**
 * Connect ModbusRTU client over an already-open SerialPort instance.
 * modbus-serial can accept an existing SerialPort via connectRTUBuffered.
 * @param {import('serialport').SerialPort} serialPort
 * @param {number} slaveId
 */
export async function connectModbus(serialPort, slaveId) {
  if (client && client.isOpen) {
    await disconnectModbus();
  }

  client = new ModbusRTU();
  // Use the already-open port by passing the path and reusing settings
  // modbus-serial will use the port object directly via connectRTUBuffered
  await client.connectRTUBuffered(serialPort.path, {
    baudRate: serialPort.baudRate,
    parity: serialPort.parity,
    stopBits: serialPort.stopBits,
    dataBits: serialPort.dataBits,
  });

  client.setID(slaveId);
  client.setTimeout(3000);
  console.log(`[modbus] connected to ${serialPort.path}, slave ${slaveId}`);
}

/**
 * Change the active Modbus slave ID without reconnecting.
 * @param {number} slaveId
 */
export function setSlaveId(slaveId) {
  if (client) {
    client.setID(slaveId);
  }
}

/**
 * Read holding registers (FC03).
 * @param {number} address  - start address (0-based Modbus address)
 * @param {number} count    - number of 16-bit registers to read
 * @returns {Promise<number[]>}
 */
export async function readHoldingRegisters(address, count) {
  if (!client) throw new Error('Modbus client not connected');
  const result = await client.readHoldingRegisters(address, count);
  return result.data; // uint16[]
}

/**
 * Read input registers (FC04).
 * @param {number} address
 * @param {number} count
 * @returns {Promise<number[]>}
 */
export async function readInputRegisters(address, count) {
  if (!client) throw new Error('Modbus client not connected');
  const result = await client.readInputRegisters(address, count);
  return result.data;
}

/**
 * Disconnect the Modbus client.
 */
export async function disconnectModbus() {
  if (client) {
    try {
      client.close(() => {});
    } catch (_) { /* ignore */ }
    client = null;
    console.log('[modbus] disconnected');
  }
}

/**
 * Whether the Modbus client is currently connected.
 * @returns {boolean}
 */
export function isModbusConnected() {
  return !!(client && client.isOpen);
}

/**
 * Write single register (FC06).
 * @param {number} address
 * @param {number} value
 * @returns {Promise<void>}
 */
export async function writeSingleRegister(address, value) {
  if (!client) throw new Error('Modbus client not connected');
  await client.writeRegister(address, value);
}

/**
 * Write multiple registers (FC16).
 * @param {number} address
 * @param {number[]} values
 * @returns {Promise<void>}
 */
export async function writeMultipleRegisters(address, values) {
  if (!client) throw new Error('Modbus client not connected');
  await client.writeRegisters(address, values);
}

/**
 * Auto-detect serial settings by trying multiple configurations on a port.
 * Uses a short timeout and checks for success or Modbus exception responses.
 * @param {string} path - port path
 * @param {{ slaveId: number, address: number, fc: number }} testConfig
 * @returns {Promise<{ baudRate: number, parity: string, stopBits: number, dataBits: number }>}
 */
export async function autoDetectSettings(path, testConfig) {
  const { slaveId = 1, address = 0, fc = 3 } = testConfig;

  // Common configs to check (defaults and common alternatives)
  const bauds = [19200, 9600, 115200, 4800, 38400, 57600];
  const parities = ['even', 'none', 'odd'];
  const stopBitsOpts = [1, 2];

  let testClient = null;

  for (const baudRate of bauds) {
    for (const parity of parities) {
      for (const stopBits of stopBitsOpts) {
        try {
          console.log(`[autodetect] Testing ${path} @ ${baudRate} baud, parity: ${parity}, stopBits: ${stopBits}`);
          testClient = new ModbusRTU();
          
          await testClient.connectRTUBuffered(path, {
            baudRate,
            parity,
            stopBits,
            dataBits: 8,
          });

          testClient.setID(slaveId);
          testClient.setTimeout(250); // Short timeout for rapid scanning

          if (fc === 4) {
            try {
              await testClient.readInputRegisters(address, 1);
            } catch (err) {
              // Try reading register 0 as fallback
              await testClient.readInputRegisters(0, 1);
            }
          } else {
            try {
              await testClient.readHoldingRegisters(address, 1);
            } catch (err) {
              // Try reading register 0 as fallback
              await testClient.readHoldingRegisters(0, 1);
            }
          }

          console.log(`[autodetect] SUCCESS: Found device at ${baudRate}-${parity}-${stopBits}`);
          try { testClient.close(() => {}); } catch (_) {}
          return { baudRate, parity, stopBits, dataBits: 8 };
        } catch (err) {
          if (testClient) {
            try { testClient.close(() => {}); } catch (_) {}
            testClient = null;
          }

          const msg = (err.message || '').toLowerCase();
          // Modbus exception means connection params are correct (device heard us and CRC matched)
          if (
            msg.includes('illegal function') || 
            msg.includes('illegal data address') || 
            msg.includes('illegal data value') || 
            msg.includes('slave device failure')
          ) {
            console.log(`[autodetect] SUCCESS (via Modbus exception): Found device at ${baudRate}-${parity}-${stopBits}`);
            return { baudRate, parity, stopBits, dataBits: 8 };
          }
        }
      }
    }
  }

  throw new Error('Auto-detect failed. Ensure device is powered, connected, and using a supported Modbus configuration.');
}

