import { SerialPort } from 'serialport';
import { isModbusConnected, disconnectModbus } from './modbusEngine.js';

/**
 * List all available serial ports.
 * @returns {Promise<Array<{path:string, manufacturer:string|undefined, serialNumber:string|undefined}>>}
 */
export async function listPorts() {
  const ports = await SerialPort.list();
  return ports.map(({ path, manufacturer, serialNumber, pnpId, locationId }) => ({
    path,
    manufacturer: manufacturer || '',
    serialNumber: serialNumber || '',
    pnpId: pnpId || '',
    locationId: locationId || '',
  }));
}

/**
 * Open a serial port.
 * We resolve configuration details immediately. The actual physical port opening
 * is deferred and handled by ModbusRTU's connectRTUBuffered in modbusEngine.js
 * to avoid double-locking/opening conflicts.
 * @param {{path:string, baudRate:number, parity:string, stopBits:number, dataBits:number}} config
 * @returns {Promise<{path:string, baudRate:number, parity:string, stopBits:number, dataBits:number}>}
 */
export function openPort(config) {
  return Promise.resolve({
    path: config.path,
    baudRate: config.baudRate || 9600,
    parity: config.parity || 'none',
    stopBits: config.stopBits || 1,
    dataBits: config.dataBits || 8,
  });
}

/**
 * Close the active serial port.
 * @returns {Promise<void>}
 */
export async function closePort() {
  await disconnectModbus();
}

/**
 * Get the currently open SerialPort instance (deprecated, modbusEngine owns it now).
 * @returns {null}
 */
export function getActivePort() {
  return null;
}

/**
 * Check whether a port is currently open.
 * @returns {boolean}
 */
export function isPortOpen() {
  return isModbusConnected();
}

