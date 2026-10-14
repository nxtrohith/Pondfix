// AquaGuard data simulator: posts synthetic readings for every pond whose data source is set to "Server".
//   API_URL (default http://127.0.0.1:4000/api), SIM_INTERVAL_MINUTES (default 15), SIM_BACKFILL_HOURS (default 6),
//   SIM_ANOMALIES=1 (or npm run simulator:anom) makes about half the ponds drift into warning/critical ranges
import { createRunner } from './runner.js';

const apiUrl = process.env.API_URL || 'http://127.0.0.1:4000/api';
const intervalMinutes = Number(process.env.SIM_INTERVAL_MINUTES || 1);
const backfillHours = Number(process.env.SIM_BACKFILL_HOURS || 6);
if (!(intervalMinutes > 0) || !(backfillHours >= 0)) { console.error('SIM_INTERVAL_MINUTES must be > 0 and SIM_BACKFILL_HOURS >= 0'); process.exit(1); }

const anomalies = ['1', 'true'].includes(process.env.SIM_ANOMALIES ?? '');
const runner = createRunner({ apiUrl, intervalMinutes, backfillHours, anomalies });
const pass = async () => {
  try {
    const r = await runner.tick();
    if (r.skipped) return; // previous pass still running
    console.log(`${new Date().toISOString()} simulating ${r.ponds} pond(s): ${r.posted} reading(s) posted${r.failed ? `, ${r.failed} failed` : ''}`);
  } catch (e) { console.error(`${new Date().toISOString()} cannot reach the API (${e.message}); will retry`); }
};

console.log(`AquaGuard simulator -> ${apiUrl}, one reading per pond every ${intervalMinutes} min, backfill up to ${backfillHours} h${anomalies ? ', ANOMALY MODE (some ponds will trigger alerts)' : ''}`);
await pass();
// Check more often than the interval so a pond switched to "Server" starts promptly and slots are never skipped.
const timer = setInterval(pass, Math.min(runner.intervalMs, 30000));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { clearInterval(timer); process.exit(0); });
