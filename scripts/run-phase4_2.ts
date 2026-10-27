import { connectMongo } from '../src/config/mongo.client';
import { MigrationPhaseRunner } from '../src/orchestrator/phaseRunner';

async function run() {
  try {
    await connectMongo();
    const runner = new MigrationPhaseRunner();
    console.log('Starting Phase 4.2: Gift Cards...');
    const result = await runner.runPhase4_2((p) => {
      console.log(`[Phase 4.2] ${p.processed}/${p.total} cards - status: ${p.status}`);
    });
    console.log('Phase 4.2 finished:', result);
  } catch (e) {
    console.error('Phase 4.2 error:', e);
  } finally {
    process.exit(0);
  }
}
run();
