import type { Alert, RiskStatus } from './api/schemas';

export type Tone = 'healthy' | 'warning' | 'critical' | 'muted' | 'neutral';

export const RISK_TONE: Record<RiskStatus, Tone> = { NORMAL: 'healthy', WARNING: 'warning', CRITICAL: 'critical', STALE: 'muted', NO_DATA: 'muted', UNKNOWN: 'muted' };
/** Wording for ONE water-quality factor (dissolved oxygen, pH, temperature). Pond-level wording lives in terms.ts (POND_STATUS). */
export const RISK_LABEL: Record<RiskStatus, string> = { NORMAL: 'Normal', WARNING: 'Warning', CRITICAL: 'Critical', STALE: 'Data is not recent', NO_DATA: 'No recent data', UNKNOWN: 'Not monitored' };
/** Sort key: things needing attention first, then old/missing data, then healthy. */
export const RISK_ORDER: Record<RiskStatus, number> = { CRITICAL: 0, WARNING: 1, STALE: 2, NO_DATA: 3, UNKNOWN: 4, NORMAL: 5 };

export const SEVERITY_TONE: Record<Alert['severity'], Tone> = { CRITICAL: 'critical', WARNING: 'warning' };
export const ALERT_STATUS_LABEL: Record<Alert['status'], string> = { ACTIVE: 'Active', ACKNOWLEDGED: 'Marked as seen', RESOLVED: 'Resolved' };
export const ALERT_STATUS_TONE: Record<Alert['status'], Tone> = { ACTIVE: 'warning', ACKNOWLEDGED: 'neutral', RESOLVED: 'healthy' };
