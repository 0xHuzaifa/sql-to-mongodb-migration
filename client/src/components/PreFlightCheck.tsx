import React, { useEffect, useState } from 'react';
import { Database, Server, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';

interface PreflightRow {
  phase: string;
  sourceTable: string;
  sourceCount: number;
  targetCollection: string;
  targetCount: string | number;
}

export const PreFlightCheck: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [health, setHealth] = useState<any>(null);
  const [data, setData] = useState<PreflightRow[]>([]);
  const [totalLedgerKeys, setTotalLedgerKeys] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  const fetchPreflight = async () => {
    setLoading(true);
    setError(null);
    try {
      const [healthRes, preflightRes] = await Promise.all([
        fetch('/api/migration/health'),
        fetch('/api/migration/preflight'),
      ]);

      const healthJson = await healthRes.json();
      const preflightJson = await preflightRes.json();

      setHealth(healthJson);
      if (preflightJson.success) {
        setData(preflightJson.data);
        setTotalLedgerKeys(preflightJson.totalLedgerKeys || 0);
      } else {
        setError(preflightJson.error || 'Failed to fetch preflight data');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPreflight();
    // Auto-refresh once after 2 seconds to seamlessly catch the backend if Vite booted first
    const timer = setTimeout(() => {
      fetchPreflight();
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Top Connection Status Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
        {/* SQL Server Card */}
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ padding: '0.6rem', borderRadius: '10px', background: 'rgba(2, 132, 199, 0.2)', color: '#38bdf8' }}>
                <Server size={24} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>SQL Server (.bak Staging)</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>CounterPoint 50GB Snapshot</p>
              </div>
            </div>
            {health?.sqlServer?.connected ? (
              <span className="badge badge-success"><span className="status-dot dot-green"></span> Connected</span>
            ) : (
              <span className="badge badge-error"><span className="status-dot dot-red"></span> Disconnected</span>
            )}
          </div>
          {health?.sqlServer?.error && (
            <p style={{ marginTop: '1rem', fontSize: '0.8rem', color: '#fb7185', background: 'rgba(244, 63, 94, 0.1)', padding: '0.5rem', borderRadius: '6px' }}>
              {health.sqlServer.error}
            </p>
          )}
        </div>

        {/* MongoDB Target Card */}
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ padding: '0.6rem', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.2)', color: '#34d399' }}>
                <Database size={24} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>MongoDB IMS Target</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>75 Strict Mongoose Collections</p>
              </div>
            </div>
            {health?.mongodb?.connected ? (
              <span className="badge badge-success"><span className="status-dot dot-green"></span> Connected</span>
            ) : (
              <span className="badge badge-error"><span className="status-dot dot-red"></span> Disconnected</span>
            )}
          </div>
          <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            <span>Key Ledger Keys:</span>
            <span style={{ fontWeight: 600, color: '#38bdf8' }}>{totalLedgerKeys.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 700 }}>Pre-Flight Volume Matrix</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Source CounterPoint table counts compared against current MongoDB documents
          </p>
        </div>
        <button className="btn-secondary" onClick={fetchPreflight} disabled={loading}>
          <RefreshCw size={16} className={loading ? 'spin' : ''} />
          Refresh Counters
        </button>
      </div>

      {error && (
        <div className="glass-panel" style={{ padding: '1rem', borderLeft: '4px solid var(--rose)', color: '#fb7185' }}>
          <AlertTriangle size={20} style={{ verticalAlign: 'middle', marginRight: '0.5rem' }} />
          {error}
        </div>
      )}

      {/* Volume Matrix Table */}
      <div className="glass-panel" style={{ overflow: 'hidden' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Execution Phase</th>
              <th>Source SQL Table</th>
              <th>Source SQL Rows</th>
              <th>Target MongoDB Collection</th>
              <th>Current Mongo Docs</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, idx) => {
              const src = Number(row.sourceCount) || 0;
              const tgt = typeof row.targetCount === 'number' ? row.targetCount : 0;
              const isMigrated = tgt > 0;

              return (
                <tr key={idx}>
                  <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{row.phase}</td>
                  <td><code>{row.sourceTable}</code></td>
                  <td style={{ fontWeight: 600, color: '#38bdf8' }}>{src.toLocaleString()}</td>
                  <td><code>{row.targetCollection}</code></td>
                  <td style={{ fontWeight: 600, color: '#34d399' }}>
                    {typeof row.targetCount === 'number' ? row.targetCount.toLocaleString() : row.targetCount}
                  </td>
                  <td>
                    {isMigrated ? (
                      <span className="badge badge-success"><CheckCircle2 size={12} /> Seeded</span>
                    ) : (
                      <span className="badge badge-neutral">Pending</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
