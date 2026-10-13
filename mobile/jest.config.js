// Jest (jest-expo preset). `expo-modules-core` is resolved from `expo` itself: jest-expo requires
// it without declaring it, and npm may install it nested under `expo` instead of at the top
// (it did for 57.0.22, which has an extra peer dependency), so a plain lookup would fail.
const path = require('node:path');

const expoModulesCore = path.dirname(
  require.resolve('expo-modules-core/package.json', { paths: [path.dirname(require.resolve('expo/package.json'))] }),
);

/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^expo-modules-core$': expoModulesCore,
    '^expo-modules-core/(.*)$': `${expoModulesCore}/$1`,
  },
  setupFiles: ['<rootDir>/jest.setup.ts'],
  testTimeout: 15_000,
};
