import { connectMongo } from '../src/config/mongo.client';
import { MigrationPhaseRunner } from '../src/orchestrator/phaseRunner';

async function run() {
  try {
    await connectMongo();
    const runner = new MigrationPhaseRunner();
    console.log('Resuming Phase 4.1: Customers from checkpoint...');
    const result = await runner.runPhase4_1(undefined, (p) => {
      console.log(`[Phase 4.1] ${p.processed}/${p.total} customers (${((p.processed/p.total)*100).toFixed(1)}%) - status: ${p.status}`);
    });
    console.log('Phase 4.1 completed:', result);
  } catch (e) {
    console.error('Phase 4.1 error:', e);
  } finally {
    process.exit(0);
  }
}
run();
