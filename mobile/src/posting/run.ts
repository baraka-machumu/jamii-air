// Sharing a post (App Flow §6, §6.1): upload each file (with progress) → POST /posts with the
// draft's Idempotency-Key → poll GET /posts/:id until it is PUBLISHED.
// Each step saves its result in the draft, so Retry (or a relaunch) continues where it stopped:
// a photo already uploaded is not uploaded again, and a created post is not created twice.
//
// Publishing waits for the whole post: a carousel appears when its last photo is ready, and a
// video when the server has finished transcoding, which takes longer than an image (BR-CT-08) —
// hence the longer polling for a video.
import type { QueryClient } from '@tanstack/react-query';
import { api, call } from '@/api/client';
import { track } from '@/analytics';
import { ApiError } from '@/api/errors';
import { meKey } from '@/api/me';
import { peopleKey } from '@/api/people';
import { uploadImage, uploadVideo } from '@/media/upload';
import { usePublished } from './published';
import { type Draft, draftMedia, newDraftKey, usePosting } from './store';

export type PostOutcome = 'PUBLISHED' | 'FAILED' | 'PENDING';

/** Photos are ready in seconds. Up to about 40 s of polling. */
const PHOTO_POLL_DELAYS_MS = [2_000, 4_000, 8_000, 8_000, 8_000, 8_000];
/** A 60 s video is a transcode, not a resize: up to about three minutes. */
const VIDEO_POLL_DELAYS_MS = [4_000, 6_000, 10_000, 15_000, 15_000, 20_000, 20_000, 30_000, 30_000];

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function pollDelaysFor(draft: Draft): number[] {
  return draft.video ? VIDEO_POLL_DELAYS_MS : PHOTO_POLL_DELAYS_MS;
}

export async function waitForPost(postId: string, delays: number[] = PHOTO_POLL_DELAYS_MS): Promise<PostOutcome> {
  for (const delay of delays) {
    await wait(delay);
    const post = await call(api.GET('/api/v1/posts/{id}', { params: { path: { id: postId } } })).catch(() => null);
    if (post?.status === 'PUBLISHED') return 'PUBLISHED';
    if (post?.status === 'FAILED') return 'FAILED';
  }
  return 'PENDING';
}

/** Codes after which an uploaded file cannot be used again: upload a fresh one. */
const MEDIA_GONE = new Set(['MEDIA_NOT_FOUND', 'MEDIA_NOT_UPLOADED', 'MEDIA_NOT_ATTACHABLE', 'MEDIA_KINDS_MIXED']);

let running: Promise<void> | null = null;

/** Runs (or resumes) the draft. One run at a time; a second call joins the first. */
export function runPosting(queryClient: QueryClient, delays?: number[]): Promise<void> {
  running ??= run(queryClient, delays).finally(() => { running = null; });
  return running;
}

