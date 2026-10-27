import React, { useState, useEffect } from 'react';
import { ShieldCheck, RefreshCw, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';

interface ReconciliationReportItem {
  checkNumber: number;
  domain: string;
  sourceSqlCountOrSum: number;
  targetMongoCountOrSum: number;
  passed: boolean;
  notes: string;
}

export const ReconciliationView: React.FC = () => {
  const [report, setReport] = useState<ReconciliationReportItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [allPassed, setAllPassed] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runReconciliation = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/migration/reconcile');
      const json = await res.json();
      if (json.success) {
        setReport(json.report);
        setAllPassed(json.allPassed);
      } else {
        setError(json.error || 'Reconciliation failed');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runReconciliation();
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ padding: '0.6rem', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.2)', color: '#34d399' }}>
            <ShieldCheck size={24} />
          </div>
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>8-Point Automated Production Cutover Verification</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Compares exact source SQL counts and currency sums against target MongoDB collections
            </p>
          </div>
        </div>

        <button className="btn-primary" onClick={runReconciliation} disabled={loading}>
          <RefreshCw size={16} /> Run Reconciliation Suite
        </button>
      </div>

      {allPassed !== null && (
        <div
          className="glass-panel"
          style={{
            padding: '1.25rem',
            borderLeft: allPassed ? '4px solid var(--emerald)' : '4px solid var(--rose)',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
          }}
        >
          {allPassed ? (
            <>
              <CheckCircle2 size={32} color="#10b981" />
              <div>
                <h4 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#34d399' }}>100% Production Reconciliation Passed</h4>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  All catalog items, stock unit sums, gift card balances, and POS revenue match source SQL tables with zero data loss.
                </p>
              </div>
            </>
          ) : (
            <>
              <AlertTriangle size={32} color="#f43f5e" />
              <div>
                <h4 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fb7185' }}>Discrepancies Detected in Target Database</h4>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  One or more verification checks failed. Review the table below before authorizing production cutover.
                </p>
              </div>
            </>
          )}
        </div>
      )}

      {error && (
        <div className="glass-panel" style={{ padding: '1rem', borderLeft: '4px solid var(--rose)', color: '#fb7185' }}>
          <AlertTriangle size={20} style={{ verticalAlign: 'middle', marginRight: '0.5rem' }} />
          {error}
        </div>
      )}

      <div className="glass-panel" style={{ overflow: 'hidden' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Domain Verified</th>
              <th>Source SQL Value</th>
              <th>Target MongoDB Value</th>
              <th>Verification Status</th>
              <th>Audit Notes</th>
            </tr>
          </thead>
          <tbody>
            {report.map((item) => (
              <tr key={item.checkNumber}>
                <td><strong>{item.checkNumber}</strong></td>
                <td style={{ fontWeight: 600 }}>{item.domain}</td>
                <td style={{ color: '#38bdf8', fontWeight: 600 }}>
                  {typeof item.sourceSqlCountOrSum === 'number'
                    ? item.sourceSqlCountOrSum.toLocaleString()
                    : item.sourceSqlCountOrSum}
                </td>
                <td style={{ color: '#34d399', fontWeight: 600 }}>
                  {typeof item.targetMongoCountOrSum === 'number'
                    ? item.targetMongoCountOrSum.toLocaleString()
                    : item.targetMongoCountOrSum}
                </td>
                <td>
                  {item.passed ? (
                    <span className="badge badge-success"><CheckCircle2 size={12} /> Exact Match</span>
                  ) : (
                    <span className="badge badge-error"><XCircle size={12} /> Discrepancy</span>
                  )}
                </td>
                <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{item.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
