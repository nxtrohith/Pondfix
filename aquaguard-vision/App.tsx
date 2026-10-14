import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { BoundingBoxOverlay } from './src/components/BoundingBoxOverlay';
import {
  BehaviourEventsList,
  type BehaviourEvent,
} from './src/components/BehaviourEventsList';
import { FishStatsPanel } from './src/components/FishStatsPanel';
import { FishTracker, type BehaviourTransition, type FishTrack } from './src/lib/fishTracker';
import { computeStats, EMPTY_STATS, type FishStats } from './src/lib/fishStats';
import { REFERENCE_FRAME_WIDTH } from './src/lib/behaviourConfig';
import { runInference, getInferenceUrl } from './src/lib/inferenceService';
import { createLogger } from './src/lib/inferenceLogger';
import { BEHAVIOUR_COLOUR, colors, fontSize, radius, shadow, spacing } from './src/theme';

const CAPTURE_INTERVAL_MS = 1500;
const CAPTURE_QUALITY = 0.4;
// Detections are rescaled to this reference width before tracking, so pixel thresholds do not depend on camera resolution.
const DEFAULT_REF_SIZE = { w: REFERENCE_FRAME_WIDTH, h: Math.round((REFERENCE_FRAME_WIDTH * 4) / 3) };
const MAX_EVENTS = 20;

const { width: SCREEN_W } = Dimensions.get('window');
const PREVIEW_H = Math.round((SCREEN_W * 4) / 3);

type StatusLabel = 'idle' | 'running' | 'error' | 'no-permission';

export default function App() {
  return (
    <SafeAreaProvider>
      <MainVisionScreen />
    </SafeAreaProvider>
  );
}

