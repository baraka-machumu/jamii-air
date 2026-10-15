// A one-shot "your post is up" signal, from the posting job to the Home feed.
//
// Posting runs in the background while you carry on scrolling, so by the time it finishes the
// feed is wherever you left it and the new post is off-screen at the top - which looks like
// nothing happened. The job announces the post here, Home scrolls to the top and clears it.
//
// Deliberately not part of usePosting: that store is persisted, and a signal that survives a
// restart would scroll the feed for a post shared yesterday.
import { create } from 'zustand';

interface PublishedState {
  /** The post just published, until Home has shown it. */
  postId: string | null;
  announce: (postId: string) => void;
  clear: () => void;
}

export const usePublished = create<PublishedState>((set) => ({
  postId: null,
  announce: (postId) => set({ postId }),
  clear: () => set({ postId: null }),
}));
