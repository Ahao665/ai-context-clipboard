import { create } from 'zustand';
import type { ClipboardEntry } from '@ai-clipboard/types';

interface ClipboardState {
  entries: ClipboardEntry[];
  loading: boolean;
  selectedId: string | null;
  setEntries: (entries: ClipboardEntry[]) => void;
  addEntry: (entry: ClipboardEntry) => void;
  removeEntry: (id: string) => void;
  setSelected: (id: string | null) => void;
  setLoading: (loading: boolean) => void;
}

export const useClipboardStore = create<ClipboardState>((set) => ({
  entries: [],
  loading: false,
  selectedId: null,
  setEntries: (entries) => set({ entries }),
  addEntry: (entry) =>
    set((s) => ({ entries: [entry, ...s.entries].slice(0, 500) })),
  removeEntry: (id) =>
    set((s) => ({ entries: s.entries.filter((e) => e.id !== id) })),
  setSelected: (id) => set({ selectedId: id }),
  setLoading: (loading) => set({ loading }),
}));
