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

// expo-file-system's File (native): a photo file of 2048 bytes; upload() goes through the global
// fetch, so tests that stub fetch also see the storage PUT (and can fail it).
jest.mock('expo-file-system', () => ({
  UploadType: { BINARY_CONTENT: 0, MULTIPART: 1 },
  File: class {
    mockUri: string;
    constructor(path: string) { this.mockUri = path; }
    get size() { return 2048; }
    async upload(url: string, options: { httpMethod?: string; headers?: Record<string, string>; onProgress?: (p: { bytesSent: number; totalBytes: number }) => void }) {
      options.onProgress?.({ bytesSent: 1024, totalBytes: 2048 });
      const response = await fetch(url, { method: options.httpMethod ?? 'POST', headers: options.headers });
      options.onProgress?.({ bytesSent: 2048, totalBytes: 2048 });
      return { status: response.status, body: '', headers: {} };
    }
  },
}));
