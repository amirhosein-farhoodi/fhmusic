import { Maximize2, Minimize2, SlidersHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Scene } from "./scene/Scene";
import { useDJ } from "./store";
import { BpmControl } from "./ui/BpmControl";
import { LivePill, Logo } from "./ui/Brand";
import { StylePicker, Transport } from "./ui/Controls";
import { DJPanel } from "./ui/DJPanel";
import { NowPlaying } from "./ui/NowPlaying";
import { StartScreen } from "./ui/StartScreen";

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || (e.repeat && e.code === "Space")) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return; // leave browser shortcuts (Cmd+S, Ctrl+D...) alone
      const s = useDJ.getState();
      if (e.code === "Space") {
        e.preventDefault();
        if (s.status === "idle") void s.start();
        else s.togglePlay();
      } else if (s.status === "idle") {
        return;
      } else if (e.key === "ArrowRight") {
        if (!s.skipping && !s.meta?.next) s.next();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        s.nudgeBpm(e.shiftKey ? 5 : 1);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        s.nudgeBpm(e.shiftKey ? -5 : -1);
      } else if (e.key === "a") {
        s.autoBpm();
      } else if (e.key === "s") {
        s.toggleShape();
      } else if (e.key === "d") {
        s.toggleDJ();
      } else if (e.key === "Escape") {
        if (s.clean) s.setClean(false);
        else s.toggleDJ(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

const IDLE_MS = 2500; // visuals-only mode: controls fade out after this long without the mouse moving
const ENTER_GRACE_MS = 600; // ignore the mouse settling right after the double-click
const MOVE_PX = 6; // ...and tiny jitters

/**
 * Visuals-only mode. Double-click the stage: the UI slides away, the page goes
 * fullscreen and the cursor hides. Moving the mouse (or tapping) brings the
 * controls back for a few seconds; double-click again or press Esc to leave.
 * Returns whether the UI is currently hidden and whether to show the hint.
 */
function useCleanMode() {
  const clean = useDJ((s) => s.clean);
  const [awake, setAwake] = useState(false);
  const [hint, setHint] = useState(false);
  const wentFullscreen = useRef(false);

  useEffect(() => {
    if (!clean) {
      setAwake(false);
      setHint(false);
      if (wentFullscreen.current && document.fullscreenElement) void document.exitFullscreen().catch(() => {});
      wentFullscreen.current = false;
      return;
    }
    const entered = performance.now();
    let timer = 0;
    let last: { x: number; y: number } | null = null;
    const sleepSoon = () => {
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        setAwake(false);
        setHint(false);
      }, IDLE_MS);
    };
    const wake = () => {
      setAwake(true);
      setHint(false); // the controls (with the Visuals button) are back, the hint isn't needed
      sleepSoon();
    };
    const onMove = (e: PointerEvent) => {
      if (performance.now() - entered < ENTER_GRACE_MS) return;
      if (last && Math.hypot(e.clientX - last.x, e.clientY - last.y) < MOVE_PX) return;
      last = { x: e.clientX, y: e.clientY };
      wake();
    };
    // briefly say how to get back, without bringing the controls back
    setHint(true);
    sleepSoon();
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerdown", wake);

    // fullscreen if the browser allows it; leaving fullscreen (e.g. with Esc) leaves the mode too
    const el = document.documentElement;
    if (!document.fullscreenElement && el.requestFullscreen) {
      el.requestFullscreen({ navigationUI: "hide" }).then(
        () => void (wentFullscreen.current = true),
        () => {},
      );
    }
    const onFs = () => {
      if (!document.fullscreenElement && wentFullscreen.current) {
        wentFullscreen.current = false;
        useDJ.getState().setClean(false);
      }
    };
    document.addEventListener("fullscreenchange", onFs);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", wake);
      document.removeEventListener("fullscreenchange", onFs);
    };
  }, [clean]);

  return { hidden: clean && !awake, hint: clean && hint };
}

function CleanHint() {
  const setClean = useDJ((s) => s.setClean);
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-center p-4 sm:p-7">
      <button
        onClick={() => setClean(false)}
        className="card pointer-events-auto flex animate-pop items-center gap-2 !rounded-full px-4 py-2 text-xs font-semibold text-white/85 hover:text-butter"
      >
        <Maximize2 className="size-3.5 shrink-0 text-butter" strokeWidth={2.5} />
        <span className="sm:hidden">Visuals only · tap to bring the controls back</span>
        <span className="hidden sm:inline">
          Visuals only · double-click or <span className="font-bold text-butter">Esc</span> to bring the controls back
        </span>
      </button>
    </div>
  );
}

