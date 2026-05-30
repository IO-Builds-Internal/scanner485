import { useState, useEffect, useRef } from 'react';

export default function LiveDataFeed({ feedEntries, onClear }) {
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [feedEntries, autoScroll]);

  const handleExportCSV = () => {
    if (feedEntries.length === 0) return;

    // Build CSV content
    const headers = ['Timestamp', 'Register Name', 'Modbus Address', 'Value', 'Unit'].join(',');
    const rows = feedEntries.map(entry => {
      // Escape label if it contains commas
      const escapedLabel = entry.label.includes(',') ? `"${entry.label}"` : entry.label;
      return [
        entry.ts,
        escapedLabel,
        entry.address,
        entry.value,
        entry.unit || ''
      ].join(',');
    });

    const csvContent = [headers, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `scanner485-live-data-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="panel reg-table-wrap" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Control Bar */}
      <div className="stats-bar" style={{ justifyContent: 'space-between', padding: '6px 12px' }}>
        <div className="flex-center gap-2">
          <span>Feed history: <strong>{feedEntries.length}</strong> points</span>
          <span className="stats-sep">|</span>
          <label className="checkbox-row" style={{ fontSize: 11 }}>
            <input 
              type="checkbox" 
              checked={autoScroll} 
              onChange={e => setAutoScroll(e.target.checked)} 
            />
            Auto-scroll
          </label>
        </div>
        
        <div className="flex-center gap-2">
          <button 
            className="btn btn-success btn-sm" 
            onClick={handleExportCSV} 
            disabled={feedEntries.length === 0}
            title="Download log history as a CSV file"
          >
            📥 Export to CSV
          </button>
          <button 
            className="btn btn-default btn-sm" 
            onClick={onClear} 
            disabled={feedEntries.length === 0}
          >
            Clear Log
          </button>
        </div>
      </div>

      {/* Scrolling Table */}
      <div className="reg-table-scroll" ref={scrollRef} style={{ flex: 1, minHeight: 0 }}>
        {feedEntries.length === 0 ? (
          <div className="empty-state" style={{ padding: '60px 24px' }}>
            <div className="empty-icon">🕒</div>
            <div className="empty-title">Live feed is empty</div>
            <div className="empty-desc">
              Arriving scan values will log here sequentially. Start a scan to see live stream.
            </div>
          </div>
        ) : (
          <table className="reg-table" style={{ tableLayout: 'auto' }}>
            <thead>
              <tr style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                <th style={{ width: '80px' }}>Time</th>
                <th>Register Name</th>
                <th style={{ width: '90px', textAlign: 'right' }}>Address</th>
                <th style={{ width: '120px', textAlign: 'right' }}>Value</th>
                <th style={{ width: '70px', textAlign: 'center' }}>Unit</th>
              </tr>
            </thead>
            <tbody>
              {feedEntries.map((entry, idx) => (
                <tr key={idx}>
                  <td className="mono" style={{ color: 'var(--text-muted)' }}>{entry.ts}</td>
                  <td style={{ fontWeight: 500 }}>{entry.label}</td>
                  <td className="mono" style={{ textAlign: 'right', color: 'var(--text-mono)' }}>{entry.address}</td>
                  <td className="mono" style={{ textAlign: 'right', color: 'var(--green)', fontWeight: 600 }}>
                    {typeof entry.value === 'number' ? entry.value.toFixed(4) : entry.value}
                  </td>
                  <td style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>{entry.unit || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
