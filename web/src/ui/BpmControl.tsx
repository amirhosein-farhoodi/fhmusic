import { Minus, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { features } from "../scene/features";
import { useDJ } from "../store";

/** Button that repeats while held (tap = 1 step, hold = fast). */
function HoldButton({ onStep, label, children }: { onStep: () => void; label: string; children: ReactNode }) {
  const timers = useRef<{ t?: number; i?: number }>({});
  const stop = () => {
    clearTimeout(timers.current.t);
    clearInterval(timers.current.i);
  };
  useEffect(() => stop, []);
  return (
    <button
      aria-label={label}
      onPointerDown={() => {
        onStep();
        timers.current.t = window.setTimeout(() => {
          timers.current.i = window.setInterval(onStep, 90);
        }, 380);
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      className="press grid size-12 place-items-center rounded-full bg-grape text-butter shadow-[0_4px_0_0_#C77DFF] hover:bg-[#8b3bd1]"
    >
      {children}
    </button>
  );
}

/** Four dots flashing on the beat -- driven straight from the audio clock. */
function BeatDots() {
  const refs = useRef<(HTMLSpanElement | null)[]>([]);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const beat = features.playing ? Math.floor(features.step / 4) : -1;
      const frac = (features.step % 4) / 4;
      refs.current.forEach((el, i) => {
        if (!el) return;
        const on = i === beat;
        el.style.opacity = on ? String(1 - frac * 0.7) : "0.18";
        el.style.transform = on ? `scale(${1.35 - frac * 0.35})` : "scale(1)";
      });
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className="flex justify-center gap-1.5">
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          ref={(el) => void (refs.current[i] = el)}
          className={`size-2 rounded-full ${i === 0 ? "bg-bubblegum" : "bg-lavender"}`}
        />
      ))}
    </div>
  );
}

export function BpmControl() {
  const meta = useDJ((s) => s.meta);
  const server = useDJ((s) => s.server);
  const nudge = useDJ((s) => s.nudgeBpm);
  const autoBpm = useDJ((s) => s.autoBpm);

  const live = meta?.bpm ?? server.target_bpm;
  const shown = server.bpm_locked ? server.target_bpm : live;
  const gliding = server.bpm_locked && Math.abs(live - server.target_bpm) > 0.4;

  return (
    <section className="card flex w-full items-center justify-between gap-4 p-3 sm:p-5 lg:w-auto">
      <HoldButton label="Slower" onStep={() => nudge(-1)}>
        <Minus className="size-6" strokeWidth={3} />
      </HoldButton>

      <div className="flex min-w-[124px] flex-col items-center text-center">
        <div className="eyebrow hidden sm:block">Tempo</div>
        <div className="font-display text-4xl font-black leading-none tabular-nums text-butter sm:mt-1 sm:text-5xl">
          {Math.round(shown)}
        </div>
        <div className="mt-1 hidden h-4 text-xs font-medium text-lavender/80 tabular-nums sm:block">
          {gliding ? `gliding · ${live.toFixed(1)}` : "BPM"}
        </div>
        <div className="mt-1.5">
          <BeatDots />
        </div>
        <button
          onClick={server.bpm_locked ? autoBpm : undefined}
          className={`mt-2 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider ${
            server.bpm_locked
              ? "press bg-bubblegum text-plum hover:bg-[#ffc6d4]"
              : "cursor-default text-lavender/70 ring-1 ring-lavender/30"
          }`}
        >
          {server.bpm_locked ? "Manual · reset" : "DJ auto"}
        </button>
      </div>

      <HoldButton label="Faster" onStep={() => nudge(1)}>
        <Plus className="size-6" strokeWidth={3} />
      </HoldButton>
    </section>
  );
}
