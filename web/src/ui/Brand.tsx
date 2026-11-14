import { useDJ } from "../store";

export function Logo({ big = false }: { big?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={`relative grid shrink-0 -rotate-6 place-items-center rounded-2xl bg-grape shadow-[0_4px_0_0_#C77DFF] ${big ? "size-16" : "size-11"}`}
      >
        <div className={`rounded-full bg-lavender ${big ? "size-8" : "size-5"}`} />
        <div className={`absolute rounded-full bg-butter ${big ? "size-3" : "size-2"}`} />
        <span className={`absolute -right-1 -top-1 rounded-full bg-bubblegum ${big ? "size-4" : "size-3"}`} />
      </div>
      <div>
        <div className={`font-display font-black leading-none tracking-tight ${big ? "text-4xl" : "text-xl"}`}>
          fh<span className="text-butter">music</span>
        </div>
        <div className={`eyebrow mt-1.5 !text-[10px] ${big ? "" : "hidden sm:block"}`}>industrial · generated live</div>
      </div>
    </div>
  );
}

export function LivePill() {
  const status = useDJ((s) => s.status);
  const connected = useDJ((s) => s.connected);
  const trackNo = useDJ((s) => s.meta?.track_no);
  if (status === "idle" || status === "starting") return null;

  const [label, dot] = !connected
    ? ["Reconnecting", "bg-butter"]
    : status === "paused"
      ? ["Paused", "bg-lavender"]
      : ["Live", "bg-bubblegum"];

  return (
    <div className="card flex items-center gap-2.5 !rounded-full px-4 py-2.5 text-sm font-semibold">
      <span className="relative flex size-2.5">
        {status === "playing" && connected && (
          <span className={`absolute inline-flex size-full animate-ping rounded-full opacity-75 ${dot}`} />
        )}
        <span className={`relative inline-flex size-2.5 rounded-full ${dot}`} />
      </span>
      <span className="uppercase tracking-[0.2em]">{label}</span>
      {trackNo && <span className="hidden text-lavender/70 sm:inline">· set track {trackNo}</span>}
    </div>
  );
}
