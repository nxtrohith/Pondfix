'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle, PencilSimple } from '@phosphor-icons/react/dist/ssr';
import { ApiError, browserApi } from '@/lib/api/client';
import type { SpeciesConfig } from '@/lib/api/schemas';
import { useApiQuery } from '@/lib/useApiQuery';
import { SAFETY_LABEL, buildSpeciesRequest, draftFrom, isConfigured, referenceLines, type SpeciesDraft } from '@/lib/species';
import { formatDateTime } from '@/lib/format';
import { Card, CardHeader } from '../ui/Card';
import { Field, Input, Segmented, Select } from '../ui/Field';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Notice } from '../ui/states';
import { StatusPill } from '../ui/StatusPill';

/**
 * Species of one pond: shows the value SAVED ON THE SERVER, and edits it through PATCH /ponds/:id/species. The displayed value only
 * changes from the API's response, never from the form, so a failed save can never look like a success.
 */
export function SpeciesSettings({ pondId, pondName, initial }: { pondId: string; pondName: string; initial?: SpeciesConfig }) {
  const api = useMemo(() => browserApi(), []);
  const router = useRouter();
  const catalogue = useApiQuery((s) => api.speciesProfiles(s), []);
  const [saved, setSaved] = useState<SpeciesConfig | undefined>(initial);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<SpeciesDraft>(() => draftFrom(initial));
  const [formError, setFormError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<ApiError | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<ReturnType<typeof buildSpeciesRequest> | null>(null);

  const entries = catalogue.data?.items ?? [];
  const configured = isConfigured(saved);
  const savedEntry = entries.find((e) => e.id === saved?.speciesProfileId);
  const selected = entries.find((e) => e.id === draft.speciesId);
  const safety = saved?.safetyProfile;

  function startEdit() { setDraft(draftFrom(saved)); setFormError(null); setApiError(null); setSuccess(null); setEditing(true); }
  function submit() {
    setApiError(null); setSuccess(null);
    const built = buildSpeciesRequest(draft, entries);
    if (!built.ok) { setFormError(built.error); return; }
    setFormError(null);
    if (configured) setPending(built); else void save(built);
  }
  async function save(built: ReturnType<typeof buildSpeciesRequest> | null) {
    if (!built?.ok) return;
    setBusy(true); setApiError(null);
    try {
      const pond = await api.saveSpecies(pondId, built.body);
      setSaved(pond.speciesConfig);
      setSuccess(pond.speciesConfig?.state === 'configured' ? `Saved. ${pondName} is now set to ${pond.speciesConfig.label}.` : `Saved. ${pondName} has no species set.`);
      setEditing(false); setPending(null);
      router.refresh();
    } catch (e) {
      setApiError(e instanceof ApiError ? e : new ApiError('network', 'The species could not be saved.'));
      setPending(null);
    } finally { setBusy(false); }
  }
  async function clear() { setPending({ ok: true, body: { mode: 'unconfigured' } }); }

  return (
    <Card aria-labelledby="species-title">
      <CardHeader id="species-title" title="Species and safety profile"
        description="The species raised in this pond decides which reference ranges AquaGuard shows with its alerts."
        action={!editing ? <Button size="sm" onClick={startEdit} disabled={catalogue.loading && !catalogue.data}><PencilSimple size={14} aria-hidden="true" />{configured ? 'Change species' : 'Select species'}</Button> : null} />
      <div className="space-y-4 px-5 pb-5 pt-4 text-[13px]">
        <div aria-live="polite">{success ? <p role="status" className="flex items-start gap-2 rounded-lg bg-ok-bg px-3 py-2 text-ok-text"><CheckCircle size={16} weight="fill" className="mt-px shrink-0" aria-hidden="true" />{success}</p> : null}</div>

        {!editing ? (
          <>
            <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
              <div><dt className="text-ink-soft">Saved species</dt><dd className="mt-0.5 text-[15px] font-medium text-ink">{saved ? saved.label : 'Species not set'}{saved?.cultureLabel ? <span className="ml-2 rounded-full bg-surface px-2 py-0.5 align-middle text-xs font-normal text-ink-soft">{saved.cultureLabel}</span> : null}</dd></div>
              {saved?.scientificName ? <div><dt className="text-ink-soft">Scientific name</dt><dd className="mt-0.5 italic text-ink">{saved.scientificName}</dd></div> : null}
              {saved?.mode === 'polyculture' ? <div className="sm:col-span-2"><dt className="text-ink-soft">Species mix</dt><dd className="mt-0.5 text-ink">{saved.composition?.map((c) => `${c.displayName}${c.proportionPercent !== undefined ? ` ${c.proportionPercent}%` : ''}`).join(', ')}{saved.composition?.some((c) => c.proportionPercent === undefined) ? <span className="text-ink-soft"> (shares not recorded)</span> : null}</dd></div> : null}
              <div><dt className="text-ink-soft">Safety profile</dt><dd className="mt-1">{safety ? <StatusPill tone={SAFETY_LABEL[safety.status].tone}>{SAFETY_LABEL[safety.status].label}</StatusPill> : <span className="text-ink-soft">Not available</span>}</dd></div>
              {saved?.configuredAt ? <div><dt className="text-ink-soft">Last saved</dt><dd className="mt-0.5 text-ink">{formatDateTime(saved.configuredAt)}</dd></div> : null}
            </dl>
            <Notice tone={safety?.alertsEnabled ? 'neutral' : 'warning'}>
              {!configured ? <><strong className="font-medium">No species selected.</strong> The general safety rules still raise alerts for this pond. {safety?.message}</> : <>{safety?.message} {safety?.alertsEnabled ? 'Meeting these limits does not by itself mean the stock is safe.' : 'Actual readings are still shown and the general safety rules still raise alerts.'}</>}
            </Notice>
            {savedEntry && referenceLines(savedEntry).length ? (
              <section aria-label="Reference ranges">
                <h3 className="text-xs font-medium uppercase tracking-wide text-ink-soft">Reference ranges (context only, not alert limits)</h3>
                <ul className="mt-2 space-y-1">{referenceLines(savedEntry).map((l) => <li key={l.parameter} className="flex flex-wrap justify-between gap-x-4"><span className="text-ink-soft">{l.label}</span><span className="text-ink">{l.text} <span className="text-xs text-ink-soft">({l.kind})</span></span></li>)}</ul>
                {savedEntry.notes.map((n) => <p key={n} className="mt-2 text-xs text-ink-soft">{n}</p>)}
              </section>
            ) : savedEntry?.notes.length ? <p className="text-xs text-ink-soft">{savedEntry.notes.join(' ')}</p> : null}
            {configured ? <div><Button size="sm" variant="ghost" onClick={clear}>Remove species setting</Button></div> : null}
          </>
        ) : (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
            <Segmented<SpeciesDraft['mode']> label="Pond type" value={draft.mode} onChange={(mode) => setDraft((d) => ({ ...d, mode }))} options={[{ value: 'single', label: 'One species' }, { value: 'polyculture', label: 'Mixed species' }]} />
            {draft.mode === 'single' ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Species" hint={selected ? (selected.scientificName ? `${selected.scientificName} · ${selected.cultureLabel}` : selected.scientificNameStatus === 'to_be_configured' ? `Exact species to be configured · ${selected.cultureLabel}` : selected.cultureLabel) : undefined}>
                  {(id, d) => (
                    <Select id={id} aria-describedby={d} value={draft.speciesId} onChange={(e) => { setFormError(null); setDraft((s) => ({ ...s, speciesId: e.target.value })); }}>
                      <option value="" disabled>Choose a species</option>
                      {entries.map((e) => <option key={e.id} value={e.id}>{e.displayName} ({e.cultureLabel.toLowerCase()})</option>)}
                    </Select>
                  )}
                </Field>
                {selected?.requiresCustomName ? <Field label="Species name" hint="Free text. AquaGuard has no safety profile for it.">{(id, d) => <Input id={id} aria-describedby={d} maxLength={80} value={draft.customName} onChange={(e) => setDraft((s) => ({ ...s, customName: e.target.value }))} />}</Field> : null}
              </div>
            ) : (
              <fieldset>
                <legend className="mb-2 text-[13px] font-medium text-ink">Species in this pond</legend>
                <ul className="space-y-2">
                  {entries.filter((e) => !e.requiresCustomName).map((e) => { const row = draft.poly[e.id] ?? { checked: false, percent: '' }; return (
                    <li key={e.id} className="flex flex-wrap items-center justify-between gap-3">
                      <label className="flex cursor-pointer items-center gap-2 text-ink"><input type="checkbox" className="size-4 accent-[#637957]" checked={row.checked} onChange={(ev) => setDraft((s) => ({ ...s, poly: { ...s.poly, [e.id]: { ...row, checked: ev.target.checked } } }))} />{e.displayName} <span className="text-xs text-ink-soft">({e.cultureLabel.toLowerCase()})</span></label>
                      <label className="flex items-center gap-1.5 text-xs text-ink-soft">Share<Input aria-label={`${e.displayName} share in percent`} inputMode="decimal" className="h-8 w-20" disabled={!row.checked} value={row.percent} placeholder="optional" onChange={(ev) => setDraft((s) => ({ ...s, poly: { ...s.poly, [e.id]: { ...row, percent: ev.target.value } } }))} />%</label>
                    </li>
                  ); })}
                </ul>
                <p className="mt-2 text-xs text-ink-soft">Shares are optional, but if you enter one you must enter all of them, totalling 100%. Alert limits for mixed-species ponds are not validated, so the general safety rules apply.</p>
              </fieldset>
            )}
            {formError ? <p role="alert" className="text-xs text-crit-text">{formError}</p> : null}
            {apiError ? <div role="alert" className="rounded-lg bg-crit-bg px-3 py-2 text-xs text-crit-text"><strong className="font-medium">Not saved.</strong> {apiError.message}{apiError.details?.length ? <ul className="mt-1 list-disc pl-4">{apiError.details.map((d, i) => <li key={i}>{d.message}</li>)}</ul> : null}</div> : null}
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" type="submit" disabled={busy}>{busy ? 'Saving' : 'Save species'}</Button>
              <Button variant="ghost" disabled={busy} onClick={() => { setEditing(false); setFormError(null); setApiError(null); }}>Cancel</Button>
            </div>
          </form>
        )}
        {!editing && apiError ? <div role="alert" className="rounded-lg bg-crit-bg px-3 py-2 text-xs text-crit-text"><strong className="font-medium">Not saved.</strong> {apiError.message}</div> : null}
        {catalogue.error ? <p role="alert" className="text-xs text-crit-text">The species list could not be loaded, so the species cannot be changed right now. <button type="button" className="underline" onClick={catalogue.reload}>Try again</button></p> : null}
      </div>

      {pending?.ok ? <ConfirmDialog open title={pending.body.mode === 'unconfigured' ? 'Remove the species setting?' : 'Change the species for this pond?'} confirmLabel={pending.body.mode === 'unconfigured' ? 'Remove species' : 'Change species'} busy={busy} onConfirm={() => save(pending)} onCancel={() => !busy && setPending(null)}>
        <p><strong className="font-medium text-ink">{pondName}</strong> is currently set to <strong className="font-medium text-ink">{saved?.label}</strong>.</p>
        <p>Future readings will be checked against the new setting, so which alerts appear may change. Existing alerts are not edited or closed by this change; an open alert is re-checked by the next reading.</p>
      </ConfirmDialog> : null}
    </Card>
  );
}
