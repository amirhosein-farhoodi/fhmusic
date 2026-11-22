import { ArrowDownToLine, Check, Flame, Minus, Pause, Play, Plus, Repeat, RotateCcw, SkipForward, TrendingUp, X } from "lucide-react";
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import { DEFAULT_FX } from "../audio/fx";
import type { Channel } from "../audio/player";
import { CHANNELS, type Pad, useDJ } from "../store";
import { BeatDots } from "./BpmControl";

// ---------------------------------------------------------------- keyboard map
//
// Rows of the keyboard follow the controls:
//   Z X C          pads (build / drop / breakdown)      1 2 4   loop bars
//   Q W E          filter darker / thinner / center
//   R T Y          EQ high  down / up / kill            (top row    = high)
//   F G H          EQ mid   down / up / kill            (middle row = mid)
//   V B N          EQ low   down / up / kill            (bottom row = low)
//   U I O          echo less / more / cycle time        J K   reverb less / more
//   5 6 7 8 9      mute kick / drums / bass / synths / atmos          0  reset all

const ECHO_TIMES = [
  { beats: 0.25, label: "1/16" },
  { beats: 0.5, label: "1/8" },
  { beats: 0.75, label: "3/16" },
  { beats: 1, label: "1/4" },
];
const EQ_KEYS = { high: ["R", "T", "Y"], mid: ["F", "G", "H"], low: ["V", "B", "N"] } as const;
const MUTE_KEYS: Record<Channel, string> = { kick: "5", drums: "6", bass: "7", synths: "8", atmos: "9" };
const LOOP_KEYS: Record<number, string> = { 1: "1", 2: "2", 4: "4" };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const snapFilter = (v: number) => (Math.abs(v) < 0.03 ? 0 : clamp(v, -1, 1));

function useDJKeyboard(open: boolean) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return; // keep browser shortcuts working
      const s = useDJ.getState();
      if (s.status === "idle") return;
      const fx = s.fx;
      const once = (fn: () => void) => () => {
        if (!e.repeat) fn();
      };
      const eq = (band: "low" | "mid" | "high", d: number) => () => s.setFx({ [band]: clamp(fx[band] + d, -24, 6) });
      const mixing = !!s.meta?.next || s.skipping;
      const pad = (p: Pad) => once(() => !mixing && s.perform(p));

      const actions: Record<string, () => void> = {
        z: pad("build"),
        x: pad("drop"),
        c: pad("breakdown"),
        "1": once(() => s.setLoop(1)),
        "2": once(() => s.setLoop(2)),
        "4": once(() => s.setLoop(4)),
        q: () => s.setFx({ filter: snapFilter(fx.filter - 0.05) }),
        w: () => s.setFx({ filter: snapFilter(fx.filter + 0.05) }),
        e: once(() => s.setFx({ filter: 0 })),
        r: eq("high", -1.5),
        t: eq("high", 1.5),
        y: once(() => s.toggleKill("high")),
        f: eq("mid", -1.5),
        g: eq("mid", 1.5),
        h: once(() => s.toggleKill("mid")),
        v: eq("low", -1.5),
        b: eq("low", 1.5),
        n: once(() => s.toggleKill("low")),
        u: () => s.setFx({ echo: clamp(fx.echo - 0.05, 0, 1) }),
        i: () => s.setFx({ echo: clamp(fx.echo + 0.05, 0, 1) }),
        o: once(() => {
          const i = ECHO_TIMES.findIndex((t) => t.beats === fx.echoBeats);
          s.setFx({ echoBeats: ECHO_TIMES[(i + 1) % ECHO_TIMES.length].beats });
        }),
        j: () => s.setFx({ reverb: clamp(fx.reverb - 0.05, 0, 1) }),
        k: () => s.setFx({ reverb: clamp(fx.reverb + 0.05, 0, 1) }),
        "0": once(() => s.resetDJ()),
        ...Object.fromEntries(CHANNELS.map((ch) => [MUTE_KEYS[ch], once(() => s.toggleMute(ch))])),
      };
      const fn = actions[e.key.toLowerCase()];
      if (fn) {
        e.preventDefault();
        fn();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
}

