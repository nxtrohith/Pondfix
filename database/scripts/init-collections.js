// Idempotent: creates missing collections with validators, updates validators on existing ones via collMod.
import { withDb, run } from '../lib/connect.js';
import { applyCollections } from '../lib/setup.js';

run(() => withDb((db) => applyCollections(db, console.log)));
