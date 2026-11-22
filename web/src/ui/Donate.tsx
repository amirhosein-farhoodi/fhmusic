import { Check, Copy, Heart, Wallet, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DONATE_AMOUNTS, DONATE_NETWORKS, NoWalletError, RejectedError, sendTip, type DonateNetwork } from "../donate";

/**
 * "Tip the DJ": a small heart pill that opens a soda-styled card. It stays out of the
 * way of the visuals — icon only during the party, and it hides with the rest of the
 * UI in visuals-only mode.
 */
export function TipButton({ withLabel = false }: { withLabel?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Tip the DJ"
        aria-label="Tip the DJ"
        className={
          withLabel
            ? "press mx-auto flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-lavender/80 ring-1 ring-lavender/25 hover:text-bubblegum hover:ring-bubblegum/50"
            : "card press grid size-[42px] place-items-center !rounded-full text-bubblegum hover:text-butter"
        }
      >
        <Heart className={withLabel ? "size-3.5" : "size-4"} strokeWidth={2.5} fill="currentColor" />
        {withLabel && <span>Like it? Tip the DJ</span>}
      </button>
      {open && createPortal(<TipDialog onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

type Status =
  | { kind: "idle" }
  | { kind: "working"; step: string }
  | { kind: "sent"; hash: string }
  | { kind: "error"; message: string };

const STEPS: Record<string, string> = {
  connect: "Waiting for your wallet…",
  switch: "Switching MetaMask to Ethereum mainnet…",
  confirm: "Confirm the amount in your wallet…",
};

function TipDialog({ onClose }: { onClose: () => void }) {
  const [netId, setNetId] = useState<DonateNetwork["id"]>("eth");
  const [amount, setAmount] = useState(3);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [copied, setCopied] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const net = DONATE_NETWORKS.find((n) => n.id === netId) ?? DONATE_NETWORKS[0];
  const busy = status.kind === "working";

  useEffect(() => closeRef.current?.focus(), []);
  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  const pick = (fn: () => void) => () => {
    fn();
    setStatus({ kind: "idle" });
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(net.address);
      setCopied(true);
    } catch {
      window.prompt("Copy the address:", net.address);
    }
  };

  const pay = async () => {
    try {
      const hash = await sendTip(net, amount, (step) => setStatus({ kind: "working", step }));
      setStatus({ kind: "sent", hash });
    } catch (e) {
      if (e instanceof RejectedError) return setStatus({ kind: "idle" });
      setStatus({
        kind: "error",
        message:
          e instanceof NoWalletError
            ? net.id === "eth"
              ? "MetaMask isn't in this browser. Copy the address instead."
              : "TronLink isn't in this browser. Copy the address and pay from any TRC-20 wallet."
            : (e as Error).message,
      });
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-night/55 p-4 backdrop-blur-[2px]"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      // keep Space / arrows / D from reaching the DJ shortcuts while this is open
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") onClose();
      }}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="tip-title" className="card relative w-full max-w-md animate-pop p-6 select-text sm:p-8">
        <span className="absolute -left-3 -top-3 rotate-[-10deg] rounded-2xl bg-bubblegum px-3 py-1.5 font-display text-xs font-bold text-plum shadow-[0_3px_0_0_#7B2CBF]">
          optional
        </span>
        <button
          ref={closeRef}
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 grid size-8 place-items-center rounded-full text-white/60 hover:bg-white/10 hover:text-white"
        >
          <X className="size-4" strokeWidth={2.5} />
        </button>

        <div className="eyebrow">Tip the DJ</div>
        <h2 id="tip-title" className="mt-2 font-display text-2xl font-black leading-tight">
          Keep the <span className="text-butter">machines</span> running
        </h2>
        <p className="mt-2 text-sm text-white/70">
          fhmusic is free, no ads, no accounts. If it got your party going, a small USDT tip helps. Nothing is locked
          behind it.
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          {DONATE_AMOUNTS.map((a) => (
            <button
              key={a}
              onClick={pick(() => setAmount(a))}
              disabled={busy}
              aria-pressed={amount === a}
              className={`press min-w-12 rounded-full px-3.5 py-2 text-sm font-bold ${
                amount === a ? "bg-butter text-plum shadow-[0_3px_0_0_#7B2CBF]" : "bg-white/8 text-white ring-1 ring-white/15 hover:text-butter"
              }`}
            >
              ${a}
            </button>
          ))}
        </div>

        <div className="mt-3 inline-flex gap-1 rounded-full bg-night/60 p-1 ring-1 ring-lavender/20">
          {DONATE_NETWORKS.map((n) => (
            <button
              key={n.id}
              onClick={pick(() => setNetId(n.id))}
              disabled={busy}
              aria-pressed={netId === n.id}
              className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors ${
                netId === n.id ? "bg-lavender text-plum" : "text-white/70 hover:text-white"
              }`}
            >
              {n.label} <span className="opacity-70">{n.short}</span>
            </button>
          ))}
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-2xl bg-night/60 py-1.5 pl-4 pr-1.5 ring-1 ring-lavender/20">
          <code title={net.address} className="min-w-0 flex-1 truncate font-mono text-xs text-white/85">
            {net.address}
          </code>
          <button
            onClick={() => void copy()}
            className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold hover:text-butter"
          >
            {copied ? <Check className="size-3.5" strokeWidth={3} /> : <Copy className="size-3.5" strokeWidth={2.5} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>

        <button
          onClick={() => void pay()}
          disabled={busy}
          className="press mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-butter py-3 font-display text-base font-black text-plum shadow-[0_5px_0_0_#7B2CBF] hover:bg-[#fff08f] disabled:opacity-80"
        >
          <Wallet className="size-4" strokeWidth={2.5} />
          {busy ? "Waiting for wallet…" : `Send $${amount} with ${net.wallet}`}
        </button>

        <p className="mt-3 text-center text-xs text-lavender/75">
          {net.id === "eth"
            ? "Opens MetaMask on Ethereum. You confirm the amount and pay the network fee."
            : "TRON needs TronLink or any TRC-20 wallet. Copying the address works everywhere."}
        </p>

        <div aria-live="polite" className="text-center text-sm">
          {status.kind === "working" && <p className="mt-3 text-white/70">{STEPS[status.step] ?? "Waiting for wallet…"}</p>}
          {status.kind === "sent" && (
            <p className="mt-3 font-semibold text-butter">
              Thank you!{" "}
              <a href={net.explorer + status.hash} target="_blank" rel="noreferrer noopener" className="underline underline-offset-4">
                View the transaction
              </a>
            </p>
          )}
          {status.kind === "error" && <p className="mt-3 font-medium text-bubblegum">{status.message}</p>}
        </div>
      </div>
    </div>
  );
}
