import { Play } from "lucide-react";
import type { ReactNode } from "react";
import { useDJ } from "../store";
import { Logo } from "./Brand";
import { TipButton } from "./Donate";

export function StartScreen() {
  const status = useDJ((s) => s.status);
  const start = useDJ((s) => s.start);
  const error = useDJ((s) => s.error);
  if (status === "playing" || status === "paused") return null;
  const starting = status === "starting";

  return (
    <div className="absolute inset-0 grid place-items-center bg-night/45 p-6 backdrop-blur-[2px]">
      <div className="card relative w-full max-w-xl animate-pop p-8 text-center sm:p-10">
        {/* stickers */}
        <span className="absolute -left-4 -top-4 rotate-[-12deg] animate-float rounded-2xl bg-bubblegum px-3 py-1.5 font-display text-xs font-bold text-plum shadow-[0_3px_0_0_#7B2CBF]">
          no samples
        </span>
        <span className="absolute -right-3 top-10 rotate-[10deg] animate-float rounded-2xl bg-butter px-3 py-1.5 font-display text-xs font-bold text-plum shadow-[0_3px_0_0_#7B2CBF] [animation-delay:-2s]">
          130–150 BPM
        </span>

        <div className="flex justify-center">
          <Logo big />
        </div>
        <h1 className="mt-8 font-display text-3xl font-black leading-[1.1] tracking-tight sm:text-4xl">
          Endless <span className="text-lavender">industrial techno</span>, <span className="text-butter">made live</span>{" "}
          for your party.
        </h1>
        <p className="mx-auto mt-4 max-w-md text-base text-white/70">
          Every kick, clang and chant is synthesized on the spot. Nothing is pre-recorded and no two nights sound the
          same.
        </p>

        <button
          onClick={start}
          disabled={starting}
          className="press mx-auto mt-8 flex items-center gap-3 rounded-full bg-butter py-4 pl-6 pr-8 font-display text-lg font-black text-plum shadow-[0_6px_0_0_#7B2CBF] hover:bg-[#fff08f] disabled:opacity-80"
        >
          <span className="grid size-9 place-items-center rounded-full bg-plum text-butter">
            <Play className={`ml-0.5 size-4 ${starting ? "animate-pulse" : ""}`} fill="currentColor" />
          </span>
          {starting ? "Warming up the machines…" : "Start the party"}
        </button>

        {error && <p className="mt-4 text-sm font-medium text-bubblegum">Couldn't start audio: {error}</p>}

        <div className="mt-8 flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-lavender/80">
          <span><Kbd>Space</Kbd> play / pause</span>
          <span><Kbd>→</Kbd> next track</span>
          <span><Kbd>↑</Kbd><Kbd>↓</Kbd> tempo</span>
          <span><Kbd>D</Kbd> DJ mode</span>
          <span><Kbd>double-click</Kbd> visuals only</span>
        </div>

        <div className="mt-6 flex justify-center">
          <TipButton withLabel />
        </div>
      </div>
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="mx-0.5 rounded-md bg-white/10 px-1.5 py-0.5 font-sans text-[11px] font-semibold text-white ring-1 ring-white/15">
      {children}
    </kbd>
  );
}
