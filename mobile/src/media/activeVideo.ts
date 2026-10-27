// Which video is playing, app-wide: at most one (BR-CT-07). Starting a video stops whichever was
// playing, and a video stops when its post scrolls away or its screen loses focus — otherwise a
// clip nobody is looking at keeps spending the viewer's data bundle (BRS §11) and holding a
// decoder. "Stopped" means the page goes back to its poster and the player is released.
//
// Leaving the app stops it too (the screen turned off, the home button, another app). Android takes
// the video's surface away while the app is in the background, and a player kept across that came
// back frozen on its last frame with no ▶ to start it again, until the app was restarted. Released
// instead, the page shows its poster on return and ▶ makes a fresh player.
//
// Tapping a playing video opens its post, like tapping a photo. The video then carries on there
// from the same moment: the feed hands it off, and the post screen's page picks it up as it mounts.
import { create } from 'zustand';

/** A handoff not picked up by then is stale (a double-tap to like, a tap on the post screen). */
const HANDOFF_MS = 3000;

export interface Handoff {
  mediaId: string;
  /** Seconds into the video. */
  time: number;
  muted: boolean;
  at: number;
}

interface Playing {
  /** One video page on one screen: the same post can be on the feed and on its detail screen. */
  key: string;
  postId: string;
  /** Opened from this video playing elsewhere: start where it was. */
  resume?: Handoff;
}

interface ActiveVideoState {
  playing: Playing | null;
  play: (video: Playing) => void;
  /** Stops this page's video, and only if it is the one playing. */
  stop: (key: string) => void;
  /** Stops whatever is playing: the app has left the foreground. */
  stopAll: () => void;
  /** Stops the video unless its post is among these (the posts a list has on screen). */
  keepOnly: (postIds: ReadonlySet<string>) => void;
  handoff: Handoff | null;
  handOff: (handoff: Omit<Handoff, 'at'>) => void;
  /** The handoff for this video if there is a fresh one, which is then used up. */
  takeHandoff: (mediaId: string) => Handoff | null;
}

export const useActiveVideo = create<ActiveVideoState>()((set, get) => ({
  playing: null,
  handoff: null,
  play: (video) => set({ playing: video }),
  handOff: (handoff) => set({ handoff: { ...handoff, at: Date.now() } }),
  takeHandoff: (mediaId) => {
    const { handoff } = get();
    if (!handoff || handoff.mediaId !== mediaId || Date.now() - handoff.at > HANDOFF_MS) return null;
    set({ handoff: null });
    return handoff;
  },
  stop: (key) => set((s) => (s.playing?.key === key ? { playing: null } : s)),
  stopAll: () => set({ playing: null, handoff: null }),
  keepOnly: (postIds) => set((s) => (s.playing && !postIds.has(s.playing.postId) ? { playing: null } : s)),
}));
