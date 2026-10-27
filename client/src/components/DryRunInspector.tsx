import React, { useState, useEffect } from 'react';
import { Eye, CheckCircle2, XCircle, AlertTriangle, RefreshCw, Layers } from 'lucide-react';

interface DryRunRecord {
  sourceRow: any;
  transformedPayload: any;
  variantPreviews?: any[];
  isValid: boolean;
  validationError?: string | null;
  warnings?: string[];
}

export const DryRunInspector: React.FC = () => {
  const [phase, setPhase] = useState<string>('PHASE_3_1_PRODUCTS');
  const [records, setRecords] = useState<DryRunRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [selectedRecordIndex, setSelectedRecordIndex] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  const fetchDryRun = async (selectedPhase: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/migration/dry-run?phase=${selectedPhase}`);
      const json = await res.json();
      if (json.success) {
        setRecords(json.records);
        setSelectedRecordIndex(0);
      } else {
        setError(json.error || 'Dry-run inspection failed');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDryRun(phase);
  }, [phase]);

  const activeRecord = records[selectedRecordIndex];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Controls & Phase Selector */}
      <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ padding: '0.5rem', borderRadius: '8px', background: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8' }}>
            <Eye size={20} />
          </div>
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>5-Row In-Memory Dry-Run Inspector</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Executes transformer + <code>doc.validateSync()</code> in RAM with zero database mutations
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <select
            value={phase}
            onChange={(e) => setPhase(e.target.value)}
            style={{
              background: 'rgba(15, 23, 42, 0.8)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              padding: '0.6rem 1rem',
              borderRadius: '8px',
              fontSize: '0.9rem',
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            <option value="PHASE_2_1_LOCATIONS">Phase 2.1: Locations (IM_LOC)</option>
            <option value="PHASE_2_2_TAXONOMIES">Phase 2.2: Taxonomies (IM_CATEG_COD)</option>
            <option value="PHASE_2_3_VENDORS">Phase 2.3: Vendors (PO_VEND)</option>
            <option value="PHASE_3_1_PRODUCTS">Phase 3.1: Products & Variants (IM_ITEM)</option>
          </select>

          <button className="btn-secondary" onClick={() => fetchDryRun(phase)} disabled={loading}>
            <RefreshCw size={16} />
            Re-run Inspection
          </button>
        </div>
      </div>

      {error && (
        <div className="glass-panel" style={{ padding: '1rem', borderLeft: '4px solid var(--rose)', color: '#fb7185' }}>
          <AlertTriangle size={20} style={{ verticalAlign: 'middle', marginRight: '0.5rem' }} />
          {error}
        </div>
      )}

      {/* Record Selector Pills */}
      <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
        {records.map((r, idx) => (
          <button
            key={idx}
            className={`tab-btn ${selectedRecordIndex === idx ? 'active' : ''}`}
            onClick={() => setSelectedRecordIndex(idx)}
            style={{ padding: '0.6rem 1rem', borderRadius: '10px' }}
          >
            <Layers size={14} />
            Sample #{idx + 1}: {r.sourceRow.ITEM_NO || r.sourceRow.LOC_ID || r.sourceRow.CATEG_COD || r.sourceRow.VEND_NO}
            {r.isValid ? (
              <span className="status-dot dot-green" style={{ marginLeft: '0.35rem' }}></span>
            ) : (
              <span className="status-dot dot-red" style={{ marginLeft: '0.35rem' }}></span>
            )}
          </button>
        ))}
      </div>

      {/* Side-by-Side Comparison Panels */}
      {activeRecord && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '1.5rem' }}>
          {/* Left: Raw SQL Source */}
          <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ fontSize: '1rem', fontWeight: 600, color: '#38bdf8' }}>Source CounterPoint SQL Row</h4>
              <span className="badge badge-neutral">Raw Extracted Fields</span>
            </div>
            <pre
              style={{
                background: 'rgba(7, 9, 14, 0.8)',
                padding: '1rem',
                borderRadius: '8px',
                fontSize: '0.8rem',
                color: '#e2e8f0',
                maxHeight: '450px',
                overflowY: 'auto',
                border: '1px solid rgba(255, 255, 255, 0.05)',
              }}
            >
              {JSON.stringify(activeRecord.sourceRow, null, 2)}
            </pre>
          </div>

          {/* Right: Target Mongoose Document */}
          <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ fontSize: '1rem', fontWeight: 600, color: '#34d399' }}>Transformed Mongoose Document</h4>
              {activeRecord.isValid ? (
                <span className="badge badge-success"><CheckCircle2 size={12} /> doc.validate() Passed</span>
              ) : (
                <span className="badge badge-error"><XCircle size={12} /> Validation Error</span>
              )}
            </div>

            {activeRecord.validationError && (
              <div style={{ padding: '0.75rem', borderRadius: '8px', background: 'rgba(244, 63, 94, 0.15)', color: '#fb7185', fontSize: '0.85rem' }}>
                <strong>Mongoose Error:</strong> {activeRecord.validationError}
              </div>
            )}

            {activeRecord.warnings && activeRecord.warnings.length > 0 && (
              <div style={{ padding: '0.75rem', borderRadius: '8px', background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', fontSize: '0.85rem' }}>
                <strong>Warnings:</strong> {activeRecord.warnings.join('; ')}
              </div>
            )}

            <pre
              style={{
                background: 'rgba(7, 9, 14, 0.8)',
                padding: '1rem',
                borderRadius: '8px',
                fontSize: '0.8rem',
                color: '#e2e8f0',
                maxHeight: '450px',
                overflowY: 'auto',
                border: '1px solid rgba(255, 255, 255, 0.05)',
              }}
            >
              {JSON.stringify(activeRecord.transformedPayload, null, 2)}
            </pre>

            {activeRecord.variantPreviews && activeRecord.variantPreviews.length > 0 && (
              <div style={{ marginTop: '0.5rem' }}>
                <h5 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.5rem', color: '#c084fc' }}>
                  Generated Variant Cells ({activeRecord.variantPreviews.length}):
                </h5>
                <pre
                  style={{
                    background: 'rgba(7, 9, 14, 0.8)',
                    padding: '1rem',
                    borderRadius: '8px',
                    fontSize: '0.75rem',
                    color: '#c084fc',
                    maxHeight: '200px',
                    overflowY: 'auto',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                  }}
                >
                  {JSON.stringify(activeRecord.variantPreviews, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
