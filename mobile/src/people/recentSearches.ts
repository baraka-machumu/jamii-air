// Recent searches (App Flow §8.1): the accounts opened from Search, newest first, at most 10,
// saved on the phone only, clearable.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export const MAX_RECENT = 10;

export interface RecentAccount {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

interface RecentState {
  accounts: RecentAccount[];
  add: (account: RecentAccount) => void;
  remove: (id: string) => void;
  clear: () => void;
}

export const useRecentSearches = create<RecentState>()(persist(
  (set) => ({
    accounts: [],
    add: (account) => set((s) => ({ accounts: [account, ...s.accounts.filter((a) => a.id !== account.id)].slice(0, MAX_RECENT) })),
    remove: (id) => set((s) => ({ accounts: s.accounts.filter((a) => a.id !== id) })),
    clear: () => set({ accounts: [] }),
  }),
  { name: 'jamii.recentSearches', version: 1, storage: createJSONStorage(() => AsyncStorage) },
));
