import React, { useState, useEffect } from 'react';
import { Play, CheckCircle2, AlertTriangle, XCircle, ArrowRight, Activity } from 'lucide-react';

interface PhaseState {
  key: string;
  name: string;
  description: string;
  processed: number;
  total: number;
  success: number;
  warnings: number;
  failed: number;
  status: 'idle' | 'running' | 'completed' | 'failed';
}

const INITIAL_PHASES: PhaseState[] = [
  {
    key: 'PHASE_2_1_LOCATIONS',
    name: 'Phase 2.1: Facilities & Locations',
    description: 'IM_LOC -> Facility & Location (Default Bins & CanSellDirectly logic)',
    processed: 0,
    total: 4,
    success: 0,
    warnings: 0,
    failed: 0,
    status: 'idle',
  },
  {
    key: 'PHASE_2_2_TAXONOMIES',
    name: 'Phase 2.2: Taxonomies & Categories',
    description: 'IM_CATEG_COD & Subcategories -> Taxonomy (plus UNCATEGORIZED fallback)',
    processed: 0,
    total: 20,
    success: 0,
    warnings: 0,
    failed: 0,
    status: 'idle',
  },
  {
    key: 'PHASE_2_3_VENDORS',
    name: 'Phase 2.3: Vendors',
    description: 'PO_VEND -> Vendor (exact vendor string IDs + INHOUSE vendor)',
    processed: 0,
    total: 216,
    success: 0,
    warnings: 0,
    failed: 0,
    status: 'idle',
  },
  {
    key: 'PHASE_3_ALL',
    name: 'Phase 3: Catalog, Variants & Inventory',
    description: 'IM_ITEM, 42-tag dynamic grid normalizer, barcodes, prices & inventory collections',
    processed: 0,
    total: 6122,
    success: 0,
    warnings: 0,
    failed: 0,
    status: 'idle',
  },
  {
    key: 'PHASE_4_1_CUSTOMERS',
    name: 'Phase 4.1: Customers & Corporate Accounts',
    description: 'AR_CUST -> WalkInCustomer & Agency accounts (Two-pass hierarchy classification)',
    processed: 0,
    total: 71038,
    success: 0,
    warnings: 0,
    failed: 0,
    status: 'idle',
  },
  {
    key: 'PHASE_4_2_GIFTCARDS',
    name: 'Phase 4.2: Gift Cards',
    description: 'SY_GFC & SY_GFC_ACTIV -> GiftCard (Balance tracking & activity logs)',
    processed: 0,
    total: 2142,
    success: 0,
    warnings: 0,
    failed: 0,
    status: 'idle',
  },
  {
    key: 'PHASE_4_3_POS_ORDERS',
    name: 'Phase 4.3: Historical POS Sales Orders',
    description: 'PS_TKT_HIST (470K) + Lines (1.4M) via Keyset seek & PCI safe tenders',
    processed: 0,
    total: 470431,
    success: 0,
    warnings: 0,
    failed: 0,
    status: 'idle',
  },
  {
    key: 'PHASE_4_4_DRAWER_SESSIONS',
    name: 'Phase 4.4: Drawer Session Archives',
    description: 'PS_DRW_SESSION_HIST (78K) -> CounterPointReportArchive (EOD Z-Out)',
    processed: 0,
    total: 78417,
    success: 0,
    warnings: 0,
    failed: 0,
    status: 'idle',
  },
  {
    key: 'PHASE_4_5_OPEN_INVOICES',
    name: 'Phase 4.5: Open A/R Invoices',
    description: 'AR_OPN_ITEM (265K) -> Invoice (A/R customer aging & balance tracking)',
    processed: 0,
    total: 265119,
    success: 0,
    warnings: 0,
    failed: 0,
    status: 'idle',
  },
];

