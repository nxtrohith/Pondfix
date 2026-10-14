// Screen 4: pond details. Each parameter has its own status. Missing or stale readings show as unavailable, never as healthy.
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/colors';
import { fontSize, radius, spacing } from '@/constants/theme';
import { useAlerts, usePonds } from '@/context/LiveData';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { PondImage } from '@/components/PondImage';
import { MetricCard } from '@/components/MetricCard';
import { ChemistryCard } from '@/components/ChemistryCard';
import { StatusBadge } from '@/components/StatusBadge';
import { AppButton } from '@/components/AppButton';
import { AlertCard } from '@/components/AlertCard';
import { ConnectionBanner } from '@/components/ConnectionBanner';
import { EmptyState } from '@/components/StateViews';
import { SectionHeader, Panel } from '@/components/SectionHeader';
import { WHY_IT_MATTERS } from '@/data/whyItMatters';
import { summarizePond } from '@/lib/pondSummary';
import { ageMinutes, classifyValue, PARAMETER_LABEL, POND_PRESENTATION } from '@/lib/status';
import { formatDateTime, formatTime } from '@/lib/format';
import { CHEMISTRY_PARAMETERS, PARAMETERS } from '@/types';
import { param, routes } from '@/lib/routes';

export default function PondDetailScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = param(rawId) ?? '';
  const { ponds, readings, chemistry, asOf, staleAfterMinutes, ensureHistory } = usePonds();
  const { activeAlerts: alerts } = useAlerts();
  const pond = ponds.find((p) => p.id === id);
  const hasPond = !!pond;
  useEffect(() => { if (hasPond) ensureHistory(id); }, [hasPond, id, ensureHistory]);

  if (!pond) {
    return (
      <ScreenContainer bottomNav="ponds" testID="pond-missing">
        <AppHeader title="Pond not found" />
        <EmptyState title="This pond does not exist">It may have been removed. Go back to the pond list.</EmptyState>
        <AppButton label="All ponds" variant="outline" onPress={() => router.replace(routes.ponds)} />
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
        subtitle={pond.speciesLabel ?? 'Species not set'}
        right={<AppButton label="Edit" variant="outline" icon="create-outline" onPress={() => router.push(routes.pondEdit(pond.id))} testID="edit-pond" />}
      />
      <ConnectionBanner />

      <View style={styles.hero}>
        <PondImage width={120} height={88} radius={14} label={`Photo placeholder for ${pond.displayName}`} />
        <View style={styles.heroText}>
          <StatusBadge kind="pond" status={summary.status} />
          <Text style={styles.summary}>{presentation.summary}</Text>
          <Text style={styles.updated} testID="last-updated">Last updated {lastUpdated ? formatDateTime(lastUpdated) : 'never (no readings)'}</Text>
        </View>
      </View>

      <Panel>
        <View style={styles.row}>
          <Text style={styles.label}>Species</Text>
          <Text style={styles.value} testID="pond-species">{pond.speciesLabel ?? 'Not set'}</Text>
        </View>
        <Text style={styles.small} testID="species-safety">
          {pond.speciesSafety?.message || (pond.speciesLabel ? 'The server has not reported which alert limits apply to this species.' : 'No species is set. The general safety rules apply until one is chosen.')}
        </Text>
        {pond.areaAcres ? <Text style={styles.small}>Area {pond.areaAcres} acres</Text> : null}
      </Panel>

      <SectionHeader title="Current water quality" hint="Each reading has its own status." />
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
            />
          );
        })}
      </View>

      {(chemistry[pond.id] ?? []).some((c) => c.latest) ? (
        <>
          <SectionHeader title="Water chemistry" hint="Ammonia, nitrate and turbidity. No alert limits are set for these, so they do not change the pond status." />
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
              ? `${PARAMETER_LABEL[p]} reading is not recent. It is not counted as healthy.`
              : `${PARAMETER_LABEL[p]} is unavailable${r.lastSeenAt ? `, last seen ${formatTime(r.lastSeenAt)}` : ''}. It is not counted as healthy.`;
            return (
              <View key={p} style={styles.unavailRow}>
                <Ionicons name="help-circle" size={18} color={colors.textSecondary} />
                <Text style={[styles.small, { flex: 1 }]}>{text}</Text>
                <AppButton label="Troubleshoot" variant="onCard" onPress={() => router.push(routes.unavailable(pond.id, p))} testID={`troubleshoot-${p}`} />
              </View>
            );
          })}
        </Panel>
      ) : null}

      <SectionHeader title="What needs attention?" />
      {problems.length === 0 && unavailable.length === 0 ? (
        <Panel><Text style={styles.small}>Every reading is within the acceptable range and current. This is a water-quality status, not a check of fish or shrimp health.</Text></Panel>
      ) : null}
      {problems.map((p) => {
        const reading = summary.parameters[p].reading.latest!;
        const cls = classifyValue(p, reading.value);
        const open = summary.openAlerts.find((a) => a.parameter === p);
        const explanation = open?.explanation || WHY_IT_MATTERS[`${p}.${open?.direction ?? cls.direction ?? 'low'}`] || 'This reading is outside the acceptable range.';
        const critical = summary.parameters[p].status === 'CRITICAL';
        return (
          <Panel key={p} testID={`problem-${p}`}>
            <Text style={styles.heading}>{PARAMETER_LABEL[p]} is {critical ? 'at a critical level' : 'outside the acceptable range'}</Text>
            <Text style={styles.small}>{explanation}</Text>
            {open ? <AlertCard alert={open} pondName={pond.displayName} onPress={() => router.push(routes.alert(open.id))} /> : null}
          </Panel>
        );
      })}

      <SectionHeader title="Tools" />
      <View style={styles.tools}>
        <ToolLink icon="stats-chart-outline" label="Charts" onPress={() => router.push(routes.pondCharts(pond.id))} testID="open-charts" />
        <ToolLink icon="trending-up-outline" label="Forecast" onPress={() => router.push(routes.pondForecast(pond.id))} testID="open-forecast" />
        <ToolLink icon="hardware-chip-outline" label="Sensors" onPress={() => router.push(routes.pondSensors(pond.id))} testID="open-sensors" />
      </View>
    </ScreenContainer>
  );
}

function ToolLink({ icon, label, onPress, testID }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; testID?: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.tool} testID={testID}>
      <Ionicons name={icon} size={20} color={colors.textOnDark} />
      <Text style={styles.toolText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  heroText: { flex: 1, gap: 6 },
  summary: { fontSize: fontSize.secondary, color: colors.textOnDarkSecondary, lineHeight: 18 },
  updated: { fontSize: fontSize.metadata, color: colors.textOnDarkMuted },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: fontSize.body, color: colors.textSecondary },
  value: { fontSize: fontSize.body, fontWeight: '700', color: colors.textPrimary },
  small: { fontSize: fontSize.secondary, color: colors.textSecondary, lineHeight: 18 },
  heading: { fontSize: fontSize.cardHeading, fontWeight: '700', color: colors.textPrimary },
  metrics: { gap: spacing.sm },
  unavailRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' },
  tools: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  tool: { flexGrow: 1, flexBasis: '30%', minHeight: 64, borderRadius: radius.card, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', gap: 4, padding: spacing.xs },
  toolText: { fontSize: fontSize.secondary, fontWeight: '600', color: colors.textOnDark },
});
