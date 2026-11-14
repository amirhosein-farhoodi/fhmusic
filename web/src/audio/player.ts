import type { BarMeta, Hello, ServerState } from "./types";

const SAMPLE_RATE = 48000;
const TARGET_BUFFER_S = 1.0; // pull a new bar when less than this is queued
const APPROX_BAR_S = 1.8;

type Command =
  | { type: "bpm"; value: number }
  | { type: "bpm_auto" }
  | { type: "next" }
  | { type: "style"; value: string | null };

export interface PlayerEvents {
  onHello: (h: Hello) => void;
  onState: (s: ServerState) => void;
  onBar: (m: BarMeta) => void; // a bar started playing (audible)
  onConnection: (connected: boolean) => void;
}

/**
 * Streams bars from the backend over a WebSocket and plays them through an
 * AudioWorklet. Bars are pulled just ahead of playback, so live controls are
 * heard within a bar or two and the music never stops.
 */
class Player {
  ctx: AudioContext | null = null;
  analyser: AnalyserNode | null = null;
  current: BarMeta | null = null;
  private startTime = 0;
  private node: AudioWorkletNode | null = null;
  private ws: WebSocket | null = null;
  private metas = new Map<number, BarMeta>();
  private inflight = 0;
  private buffered = 0;
  private playing = false;
  private events: PlayerEvents | null = null;
  private retry: number | undefined;

  async start(events: PlayerEvents) {
    this.events = events;
    if (!this.ctx) {
      const ctx = new AudioContext({ sampleRate: SAMPLE_RATE, latencyHint: "playback" });
      await ctx.audioWorklet.addModule("/pcm-worklet.js");
      const node = new AudioWorkletNode(ctx, "pcm-player", { numberOfInputs: 0, outputChannelCount: [2] });
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.55;
      node.connect(analyser);
      analyser.connect(ctx.destination);
      node.port.onmessage = (e) => this.onWorklet(e.data);
      Object.assign(this, { ctx, node, analyser });
    }
    this.playing = true;
    await this.ctx!.resume();
    this.connect();
  }

  pause() {
    this.playing = false;
    void this.ctx?.suspend();
  }

  async resume() {
    this.playing = true;
    await this.ctx?.resume();
    this.pump();
  }

  send(cmd: Command) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(cmd));
  }

  /** Position inside the bar that is audible right now (0..1), latency-compensated. */
  barProgress(): number {
    if (!this.ctx || !this.current) return 0;
    const latency = this.ctx.outputLatency || this.ctx.baseLatency || 0;
    return (this.ctx.currentTime - latency - this.startTime) / (this.current.bar_len / SAMPLE_RATE);
  }

  private connect() {
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) return;
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.binaryType = "arraybuffer";
    ws.onopen = () => {
      this.inflight = 0;
      this.events?.onConnection(true);
      this.pump();
    };
    ws.onclose = () => {
      this.events?.onConnection(false);
      this.ws = null;
      clearTimeout(this.retry);
      this.retry = window.setTimeout(() => this.connect(), 1500);
    };
    ws.onmessage = (e) => {
      if (typeof e.data === "string") {
        const msg = JSON.parse(e.data);
        if (msg.type === "hello") this.events?.onHello(msg as Hello);
        else if (msg.type === "state") this.events?.onState(msg as ServerState);
      } else {
        this.onBarData(e.data as ArrayBuffer);
      }
    };
    this.ws = ws;
  }

  private onBarData(buf: ArrayBuffer) {
    this.inflight = Math.max(0, this.inflight - 1);
    const view = new DataView(buf);
    const headLen = view.getUint32(0, true);
    const meta = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, headLen))) as BarMeta;
    const pcm = new Int16Array(buf, 4 + headLen);
    const frames = pcm.length / 2;
    const l = new Float32Array(frames);
    const r = new Float32Array(frames);
    for (let i = 0; i < frames; i++) {
      l[i] = pcm[2 * i] / 32768;
      r[i] = pcm[2 * i + 1] / 32768;
    }
    this.metas.set(meta.id, meta);
    this.buffered += frames;
    this.node?.port.postMessage({ type: "chunk", id: meta.id, l, r }, [l.buffer, r.buffer]);
    this.pump();
  }

  private onWorklet(msg: { type: string; id?: number; frame?: number; buffered?: number }) {
    if (msg.type === "level") {
      this.buffered = msg.buffered ?? 0;
      this.pump();
    } else if (msg.type === "started" && msg.id !== undefined) {
      const meta = this.metas.get(msg.id);
      for (const id of this.metas.keys()) if (id < msg.id) this.metas.delete(id);
      if (meta) {
        this.current = meta;
        this.startTime = (msg.frame ?? 0) / SAMPLE_RATE;
        this.events?.onBar(meta);
      }
    }
  }

  private pump() {
    if (!this.playing || this.ws?.readyState !== WebSocket.OPEN) return;
    const queued = this.buffered / SAMPLE_RATE + this.inflight * APPROX_BAR_S;
    if (queued < TARGET_BUFFER_S && this.inflight < 2) {
      this.inflight++;
      this.ws.send(JSON.stringify({ type: "pull" }));
    }
  }
}

export const player = new Player();
