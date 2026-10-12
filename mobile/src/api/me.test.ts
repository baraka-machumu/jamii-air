import { changesOf, type Me, profileFormOf } from './me';

const me: Me = {
  id: 'u1', username: 'amina', email: 'a@b.co', displayName: 'Amina', bio: null, avatarMediaId: null,
  avatarUrl: null, avatarLargeUrl: null, locale: 'en', postCount: 0, followerCount: 0, followingCount: 0,
};

describe('Edit profile changes (PATCH /me sends only what changed)', () => {
  it('sends nothing when nothing changed', () => {
    expect(changesOf(me, profileFormOf(me))).toEqual({});
  });

  it('sends changed fields, trimmed', () => {
    expect(changesOf(me, { displayName: ' Amina J ', username: 'amina_j', bio: ' Mama Lishe ' }))
      .toEqual({ displayName: 'Amina J', username: 'amina_j', bio: 'Mama Lishe' });
  });

  it('removes an emptied name with null', () => {
    expect(changesOf(me, { ...profileFormOf(me), displayName: '  ' })).toEqual({ displayName: null });
  });
});
