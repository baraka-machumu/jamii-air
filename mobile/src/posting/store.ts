// The post being made (App Flow §6), saved on the phone so a crash or an app kill never loses it
// ("You have an unfinished post"). One post at a time in R1.
//   editing     picked, being cropped / captioned
//   uploading   photo bytes going to storage (progress shown)
//   creating    POST /posts (with this draft's Idempotency-Key, so a retry never posts twice)
//   processing  the server is making the image sizes; the app polls GET /posts/:id
//   failed      stopped; `failure` is an error code; Retry continues from the step that failed
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { AspectChoice } from './crop';

/** Caption limit (BR-CT-03, server CAPTION_TOO_LONG). */
export const CAPTION_MAX = 2_200;

export type Phase = 'editing' | 'uploading' | 'creating' | 'processing' | 'failed';

export interface Draft {
  /** Idempotency-Key for POST /posts (TRD API-08). */
  key: string;
  /** The picked photo, upright JPEG (src/media/upload.ts normalizeImage). */
  source: { uri: string; width: number; height: number };
  aspect: AspectChoice;
  /** The cropped, downscaled JPEG that is uploaded. */
  image?: { uri: string; width: number; height: number };
  caption: string;
  phase: Phase;
  mediaId?: string;
  postId?: string;
  failure?: string;
}

interface PostingState {
  draft: Draft | null;
  /** Upload progress 0…1 (not saved). */
  progress: number;
  start: (source: Draft['source']) => void;
  update: (changes: Partial<Draft>) => void;
  setProgress: (progress: number) => void;
  discard: () => void;
}

/** 8–64 of [A-Za-z0-9_.:-], unique enough per user (the server checks reuse). */
export function newDraftKey(): string {
  return `post-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export const usePosting = create<PostingState>()(persist(
  (set) => ({
    draft: null,
    progress: 0,
    start: (source) => set({ draft: { key: newDraftKey(), source, aspect: 'square', caption: '', phase: 'editing' }, progress: 0 }),
    update: (changes) => set((s) => (s.draft ? { draft: { ...s.draft, ...changes } } : s)),
    setProgress: (progress) => set({ progress }),
    discard: () => set({ draft: null, progress: 0 }),
  }),
  {
    name: 'jamii.postDraft',
    version: 1,
    storage: createJSONStorage(() => AsyncStorage),
    partialize: ({ draft }) => ({ draft }),
    // A post that was uploading or creating when the app stopped did not finish: offer Retry.
    merge: (saved, current) => {
      const draft = (saved as { draft?: Draft | null } | undefined)?.draft ?? null;
      const interrupted = draft && (draft.phase === 'uploading' || draft.phase === 'creating');
      return { ...current, draft: interrupted ? { ...draft, phase: 'failed', failure: 'INTERRUPTED' } : draft };
    },
  },
));
