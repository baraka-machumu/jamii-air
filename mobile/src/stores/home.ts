// Which of Home's top tabs is open (App Flow §16.1): remembered while the app is open, not saved,
// so a cold start opens Posts.
import { create } from 'zustand';

export type HomeSection = 'posts' | 'stories' | 'ocean' | 'shops';

export const useHomeSection = create<{ section: HomeSection; setSection: (section: HomeSection) => void }>((set) => ({
  section: 'posts',
  setSection: (section) => set({ section }),
}));
