import React, { useState, useEffect } from 'react';
import { AlertOctagon, RefreshCw, AlertTriangle, XCircle, CheckCircle2 } from 'lucide-react';

interface AuditBatchLog {
  batchId: string;
  module: string;
  totalRecords: number;
  successfulRecords: number;
  warningRecords: number;
  failedRecords: number;
  records: Array<{
    identifier: string;
    status: string;
    message: string;
    rawData?: any;
    importedAt: string;
  }>;
  createdAt: string;
}

export const DeadLetterInspector: React.FC = () => {
  const [logs, setLogs] = useState<AuditBatchLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<AuditBatchLog | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/migration/audit-logs');
      const json = await res.json();
      if (json.success) {
        setLogs(json.logs);
        if (json.logs.length > 0 && !selectedBatch) {
          setSelectedBatch(json.logs[0]);
        }
      }
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ padding: '0.5rem', borderRadius: '8px', background: 'rgba(244, 63, 94, 0.2)', color: '#fb7185' }}>
            <AlertOctagon size={20} />
          </div>
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Dead-Letter Queue & Anomaly Inspector</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Inspect clamped negative stock, truncated descriptions, and schema validation collisions
            </p>
          </div>
        </div>

        <button className="btn-secondary" onClick={fetchLogs} disabled={loading}>
          <RefreshCw size={16} /> Refresh Audit Logs
        </button>
      </div>

      {logs.length === 0 ? (
        <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <CheckCircle2 size={40} color="#10b981" style={{ marginBottom: '1rem' }} />
          <h3>No Anomalies or Dead-Letter Records Found</h3>
          <p style={{ fontSize: '0.85rem' }}>All executed migration batches completed with zero uncaught schema errors.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '1.5rem' }}>
          {/* Left Batch Selector */}
          <div className="glass-panel" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <h4 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Migration Batches</h4>
            {logs.map((log) => (
              <div
                key={log.batchId}
                onClick={() => setSelectedBatch(log)}
                style={{
                  padding: '0.85rem',
                  borderRadius: '8px',
                  background: selectedBatch?.batchId === log.batchId ? 'rgba(56, 189, 248, 0.15)' : 'rgba(255, 255, 255, 0.02)',
                  border: selectedBatch?.batchId === log.batchId ? '1px solid #38bdf8' : '1px solid transparent',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{log.module.toUpperCase()}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{log.batchId}</div>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.4rem', fontSize: '0.75rem' }}>
                  <span style={{ color: '#34d399' }}>✓ {log.successfulRecords}</span>
                  <span style={{ color: '#fbbf24' }}>⚠ {log.warningRecords}</span>
                  <span style={{ color: '#fb7185' }}>✕ {log.failedRecords}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Right Records Inspector */}
          {selectedBatch && (
            <div className="glass-panel" style={{ padding: '1.5rem', overflow: 'hidden' }}>
              <h4 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>
                Batch Records: {selectedBatch.batchId} ({selectedBatch.records?.length || 0} flagged records)
              </h4>

              <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Identifier</th>
                      <th>Status</th>
                      <th>Diagnostic Message</th>
                      <th>Raw Summary</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedBatch.records || []).map((rec, idx) => (
                      <tr key={idx}>
                        <td><code>{rec.identifier}</code></td>
                        <td>
                          {rec.status === 'warning' ? (
                            <span className="badge badge-warning"><AlertTriangle size={12} /> Warning</span>
                          ) : (
                            <span className="badge badge-error"><XCircle size={12} /> Error</span>
                          )}
                        </td>
                        <td style={{ fontSize: '0.85rem' }}>{rec.message}</td>
                        <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {rec.rawData ? JSON.stringify(rec.rawData) : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
