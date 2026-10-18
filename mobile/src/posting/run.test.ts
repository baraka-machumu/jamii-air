import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '@/api/errors';
import { uploadImage, uploadVideo } from '@/media/upload';
import { useSession } from '@/stores/session';
import { json, type StubRequest, stubApi } from '@/test/api';
import { usePublished } from './published';
import { pollDelaysFor, retryPosting, runPosting } from './run';
import { usePosting } from './store';

// Named `mock…` so jest's hoisted factory below is allowed to close over it.
let mockMediaId = 0;

jest.mock('@/media/upload', () => ({
  uploadImage: jest.fn(async (_image: unknown, _purpose: string, options?: { onProgress?: (p: number) => void }) => {
    options?.onProgress?.(0.5);
    return `media-${++mockMediaId}`;
  }),
  uploadVideo: jest.fn(async (_video: unknown, options?: { onProgress?: (p: number) => void }) => {
    options?.onProgress?.(0.5);
    return 'video-1';
  }),
}));

const post = (status: string) => ({ id: 'post-1', status, caption: null, likeCount: 0, commentCount: 0, likedByMe: false, isMine: true, author: {}, media: [], shareUrl: '', createdAt: '' });
const queryClient = new QueryClient();
const NO_WAIT = [0, 0, 0];

let requests: StubRequest[];
const creates = () => requests.filter((r) => r.method === 'POST' && r.path === '/api/v1/posts');

/** A draft of `photos` cropped photos, ready to upload. */
function ready(caption = '  Sokoni leo  ', photos = 1) {
  usePosting.getState().startPhotos(
    Array.from({ length: photos }, (_, i) => ({ uri: `file:///source-${i}.jpg`, width: 2048, height: 1536 })),
  );
  for (let i = 0; i < photos; i++) {
    usePosting.getState().updatePhoto(i, { image: { uri: `file:///post-${i}.jpg`, width: 1536, height: 1536 } });
  }
  usePosting.getState().update({ caption, phase: 'uploading' });
}

beforeEach(() => {
  mockMediaId = 0;
  jest.mocked(uploadImage).mockClear();
  jest.mocked(uploadVideo).mockClear();
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
    expect(uploadImage).toHaveBeenCalledWith({ uri: 'file:///post-0.jpg', width: 1536, height: 1536 }, 'POST', expect.anything());
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
    expect(usePosting.getState().draft).toMatchObject({ phase: 'failed', failure: 'NETWORK_ERROR' });
    // The photo stays uploaded, so Retry does not spend the bundle again.
    expect(usePosting.getState().draft!.photos[0]!.mediaId).toBe('media-1');

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

describe('runPosting with several photos and with video', () => {
  it('uploads a carousel in order, as one progress bar, and posts the ids in that order', async () => {
    requests = stubApi((req) => json(req.method === 'POST' ? 201 : 200, post('PUBLISHED')));
    ready('Three', 3);
    await runPosting(queryClient, NO_WAIT);

    expect(uploadImage).toHaveBeenCalledTimes(3);
    // The order the photos were picked in is the order they are posted in (BR-CT-09).
    expect(jest.mocked(uploadImage).mock.calls.map((call) => (call[0] as { uri: string }).uri))
      .toEqual(['file:///post-0.jpg', 'file:///post-1.jpg', 'file:///post-2.jpg']);
    expect(creates()[0]!.body).toEqual({ mediaIds: ['media-1', 'media-2', 'media-3'], caption: 'Three' });
    expect(usePosting.getState().draft).toBeNull();
  });

  it('does not upload the photos of a carousel twice when one of them fails', async () => {
    // The first photo goes up, the second loses the connection (which is the error uploadImage
    // raises), and on Retry the second succeeds.
    jest.mocked(uploadImage)
      .mockImplementationOnce(async () => 'media-1')
      .mockImplementationOnce(async () => { throw new ApiError(0, 'NETWORK_ERROR', 'The upload did not get through'); })
      .mockImplementationOnce(async () => 'media-2');
    requests = stubApi((req) => json(req.method === 'POST' ? 201 : 200, post('PUBLISHED')));
    ready('Two', 2);
    await runPosting(queryClient, NO_WAIT);
    expect(usePosting.getState().draft).toMatchObject({ phase: 'failed', failure: 'NETWORK_ERROR' });
    expect(creates()).toHaveLength(0);

    await retryPosting(queryClient, NO_WAIT);
    // Three uploads in total: the first photo was kept, only the second went again.
    expect(uploadImage).toHaveBeenCalledTimes(3);
    expect(creates()[0]!.body).toMatchObject({ mediaIds: ['media-1', 'media-2'] });
  });

  it('uploads a video without touching the photo path, and waits longer for the transcode', async () => {
    let polls = 0;
    requests = stubApi((req) => (req.method === 'POST'
      ? json(201, post('PROCESSING'))
      : json(200, post(++polls < 2 ? 'PROCESSING' : 'PUBLISHED'))));
    usePosting.getState().startVideo({ uri: 'file:///clip.mp4', width: 720, height: 1280, durationMs: 42_000, mimeType: 'video/mp4' });
    usePosting.getState().update({ caption: 'Clip', phase: 'uploading' });
    await runPosting(queryClient, NO_WAIT);

    expect(uploadVideo).toHaveBeenCalledTimes(1);
    expect(uploadImage).not.toHaveBeenCalled();
    expect(creates()[0]!.body).toEqual({ mediaIds: ['video-1'], caption: 'Clip' });
    expect(usePublished.getState().postId).toBe('post-1');
  });

  it('gives a video more polling attempts than a photo, since transcoding is slower', () => {
    ready('photo', 1);
    const photoDelays = pollDelaysFor(usePosting.getState().draft!);
    usePosting.getState().startVideo({ uri: 'file:///clip.mp4', width: 720, height: 1280, durationMs: 60_000, mimeType: 'video/mp4' });
    const videoDelays = pollDelaysFor(usePosting.getState().draft!);

    const total = (delays: number[]) => delays.reduce((sum, d) => sum + d, 0);
    expect(total(videoDelays)).toBeGreaterThan(total(photoDelays));
    expect(total(videoDelays)).toBeGreaterThanOrEqual(150_000); // a 60 s clip needs minutes
  });
});

describe('the saved draft', () => {
  it('turns a post that was uploading when the app stopped into "interrupted", ready to retry', async () => {
    const draft = {
      key: 'post-abc12345', aspect: 'square', selected: 0, caption: 'x', phase: 'uploading',
      photos: [{ source: { uri: 'file:///s.jpg', width: 1, height: 1 }, image: { uri: 'file:///p.jpg', width: 1, height: 1 } }],
    };
    await AsyncStorage.setItem('jamii.postDraft', JSON.stringify({ state: { draft }, version: 2 }));
    await usePosting.persist.rehydrate();
    expect(usePosting.getState().draft).toMatchObject({ phase: 'failed', failure: 'INTERRUPTED', caption: 'x' });
  });

  it('drops a draft saved by the one-photo version rather than crashing on its shape', async () => {
    const v1 = { key: 'post-old12345', source: { uri: 'file:///s.jpg', width: 1, height: 1 }, aspect: 'square', caption: 'x', phase: 'editing' };
    await AsyncStorage.setItem('jamii.postDraft', JSON.stringify({ state: { draft: v1 }, version: 1 }));
    await usePosting.persist.rehydrate();
    expect(usePosting.getState().draft).toBeNull();
  });
});
