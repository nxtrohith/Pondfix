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