async function run(queryClient: QueryClient, delays?: number[]): Promise<void> {
  const { update, updatePhoto, setProgress, discard } = usePosting.getState();
  const draft = () => usePosting.getState().draft;
  const announce = (postId: string) => usePublished.getState().announce(postId);
  const refresh = async () => {
    // Awaited, so the feed and grid already hold the new post when Home is told to show it
    // (BR-FD-12). Without this the list scrolls to a top that does not have the post yet.
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['feed'] }),
      queryClient.invalidateQueries({ queryKey: meKey }),
      queryClient.invalidateQueries({ queryKey: peopleKey }),
    ]).catch(() => undefined);
  };

  try {
    let current = draft();
    if (!current || current.phase === 'editing') return;

    // ── Upload every file, reporting one progress bar across all of them ──
    const files = draftMedia(current);
    const total = files.length;
    const uploaded = () => draftMedia(usePosting.getState().draft!).filter((f) => f.mediaId).length;
    const onProgress = (fraction: number) => setProgress(Math.min(1, (uploaded() + fraction) / total));

    if (files.some((f) => !f.mediaId)) {
      update({ phase: 'uploading', failure: undefined });
      setProgress(uploaded() / total);

      if (current.video) {
        if (!current.video.mediaId) {
          const mediaId = await uploadVideo(current.video, { onProgress });
          update({ video: { ...usePosting.getState().draft!.video!, mediaId } });
        }
      } else {
        for (const [index, photo] of current.photos.entries()) {
          if (photo.mediaId || !photo.image) continue;
          const mediaId = await uploadImage(photo.image, 'POST', { onProgress });
          updatePhoto(index, { mediaId });
        }
      }
      setProgress(1);
    }

    // ── Create the post ──
    current = draft()!;
    const mediaIds = draftMedia(current).map((f) => f.mediaId).filter((id): id is string => Boolean(id));
    if (mediaIds.length !== total) throw new ApiError(0, 'UPLOAD_FAILED', 'Not every file was uploaded');

    if (!current.postId) {
      update({ phase: 'creating', failure: undefined });
      const post = await call(api.POST('/api/v1/posts', {
        body: { mediaIds, caption: current.caption.trim() || null },
        headers: { 'Idempotency-Key': current.key },
      }));
      update({ postId: post.id });
      track('post_created', { media: total, kind: current.video ? 'video' : 'photo' });
      // Refresh NOW, not only once the server has finished (BR-FD-12). The feed returns the
      // viewer's own PROCESSING posts, so this is what puts the post on screen straight away —
      // holding its place with "Processing…" rather than leaving the feed looking unchanged for
      // the seconds an image takes, or the minute a video takes.
      await refresh();
      if (post.status === 'PUBLISHED') {
        discard();
        announce(post.id);
        return;
      }
      announce(post.id);
    }

    // ── Wait for the server to finish ──
    update({ phase: 'processing', failure: undefined });
    const outcome = await waitForPost(draft()!.postId!, delays ?? pollDelaysFor(draft()!));
    if (outcome === 'FAILED') {
      // The server could not use this file. Retry starts over: new upload, new post, new key.
      update({ phase: 'failed', failure: 'PROCESSING_FAILED' });
      track('upload_failed', { reason: 'PROCESSING_FAILED' });
      return;
    }
    // PUBLISHED, or still processing after the last try: the post exists and shows up in the
    // feed and grid by itself (the grid marks it "Processing…"). Tell Home as well, so the feed
    // goes to the top and what was just shared is the post on screen (BR-FD-12).
    const published = draft()?.postId;
    discard();
    await refresh();
    // Announce again: the card has just become the finished photo or video, and Home sends the
    // feed back to the top so that is what the viewer is looking at.
    if (published) announce(published);
  } catch (error) {
    const code = error instanceof ApiError ? error.code : 'UNKNOWN';
    const changes: Parameters<typeof update>[0] = { phase: 'failed', failure: code };
    if (code === 'IDEMPOTENCY_KEY_REUSED') changes.key = newDraftKey();
    update(changes);
    // A file the server will not take again has to be uploaded afresh. Which one is unknown, so
    // every mediaId in the draft is dropped and the whole post goes up again on Retry.
    if (MEDIA_GONE.has(code)) forgetUploads();
    track('upload_failed', { reason: code });
  }
}

/** Drops every mediaId in the draft, so Retry uploads the files again. */
function forgetUploads(): void {
  const { draft, update, updatePhoto } = usePosting.getState();
  if (!draft) return;
  if (draft.video) update({ video: { ...draft.video, mediaId: undefined } });
  draft.photos.forEach((_, index) => updatePhoto(index, { mediaId: undefined }));
}

/** Retry from the failed step; after a processing failure, start the upload over. */
export function retryPosting(queryClient: QueryClient, delays?: number[]): Promise<void> {
  const current = usePosting.getState().draft;
  if (current?.failure === 'PROCESSING_FAILED') {
    forgetUploads();
    usePosting.getState().update({ postId: undefined, key: newDraftKey() });
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
