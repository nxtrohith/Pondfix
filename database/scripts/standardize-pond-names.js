// Idempotent migration to standardize pond display names to 'Pond 1' ... 'Pond 17'.
// Preserves all document _ids, sourceIds, timestamps, measurements, alerts, etc.
//   node database/scripts/standardize-pond-names.js
import { withDb, run, DB_NAME } from '../lib/connect.js';
import { POND_NAMES } from '../lib/fwi-mapping.js';

run(() => withDb(async (db) => {
  const ponds = await db.collection('ponds').find({}).toArray();
  let updated = 0;
  let alreadyStandard = 0;
  let unmapped = 0;

  for (const pond of ponds) {
    const targetName = POND_NAMES[pond.sourceId];
    if (!targetName) {
      console.log(`Pond ${pond._id} (sourceId: ${pond.sourceId}, name: ${pond.name}) has no standard mapping; keeping unchanged.`);
      unmapped++;
      continue;
    }
    if (pond.name === targetName) {
      alreadyStandard++;
      continue;
    }
    await db.collection('ponds').updateOne(
      { _id: pond._id },
      { $set: { name: targetName } }
    );
    console.log(`Updated pond ${pond._id} (sourceId: ${pond.sourceId}): '${pond.name}' -> '${targetName}'`);
    updated++;
  }

  console.log(`Migration finished in "${DB_NAME}": ${updated} updated, ${alreadyStandard} already standardized, ${unmapped} unmapped (total: ${ponds.length}).`);
}));