// ---------------------------------------------------------------- building blocks

/** A keyboard shortcut hint, drawn like a physical key (not clickable on its own). */
function Key({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return (
    <kbd
      title={`Keyboard shortcut: ${typeof children === "string" ? children : ""}`}
      className={`pointer-events-none inline-grid h-[18px] min-w-[18px] place-items-center rounded-[5px] border border-b-[3px] px-1 font-mono text-[10px] font-bold leading-none ${
        dark ? "border-plum/40 text-plum/80" : "border-white/30 text-white/75"
      }`}
    >
      {children}
    </kbd>
  );
}

function Block({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-3xl bg-night/50 px-4 py-3 ring-1 ring-lavender/15">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="font-display text-sm font-bold">{title}</h3>
        {hint && <span className="flex items-center gap-1.5 text-[11px] text-lavender/60">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

/** Range input; bipolar faders fill from the center. Double-click resets. */
function Fader({
  value, min, max, step = 0.01, onChange, reset, bipolar = false, fill, disabled, label,
}: {
  value: number; min: number; max: number; step?: number; onChange: (v: number) => void;
  reset: number; bipolar?: boolean; fill?: string; disabled?: boolean; label: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  const zero = bipolar ? ((0 - min) / (max - min)) * 100 : 0;
  const style = {
    "--a": `${Math.min(zero, pct)}%`,
    "--b": `${Math.max(zero, pct)}%`,
    ...(fill ? { "--fill": fill } : {}),
  } as CSSProperties;
  return (
    <input
      type="range"
      aria-label={label}
      className="fader min-w-0 flex-1"
      style={style}
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
      onDoubleClick={() => onChange(reset)}
    />
  );
}

function Toggle({ on, onClick, children, tone = "pink", k }: { on: boolean; onClick: () => void; children: ReactNode; tone?: "pink" | "butter"; k?: string }) {
  const active = tone === "pink" ? "bg-bubblegum text-plum shadow-[0_3px_0_0_#7B2CBF]" : "bg-butter text-plum shadow-[0_3px_0_0_#7B2CBF]";
  return (
    <button
      onClick={onClick}
      className={`press flex shrink-0 items-center gap-1.5 rounded-xl py-1 pl-2.5 text-[11px] font-bold uppercase tracking-wider ${k ? "pr-1" : "pr-2.5"} ${
        on ? active : "text-lavender/80 ring-1 ring-lavender/30 hover:text-white hover:ring-lavender/60"
      }`}
    >
      {children}
      {k && <Key dark={on}>{k}</Key>}
    </button>
  );
}

/** One fader row: label, [down key] fader [up key], value, then an optional button. */
function Row({ label, down, up, value, after, children }: { label: string; down?: string; up?: string; value: string; after?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex h-8 items-center gap-2">
      <span className="w-[52px] shrink-0 text-[11px] font-bold uppercase tracking-wider text-lavender">{label}</span>
      {down && <Key>{down}</Key>}
      {children}
      {up && <Key>{up}</Key>}
      <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-white/70">{value}</span>
      {after}
    </div>
  );
}

// ---------------------------------------------------------------- sections

function Tempo() {
  const meta = useDJ((s) => s.meta);
  const server = useDJ((s) => s.server);
  const nudge = useDJ((s) => s.nudgeBpm);
  const autoBpm = useDJ((s) => s.autoBpm);
  const live = meta?.bpm ?? server.target_bpm;
  const shown = server.bpm_locked ? server.target_bpm : live;
  const btn = "press grid size-10 place-items-center rounded-full bg-grape text-butter shadow-[0_3px_0_0_#C77DFF] hover:bg-[#8b3bd1]";
  return (
    <Block title="Tempo" hint={<><Key>↓</Key><Key>↑</Key> ±1 · shift ±5 · <Key>A</Key> auto</>}>
      <div className="flex items-center gap-3">
        <button aria-label="Slower" className={btn} onClick={() => nudge(-1)}>
          <Minus className="size-5" strokeWidth={3} />
        </button>
        <div className="flex flex-1 items-baseline justify-center gap-2">
          <span className="font-display text-4xl font-black leading-none tabular-nums text-butter">{Math.round(shown)}</span>
          <span className="text-xs font-bold text-lavender">BPM</span>
        </div>
        <button aria-label="Faster" className={btn} onClick={() => nudge(1)}>
          <Plus className="size-5" strokeWidth={3} />
        </button>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <BeatDots />
        <button
          onClick={server.bpm_locked ? autoBpm : undefined}
          className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider ${
            server.bpm_locked ? "press bg-bubblegum text-plum" : "cursor-default text-lavender/70 ring-1 ring-lavender/30"
          }`}
        >
          {server.bpm_locked ? "Manual · reset" : "DJ auto"}
        </button>
      </div>
    </Block>
  );
}

const PADS: { pad: Pad; label: string; sub: string; key: string; icon: ReactNode; color: string }[] = [
  { pad: "build", label: "Build up", sub: "riser → drop", key: "Z", icon: <TrendingUp className="size-5" strokeWidth={2.5} />, color: "bg-lavender" },
  { pad: "drop", label: "Drop", sub: "full power", key: "X", icon: <Flame className="size-5" strokeWidth={2.5} />, color: "bg-butter" },
  { pad: "breakdown", label: "Break­down", sub: "drums out", key: "C", icon: <ArrowDownToLine className="size-5" strokeWidth={2.5} />, color: "bg-bubblegum" },
];

function Performance() {
  const perform = useDJ((s) => s.perform);
  const lastPad = useDJ((s) => s.lastPad);
  const loop = useDJ((s) => s.loop);
  const setLoop = useDJ((s) => s.setLoop);
  const mixing = useDJ((s) => !!s.meta?.next || s.skipping);

  return (
    <Block title="Performance" hint={mixing ? "waiting for the mix to finish" : "lands on the next bar"}>
      <div className="grid grid-cols-3 gap-2.5">
        {PADS.map((p) => (
          <button
            key={p.pad}
            disabled={mixing}
            onClick={() => perform(p.pad)}
            className={`press flex h-[92px] min-w-0 flex-col items-start justify-between rounded-2xl p-2.5 text-left text-plum shadow-[0_4px_0_0_#7B2CBF] disabled:opacity-40 disabled:shadow-none ${p.color} ${
              lastPad === p.pad ? "animate-pulse ring-4 ring-white/70" : ""
            }`}
          >
            <span className="flex w-full items-start justify-between">
              {p.icon}
              <Key dark>{p.key}</Key>
            </span>
            <span className="min-w-0">
              <span className="block font-display text-[12px] font-black leading-tight [overflow-wrap:anywhere] [hyphens:manual]">{p.label}</span>
              <span className="block text-[11px] font-semibold opacity-70">{p.sub}</span>
            </span>
          </button>
        ))}
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-lavender">
          <Repeat className="size-4" /> Loop
        </span>
        <div className="ml-auto flex gap-1.5">
          {[1, 2, 4].map((b) => (
            <Toggle key={b} on={loop === b} onClick={() => setLoop(b)} tone="butter" k={LOOP_KEYS[b]}>
              {b} bar{b > 1 ? "s" : ""}
            </Toggle>
          ))}
        </div>
      </div>
    </Block>
  );
}

function Filter() {
  const filter = useDJ((s) => s.fx.filter);
  const setFx = useDJ((s) => s.setFx);
  const label = Math.abs(filter) < 0.03 ? "Off" : filter < 0 ? `Low-pass ${Math.round(-filter * 100)}%` : `High-pass ${Math.round(filter * 100)}%`;
  return (
    <Block title="Filter" hint={<><Key>E</Key> center · double-click</>}>
      <div className="flex items-center gap-2">
        <Key>Q</Key>
        <Fader label="DJ filter" value={filter} min={-1} max={1} reset={0} bipolar fill="var(--color-butter)" onChange={(v) => setFx({ filter: snapFilter(v) })} />
        <Key>W</Key>
      </div>
      <div className="mt-0.5 flex justify-between px-7 text-[11px] font-semibold text-lavender/70">
        <span>◀ darker</span>
        <span className="text-butter">{label}</span>
        <span>thinner ▶</span>
      </div>
    </Block>
  );
}

function EQ() {
  const fx = useDJ((s) => s.fx);
  const setFx = useDJ((s) => s.setFx);
  const toggleKill = useDJ((s) => s.toggleKill);
  return (
    <Block title="EQ" hint="kill = cut the band">
      {(["high", "mid", "low"] as const).map((band) => {
        const [down, up, kill] = EQ_KEYS[band];
        return (
          <Row
            key={band}
            label={band}
            down={down}
            up={up}
            value={fx.kill[band] ? "—" : `${fx[band] > 0 ? "+" : ""}${fx[band]}dB`}
            after={
              <Toggle on={fx.kill[band]} onClick={() => toggleKill(band)} k={kill}>
                Kill
              </Toggle>
            }
          >
            <Fader label={`EQ ${band}`} value={fx[band]} min={-24} max={6} step={0.5} reset={0} bipolar disabled={fx.kill[band]} onChange={(v) => setFx({ [band]: v })} />
          </Row>
        );
      })}
    </Block>
  );
}

function Effects() {
  const fx = useDJ((s) => s.fx);
  const setFx = useDJ((s) => s.setFx);
  return (
    <Block title="FX" hint="synced to the BPM">
      <Row label="Echo" down="U" up="I" value={`${Math.round(fx.echo * 100)}%`}>
        <Fader label="Echo amount" value={fx.echo} min={0} max={1} reset={0} fill="var(--color-bubblegum)" onChange={(v) => setFx({ echo: v })} />
      </Row>
      <div className="my-1 flex items-center justify-end gap-1.5">
        <span className="mr-1 flex items-center gap-1 text-[11px] text-lavender/60">
          time <Key>O</Key>
        </span>
        {ECHO_TIMES.map((t) => (
          <Toggle key={t.beats} on={fx.echoBeats === t.beats} onClick={() => setFx({ echoBeats: t.beats })}>
            {t.label}
          </Toggle>
        ))}
      </div>
      <Row label="Reverb" down="J" up="K" value={`${Math.round(fx.reverb * 100)}%`}>
        <Fader label="Reverb amount" value={fx.reverb} min={0} max={1} reset={0} fill="var(--color-bubblegum)" onChange={(v) => setFx({ reverb: v })} />
      </Row>
    </Block>
  );
}

const CHANNEL_LABEL: Record<Channel, string> = { kick: "Kick", drums: "Drums", bass: "Bass", synths: "Synths", atmos: "Atmos" };

function Channels() {
  const levels = useDJ((s) => s.levels);
  const mutes = useDJ((s) => s.mutes);
  const setLevel = useDJ((s) => s.setLevel);
  const toggleMute = useDJ((s) => s.toggleMute);
  return (
    <Block title="Channels" hint="lands on the next bar">
      {CHANNELS.map((ch) => (
        <Row
          key={ch}
          label={CHANNEL_LABEL[ch]}
          value={mutes[ch] ? "off" : String(Math.round(levels[ch] * 100))}
          after={
            <Toggle on={mutes[ch]} onClick={() => toggleMute(ch)} k={MUTE_KEYS[ch]}>
              Mute
            </Toggle>
          }
        >
          <Fader label={`${CHANNEL_LABEL[ch]} level`} value={levels[ch]} min={0} max={1.5} reset={1} disabled={mutes[ch]} onChange={(v) => setLevel(ch, v)} />
        </Row>
      ))}
    </Block>
  );
}

function MiniTransport() {
  const playing = useDJ((s) => s.status === "playing");
  const togglePlay = useDJ((s) => s.togglePlay);
  const next = useDJ((s) => s.next);
  const skipping = useDJ((s) => s.skipping || !!s.meta?.next);
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={togglePlay}
        aria-label={playing ? "Pause" : "Play"}
        className="press grid size-10 place-items-center rounded-full bg-butter text-plum shadow-[0_3px_0_0_#7B2CBF]"
      >
        {playing ? <Pause className="size-4" fill="currentColor" /> : <Play className="ml-0.5 size-4" fill="currentColor" />}
      </button>
      <button
        onClick={next}
        disabled={skipping}
        className="press flex h-10 items-center gap-1.5 rounded-full bg-lavender px-3.5 text-xs font-bold text-plum shadow-[0_3px_0_0_#7B2CBF] disabled:bg-grape disabled:text-lavender disabled:shadow-none"
      >
        <SkipForward className="size-4" fill="currentColor" />
        {skipping ? "Mixing…" : "Next"}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- panel

/** Fraction of the screen the panel covers on desktop (keep in sync with the class below). */
export const DJ_PANEL_FRACTION = 0.58;
export const DJ_PANEL_MAX_PX = 940;

function ResetButton() {
  const resetDJ = useDJ((s) => s.resetDJ);
  const dirty = useDJ(
    (s) =>
      s.loop !== 0 ||
      JSON.stringify(s.fx) !== JSON.stringify(DEFAULT_FX) ||
      Object.values(s.levels).some((v) => v !== 1) ||
      Object.values(s.mutes).some(Boolean),
  );
  // flash "Reset ✓" whenever a reset happens (button or the 0 key)
  const [done, setDone] = useState(false);
  const wasDirty = useRef(dirty);
  useEffect(() => {
    if (wasDirty.current && !dirty) {
      setDone(true);
      const t = setTimeout(() => setDone(false), 1200);
      wasDirty.current = dirty;
      return () => clearTimeout(t);
    }
    wasDirty.current = dirty;
  }, [dirty]);

  return (
    <button
      onClick={resetDJ}
      disabled={!dirty && !done}
      title={dirty ? "Reset filter, EQ, FX, loop and channels (key 0)" : "Nothing to reset"}
      className={`press flex h-10 items-center gap-1.5 rounded-full pl-3 pr-2 text-xs font-bold ${
        done
          ? "bg-butter text-plum"
          : "text-lavender ring-1 ring-lavender/30 hover:text-white disabled:cursor-default disabled:opacity-40 disabled:hover:text-lavender"
      }`}
    >
      {done ? <Check className="size-3.5" strokeWidth={3} /> : <RotateCcw className="size-3.5" />}
      Reset
      <Key dark={done}>0</Key>
    </button>
  );
}

export function DJPanel() {
  const open = useDJ((s) => s.djOpen);
  const toggleDJ = useDJ((s) => s.toggleDJ);
  useDJKeyboard(open);

  return (
    <aside
      aria-hidden={!open}
      className={`pointer-events-auto absolute inset-y-0 right-0 z-20 w-full p-3 transition-transform duration-300 ease-out sm:p-4 lg:w-[min(58vw,940px)] ${
        open ? "translate-x-0" : "translate-x-[105%]"
      }`}
    >
      <div className="card flex h-full flex-col overflow-hidden">
        <header className="flex flex-wrap items-center gap-3 border-b border-lavender/15 px-5 py-3">
          <div>
            <div className="eyebrow">Advanced</div>
            <h2 className="mt-1 font-display text-xl font-black">
              DJ <span className="text-butter">Mode</span>
            </h2>
          </div>
          <span className="hidden items-center gap-1.5 text-[11px] font-semibold text-lavender/70 xl:flex">
            <Key>Z</Key> = press that key on your keyboard
          </span>
          <div className="ml-auto flex items-center gap-2">
            <MiniTransport />
            <ResetButton />
            <button
              onClick={() => toggleDJ(false)}
              aria-label="Close DJ mode"
              className="press grid size-10 place-items-center rounded-full bg-grape text-butter shadow-[0_3px_0_0_#C77DFF]"
            >
              <X className="size-5" strokeWidth={3} />
            </button>
          </div>
        </header>

        <div className="grid flex-1 content-start gap-3 overflow-y-auto p-3 [scrollbar-width:thin] sm:p-4 lg:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-3">
            <Tempo />
            <Performance />
            <Filter />
          </div>
          <div className="flex min-w-0 flex-col gap-3">
            <EQ />
            <Effects />
            <Channels />
          </div>
        </div>
      </div>
    </aside>
  );
}
