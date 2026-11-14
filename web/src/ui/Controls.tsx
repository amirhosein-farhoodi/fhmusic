import { Pause, Play, SkipForward } from "lucide-react";
import { useDJ } from "../store";

export function Transport() {
  const status = useDJ((s) => s.status);
  const togglePlay = useDJ((s) => s.togglePlay);
  const next = useDJ((s) => s.next);
  const skipping = useDJ((s) => s.skipping || !!s.meta?.next);
  const playing = status === "playing";

  return (
    <div className="card flex items-center gap-3 !rounded-full p-2.5 pr-3">
      <button
        onClick={togglePlay}
        aria-label={playing ? "Pause" : "Play"}
        className="press grid size-16 place-items-center rounded-full bg-butter text-plum shadow-[0_5px_0_0_#7B2CBF] hover:bg-[#fff08f]"
      >
        {playing ? <Pause className="size-7" fill="currentColor" /> : <Play className="ml-1 size-7" fill="currentColor" />}
      </button>
      <button
        onClick={next}
        disabled={skipping}
        aria-label="Next track"
        className="press group flex h-12 items-center gap-2 rounded-full bg-lavender pl-4 pr-5 font-display text-sm font-bold text-plum shadow-[0_4px_0_0_#7B2CBF] hover:bg-[#d495ff] disabled:cursor-default disabled:bg-grape disabled:text-lavender disabled:shadow-none"
      >
        <SkipForward className={`size-5 ${skipping ? "animate-pulse" : ""}`} fill="currentColor" />
        {skipping ? "Mixing…" : "Next"}
      </button>
    </div>
  );
}

export function StylePicker() {
  const styles = useDJ((s) => s.styles);
  const locked = useDJ((s) => s.server.locked_style);
  const setStyle = useDJ((s) => s.setStyle);
  if (!styles.length) return null;

  const chips = [{ key: null as string | null, name: "Auto mix" }, ...styles];
  return (
    <div className="flex max-w-full gap-2 overflow-x-auto px-1 pb-2 pt-1 [scrollbar-width:none]">
      {chips.map((s) => {
        const active = locked === s.key;
        return (
          <button
            key={s.key ?? "auto"}
            onClick={() => setStyle(s.key)}
            className={`press shrink-0 rounded-full px-4 py-2 text-sm font-semibold whitespace-nowrap ${
              active
                ? "bg-butter text-plum shadow-[0_3px_0_0_#7B2CBF]"
                : "bg-plum/70 text-lavender ring-2 ring-lavender/25 backdrop-blur-md hover:-translate-y-0.5 hover:text-white hover:ring-lavender/60"
            }`}
          >
            {s.name}
          </button>
        );
      })}
    </div>
  );
}
