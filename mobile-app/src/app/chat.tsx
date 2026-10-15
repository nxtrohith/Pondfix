// Chat with the PondFix assistant about one pond.
import { useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@/components/Text';
import { AppHeader } from '@/components/AppHeader';
import { AppButton } from '@/components/AppButton';
import { colors } from '@/constants/colors';
import { fontSize, layout, radius, spacing } from '@/constants/theme';
import { usePonds } from '@/context/LiveData';
import { askPond } from '@/services/chat';
import { param } from '@/lib/routes';

interface Message { id: string; role: 'user' | 'assistant'; text: string; failed?: boolean }

export default function ChatScreen() {
  const { t } = useTranslation();
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = param(rawId) ?? '';
  const { ponds } = usePonds();
  const pond = ponds.find((p) => p.id === id);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const conversation = useRef<string | undefined>(undefined);
  const list = useRef<FlatList<Message>>(null);
  const trimmed = text.trim();

  async function send() {
    if (!trimmed || busy || !id) return;
    const mine: Message = { id: `u${Date.now()}`, role: 'user', text: trimmed };
    setMessages((m) => [...m, mine]); setText(''); setBusy(true);
    try {
      const r = await askPond(id, trimmed, conversation.current);
      conversation.current = r.conversationId;
      setMessages((m) => [...m, { id: `a${Date.now()}`, role: 'assistant', text: r.answer }]);
    } catch {
      setMessages((m) => [...m, { id: `e${Date.now()}`, role: 'assistant', text: t('chat.failed'), failed: true }]);
    } finally { setBusy(false); }
  }

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right', 'bottom']} testID="chat-screen">
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}><AppHeader title={t('chat.title')} subtitle={pond ? t('chat.subtitle', { pond: pond.displayName }) : undefined} /></View>
        <FlatList
          ref={list}
          style={styles.flex}
          contentContainerStyle={styles.messages}
          data={messages}
          keyExtractor={(m) => m.id}
          onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={<Text style={styles.empty}>{t('chat.empty')}</Text>}
          renderItem={({ item }) => (
            <View style={[styles.bubble, item.role === 'user' ? styles.mine : styles.theirs]}>
              <Text style={[styles.body, item.failed && styles.failed]}>{item.text}</Text>
            </View>
          )}
        />
        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder={t('chat.placeholder')}
            placeholderTextColor={colors.textMuted}
            accessibilityLabel={t('chat.placeholder')}
            multiline
            maxLength={1000}
            testID="chat-input"
          />
          <AppButton label={t('chat.send')} icon="send" onPress={() => void send()} disabled={!trimmed || busy} loading={busy} testID="chat-send" />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  header: { paddingHorizontal: layout.screenPaddingX },
  messages: { padding: layout.screenPaddingX, gap: spacing.sm, flexGrow: 1 },
  empty: { fontSize: fontSize.body, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.lg },
  bubble: { maxWidth: '85%', borderRadius: radius.cardLarge, padding: spacing.sm },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.inputBackground },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.inputBackground, opacity: 0.95 },
  body: { fontSize: fontSize.body, color: colors.textPrimary, lineHeight: 21 },
  failed: { color: colors.criticalOnBackground },
  composer: { padding: layout.screenPaddingX, gap: spacing.xs },
  input: { minHeight: 48, maxHeight: 120, borderRadius: radius.control, backgroundColor: colors.inputBackground, color: colors.textPrimary, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, fontSize: fontSize.body },
});
