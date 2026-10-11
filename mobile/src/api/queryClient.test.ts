import { shouldRetry } from './queryClient';

describe('query retries (App Flow §13)', () => {
  it('retries network and server errors twice', () => {
    expect(shouldRetry(0, new TypeError('Network request failed'))).toBe(true);
    expect(shouldRetry(1, { status: 503 })).toBe(true);
    expect(shouldRetry(2, { status: 500 })).toBe(false);
  });

  it('never retries client errors', () => {
    for (const status of [400, 401, 403, 404, 409, 426, 429]) expect(shouldRetry(0, { status })).toBe(false);
  });
});