export const PhaseProgressRunner: React.FC = () => {
  const [phases, setPhases] = useState<PhaseState[]>(INITIAL_PHASES);
  const [isRunningAll, setIsRunningAll] = useState<boolean>(false);
  const [activePhaseKey, setActivePhaseKey] = useState<string | null>(null);

  useEffect(() => {
    // Connect to Server-Sent Events stream
    const eventSource = new EventSource('/api/migration/stream-progress');

    eventSource.onmessage = (event) => {
      try {
        const update = JSON.parse(event.data);
        if (update.phaseKey) {
          setPhases((prev) =>
            prev.map((p) => {
              if (p.key === update.phaseKey || (p.key === 'PHASE_3_ALL' && update.phaseKey.startsWith('PHASE_3'))) {
                return {
                  ...p,
                  processed: update.processed || p.processed,
                  total: update.total || p.total,
                  success: update.success || p.success,
                  warnings: update.warnings || p.warnings,
                  failed: update.failed || p.failed,
                  status: update.status || p.status,
                };
              }
              return p;
            })
          );
        }
      } catch (err) {
        console.error('Error parsing SSE event:', err);
      }
    };

    return () => {
      eventSource.close();
    };
  }, []);

  const launchPhase = async (phaseKey: string, limit?: number) => {
    setActivePhaseKey(phaseKey);
    setPhases((prev) =>
      prev.map((p) => (p.key === phaseKey ? { ...p, status: 'running' } : p))
    );

    try {
      await fetch('/api/migration/run-phase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phase: phaseKey, limit }),
      });
    } catch (err) {
      console.error('Failed to trigger phase:', err);
    }
  };

  const launchAllSequential = async () => {
    setIsRunningAll(true);
    try {
      await fetch('/api/migration/run-phase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phase: 'ALL_SEQUENTIAL' }),
      });
    } catch (err) {
      console.error('Failed to trigger full sequential pipeline:', err);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Top Banner & Pipeline Trigger */}
      <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Activity size={22} color="#38bdf8" />
            Sequential Phase Execution Engine
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Strict dependency execution order: Reference Data -&gt; Catalog &amp; Grid -&gt; Inventory -&gt; Customers -&gt; Historical Sales
          </p>
        </div>

        <div style={{ display: 'flex', gap: '1rem' }}>
          <button
            className="btn-primary"
            onClick={launchAllSequential}
            disabled={isRunningAll}
            style={{ padding: '0.75rem 1.5rem', fontSize: '1rem' }}
          >
            <Play size={18} />
            {isRunningAll ? 'Pipeline Running...' : 'Execute Full Migration Pipeline'}
          </button>
        </div>
      </div>

      {/* Phase Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {phases.map((phase) => {
          const percent = phase.total > 0 ? Math.min(100, Math.round((phase.processed / phase.total) * 100)) : 0;
          const isCurrent = activePhaseKey === phase.key;

          return (
            <div
              key={phase.key}
              className="glass-panel"
              style={{
                padding: '1.5rem',
                borderLeft:
                  phase.status === 'completed'
                    ? '4px solid var(--emerald)'
                    : phase.status === 'running'
                    ? '4px solid #38bdf8'
                    : phase.status === 'failed'
                    ? '4px solid var(--rose)'
                    : '4px solid var(--border-color)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                <div style={{ flex: 1, minWidth: '300px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>{phase.name}</h3>
                    {phase.status === 'completed' && (
                      <span className="badge badge-success"><CheckCircle2 size={12} /> Complete</span>
                    )}
                    {phase.status === 'running' && (
                      <span className="badge badge-neutral" style={{ color: '#38bdf8', borderColor: '#38bdf8' }}>
                        <span className="status-dot dot-cyan"></span> Running...
                      </span>
                    )}
                    {phase.status === 'failed' && (
                      <span className="badge badge-error"><XCircle size={12} /> Failed</span>
                    )}
                    {phase.status === 'idle' && (
                      <span className="badge badge-neutral">Idle</span>
                    )}
                  </div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                    {phase.description}
                  </p>
                </div>

                {/* Individual Action Controls */}
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <button
                    className="btn-secondary"
                    onClick={() => launchPhase(phase.key, 100)}
                    disabled={phase.status === 'running'}
                    style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}
                  >
                    Smoke Run (100)
                  </button>
                  <button
                    className="btn-primary"
                    onClick={() => launchPhase(phase.key)}
                    disabled={phase.status === 'running'}
                    style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}
                  >
                    <Play size={14} /> Run Phase
                  </button>
                </div>
              </div>

              {/* Progress Bar & Counters */}
              <div style={{ marginTop: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>
                    Processed: <strong>{phase.processed.toLocaleString()}</strong> / {phase.total.toLocaleString()} rows ({percent}%)
                  </span>
                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <span style={{ color: '#34d399' }}>✓ {phase.success.toLocaleString()} success</span>
                    {phase.warnings > 0 && (
                      <span style={{ color: '#fbbf24' }}>⚠ {phase.warnings.toLocaleString()} warnings</span>
                    )}
                    {phase.failed > 0 && (
                      <span style={{ color: '#fb7185' }}>✕ {phase.failed.toLocaleString()} failed</span>
                    )}
                  </div>
                </div>

                <div className="progress-bar-container">
                  <div
                    className="progress-bar-fill"
                    style={{
                      width: `${percent}%`,
                      background:
                        phase.status === 'completed'
                          ? 'linear-gradient(90deg, #10b981, #059669)'
                          : 'linear-gradient(90deg, #38bdf8, #6366f1)',
                    }}
                  ></div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
