// "Listen" control for a farmer-facing message. Speech is never automatic: nothing plays until the farmer taps, and a tap while playing stops it.
// States: idle, loading, playing, and a quiet error line. Whatever happens here, the text on screen is untouched, so a failed or
// unsupported voice never hides an alert.
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { colors } from '@/constants/colors';
import { fontSize, spacing } from '@/constants/theme';
import { languageInfo } from '@/i18n/languages';
import { SpeechError, speechUri, type SpeechFailure } from '@/services/speech';
import { AppButton } from './AppButton';
import { Text } from './Text';

type State = { kind: 'idle' } | { kind: 'loading' } | { kind: 'playing' } | { kind: 'error'; reason: SpeechFailure };

export function VoiceButton({ text, testID }: { text: string; testID?: string }) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const info = languageInfo(language);
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const [state, setState] = useState<State>({ kind: 'idle' });
  const request = useRef(0); // a newer tap, a language change or an unmount invalidates an in-flight request

  // Let the message play even with the phone's silent switch on: this is a safety message the farmer asked to hear.
  useEffect(() => { void setAudioModeAsync({ playsInSilentMode: true }).catch(() => undefined); }, []);
  // A different language or message makes the old audio meaningless.
  useEffect(() => () => { request.current += 1; }, [language, text]);
  useEffect(() => { setState({ kind: 'idle' }); try { player.pause(); } catch { /* nothing playing */ } }, [language, text]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (status.didJustFinish) setState({ kind: 'idle' }); }, [status.didJustFinish]);

  const stop = useCallback(() => { request.current += 1; try { player.pause(); void player.seekTo(0); } catch { /* ignore */ } setState({ kind: 'idle' }); }, [player]);

  const start = useCallback(async () => {
    const mine = ++request.current;
    setState({ kind: 'loading' });
    try {
      const uri = await speechUri(text, language);
      if (mine !== request.current) return; // superseded while loading
      player.replace({ uri });
      player.play();
      setState({ kind: 'playing' });
    } catch (e) {
      if (mine !== request.current) return;
      setState({ kind: 'error', reason: e instanceof SpeechError ? e.reason : 'unavailable' });
    }
  }, [language, player, text]);

  if (!info.voice) {
    return <Text style={styles.note} testID={testID ? `${testID}-unsupported` : undefined}>{t('voice.unsupported', { language: info.nativeName })}</Text>;
  }
  const busy = state.kind === 'loading';
  const playing = state.kind === 'playing';
  return (
    <View style={styles.wrap} testID={testID}>
      <AppButton
        label={busy ? t('voice.loading') : playing ? t('voice.stop') : t('voice.listen')}
        icon={playing ? 'stop-circle-outline' : 'volume-high-outline'}
        variant="onCard"
        loading={busy}
        onPress={() => (playing ? stop() : void start())}
        accessibilityHint={t('voice.hint')}
        testID={testID ? `${testID}-button` : undefined}
      />
      {state.kind === 'error' ? <Text style={styles.error} accessibilityLiveRegion="polite" testID={testID ? `${testID}-error` : undefined}>{t(`voice.error.${state.reason}`)}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xxs, alignItems: 'flex-start', marginTop: spacing.xs },
  note: { fontSize: fontSize.metadata, color: colors.textSecondary, marginTop: spacing.xs },
  error: { fontSize: fontSize.metadata, color: colors.textSecondary },
});
