// Plain Node runner for the opt-in live-backend test. The jest-expo preset replaces fetch with a native-only polyfill that does not
// run under Node, and this test needs a real network stack.
module.exports = {
  rootDir: '../..',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/e2e/**/*.e2e.test.ts'],
  transform: { '^.+\\.[jt]sx?$': ['babel-jest', { configFile: false, babelrc: false, presets: ['@babel/preset-typescript'], plugins: ['@babel/plugin-transform-modules-commonjs'] }] },
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
};
