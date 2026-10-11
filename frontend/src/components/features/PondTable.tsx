import Link from 'next/link';
import { CaretRight } from '@phosphor-icons/react/dist/ssr';
import type { FleetRow } from '@/lib/fleet';
import { formatAge, formatDateTime, formatValue, unitLabel } from '@/lib/format';
import { RISK_LABEL, RISK_TONE } from '@/lib/status';
import { PARAM_SHORT } from '@/lib/format';
import { Table, Td, Th, Tr } from '../ui/Table';
import { SourceBadge, StatusPill } from '../ui/StatusPill';

const TEXT_BY_RISK = { CRITICAL: 'text-crit-text', WARNING: 'text-warn-text' } as const;

function ParamCell({ row, parameter }: { row: FleetRow; parameter: string }) {
  const p = row.summary?.parameters[parameter];
  if (!p) return <span className="text-ink-soft" title="Not available">n/a</span>;
  const risk = p.risk === 'CRITICAL' || p.risk === 'WARNING' ? TEXT_BY_RISK[p.risk] : '';
  return <span className={`tabular-nums ${risk}`}>{formatValue(p.value, parameter)}<span className="ml-1 text-xs text-ink-soft">{unitLabel(p.unit)}</span></span>;
}

export function PondTable({ rows, caption }: { rows: FleetRow[]; caption: string }) {
  return (
    <Table caption={caption} className="min-w-[880px]">
      <thead>
        <tr><Th>Pond</Th><Th>DO</Th><Th>pH</Th><Th>Temperature</Th><Th>Latest reading</Th><Th>Freshness</Th><Th>Status</Th><Th className="text-right"><span className="sr-only">Details</span></Th></tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const latestSource = r.summary ? Object.values(r.summary.parameters).sort((a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt))[0]?.source : undefined;
          return (
            <Tr key={r.pond.id}>
              <Td><Link href={`/ponds/${r.pond.id}`} className="font-medium text-ink hover:text-olive-text hover:underline">{r.pond.name}</Link></Td>
              <Td><ParamCell row={r} parameter="dissolved_oxygen" /></Td>
              <Td><ParamCell row={r} parameter="ph" /></Td>
              <Td><ParamCell row={r} parameter="temperature" /></Td>
              <Td>
                {r.latestAt ? (
                  <div className="flex flex-col items-start gap-1"><span className="whitespace-nowrap tabular-nums">{formatDateTime(r.latestAt)}</span>{latestSource ? <SourceBadge source={latestSource} /> : null}</div>
                ) : <span className="text-ink-soft">No readings</span>}
              </Td>
              <Td className="whitespace-nowrap text-ink-soft">{r.latestAt ? formatAge(r.latestAgeMinutes) : 'n/a'}</Td>
              <Td>
                {r.risk === 'ERROR' ? <StatusPill tone="muted">Unavailable</StatusPill> : <StatusPill tone={RISK_TONE[r.risk]}>{RISK_LABEL[r.risk]}</StatusPill>}
                {(() => { const obs = [...new Set((r.summary?.openAlertItems ?? []).filter((a) => a.origin === 'observed').map((a) => PARAM_SHORT[a.parameter] ?? a.parameter))]; return obs.length ? <p className="mt-1 text-xs text-ink-soft" title="Parameters with an unresolved observed alert">Alerts: {obs.join(', ')}</p> : null; })()}
              </Td>
              <Td className="text-right"><Link href={`/ponds/${r.pond.id}`} aria-label={`View ${r.pond.name}`} className="inline-flex size-8 items-center justify-center rounded-lg text-ink-soft hover:bg-surface hover:text-ink"><CaretRight size={16} aria-hidden="true" /></Link></Td>
            </Tr>
          );
        })}
      </tbody>
    </Table>
  );
}
