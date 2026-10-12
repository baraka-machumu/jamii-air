import { adjustedFollowerCount } from './follow';
import { MAX_RECENT, useRecentSearches } from './recentSearches';

const account = (n: number) => ({ id: `u${n}`, username: `user${n}`, displayName: null, avatarUrl: null });

describe('recent searches (§8.1)', () => {
  beforeEach(() => useRecentSearches.setState({ accounts: [] }));

  it('keeps the newest first, without duplicates, at most 10', () => {
    for (let n = 1; n <= 12; n++) useRecentSearches.getState().add(account(n));
    useRecentSearches.getState().add(account(5));
    const ids = useRecentSearches.getState().accounts.map((a) => a.id);
    expect(ids).toHaveLength(MAX_RECENT);
    expect(ids.slice(0, 3)).toEqual(['u5', 'u12', 'u11']);
    expect(ids.filter((id) => id === 'u5')).toHaveLength(1);
  });
});

describe('adjustedFollowerCount', () => {
  it('moves the count only while the choice differs from what the server said', () => {
    expect(adjustedFollowerCount(41, false, undefined)).toBe(41);
    expect(adjustedFollowerCount(41, false, true)).toBe(42);
    expect(adjustedFollowerCount(42, true, false)).toBe(41);
    expect(adjustedFollowerCount(42, true, true)).toBe(42);
    expect(adjustedFollowerCount(0, true, false)).toBe(0);
  });
});
