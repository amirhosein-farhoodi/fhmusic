import { create } from "zustand";
import { player } from "./audio/player";
import type { BarMeta, ServerState, StyleInfo } from "./audio/types";

export type Status = "idle" | "starting" | "playing" | "paused";

interface DJState {
  status: Status;
  connected: boolean;
  meta: BarMeta | null;
  styles: StyleInfo[];
  bpmRange: [number, number];
  server: ServerState;
  skipping: boolean; // "next" pressed, waiting for the mix to start
  error: string | null;

  start: () => Promise<void>;
  togglePlay: () => void;
  next: () => void;
  setBpm: (bpm: number) => void;
  nudgeBpm: (delta: number) => void;
  autoBpm: () => void;
  setStyle: (key: string | null) => void;
}

export const useDJ = create<DJState>((set, get) => ({
  status: "idle",
  connected: false,
  meta: null,
  styles: [],
  bpmRange: [100, 170],
  server: { target_bpm: 135, bpm_locked: false, locked_style: null },
  skipping: false,
  error: null,

  start: async () => {
    if (get().status !== "idle") return;
    set({ status: "starting", error: null });
    try {
      await player.start({
        onHello: (h) => set({ styles: h.styles, bpmRange: h.bpm_range, server: h }),
        onState: (s) => set({ server: s }),
        onConnection: (connected) => set({ connected }),
        onBar: (meta) =>
          set((st) => ({
            meta,
            status: st.status === "starting" ? "playing" : st.status,
            skipping: st.skipping && !meta.next && meta.track_no === st.meta?.track_no,
          })),
      });
    } catch (e) {
      set({ status: "idle", error: e instanceof Error ? e.message : String(e) });
    }
  },

  togglePlay: () => {
    const { status } = get();
    if (status === "idle") return void get().start();
    if (status === "playing") {
      player.pause();
      set({ status: "paused" });
    } else if (status === "paused") {
      void player.resume();
      set({ status: "playing" });
    }
  },

  next: () => {
    player.send({ type: "next" });
    set({ skipping: true });
  },

  setBpm: (bpm) => {
    const [lo, hi] = get().bpmRange;
    const value = Math.round(Math.min(hi, Math.max(lo, bpm)));
    player.send({ type: "bpm", value });
    set((st) => ({ server: { ...st.server, target_bpm: value, bpm_locked: true } }));
  },

  nudgeBpm: (delta) => {
    const { server, meta } = get();
    const base = server.bpm_locked ? server.target_bpm : Math.round(meta?.bpm ?? server.target_bpm);
    get().setBpm(base + delta);
  },

  autoBpm: () => {
    player.send({ type: "bpm_auto" });
    set((st) => ({ server: { ...st.server, bpm_locked: false } }));
  },

  setStyle: (key) => {
    player.send({ type: "style", value: key });
    set((st) => ({ server: { ...st.server, locked_style: key }, skipping: key !== null }));
  },
}));
