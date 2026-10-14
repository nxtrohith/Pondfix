import type { Alert, RiskStatus } from './api/schemas';

export type Tone = 'healthy' | 'warning' | 'critical' | 'muted' | 'neutral';

export const RISK_TONE: Record<RiskStatus, Tone> = { NORMAL: 'healthy', WARNING: 'warning', CRITICAL: 'critical', STALE: 'muted', NO_DATA: 'muted', UNKNOWN: 'muted' };
export const RISK_LABEL: Record<RiskStatus, string> = { NORMAL: 'Healthy', WARNING: 'Warning', CRITICAL: 'Critical', STALE: 'Stale', NO_DATA: 'No data', UNKNOWN: 'Unknown' };
/** Sort key: things needing attention first, then stale/no data, then healthy. */
export const RISK_ORDER: Record<RiskStatus, number> = { CRITICAL: 0, WARNING: 1, STALE: 2, NO_DATA: 3, UNKNOWN: 4, NORMAL: 5 };

export const SEVERITY_TONE: Record<Alert['severity'], Tone> = { CRITICAL: 'critical', WARNING: 'warning' };
export const ALERT_STATUS_LABEL: Record<Alert['status'], string> = { ACTIVE: 'Active', ACKNOWLEDGED: 'Acknowledged', RESOLVED: 'Resolved' };
export const ALERT_STATUS_TONE: Record<Alert['status'], Tone> = { ACTIVE: 'warning', ACKNOWLEDGED: 'neutral', RESOLVED: 'healthy' };
