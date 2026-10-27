import React, { useState } from 'react';
import { Database, Gauge, Play, Eye, AlertOctagon, ShieldCheck, Network } from 'lucide-react';
import { PreFlightCheck } from './components/PreFlightCheck';
import { DryRunInspector } from './components/DryRunInspector';
import { PhaseProgressRunner } from './components/PhaseProgressRunner';
import { DeadLetterInspector } from './components/DeadLetterInspector';
import { ReconciliationView } from './components/ReconciliationView';
import { SchemaMappingView } from './components/SchemaMappingView';

type TabType = 'preflight' | 'mapping' | 'dryrun' | 'runner' | 'deadletter' | 'reconciliation';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('preflight');

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top Sticky Navigation Bar */}
      <header className="header-container">
        <div className="logo-group">
          <div className="logo-badge">50GB ETL</div>
          <div>
            <h1 style={{ fontSize: '1.15rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
              CounterPoint to MongoDB IMS
            </h1>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Migration Command &amp; Control Center
            </p>
          </div>
        </div>

        {/* Tab Switcher */}
        <nav className="tabs-nav">
          <button
            className={`tab-btn ${activeTab === 'preflight' ? 'active' : ''}`}
            onClick={() => setActiveTab('preflight')}
          >
            <Gauge size={16} /> Pre-Flight Matrix
          </button>
          <button
            className={`tab-btn ${activeTab === 'mapping' ? 'active' : ''}`}
            onClick={() => setActiveTab('mapping')}
          >
            <Network size={16} /> Schema Mapping
          </button>
          <button
            className={`tab-btn ${activeTab === 'dryrun' ? 'active' : ''}`}
            onClick={() => setActiveTab('dryrun')}
          >
            <Eye size={16} /> Dry-Run Inspector
          </button>
          <button
            className={`tab-btn ${activeTab === 'runner' ? 'active' : ''}`}
            onClick={() => setActiveTab('runner')}
          >
            <Play size={16} /> Phase Runner
          </button>
          <button
            className={`tab-btn ${activeTab === 'deadletter' ? 'active' : ''}`}
            onClick={() => setActiveTab('deadletter')}
          >
            <AlertOctagon size={16} /> Dead-Letter &amp; Audit
          </button>
          <button
            className={`tab-btn ${activeTab === 'reconciliation' ? 'active' : ''}`}
            onClick={() => setActiveTab('reconciliation')}
          >
            <ShieldCheck size={16} /> Cutover Verification
          </button>
        </nav>
      </header>

      {/* Main Content Area */}
      <main style={{ flex: 1, padding: '2rem', maxWidth: '1440px', margin: '0 auto', width: '100%' }}>
        {activeTab === 'preflight' && <PreFlightCheck />}
        {activeTab === 'mapping' && <SchemaMappingView />}
        {activeTab === 'dryrun' && <DryRunInspector />}
        {activeTab === 'runner' && <PhaseProgressRunner />}
        {activeTab === 'deadletter' && <DeadLetterInspector />}
        {activeTab === 'reconciliation' && <ReconciliationView />}
      </main>

      {/* Footer */}
      <footer
        style={{
          padding: '1.5rem 2rem',
          borderTop: '1px solid var(--border-color)',
          textAlign: 'center',
          fontSize: '0.8rem',
          color: 'var(--text-muted)',
          background: 'rgba(11, 15, 25, 0.6)',
        }}
      >
        50GB NCR CounterPoint to MongoDB IMS Migration Engine • Strictly PCI Compliant • In-Memory Ledger Cache • 75 Mongoose Models
      </footer>
    </div>
  );
};

export default App;
