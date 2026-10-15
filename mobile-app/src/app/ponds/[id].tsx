// Screen 4: pond details. Each parameter has its own status. Missing or stale readings show as unavailable, never as healthy.
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/Text';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/colors';
import { fontSize, radius, spacing, layout } from '@/constants/theme';
import { useAlerts, usePonds } from '@/context/LiveData';
import { useAppStore } from '@/context/AppStore';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { PondImage } from '@/components/PondImage';
import { MetricCard } from '@/components/MetricCard';
import { ChemistryCard } from '@/components/ChemistryCard';
import { StatusBadge } from '@/components/StatusBadge';
import { AppButton } from '@/components/AppButton';
import { PondNotesPanel } from '@/components/PondNotesPanel';
import { AlertCard } from '@/components/AlertCard';
import { DownstreamRiskList } from '@/components/DownstreamRiskList';
import { getDownstreamRisks } from '@/services/downstream';
import { ConnectionBanner } from '@/components/ConnectionBanner';
import { EmptyState } from '@/components/StateViews';
import { SectionHeader, Panel } from '@/components/SectionHeader';
import { WHY_IT_MATTERS } from '@/data/whyItMatters';
import { speciesName } from '@/data/mockSpecies';
import { useTranslatedTexts } from '@/i18n/useTranslated';
import { summarizePond } from '@/lib/pondSummary';
import { ageMinutes, classifyValue, PARAMETER_LABEL, POND_PRESENTATION } from '@/lib/status';
import { formatDateTime, formatTime } from '@/lib/format';
import { CHEMISTRY_PARAMETERS, PARAMETERS, type DownstreamRisk, type Parameter, type Pond } from '@/types';
import { param, routes } from '@/lib/routes';

