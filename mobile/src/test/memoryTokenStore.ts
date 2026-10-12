// An in-memory stand-in for the secure store: jest.mock('@/auth/tokenStore', () => jest.requireActual('@/test/memoryTokenStore')).
let saved: string | null = null;

export const tokenStore = {
  get: async () => saved,
  set: async (value: string) => { saved = value; },
  clear: async () => { saved = null; },
};
