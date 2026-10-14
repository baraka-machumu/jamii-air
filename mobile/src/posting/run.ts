// Sharing a post (App Flow §6, §6.1): upload the photo (with progress) → POST /posts with the
// draft's Idempotency-Key → poll GET /posts/:id at 2 s, 4 s, 8 s… (5 tries) until PUBLISHED.
// Each step saves its result in the draft, so Retry (or a relaunch) continues where it stopped:
// an uploaded photo is not uploaded again, and a created post is not created twice.
import type { QueryClient } from '@tanstack/react-query';
import { api, call } from '@/api/client';
import { track } from '@/analytics';
import { ApiError } from '@/api/errors';
import { meKey } from '@/api/me';
import { peopleKey } from '@/api/people';
import { uploadImage } from '@/media/upload';
import { newDraftKey, usePosting } from './store';

export type PostOutcome = 'PUBLISHED' | 'FAILED' | 'PENDING';

const POLL_DELAYS_MS = [2_000, 4_000, 8_000, 8_000, 8_000];
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function waitForPost(postId: string, delays = POLL_DELAYS_MS): Promise<PostOutcome> {
  for (const delay of delays) {
    await wait(delay);
    const post = await call(api.GET('/api/v1/posts/{id}', { params: { path: { id: postId } } })).catch(() => null);
    if (post?.status === 'PUBLISHED') return 'PUBLISHED';
    if (post?.status === 'FAILED') return 'FAILED';
  }
  return 'PENDING';
}

/** Codes after which the uploaded photo cannot be used again: upload a fresh one. */
const MEDIA_GONE = new Set(['MEDIA_NOT_FOUND', 'MEDIA_NOT_UPLOADED', 'MEDIA_NOT_ATTACHABLE']);

let running: Promise<void> | null = null;

/** Runs (or resumes) the draft. One run at a time; a second call joins the first. */
export function runPosting(queryClient: QueryClient, delays = POLL_DELAYS_MS): Promise<void> {
  running ??= run(queryClient, delays).finally(() => { running = null; });
  return running;
}

async function run(queryClient: QueryClient, delays: number[]): Promise<void> {
  const { update, setProgress, discard } = usePosting.getState();
  const draft = () => usePosting.getState().draft;
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: meKey });
    void queryClient.invalidateQueries({ queryKey: peopleKey });
    void queryClient.invalidateQueries({ queryKey: ['feed'] });
  };

  try {
    let current = draft();
    if (!current?.image || current.phase === 'editing') return;

    if (!current.mediaId) {
      update({ phase: 'uploading', failure: undefined });
      setProgress(0);
      const mediaId = await uploadImage(current.image, 'POST', { onProgress: setProgress });
      update({ mediaId });
      setProgress(1);
    }

    current = draft()!;
    if (!current.postId) {
      update({ phase: 'creating', failure: undefined });
      const post = await call(api.POST('/api/v1/posts', {
        body: { mediaIds: [current.mediaId!], caption: current.caption.trim() || null },
        headers: { 'Idempotency-Key': current.key },
      }));
      update({ postId: post.id });
      track('post_created');
      if (post.status === 'PUBLISHED') { discard(); refresh(); return; }
    }

    update({ phase: 'processing', failure: undefined });
    const outcome = await waitForPost(draft()!.postId!, delays);
    if (outcome === 'FAILED') {
      // The server could not use this photo. Retry starts over: new upload, new post, new key.
      update({ phase: 'failed', failure: 'PROCESSING_FAILED' });
      track('upload_failed', { reason: 'PROCESSING_FAILED' });
      return;
    }
    // PUBLISHED, or still processing after the last try: the post exists and shows up in the
    // feed and grid by itself (the grid marks it "Processing…").
    discard();
    refresh();
  } catch (error) {
    const code = error instanceof ApiError ? error.code : 'UNKNOWN';
    const changes: Parameters<typeof update>[0] = { phase: 'failed', failure: code };
    if (MEDIA_GONE.has(code)) changes.mediaId = undefined;
    if (code === 'IDEMPOTENCY_KEY_REUSED') changes.key = newDraftKey();
    update(changes);
    track('upload_failed', { reason: code });
  }
}

/** Retry from the failed step; after a processing failure, start the upload over. */
export function retryPosting(queryClient: QueryClient, delays = POLL_DELAYS_MS): Promise<void> {
  const current = usePosting.getState().draft;
  if (current?.failure === 'PROCESSING_FAILED') {
    usePosting.getState().update({ mediaId: undefined, postId: undefined, key: newDraftKey() });
  }
  usePosting.getState().update({ phase: 'uploading' });
  return runPosting(queryClient, delays);
}

/** Discard; a post the server already has but could not process is deleted (best effort). */
export function discardPosting(): void {
  const current = usePosting.getState().draft;
  if (current?.postId && current.failure === 'PROCESSING_FAILED') {
    void api.DELETE('/api/v1/posts/{id}', { params: { path: { id: current.postId } } }).catch(() => undefined);
  }
  usePosting.getState().discard();
}
