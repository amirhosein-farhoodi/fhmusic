import { useEffect } from "react";
import { Scene } from "./scene/Scene";
import { useDJ } from "./store";
import { BpmControl } from "./ui/BpmControl";
import { LivePill, Logo } from "./ui/Brand";
import { StylePicker, Transport } from "./ui/Controls";
import { NowPlaying } from "./ui/NowPlaying";
import { StartScreen } from "./ui/StartScreen";

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || (e.repeat && e.code === "Space")) return;
      const s = useDJ.getState();
      if (e.code === "Space") {
        e.preventDefault();
        if (s.status === "idle") void s.start();
        else s.togglePlay();
      } else if (s.status === "idle") {
        return;
      } else if (e.key === "ArrowRight" || e.key === "n") {
        if (!s.skipping && !s.meta?.next) s.next();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        s.nudgeBpm(e.shiftKey ? 5 : 1);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        s.nudgeBpm(e.shiftKey ? -5 : -1);
      } else if (e.key === "a") {
        s.autoBpm();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

export default function App() {
  useShortcuts();
  const started = useDJ((s) => s.status === "playing" || s.status === "paused");

  return (
    <main className="relative h-full w-full overflow-hidden">
      <Scene />

      <header className="pointer-events-none absolute inset-x-0 top-0 grid grid-cols-[1fr_auto] items-start gap-4 p-4 sm:p-7 lg:grid-cols-[1fr_auto_1fr]">
        <div className="pointer-events-auto">{started && <Logo />}</div>
        <div className="pointer-events-auto hidden lg:block">{started && <StylePicker />}</div>
        <div className="pointer-events-auto justify-self-end">
          <LivePill />
        </div>
      </header>

      {started && (
        <footer className="pointer-events-none absolute inset-x-0 bottom-0 grid items-end gap-3 p-4 sm:gap-4 sm:p-7 lg:grid-cols-[1fr_auto_1fr]">
          <div className="pointer-events-auto order-1 lg:justify-self-start">
            <NowPlaying />
          </div>
          <div className="pointer-events-auto order-3 flex min-w-0 flex-col items-center gap-3 lg:order-2">
            <div className="max-w-full lg:hidden">
              <StylePicker />
            </div>
            <Transport />
          </div>
          <div className="pointer-events-auto order-2 lg:order-3 lg:justify-self-end">
            <BpmControl />
          </div>
        </footer>
      )}

      <StartScreen />
    </main>
  );
}
