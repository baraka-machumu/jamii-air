import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient } from '@tanstack/react-query';
import { uploadImage } from '@/media/upload';
import { useSession } from '@/stores/session';
import { json, type StubRequest, stubApi } from '@/test/api';
import { usePublished } from './published';
import { retryPosting, runPosting } from './run';
import { usePosting } from './store';

jest.mock('@/media/upload', () => ({
  uploadImage: jest.fn(async (_image: unknown, _purpose: string, options?: { onProgress?: (p: number) => void }) => {
    options?.onProgress?.(0.5);
    return 'media-1';
  }),
}));

const post = (status: string) => ({ id: 'post-1', status, caption: null, likeCount: 0, commentCount: 0, likedByMe: false, isMine: true, author: {}, media: [], shareUrl: '', createdAt: '' });
const queryClient = new QueryClient();
const NO_WAIT = [0, 0, 0];

let requests: StubRequest[];
const creates = () => requests.filter((r) => r.method === 'POST' && r.path === '/api/v1/posts');

function ready(caption = '  Sokoni leo  ') {
  usePosting.getState().start({ uri: 'file:///source.jpg', width: 2048, height: 1536 });
  usePosting.getState().update({ image: { uri: 'file:///post.jpg', width: 1536, height: 1536 }, caption, phase: 'uploading' });
}

beforeEach(() => {
  jest.mocked(uploadImage).mockClear();
  useSession.setState({ status: 'signedIn', accessToken: 'access-1' });
  usePosting.setState({ draft: null, progress: 0 });
});

describe('runPosting (App Flow §6.1)', () => {
  it('uploads, creates with the Idempotency-Key and a trimmed caption, waits until published, then clears', async () => {
    let polls = 0;
    requests = stubApi((req) => (req.method === 'POST' ? json(201, post('PROCESSING')) : json(200, post(++polls < 2 ? 'PROCESSING' : 'PUBLISHED'))));
    ready();
    const key = usePosting.getState().draft!.key;
    await runPosting(queryClient, NO_WAIT);
    expect(uploadImage).toHaveBeenCalledWith({ uri: 'file:///post.jpg', width: 1536, height: 1536 }, 'POST', expect.anything());
    expect(creates()[0]!.body).toEqual({ mediaIds: ['media-1'], caption: 'Sokoni leo' });
    expect(creates()[0]!.headers['idempotency-key']).toBe(key);
    expect(polls).toBe(2);
    expect(usePosting.getState().draft).toBeNull();
    // Posting finishes in the background, so Home is told which post went up and sends the feed
    // back to the top - otherwise the new photo sits off-screen above wherever you were reading.
    expect(usePublished.getState().postId).toBe('post-1');
  });

  it('keeps the upload when creating fails, and Retry creates with the same key', async () => {
    let fail = true;
    requests = stubApi((req) => {
      if (req.method === 'POST' && fail) throw new TypeError('Network request failed');
      return json(req.method === 'POST' ? 201 : 200, post('PUBLISHED'));
    });
    ready('');
    await runPosting(queryClient, NO_WAIT);
    expect(usePosting.getState().draft).toMatchObject({ phase: 'failed', failure: 'NETWORK_ERROR', mediaId: 'media-1' });

    fail = false;
    await retryPosting(queryClient, NO_WAIT);
    expect(uploadImage).toHaveBeenCalledTimes(1);
    expect(creates()).toHaveLength(2);
    expect(creates()[1]!.headers['idempotency-key']).toBe(creates()[0]!.headers['idempotency-key']);
    expect(creates()[1]!.body).toEqual({ mediaIds: ['media-1'], caption: null });
    expect(usePosting.getState().draft).toBeNull();
  });

  it('starts over with a new upload and key when the server could not process the photo', async () => {
    requests = stubApi((req) => json(req.method === 'POST' ? 201 : 200, post(req.method === 'POST' ? 'PROCESSING' : 'FAILED')));
    ready();
    const firstKey = usePosting.getState().draft!.key;
    await runPosting(queryClient, NO_WAIT);
    expect(usePosting.getState().draft).toMatchObject({ phase: 'failed', failure: 'PROCESSING_FAILED' });

    await retryPosting(queryClient, NO_WAIT);
    expect(uploadImage).toHaveBeenCalledTimes(2);
    expect(usePosting.getState().draft!.key).not.toBe(firstKey);
  });
});

describe('the saved draft', () => {
  it('turns a post that was uploading when the app stopped into "interrupted", ready to retry', async () => {
    const draft = { key: 'post-abc12345', source: { uri: 'file:///s.jpg', width: 1, height: 1 }, aspect: 'square', caption: 'x', phase: 'uploading', image: { uri: 'file:///p.jpg', width: 1, height: 1 } };
    await AsyncStorage.setItem('jamii.postDraft', JSON.stringify({ state: { draft }, version: 1 }));
    await usePosting.persist.rehydrate();
    expect(usePosting.getState().draft).toMatchObject({ phase: 'failed', failure: 'INTERRUPTED', caption: 'x' });
  });
});
