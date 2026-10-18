// A post as a moderator sees it (App Flow §15.5), for the media the R1 scope change added: a
// carousel of up to ten photos (BR-CT-09) and a video (BR-CT-07). What matters is that reported
// media is still not on screen until the moderator asks for it, and that a video is something
// they can actually watch rather than a blank frame.
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/App';
import { useSession } from '@/stores/session';
import { renderAt } from '@/test/render';

const admin = { id: 'a1', email: 'moda@jamiiair.test', displayName: 'Moda', role: 'MODERATOR' as const };

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const photo = (n: number) => ({
  id: `m${n}`, kind: 'IMAGE', status: 'READY', blurhash: null,
  feedUrl: `http://media.test/${n}.webp`, thumbUrl: `http://media.test/${n}-t.webp`,
  posterUrl: null, videoUrl: null, durationMs: null, width: 1080, height: 1350,
});

const video = {
  id: 'v1', kind: 'VIDEO', status: 'READY', blurhash: null,
  feedUrl: null, thumbUrl: 'http://media.test/thumb.webp',
  posterUrl: 'http://media.test/poster.webp', videoUrl: 'http://media.test/video_720.mp4',
  durationMs: 42_000, width: 720, height: 1280,
};

const post = (media: object[]) => ({
  postId: 'p1', status: 'PUBLISHED', caption: 'At the beach', likeCount: 3, commentCount: 1,
  createdAt: '2026-10-10T08:00:00Z', publishedAt: '2026-10-10T08:00:05Z', hiddenAt: null, deletedAt: null,
  authorId: 'u1', authorUsername: 'juma', authorStatus: 'ACTIVE',
  media, reports: [], moderationHistory: [],
});

function api(media: object[]) {
  global.fetch = vi.fn((input: Request | string) => {
    // The API client hands fetch a Request, so read the path from it rather than String(input).
    const request = typeof input === 'string' ? new Request(input) : input;
    const { pathname } = new URL(request.url, 'http://portal.test');
    // Every page load refreshes from the cookie; answer with the session already in the store.
    if (pathname === '/api/v1/admin/auth/refresh') {
      return Promise.resolve(json(200, { accessToken: 'token-1', expiresIn: 900, admin: useSession.getState().admin }));
    }
    if (pathname === '/api/v1/admin/posts/p1') return Promise.resolve(json(200, post(media)));
    return Promise.resolve(json(200, {}));
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  useSession.setState({
    status: 'signedIn', accessToken: 'token-1', admin, startedAt: Date.now(), notice: null,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('a post a moderator is reviewing', () => {
  it('numbers the photos of a carousel, so a report about the third one can be checked', async () => {
    api([photo(1), photo(2), photo(3)]);
    renderAt(<App />, '/posts/p1');

    expect(await screen.findByText('Photo 1 of 3')).toBeTruthy();
    expect(screen.getByText('Photo 3 of 3')).toBeTruthy();
    // Every one of them is still behind the cover.
    expect(screen.getAllByRole('button', { name: /Click to show/ })).toHaveLength(3);
  });

  it('says nothing about a position when the post is one photo', async () => {
    api([photo(1)]);
    renderAt(<App />, '/posts/p1');

    await screen.findByRole('button', { name: /Click to show/ });
    expect(screen.queryByText('Photo 1 of 1')).toBeNull();
  });

  it('gives a player for a video, but only once the moderator asks to see it', async () => {
    api([video]);
    renderAt(<App />, '/posts/p1');

    // Blurred poster first: the queue is other people's worst content, and the video is not even
    // fetched until someone decides to look.
    const cover = await screen.findByRole('button', { name: /Click to show/ });
    expect(screen.getByAltText('The post’s video')).toBeTruthy();
    expect(document.querySelector('video')).toBeNull();
    expect(screen.getByText(/Video · 0:42/)).toBeTruthy();

    await userEvent.click(cover);

    await waitFor(() => {
      const player = document.querySelector('video');
      expect(player).not.toBeNull();
      expect(player!.getAttribute('src')).toBe('http://media.test/video_720.mp4');
      expect(player!.getAttribute('poster')).toBe('http://media.test/poster.webp');
      expect(player!.hasAttribute('controls')).toBe(true);
    });
  });

  it('says so when a post has no media left to look at', async () => {
    api([]);
    renderAt(<App />, '/posts/p1');

    expect(await screen.findByText(/No media/)).toBeTruthy();
  });
});
