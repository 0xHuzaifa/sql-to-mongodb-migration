const mongoose = require('mongoose');

async function updateProductNames() {
  await mongoose.connect('mongodb://admin:ChangeThisPassword123@localhost:27017/ims?authSource=admin');
  const coll = mongoose.connection.collection('products');

  console.log('Updating products in MongoDB...');
  // Using MongoDB aggregation pipeline update to swap in place:
  // additionalDescription1 = current name
  // name = productMasterSku
  const result = await coll.updateMany(
    { productMasterSku: { $exists: true, $ne: null } },
    [
      {
        $set: {
          additionalDescription1: '$name',
          name: '$productMasterSku'
        }
      }
    ]
  );

  console.log(`Updated ${result.modifiedCount} products!`);

  // Verify COB1101
  const sample = await coll.findOne({ productMasterSku: 'COB1101' });
  console.log('Sample AFTER update:', {
    _id: sample._id,
    productMasterSku: sample.productMasterSku,
    name: sample.name,
    additionalDescription1: sample.additionalDescription1
  });

  await mongoose.disconnect();
}

updateProductNames().catch(console.error);
