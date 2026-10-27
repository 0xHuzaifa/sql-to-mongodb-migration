const mongoose = require('mongoose');

async function setCheckpoint() {
  await mongoose.connect('mongodb://admin:ChangeThisPassword123@localhost:27017/ims?authSource=admin');
  const db = mongoose.connection.db;
  await db.collection('migration_checkpoints').updateOne(
    { phaseKey: 'PHASE_4_1_CUSTOMERS' },
    {
      $set: {
        phaseKey: 'PHASE_4_1_CUSTOMERS',
        lastDocId: '52312',
        processedRows: 43000,
        totalEstimatedRows: 71038,
        status: 'paused',
        updatedAt: new Date()
      }
    },
    { upsert: true }
  );
  console.log('Checkpoint set successfully!');
  const cp = await db.collection('migration_checkpoints').findOne({ phaseKey: 'PHASE_4_1_CUSTOMERS' });
  console.log('Verified checkpoint:', cp);
  await mongoose.disconnect();
}
setCheckpoint();