export default function PondDetailScreen() {
  const { t } = useTranslation();
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = param(rawId) ?? '';
  const { ponds, readings, chemistry, asOf, staleAfterMinutes, ensureHistory } = usePonds();
  const { activeAlerts: alerts } = useAlerts();
  const pond = ponds.find((p) => p.id === id);
  const hasPond = !!pond;
  useEffect(() => { if (hasPond) ensureHistory(id); }, [hasPond, id, ensureHistory]);
  // Opening a pond makes it the farmer's current pond, so Home shows it next time.
  const { selectPond } = useAppStore();
  useEffect(() => { if (hasPond) selectPond(id); }, [hasPond, id, selectPond]);
  // Knock-on effects follow the newest reading: re-fetched when a newer one arrives. A failed fetch just hides the section.
  const [risks, setRisks] = useState<DownstreamRisk[]>([]);
  const newestReading = (readings[id] ?? []).map((r) => r.latest?.recordedAt ?? '').sort().at(-1) ?? '';
  useEffect(() => {
    if (!hasPond) return undefined;
    let live = true;
    getDownstreamRisks(id).then((r) => { if (live) setRisks(r); }, () => { if (live) setRisks([]); });
    return () => { live = false; };
  }, [hasPond, id, newestReading]);

  if (!pond) {
    return (
      <ScreenContainer bottomNav="ponds" testID="pond-missing">
        <AppHeader title={t('pondDetail.notFoundTitle')} />
        <EmptyState title={t('pondDetail.notFoundHeading')}>{t('pondDetail.notFoundBody')}</EmptyState>
        <AppButton label={t('common.allPonds')} variant="outline" onPress={() => router.replace(routes.ponds)} />
      </ScreenContainer>
    );
  }

  const summary = summarizePond(pond, readings[pond.id] ?? [], alerts, asOf);
  const latestTimes = PARAMETERS.map((p) => summary.parameters[p].reading.latest?.recordedAt).filter((t): t is string => !!t);
  const lastUpdated = latestTimes.length ? [...latestTimes].sort().at(-1)! : null;
  const presentation = POND_PRESENTATION[summary.status];
  const unavailable = PARAMETERS.filter((p) => summary.parameters[p].status === 'UNAVAILABLE' || summary.parameters[p].status === 'STALE');
  const problems = PARAMETERS.filter((p) => summary.parameters[p].status === 'WARNING' || summary.parameters[p].status === 'CRITICAL');

  return (
    <ScreenContainer bottomNav="ponds" testID="pond-detail-screen">
      <AppHeader
        title={pond.displayName}
        subtitle={speciesName(pond) ?? t('species.notSet')}
        right={<AppButton label={t('common.edit')} variant="outline" icon="create-outline" onPress={() => router.push(routes.pondEdit(pond.id))} testID="edit-pond" />}
      />
      <ConnectionBanner />

      <View style={styles.hero}>
        <PondImage width={120} height={88} radius={radius.card} label={t('pondDetail.photoLabel', { name: pond.displayName })} />
        <View style={styles.heroText}>
          <StatusBadge kind="pond" status={summary.status} />
          <Text style={styles.summary}>{presentation.summary}</Text>
          <Text style={styles.updated} testID="last-updated">{t('pondDetail.lastUpdated', { time: lastUpdated ? formatDateTime(lastUpdated) : t('pondDetail.never') })}</Text>
        </View>
      </View>

      <SpeciesPanel pond={pond} />

      <SectionHeader title={t('pondDetail.currentQuality')} hint={t('pondDetail.currentQualityHint')} />
      <View style={styles.metrics}>
        {PARAMETERS.map((p) => {
          const r = summary.parameters[p];
          const latest = r.reading.latest;
          return (
            <MetricCard
              key={p}
              testID={`metric-${p}`}
              parameter={p}
              value={latest ? latest.value : null}
              status={r.status}
              recordedAt={latest?.recordedAt ?? r.reading.lastSeenAt}
              ageMinutes={latest ? ageMinutes(latest.recordedAt, asOf) : null}
              direction={summary.openAlerts.find((a) => a.parameter === p)?.direction}
              explain
            />
          );
        })}
      </View>

      {risks.length ? (
        <>
          <SectionHeader title={t('pondDetail.watchFor')} hint={t('pondDetail.watchForHint')} />
          <DownstreamRiskList risks={risks} testID="downstream-risks" />
        </>
      ) : null}

      {(chemistry[pond.id] ?? []).some((c) => c.latest) ? (
        <>
          <SectionHeader title={t('pondDetail.chemistry')} hint={t('pondDetail.chemistryHint')} />
          <View style={styles.metrics}>
            {CHEMISTRY_PARAMETERS.map((cp) => {
              const c = (chemistry[pond.id] ?? []).find((x) => x.parameter === cp);
              return c ? <ChemistryCard key={cp} testID={`chemistry-${cp}`} reading={c} asOf={asOf} staleAfterMinutes={staleAfterMinutes} /> : null;
            })}
          </View>
        </>
      ) : null}

      {unavailable.length ? (
        <Panel testID="unavailable-panel">
          {unavailable.map((p) => {
            const r = summary.parameters[p].reading;
            const text = summary.parameters[p].status === 'STALE'
              ? t('pondDetail.staleText', { name: PARAMETER_LABEL[p] })
              : r.lastSeenAt ? t('pondDetail.unavailableSeen', { name: PARAMETER_LABEL[p], time: formatTime(r.lastSeenAt) }) : t('pondDetail.unavailable', { name: PARAMETER_LABEL[p] });
            return (
              <View key={p} style={styles.unavailRow}>
                <Ionicons name="help-circle" size={18} color={colors.textSecondary} />
                <Text style={[styles.small, { flex: 1 }]}>{text}</Text>
                <AppButton label={t('common.troubleshoot')} variant="onCard" onPress={() => router.push(routes.unavailable(pond.id, p))} testID={`troubleshoot-${p}`} />
              </View>
            );
          })}
        </Panel>
      ) : null}

      <SectionHeader title={t('pondDetail.attention')} />
      {problems.length === 0 && unavailable.length === 0 ? (
        <Panel><Text style={styles.small}>{t('pondDetail.allGood')}</Text></Panel>
      ) : null}
      {problems.map((p) => {
        const reading = summary.parameters[p].reading.latest!;
        const cls = classifyValue(p, reading.value);
        const open = summary.openAlerts.find((a) => a.parameter === p);
        const critical = summary.parameters[p].status === 'CRITICAL';
        return (
          <ProblemPanel key={p} parameter={p} critical={critical} serverExplanation={open?.explanation ?? ''} fallbackKey={`${p}.${open?.direction ?? cls.direction ?? 'low'}`}>
            {open ? <AlertCard alert={open} pondName={pond.displayName} onPress={() => router.push(routes.alert(open.id))} /> : null}
          </ProblemPanel>
        );
      })}

      <PondNotesPanel pondId={pond.id} />

      <SectionHeader title={t('pondDetail.tools')} />
      <View style={styles.tools}>
        <ToolLink icon="stats-chart-outline" label={t('pondDetail.charts')} onPress={() => router.push(routes.pondCharts(pond.id))} testID="open-charts" />
        <ToolLink icon="trending-up-outline" label={t('pondDetail.forecast')} onPress={() => router.push(routes.pondForecast(pond.id))} testID="open-forecast" />
        <ToolLink icon="hardware-chip-outline" label={t('pondDetail.sensors')} onPress={() => router.push(routes.pondSensors(pond.id))} testID="open-sensors" />
        <ToolLink icon="chatbubbles-outline" label={t('chat.open')} onPress={() => router.push(routes.chat(pond.id))} testID="open-chat" />
      </View>
    </ScreenContainer>
  );
}

