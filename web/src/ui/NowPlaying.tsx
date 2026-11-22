import { useDJ } from "../store";

const SECTION_LABEL: Record<string, string> = {
  intro: "Intro",
  groove: "Groove",
  tension: "Building up",
  peak: "Peak",
  breakdown: "Breakdown",
  break: "Break",
  stripped: "Stripped",
  outro: "Outro",
};

export function NowPlaying() {
  const meta = useDJ((s) => s.meta);
  if (!meta) return <div className="hidden lg:block" />;

  const segments = Math.min(meta.bars, 32);
  const done = Math.round((meta.bar / meta.bars) * segments);
  const energy = Math.round(meta.energy * 8);

  return (
    <section className="card w-full animate-pop p-4 sm:p-6 lg:w-[400px]" key={meta.track_no}>
      <div className="eyebrow">Now playing</div>
      <h2 className="mt-2 truncate font-display text-xl font-extrabold leading-tight sm:text-3xl">{meta.track}</h2>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="-rotate-2 rounded-xl bg-butter px-3 py-1 text-sm font-bold text-plum shadow-[0_3px_0_0_#7B2CBF]">
          {meta.style}
        </span>
        <span className="rotate-1 rounded-xl px-3 py-1 text-sm font-semibold text-bubblegum ring-2 ring-bubblegum/60">
          {meta.key}
        </span>
      </div>

      <div className="mt-3 flex items-end justify-between sm:mt-5">
        <div>
          <div className="eyebrow">Section</div>
          <div className="mt-1.5 flex items-center gap-2 font-display text-lg font-bold">
            {SECTION_LABEL[meta.section] ?? meta.section}
            {meta.loop > 0 && (
              <span className="animate-pulse rounded-lg bg-butter px-2 py-0.5 font-sans text-[11px] font-bold uppercase tracking-wider text-plum">
                Looping {meta.loop} bar{meta.loop > 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="eyebrow">Energy</div>
          <div className="mt-2 flex gap-1">
            {Array.from({ length: 8 }, (_, i) => (
              <span
                key={i}
                className={`h-3 w-1.5 rounded-full transition-colors duration-500 ${i < energy ? "bg-bubblegum" : "bg-white/10"}`}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 flex gap-[3px]">
        {Array.from({ length: segments }, (_, i) => (
          <span
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i === done - 1 ? "bg-butter" : i < done ? "bg-lavender" : "bg-white/10"
            }`}
          />
        ))}
      </div>

      {meta.next && (
        <div className="mt-4 flex animate-pop items-center gap-2 rounded-2xl bg-grape/60 px-3.5 py-2.5 text-sm ring-2 ring-lavender/40">
          <span className="font-display text-xs font-bold uppercase tracking-wider text-butter">Mixing in</span>
          <span className="truncate font-semibold">{meta.next}</span>
        </div>
      )}
    </section>
  );
}