/** Briefly names the centre piece's shape when S switches it. */
function ShapeToast() {
  const shape = useDJ((s) => s.shape);
  const prev = useRef(shape);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (prev.current === shape) return; // mount (incl. StrictMode's double run): nothing changed
    prev.current = shape;
    setShown(true);
    const t = window.setTimeout(() => setShown(false), 1600);
    return () => clearTimeout(t);
  }, [shape]);
  if (!shown) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[22%] z-30 flex justify-center">
      <div key={shape} className="card flex animate-pop items-center gap-2 !rounded-full px-4 py-2 text-sm font-bold">
        <span className="text-white/70">Shape</span>
        <span className="text-butter">{shape === "star" ? "Starburst" : "Soda blob"}</span>
        <span className="text-xs font-semibold text-lavender/80">· press S to switch</span>
      </div>
    </div>
  );
}

function VisualsButton() {
  const clean = useDJ((s) => s.clean);
  const setClean = useDJ((s) => s.setClean);
  return (
    <button
      onClick={() => setClean(!clean)}
      title="Visuals only (double-click the stage)"
      className={`press flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2.5 text-sm font-bold ${
        clean ? "bg-butter text-plum shadow-[0_3px_0_0_#7B2CBF]" : "card !rounded-full text-white hover:text-butter"
      }`}
    >
      {clean ? <Minimize2 className="size-4" strokeWidth={2.5} /> : <Maximize2 className="size-4" strokeWidth={2.5} />}
      <span className="hidden sm:inline">{clean ? "Exit visuals" : "Visuals"}</span>
    </button>
  );
}

function DJButton() {
  const open = useDJ((s) => s.djOpen);
  const toggleDJ = useDJ((s) => s.toggleDJ);
  return (
    <button
      onClick={() => toggleDJ()}
      className={`press flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2.5 text-sm font-bold ${
        open ? "bg-butter text-plum shadow-[0_3px_0_0_#7B2CBF]" : "card !rounded-full text-white hover:text-butter"
      }`}
    >
      <SlidersHorizontal className="size-4" strokeWidth={2.5} />
      <span>DJ Mode</span>
    </button>
  );
}

export default function App() {
  useShortcuts();
  const started = useDJ((s) => s.status === "playing" || s.status === "paused");
  const djOpen = useDJ((s) => s.djOpen);
  const { hidden, hint } = useCleanMode();

  return (
    <main
      className="relative h-full w-full overflow-hidden"
      data-ui={hidden ? "hidden" : undefined}
      onDoubleClick={(e) => {
        // only the empty stage, never a card or button
        if (!started || !(e.target instanceof HTMLCanvasElement)) return;
        const s = useDJ.getState();
        s.setClean(!s.clean);
      }}
    >
      <Scene />

      <header className="ui-layer ui-top pointer-events-none absolute inset-x-0 top-0 grid grid-cols-[1fr_auto] items-start gap-4 p-4 sm:p-7 lg:grid-cols-[1fr_auto_1fr]">
        <div className="pointer-events-auto">{started && <Logo />}</div>
        <div className="pointer-events-auto hidden lg:block">{started && !djOpen && <StylePicker />}</div>
        <div className="pointer-events-auto flex items-center gap-2 justify-self-end">
          {started && <VisualsButton />}
          {started && <DJButton />}
          <div className="hidden sm:block">
            <LivePill />
          </div>
        </div>
      </header>

      {started && (
        <footer className="ui-layer ui-bottom pointer-events-none absolute inset-x-0 bottom-0 grid items-end gap-3 p-4 sm:gap-4 sm:p-7 lg:grid-cols-[1fr_auto_1fr]">
          <div className="pointer-events-auto order-1 lg:justify-self-start">
            <NowPlaying />
          </div>
          <div className={`pointer-events-auto order-3 flex min-w-0 flex-col items-center gap-3 lg:order-2 ${djOpen ? "lg:invisible" : ""}`}>
            <div className="max-w-full lg:hidden">
              <StylePicker />
            </div>
            <Transport />
          </div>
          <div className={`pointer-events-auto order-2 lg:order-3 lg:justify-self-end ${djOpen ? "invisible" : ""}`}>
            <BpmControl />
          </div>
        </footer>
      )}

      {started && (
        <div className="pointer-events-none absolute inset-0 z-20">
          <DJPanel />
        </div>
      )}

      {started && hint && <CleanHint />}
      {started && <ShapeToast />}

      <StartScreen />
    </main>
  );
}
