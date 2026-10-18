// The post being made (App Flow §6), saved on the phone so a crash or an app kill never loses it
// ("You have an unfinished post"). One post at a time.
//   editing     picked, being cropped / captioned
//   uploading   bytes going to storage (progress shown)
//   creating    POST /posts (with this draft's Idempotency-Key, so a retry never posts twice)
//   processing  the server is making the sizes (or transcoding); the app polls GET /posts/:id
//   failed      stopped; `failure` is an error code; Retry continues from the step that failed
//
// A draft holds EITHER up to ten photos — a carousel, in the order they will appear (BR-CT-09) —
// or one video (BR-CT-07), never both (BR-CT-10).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { AspectChoice, Offset } from './crop';

/** Caption limit (BR-CT-03, server CAPTION_TOO_LONG). */
export const CAPTION_MAX = 2_200;
/** BR-CT-09. The server refuses an eleventh (MEDIA_NOT_ATTACHABLE). */
export const MAX_PHOTOS = 10;

export type Phase = 'editing' | 'uploading' | 'creating' | 'processing' | 'failed';

export interface Picked {
  uri: string;
  width: number;
  height: number;
}

export interface DraftPhoto {
  /** The picked photo, upright JPEG (src/media/upload.ts normalizeImage). */
  source: Picked;
  /** Where the crop frame sits on it. Missing = centred (the crop screen recentres). */
  offset?: Offset;
  /** The cropped, downscaled JPEG that is uploaded. */
  image?: Picked;
  mediaId?: string;
}

export interface DraftVideo extends Picked {
  durationMs: number;
  /** 'video/mp4' or 'video/quicktime', from the picked file. */
  mimeType: string;
  mediaId?: string;
}

export interface Draft {
  /** Idempotency-Key for POST /posts (TRD API-08). */
  key: string;
  /** Photos and video are exclusive (BR-CT-10). */
  photos: DraftPhoto[];
  video?: DraftVideo;
  /** Photos only: one shape for the whole carousel, so the cards line up. */
  aspect: AspectChoice;
  /** Which photo the crop screen is editing. */
  selected: number;
  caption: string;
  phase: Phase;
  postId?: string;
  failure?: string;
}

interface PostingState {
  draft: Draft | null;
  /** Upload progress 0…1 across every file in the draft (not saved). */
  progress: number;
  startPhotos: (sources: Picked[]) => void;
  startVideo: (video: Omit<DraftVideo, 'mediaId'>) => void;
  update: (changes: Partial<Draft>) => void;
  /** Changes one photo of the carousel, leaving the others alone. */
  updatePhoto: (index: number, changes: Partial<DraftPhoto>) => void;
  removePhoto: (index: number) => void;
  setProgress: (progress: number) => void;
  discard: () => void;
}

/** 8–64 of [A-Za-z0-9_.:-], unique enough per user (the server checks reuse). */
export function newDraftKey(): string {
  return `post-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

const blank = (): Omit<Draft, 'photos'> => ({
  key: newDraftKey(), aspect: 'square', selected: 0, caption: '', phase: 'editing',
});

/** The media of a draft in the order it will be posted: the photos, or the one video. */
export function draftMedia(draft: Draft): (DraftPhoto | DraftVideo)[] {
  return draft.video ? [draft.video] : draft.photos;
}

/** True once every file has been cropped (photos) and is ready to upload. */
export function draftReady(draft: Draft): boolean {
  return draft.video ? true : draft.photos.length > 0 && draft.photos.every((p) => p.image);
}

export const usePosting = create<PostingState>()(persist(
  (set) => ({
    draft: null,
    progress: 0,
    startPhotos: (sources) => set({
      draft: { ...blank(), photos: sources.slice(0, MAX_PHOTOS).map((source) => ({ source })) },
      progress: 0,
    }),
    startVideo: (video) => set({ draft: { ...blank(), photos: [], video }, progress: 0 }),
    update: (changes) => set((s) => (s.draft ? { draft: { ...s.draft, ...changes } } : s)),
    updatePhoto: (index, changes) => set((s) => (s.draft
      ? { draft: { ...s.draft, photos: s.draft.photos.map((p, i) => (i === index ? { ...p, ...changes } : p)) } }
      : s)),
    removePhoto: (index) => set((s) => {
      if (!s.draft) return s;
      const photos = s.draft.photos.filter((_, i) => i !== index);
      if (photos.length === 0) return { draft: null, progress: 0 };
      return { draft: { ...s.draft, photos, selected: Math.min(s.draft.selected, photos.length - 1) } };
    }),
    setProgress: (progress) => set({ progress }),
    discard: () => set({ draft: null, progress: 0 }),
  }),
  {
    name: 'jamii.postDraft',
    version: 2,
    storage: createJSONStorage(() => AsyncStorage),
    partialize: ({ draft }) => ({ draft }),
    // Version 1 held a single `source`/`image` pair. There is no useful way to carry a
    // half-finished v1 draft into the carousel shape, and a stale one would crash the crop
    // screen, so it is dropped: the worst case is one unfinished post lost on upgrade.
    migrate: () => ({ draft: null }),
    // A post that was uploading or creating when the app stopped did not finish: offer Retry.
    merge: (saved, current) => {
      const draft = (saved as { draft?: Draft | null } | undefined)?.draft ?? null;
      const interrupted = draft && (draft.phase === 'uploading' || draft.phase === 'creating');
      return { ...current, draft: interrupted ? { ...draft, phase: 'failed', failure: 'INTERRUPTED' } : draft };
    },
  },
));
