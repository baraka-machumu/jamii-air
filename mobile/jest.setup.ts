// Native modules that have no JavaScript fallback in tests.
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
// FlashList needs layout sizes, which tests do not have: give it a phone-sized viewport. (Its own
// jestSetup.js swaps in a `RecyclerView` export that 2.0.2 does not have, so it is not used.)
jest.mock('@shopify/flash-list/dist/recyclerview/utils/measureLayout', () => ({
  ...jest.requireActual('@shopify/flash-list/dist/recyclerview/utils/measureLayout'),
  measureParentSize: jest.fn(() => ({ x: 0, y: 0, width: 400, height: 900 })),
  measureFirstChildLayout: jest.fn(() => ({ x: 0, y: 0, width: 400, height: 900 })),
  measureItemLayout: jest.fn(() => ({ x: 0, y: 0, width: 400, height: 100 })),
}));