/** Species line and the server's statement of which limits apply. The server's sentence is shown in the active language when a translation is available. */
function SpeciesPanel({ pond }: { pond: Pond }) {
  const { t } = useTranslation();
  const serverMessage = pond.speciesSafety?.message ?? '';
  const { texts } = useTranslatedTexts([serverMessage]);
  return (
    <Panel>
      <View style={styles.row}>
        <Text style={styles.label}>{t('species.label')}</Text>
        <Text style={styles.value} testID="pond-species">{speciesName(pond) ?? t('species.notSetShort')}</Text>
      </View>
      <Text style={styles.small} testID="species-safety">
        {(serverMessage && texts[0]) || (pond.speciesLabel ? t('pondDetail.limitsUnknown') : t('pondDetail.noSpecies'))}
      </Text>
      {pond.areaAcres ? <Text style={styles.small}>{t('pondDetail.area', { value: pond.areaAcres })}</Text> : null}
    </Panel>
  );
}

/** One out-of-range parameter: what it means for the farmer. Prefers the server's explanation (translated when available), then the local general note. */
function ProblemPanel({ parameter, critical, serverExplanation, fallbackKey, children }: { parameter: Parameter; critical: boolean; serverExplanation: string; fallbackKey: string; children?: React.ReactNode }) {
  const { t } = useTranslation();
  const { texts } = useTranslatedTexts([serverExplanation]);
  const explanation = (serverExplanation && texts[0]) || WHY_IT_MATTERS[fallbackKey] || t('pondDetail.outsideRange');
  return (
    <Panel testID={`problem-${parameter}`}>
      <Text style={styles.heading}>{critical ? t('pondDetail.problemCritical', { name: PARAMETER_LABEL[parameter] }) : t('pondDetail.problemWarning', { name: PARAMETER_LABEL[parameter] })}</Text>
      <Text style={styles.small}>{explanation}</Text>
      {children}
    </Panel>
  );
}

function ToolLink({ icon, label, onPress, testID }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; testID?: string }) {
  const { t } = useTranslation();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.tool} testID={testID}>
      <Ionicons name={icon} size={20} color={colors.textOnBackground} />
      <Text style={styles.toolText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  heroText: { flex: 1, gap: 8 },
  summary: { fontSize: fontSize.secondary, color: colors.textOnBackgroundSecondary, lineHeight: 18 },
  updated: { fontSize: fontSize.metadata, color: colors.textOnBackgroundMuted },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: fontSize.body, color: colors.textSecondary },
  value: { fontSize: fontSize.body, fontWeight: '700', color: colors.textPrimary },
  small: { fontSize: fontSize.secondary, color: colors.textSecondary, lineHeight: 18 },
  heading: { fontSize: fontSize.cardHeading, fontWeight: '700', color: colors.textPrimary },
  metrics: { gap: spacing.sm },
  unavailRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' },
  tools: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  tool: { flexGrow: 1, flexBasis: '30%', minHeight: 64, borderRadius: radius.card, backgroundColor: colors.surface, borderWidth: layout.borderWidth, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', gap: 4, padding: spacing.xs },
  toolText: { fontSize: fontSize.secondary, fontWeight: '600', color: colors.textOnBackground },
});
