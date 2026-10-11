// Idempotent: createIndex is a no-op when an identical index exists.
import { withDb, run } from '../lib/connect.js';
import { applyIndexes } from '../lib/setup.js';

run(() => withDb((db) => applyIndexes(db, console.log)));