function MainVisionScreen() {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const trackerRef = useRef<FishTracker>(new FishTracker());
  const loggerRef = useRef(createLogger());
  const frameIdRef = useRef(0);
  const lastCaptureTimeRef = useRef<number>(0);
  // Bumped on every start/stop so a frame still in flight from an earlier run cannot write into the new one.
  const runIdRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [monitoring, setMonitoring] = useState(false);
  const [status, setStatus] = useState<StatusLabel>('idle');
  const [statusMsg, setStatusMsg] = useState('Ready to monitor');
  // Tracks and the statistics derived from them are set together, in one state update, so they can never disagree on screen.
  const [view, setView] = useState<{ tracks: FishTrack[]; stats: FishStats }>({ tracks: [], stats: EMPTY_STATS });
  const [refSize, setRefSize] = useState(DEFAULT_REF_SIZE);
  const { tracks, stats } = view;
  const [events, setEvents] = useState<BehaviourEvent[]>([]);
  const [fps, setFps] = useState(0);
  const [lastLatencyMs, setLastLatencyMs] = useState(0);
  const [serverReachable, setServerReachable] = useState(true);

  const motionlessTracks = tracks.filter((t) => t.behaviour === 'POSSIBLY_MOTIONLESS');

  const addEvent = useCallback((event: Omit<BehaviourEvent, 'id' | 'timestamp'>) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    const d = new Date();
    const timeStr = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    setEvents((prev) => [
      {
        ...event,
        id: `${Date.now()}_${Math.random()}`,
        timestamp: timeStr,
      },
      ...prev.slice(0, MAX_EVENTS - 1),
    ]);
  }, []);

  const recordTransitions = useCallback((transitions: BehaviourTransition[], expired: string[]) => {
    for (const tr of transitions) {
      if (tr.to === 'POSSIBLY_MOTIONLESS') {
        addEvent({ trackId: tr.trackId, type: 'MOTIONLESS_ALERT', detail: `Possibly motionless: ${tr.inactiveDurationSeconds.toFixed(0)}s under the motionless speed (${tr.speedPxPerSecond.toFixed(1)} px/s). Visual inactivity only; inspect the fish.` });
      } else if (tr.to === 'LOW_ACTIVITY') {
        addEvent({ trackId: tr.trackId, type: 'INACTIVITY_WARNING', detail: `Low activity for ${tr.lowActivityDurationSeconds.toFixed(0)}s (${tr.speedPxPerSecond.toFixed(1)} px/s)` });
      } else {
        addEvent({ trackId: tr.trackId, type: tr.to === 'TRACKING_UNCERTAIN' ? 'TRACK_LOST' : 'STATE_CHANGE', detail: `${tr.from} -> ${tr.to}` });
      }
    }
    for (const id of expired) addEvent({ trackId: id, type: 'TRACK_LOST', detail: 'Track expired (not seen for a while); removed from live counts' });
  }, [addEvent]);

  const captureAndProcessFrame = useCallback(async (runId: number) => {
    if (!cameraRef.current) return;

    frameIdRef.current += 1;
    const currentFrameId = frameIdRef.current;

    let base64: string | null = null;
    let captureTs = Date.now();
    try {
      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: CAPTURE_QUALITY,
        skipProcessing: true,
      });
      captureTs = Date.now(); // the observation time: when the frame was taken, not when inference finished
      base64 = photo?.base64 ?? null;
    } catch (err: unknown) {
      console.warn('[CAMERA] Snapshot error:', err);
    }

    if (!base64) {
      console.warn(`[AQUAGUARD_ERROR] frame=${currentFrameId} camera capture returned no image`);
      return;
    }

    const result = await runInference(base64, REFERENCE_FRAME_WIDTH, DEFAULT_REF_SIZE.h);
    if (runId !== runIdRef.current) return; // stopped or restarted while this frame was in flight

    setServerReachable(result.serverReachable);
    setLastLatencyMs(result.inferenceMs);

    const dt = lastCaptureTimeRef.current ? captureTs - lastCaptureTimeRef.current : 0;
    lastCaptureTimeRef.current = captureTs;
    if (dt > 0) setFps(Math.round((1000 / dt) * 10) / 10);

    // Rescale detections from the server's real image size into the reference space the tracker's pixel thresholds assume.
    const fw = result.frameSize?.width;
    const fh = result.frameSize?.height;
    const scale = fw ? REFERENCE_FRAME_WIDTH / fw : 1;
    const ref = fw && fh ? { w: REFERENCE_FRAME_WIDTH, h: Math.round(fh * scale) } : null;
    if (ref) setRefSize((p) => (p.w === ref.w && p.h === ref.h ? p : ref));
    const detections = result.detections.map((d) => ({
      bbox: { x1: d.bbox.x1 * scale, y1: d.bbox.y1 * scale, x2: d.bbox.x2 * scale, y2: d.bbox.y2 * scale },
      confidence: d.confidence,
      label: d.label,
    }));

    // On an inference failure the fish are not "gone", but we have no observation either: report none so tracks go uncertain.
    const update = trackerRef.current.update(result.serverReachable ? detections : [], captureTs);
    const nextStats = computeStats(update.tracks, update.detectionCount);
    setView({ tracks: update.tracks, stats: nextStats });
    recordTransitions(update.transitions, update.expired);

    loggerRef.current({
      timestamp: captureTs,
      frameId: currentFrameId,
      stats: nextStats,
      tracks: update.tracks,
      transitions: update.transitions,
      inferenceMs: result.inferenceMs,
      frameProcessingMs: Date.now() - captureTs,
      error: result.error,
    });
  }, [recordTransitions]);

  // Frame capture loop
  useEffect(() => {
    if (!monitoring) return;

    let active = true;
    const runId = runIdRef.current;

    async function tick() {
      if (!active) return;
      const t0 = Date.now();
      await captureAndProcessFrame(runId);
      const elapsed = Date.now() - t0;
      const delay = Math.max(0, CAPTURE_INTERVAL_MS - elapsed);
      if (active) {
        timerRef.current = setTimeout(tick, delay);
      }
    }

    tick();

    return () => {
      active = false;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [monitoring, captureAndProcessFrame]);

  function handleStart() {
    runIdRef.current += 1;
    trackerRef.current.reset();
    loggerRef.current = createLogger();
    setView({ tracks: [], stats: EMPTY_STATS });
    setEvents([]);
    frameIdRef.current = 0;
    lastCaptureTimeRef.current = 0;
    setMonitoring(true);
    setStatus('running');
    setStatusMsg('Active monitoring running');
  }

  function handleStop() {
    runIdRef.current += 1;
    setMonitoring(false);
    setStatus('idle');
    setStatusMsg('Monitoring stopped');
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primaryDark} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.permissionContainer}>
        <StatusBar barStyle="dark-content" />
        <Text accessibilityRole="header" style={styles.permTitle}>Camera permission required</Text>
        <Text style={styles.permDesc}>
          PondFix Vision needs camera access to detect fish in real time and evaluate activity levels.
        </Text>
        <Pressable style={styles.btnPrimary} onPress={requestPermission} accessibilityRole="button" accessibilityLabel="Grant camera access">
          <Text style={styles.btnPrimaryText}>Grant camera access</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text accessibilityRole="header" style={styles.appTitle}>PondFix Vision</Text>
          <Text style={styles.appSubtitle}>Fish tracking and inactivity proof of concept</Text>
        </View>
        <View style={styles.badgeWrap}>
          <View
            style={[
              styles.statusIndicator,
              {
                backgroundColor:
                  status === 'running'
                    ? colors.success
                    : status === 'error'
                    ? colors.critical
                    : colors.neutral,
              },
            ]}
          />
          <Text style={styles.statusBadgeText}>
            {status === 'running' ? 'Live' : 'Standby'}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Camera Container */}
        <View style={styles.cameraContainer}>
          <CameraView
            ref={cameraRef}
            style={styles.camera}
            facing="back"
            animateShutter={false}
          />

          {/* Bounding Box Overlay */}
          <BoundingBoxOverlay
            tracks={tracks}
            previewWidth={SCREEN_W - 32}
            previewHeight={PREVIEW_H}
            frameWidth={refSize.w}
            frameHeight={refSize.h}
          />

          {!monitoring && (
            <View style={styles.cameraOverlayStandby}>
              <Text style={styles.standbyText}>Camera Live — Tap Start to Track</Text>
            </View>
          )}
        </View>

        {/* Server Warning if unreachable */}
        {!serverReachable && monitoring && (
          <View style={[styles.banner, styles.bannerWarning]}>
            <Ionicons name="cloud-offline-outline" size={20} color={colors.warningDark} />
            <View style={styles.bannerBody}>
              <Text style={[styles.bannerTitle, { color: colors.warningDark }]}>Inference server offline</Text>
              <Text style={styles.bannerText}>
                Cannot connect to {getInferenceUrl()}. Ensure inference_server.py is running on your PC.
              </Text>
            </View>
          </View>
        )}

        {/* Motionless Alert Banner */}
        {motionlessTracks.length > 0 && (
          <View style={[styles.banner, styles.bannerCritical]}>
            <Ionicons name="alert-circle" size={20} color={colors.criticalDark} />
            <View style={styles.bannerBody}>
              <Text style={[styles.bannerTitle, { color: colors.criticalDark }]}>
                {motionlessTracks.length} fish possibly motionless (visual inactivity only)
              </Text>
              <Text style={styles.bannerText}>
                {motionlessTracks.map((t) => `${t.trackId} (${t.inactiveDurationSeconds.toFixed(0)}s)`).join(', ')}
              </Text>
            </View>
          </View>
        )}

        {/* Action Controls */}
        <View style={styles.controlsRow}>
          {!monitoring ? (
            <Pressable style={styles.btnStart} onPress={handleStart} accessibilityRole="button" accessibilityLabel="Start monitoring">
              <Ionicons name="play" size={18} color={colors.primaryDark} />
              <Text style={styles.btnStartText}>Start monitoring</Text>
            </Pressable>
          ) : (
            <Pressable style={styles.btnStop} onPress={handleStop} accessibilityRole="button" accessibilityLabel="Stop monitoring">
              <Ionicons name="stop" size={18} color={colors.textOnDark} />
              <Text style={styles.btnText}>Stop monitoring</Text>
            </Pressable>
          )}
        </View>

        {/* Live statistics, derived from the current tracks on every processed frame */}
        <FishStatsPanel stats={stats} tracks={tracks} />

        {/* Performance Metrics */}
        <View style={styles.infoRow}>
          <Text style={styles.infoText}>
            Framerate: {fps > 0 ? `${fps.toFixed(1)} FPS` : '—'} · Inference: {lastLatencyMs.toFixed(0)} ms
          </Text>
          <Text style={styles.infoText}>Inference URL: {getInferenceUrl()}</Text>
        </View>

        {/* Legend */}
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: BEHAVIOUR_COLOUR.ACTIVE }]} />
            <Text style={styles.legendText}>Normal</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: BEHAVIOUR_COLOUR.LOW_ACTIVITY }]} />
            <Text style={styles.legendText}>Low activity</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: BEHAVIOUR_COLOUR.POSSIBLY_MOTIONLESS }]} />
            <Text style={styles.legendText}>Possibly motionless</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: BEHAVIOUR_COLOUR.TRACKING_UNCERTAIN }]} />
            <Text style={styles.legendText}>Uncertain</Text>
          </View>
        </View>

        {/* Activity Events */}
        <Text accessibilityRole="header" style={styles.sectionHeader}>Activity alerts and events</Text>
        <BehaviourEventsList events={events} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  appTitle: { color: colors.textOnBackground, fontSize: fontSize.heading, lineHeight: 34, fontWeight: '800', letterSpacing: -0.6 },
  appSubtitle: { color: colors.textOnBackgroundSecondary, fontSize: fontSize.secondary, marginTop: spacing.xxs },
  badgeWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderWidth: 0.5, borderColor: colors.border, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.pill, gap: spacing.xs },
  statusIndicator: { width: 8, height: 8, borderRadius: 4 },
  statusBadgeText: { color: colors.textPrimary, fontSize: fontSize.caption, fontWeight: '700' },
  scroll: { padding: spacing.md, paddingBottom: spacing.xl + spacing.md },
  cameraContainer: { width: SCREEN_W - 32, height: PREVIEW_H, borderRadius: radius.cardLarge, overflow: 'hidden', backgroundColor: colors.video, position: 'relative', marginBottom: spacing.md },
  camera: { flex: 1 },
  cameraOverlayStandby: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.videoScrim, justifyContent: 'center', alignItems: 'center' },
  standbyText: { color: colors.textOnDark, fontSize: fontSize.secondary, fontWeight: '600' },
  controlsRow: { marginBottom: spacing.md },
  btnStart: { backgroundColor: colors.surface, borderRadius: radius.pill, minHeight: 52, flexDirection: 'row', gap: spacing.xs, alignItems: 'center', justifyContent: 'center', ...shadow.button },
  btnStartText: { color: colors.primaryDark, fontWeight: '700', fontSize: 16 },
  btnStop: { backgroundColor: colors.critical, borderRadius: radius.pill, minHeight: 52, flexDirection: 'row', gap: spacing.xs, alignItems: 'center', justifyContent: 'center', ...shadow.button },
  btnPrimary: { backgroundColor: colors.surface, borderRadius: radius.pill, minHeight: 52, paddingHorizontal: spacing.lg, alignItems: 'center', justifyContent: 'center', ...shadow.button },
  btnPrimaryText: { color: colors.primaryDark, fontWeight: '700', fontSize: 16 },
  btnText: { color: colors.textOnDark, fontWeight: '700', fontSize: 16 },
  infoRow: { backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 0.5, borderColor: colors.border, padding: spacing.sm, marginBottom: spacing.md, gap: spacing.xxs },
  infoText: { color: colors.textSecondary, fontSize: fontSize.caption },
  banner: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, borderRadius: radius.card, padding: spacing.sm, marginBottom: spacing.md },
  bannerWarning: { backgroundColor: colors.warningSurface },
  bannerCritical: { backgroundColor: colors.criticalSurface },
  bannerBody: { flex: 1, gap: spacing.xxs },
  bannerTitle: { fontWeight: '700', fontSize: fontSize.secondary },
  bannerText: { color: colors.textPrimary, fontSize: fontSize.caption, lineHeight: 17 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs + 2 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { color: colors.textOnBackgroundSecondary, fontSize: fontSize.caption, fontWeight: '600' },
  sectionHeader: { color: colors.textOnBackground, fontSize: fontSize.section, fontWeight: '800', letterSpacing: -0.3, marginBottom: spacing.xs },
  permissionContainer: { flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', padding: spacing.lg },
  permTitle: { color: colors.textOnBackground, fontSize: fontSize.heading, fontWeight: '800', letterSpacing: -0.6, marginBottom: spacing.xs, textAlign: 'center' },
  permDesc: { color: colors.textOnBackgroundSecondary, fontSize: fontSize.body, textAlign: 'center', marginBottom: spacing.lg, lineHeight: 22 },
});
