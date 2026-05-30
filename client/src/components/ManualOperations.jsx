import { useState, useEffect, useRef } from 'react';
import { useSocket } from '../hooks/useSocket';

const DATA_TYPES = [
  { value: 'uint16', label: '16-bit Unsigned Integer (uint16)' },
  { value: 'int16',  label: '16-bit Signed Integer (int16)' },
  { value: 'float32_be', label: '32-bit Float Big-Endian (float32_be)' },
  { value: 'uint32_be', label: '32-bit Unsigned 32-bit (uint32_be)' },
  { value: 'int32_be', label: '32-bit Signed 32-bit (int32_be)' },
  { value: 'raw', label: 'Raw Words (comma-separated list for writing)' },
];

import {
  readLocalHoldingRegisters,
  readLocalInputRegisters,
  writeLocalSingleRegister,
  writeLocalMultipleRegisters,
  decodeWords,
  encodeWords
} from '../utils/webSerialModbus';

export default function ManualOperations({ portStatus }) {
  const { emit, on } = useSocket();

  const [fc, setFc] = useState(3); // 3=Read Holding, 4=Read Input, 6=Write Single, 16=Write Multiple
  const [address, setAddress] = useState(3000);
  const [slaveId, setSlaveId] = useState(1);
  const [count, setCount] = useState(2);
  const [writeValue, setWriteValue] = useState('0');
  const [dataType, setDataType] = useState('float32_be');
  
  const [sending, setSending] = useState(false);
  const [consoleLogs, setConsoleLogs] = useState([]);
  const logEndRef = useRef(null);

  const isConnected = portStatus?.status === 'ok';
  const isLocalMode = portStatus?.mode === 'local';

  // Handle remote server-side manual commands
  useEffect(() => {
    const unsub = on('modbus:manual:result', (data) => {
      if (isLocalMode) return; // ignore socket results when in local mode
      setSending(false);
      setConsoleLogs(prev => {
        let text = '';
        if (data.status === 'ok') {
          if (data.operation === 'read') {
            const rawHex = data.raw.map(x => '0x' + x.toString(16).toUpperCase().padStart(4, '0')).join(' ');
            text = `[${data.ts}] SUCCESS: Read Address ${address} (Count ${count}). Raw: [ ${rawHex} ]. Decoded (${dataType}): ${data.decoded !== null ? data.decoded.toFixed(4) : 'N/A'}`;
          } else {
            const wroteHex = data.wrote.map(x => '0x' + x.toString(16).toUpperCase().padStart(4, '0')).join(' ');
            text = `[${data.ts}] SUCCESS: Wrote to Address ${address}. Raw written: [ ${wroteHex} ].`;
          }
        } else {
          text = `[${new Date().toLocaleTimeString()}] ERROR: ${data.message}`;
        }
        return [...prev, { text, type: data.status }];
      });
    });
    return unsub;
  }, [on, address, count, dataType, isLocalMode]);

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollTop = logEndRef.current.scrollHeight;
    }
  }, [consoleLogs]);

  const handleSendCommand = async () => {
    if (!isConnected) return;
    setSending(true);

    if (isLocalMode) {
      // ── Native Browser-Side Web Serial Execution ─────────────────────────
      if (fc === 3 || fc === 4) {
        try {
          let rawWords;
          if (fc === 4) {
            rawWords = await readLocalInputRegisters(slaveId, address, count);
          } else {
            rawWords = await readLocalHoldingRegisters(slaveId, address, count);
          }
          let decoded = null;
          try {
            decoded = decodeWords(rawWords, dataType);
          } catch (e) {}

          const ts = new Date().toLocaleTimeString();
          const rawHex = rawWords.map(x => '0x' + x.toString(16).toUpperCase().padStart(4, '0')).join(' ');
          const text = `[${ts}] SUCCESS: Read Address ${address} (Count ${count}). Raw: [ ${rawHex} ]. Decoded (${dataType}): ${decoded !== null ? decoded.toFixed(4) : 'N/A'}`;
          setConsoleLogs(prev => [...prev, { text, type: 'ok' }]);
        } catch (err) {
          const text = `[${new Date().toLocaleTimeString()}] ERROR: ${err.message}`;
          setConsoleLogs(prev => [...prev, { text, type: 'error' }]);
        } finally {
          setSending(false);
        }
      } else if (fc === 6 || fc === 16) {
        try {
          let wordsToWrite;
          if (dataType === 'raw') {
            wordsToWrite = String(writeValue).split(',').map(x => parseInt(x.trim(), 10)).filter(x => !isNaN(x));
          } else {
            wordsToWrite = encodeWords(writeValue, dataType);
          }

          if (wordsToWrite.length === 0) {
            throw new Error('No valid values to write.');
          }

          if (wordsToWrite.length === 1 && fc === 6) {
            await writeLocalSingleRegister(slaveId, address, wordsToWrite[0]);
          } else {
            await writeLocalMultipleRegisters(slaveId, address, wordsToWrite);
          }

          const ts = new Date().toLocaleTimeString();
          const wroteHex = wordsToWrite.map(x => '0x' + x.toString(16).toUpperCase().padStart(4, '0')).join(' ');
          const text = `[${ts}] SUCCESS: Wrote to Address ${address}. Raw written: [ ${wroteHex} ].`;
          setConsoleLogs(prev => [...prev, { text, type: 'ok' }]);
        } catch (err) {
          const text = `[${new Date().toLocaleTimeString()}] ERROR: ${err.message}`;
          setConsoleLogs(prev => [...prev, { text, type: 'error' }]);
        } finally {
          setSending(false);
        }
      }
    } else {
      // ── Server-Side Socket Emission ────────────────────────────────────────
      const payload = {
        fc: Number(fc),
        address: Number(address),
        dataType,
        slaveId: Number(slaveId),
      };

      if (fc === 3 || fc === 4) {
        payload.count = Number(count);
      } else {
        payload.value = writeValue;
      }

      emit('modbus:manual', payload);
    }
  };

  const isWrite = fc === 6 || fc === 16;

  return (
    <div className="panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
      <div className="panel-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 16, flex: 1, minHeight: 0 }}>
        {/* Form controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="form-group">
            <span className="form-label">Function Code</span>
            <select className="form-select w-full" value={fc} onChange={e => {
              const val = Number(e.target.value);
              setFc(val);
              // Smart defaults: reading typically float32 (2 words), writing single typically uint16 (1 word)
              if (val === 6) {
                setCount(1);
                setDataType('uint16');
              } else if (val === 16) {
                setCount(2);
                setDataType('float32_be');
              } else {
                setCount(2);
                setDataType('float32_be');
              }
            }} disabled={!isConnected}>
              <option value={3}>FC 03 — Read Holding Registers</option>
              <option value={4}>FC 04 — Read Input Registers</option>
              <option value={6}>FC 06 — Write Single Register</option>
              <option value={16}>FC 16 — Write Multiple Registers</option>
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="form-group">
              <span className="form-label">Slave ID</span>
              <input 
                type="number" 
                className="form-input w-full" 
                value={slaveId} 
                min={1} 
                max={247}
                onChange={e => setSlaveId(Math.max(1, Math.min(247, Number(e.target.value))))} 
                disabled={!isConnected}
              />
            </div>
            
            <div className="form-group">
              <span className="form-label">Start Address</span>
              <input 
                type="number" 
                className="form-input w-full mono" 
                value={address} 
                min={0}
                max={65535}
                onChange={e => setAddress(Math.max(0, Math.min(65535, Number(e.target.value))))} 
                disabled={!isConnected}
              />
            </div>
          </div>

          <div className="form-group">
            <span className="form-label">Data Interpretation (Type)</span>
            <select className="form-select w-full" value={dataType} onChange={e => {
              const type = e.target.value;
              setDataType(type);
              // Automatically adjust count depending on chosen type
              if (type === 'float32_be' || type === 'uint32_be' || type === 'int32_be') {
                setCount(2);
              } else if (type === 'uint16' || type === 'int16') {
                setCount(1);
              }
            }} disabled={!isConnected}>
              {DATA_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {!isWrite ? (
            <div className="form-group">
              <span className="form-label">Register Count (Words)</span>
              <input 
                type="number" 
                className="form-input w-full mono" 
                value={count} 
                min={1} 
                max={125}
                onChange={e => setCount(Math.max(1, Math.min(125, Number(e.target.value))))} 
                disabled={!isConnected || dataType !== 'raw'}
                title={dataType !== 'raw' ? 'Locked based on selected Data Type' : ''}
              />
            </div>
          ) : (
            <div className="form-group">
              <span className="form-label">Value to Write</span>
              <input 
                type="text" 
                className="form-input w-full mono" 
                value={writeValue} 
                onChange={e => setWriteValue(e.target.value)} 
                disabled={!isConnected}
                placeholder={dataType === 'raw' ? 'e.g. 17202, 11520' : 'e.g. 415.2 or 10'}
              />
              <span style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                {dataType === 'raw' 
                  ? 'Enter raw 16-bit integers separated by commas.' 
                  : `Enter numerical value to convert into ${dataType}.`}
              </span>
            </div>
          )}

          <div style={{ marginTop: 6 }}>
            <button 
              className={`btn btn-primary w-full`} 
              onClick={handleSendCommand} 
              disabled={!isConnected || sending}
            >
              {sending ? <><span className="spinner" /> Querying…</> : '⚡ Send Modbus Command'}
            </button>
          </div>
        </div>

        {/* Diagnostic Terminal Output */}
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <span className="form-label" style={{ marginBottom: 4 }}>Diagnostic Console</span>
          <div 
            ref={logEndRef}
            className="log-body" 
            style={{ 
              flex: 1, 
              background: '#0d1117', 
              color: '#c9d1d9', 
              borderRadius: 'var(--r-md)', 
              border: '1px solid #30363d',
              padding: 10,
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              overflowY: 'auto',
              lineHeight: 1.5,
            }}
          >
            {consoleLogs.length === 0 ? (
              <span style={{ color: '#8b949e', fontStyle: 'italic' }}>
                Console initialized. Connect port and send commands to diagnostic log...
              </span>
            ) : (
              consoleLogs.map((log, idx) => (
                <div 
                  key={idx} 
                  style={{ 
                    marginBottom: 6, 
                    borderBottom: '1px dashed #21262d', 
                    paddingBottom: 4,
                    color: log.type === 'ok' ? '#58a6ff' : '#f85149'
                  }}
                >
                  {log.text}
                </div>
              ))
            )}
          </div>
          <button 
            className="btn btn-default btn-sm" 
            style={{ alignSelf: 'flex-end', marginTop: 6 }} 
            onClick={() => setConsoleLogs([])}
            disabled={consoleLogs.length === 0}
          >
            Clear Console
          </button>
        </div>
      </div>
    </div>
  );
}
