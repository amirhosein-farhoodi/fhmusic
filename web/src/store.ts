import { create } from "zustand";
import { DEFAULT_FX, type FxSettings } from "./audio/fx";
import { type Channel, player } from "./audio/player";
import type { BarMeta, ServerState, StyleInfo } from "./audio/types";

export type Status = "idle" | "starting" | "playing" | "paused";
export type Pad = "build" | "drop" | "breakdown";
export type Shape = "soda" | "star";

const SHAPE_KEY = "fhmusic.shape";
const savedShape = (): Shape => {
  try {
    return localStorage.getItem(SHAPE_KEY) === "soda" ? "soda" : "star"; // starburst by default
  } catch {
    return "star";
  }
};
export const CHANNELS: Channel[] = ["kick", "drums", "bass", "synths", "atmos"];
const DEFAULT_LEVELS = { kick: 1, drums: 1, bass: 1, synths: 1, atmos: 1 } as Record<Channel, number>;
const DEFAULT_MUTES = { kick: false, drums: false, bass: false, synths: false, atmos: false } as Record<Channel, boolean>;

interface DJState {
  status: Status;
  connected: boolean;
  meta: BarMeta | null;
  styles: StyleInfo[];
  bpmRange: [number, number];
  server: ServerState;
  skipping: boolean; // "next" pressed, waiting for the mix to start
  error: string | null;

  // ---- visuals-only mode (double-click the stage): the UI hides until the mouse moves
  clean: boolean;
  setClean: (on: boolean) => void;

  // ---- shape of the centre piece: the spiky starburst (default) or the original soda blob
  shape: Shape;
  toggleShape: () => void;

  // ---- DJ mode
  djOpen: boolean;
  fx: FxSettings;
  levels: Record<Channel, number>;
  mutes: Record<Channel, boolean>;
  loop: number;
  lastPad: Pad | null;

  start: () => Promise<void>;
  togglePlay: () => void;
  next: () => void;
  setBpm: (bpm: number) => void;
  nudgeBpm: (delta: number) => void;
  autoBpm: () => void;
  setStyle: (key: string | null) => void;
  toggleDJ: (open?: boolean) => void;
  setFx: (patch: Partial<FxSettings>) => void;
  toggleKill: (band: "low" | "mid" | "high") => void;
  setLevel: (ch: Channel, v: number) => void;
  toggleMute: (ch: Channel) => void;
  perform: (pad: Pad) => void;
  setLoop: (bars: number) => void;
  resetDJ: () => void;
}

/** What the engine should hear for each channel (mute = 0). */
const effectiveMix = (levels: Record<Channel, number>, mutes: Record<Channel, boolean>) =>
  Object.fromEntries(CHANNELS.map((c) => [c, mutes[c] ? 0 : levels[c]])) as Record<Channel, number>;

export const useDJ = create<DJState>((set, get) => ({
  status: "idle",
  connected: false,
  meta: null,
  styles: [],
  bpmRange: [100, 171],
  server: { target_bpm: 135, bpm_locked: false, locked_style: null },
  skipping: false,
  error: null,
  clean: false,
  shape: savedShape(),
  djOpen: false,
  fx: DEFAULT_FX,
  levels: DEFAULT_LEVELS,
  mutes: DEFAULT_MUTES,
  loop: 0,
  lastPad: null,

  start: async () => {
    if (get().status !== "idle") return;
    set({ status: "starting", error: null });
    try {
      await player.start({
        onHello: (h) => set({ styles: h.styles, bpmRange: h.bpm_range, server: h }),
        onState: (s) => set({ server: s }),
        onConnection: (connected) => {
          set({ connected });
          if (connected) {
            // a fresh engine after (re)connecting: re-apply the DJ mixer
            const { levels, mutes } = get();
            player.send({ type: "mix", channels: effectiveMix(levels, mutes) });
          }
        },
        onBar: (meta) =>
          set((st) => ({
            meta,
            status: st.status === "starting" ? "playing" : st.status,
            skipping: st.skipping && !meta.next && meta.track_no === st.meta?.track_no,
            lastPad: st.lastPad && meta.section === st.meta?.section ? st.lastPad : null,
          })),
      });
      player.fx?.apply(get().fx);
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
    set({ skipping: true, loop: 0 });
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

  toggleShape: () => {
    const shape: Shape = get().shape === "soda" ? "star" : "soda";
    try {
      localStorage.setItem(SHAPE_KEY, shape);
    } catch {
      /* private mode: just don't remember it */
    }
    set({ shape });
  },

  setClean: (on) => set(on ? { clean: true, djOpen: false } : { clean: false }),

  // ---- DJ mode
  toggleDJ: (open) => set((st) => ({ djOpen: open ?? !st.djOpen, clean: (open ?? !st.djOpen) ? false : st.clean })),

  setFx: (patch) => {
    const fx = { ...get().fx, ...patch };
    player.fx?.apply(fx);
    set({ fx });
  },

  toggleKill: (band) => {
    const { fx } = get();
    get().setFx({ kill: { ...fx.kill, [band]: !fx.kill[band] } });
  },

  setLevel: (ch, v) => {
    const levels = { ...get().levels, [ch]: v };
    player.send({ type: "mix", channels: effectiveMix(levels, get().mutes) });
    set({ levels });
  },

  toggleMute: (ch) => {
    const mutes = { ...get().mutes, [ch]: !get().mutes[ch] };
    player.send({ type: "mix", channels: effectiveMix(get().levels, mutes) });
    set({ mutes });
  },

  perform: (pad) => {
    player.send({ type: "perform", action: pad });
    set({ lastPad: pad, loop: 0 });
  },

  setLoop: (bars) => {
    const next = get().loop === bars ? 0 : bars;
    player.send({ type: "loop", bars: next });
    set({ loop: next });
  },

  resetDJ: () => {
    player.fx?.apply(DEFAULT_FX);
    player.send({ type: "mix", channels: effectiveMix(DEFAULT_LEVELS, DEFAULT_MUTES) });
    if (get().loop) player.send({ type: "loop", bars: 0 });
    set({ fx: DEFAULT_FX, levels: DEFAULT_LEVELS, mutes: DEFAULT_MUTES, loop: 0 });
  },
}));
