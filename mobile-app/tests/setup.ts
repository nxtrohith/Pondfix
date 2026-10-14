/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories must use require() */
// Shared Jest setup.
// - Safe-area insets are mocked so screens render with predictable insets.
// - Icons are replaced by a lightweight stand-in. Real icon fonts load asynchronously, which causes unrelated act() warnings.
//   The stand-in keeps the icon name in testID so tests can still see which icon a component uses.
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const Icon = ({ name, testID }: { name: string; testID?: string }) => React.createElement(Text, { testID: testID ?? `icon-${name}` }, '');
  return { Ionicons: Icon, MaterialIcons: Icon, MaterialCommunityIcons: Icon, Feather: Icon };
});

// Reduce-motion is read asynchronously by the app. Tests use a fixed value so state does not change after a test finishes.
jest.spyOn(require('react-native').AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
jest.spyOn(require('react-native').AccessibilityInfo, 'addEventListener').mockReturnValue({ remove: () => {} } as never);

// Storage and audio are native modules. Storage gets the library's own in-memory mock; audio and the file system get minimal stand-ins, so
// no test depends on a device. The language, translation and speech tests inject what they need on top of these.
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

jest.mock('expo-audio', () => ({
  useAudioPlayer: () => ({ play: jest.fn(), pause: jest.fn(), seekTo: jest.fn().mockResolvedValue(undefined), replace: jest.fn(), remove: jest.fn() }),
  useAudioPlayerStatus: () => ({ playing: false, didJustFinish: false }),
  setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-file-system', () => {
  const files = new Set<string>(); // which "files" exist, so cache checks behave like a real file system
  class File {
    uri: string;
    constructor(...parts: unknown[]) { this.uri = parts.map(String).join('/'); }
    get exists() { return files.has(this.uri); }
    create() { files.add(this.uri); }
    write() {}
  }
  return { File, Paths: { cache: 'file:///cache' } };
});
