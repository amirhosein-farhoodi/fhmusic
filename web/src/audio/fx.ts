/**
 * DJ master effects, running in the browser so every move is instant.
 *
 *   input → EQ (low / mid / high) → DJ filter (LP ← 0 → HP) ─┬─ dry ──────────┬→ output
 *                                                           ├─ echo (synced) ┤
 *                                                           └─ reverb ───────┘
 */
export interface FxSettings {
  filter: number; // -1 (low-pass) .. 0 (off) .. 1 (high-pass)
  low: number; // dB, -24..+6
  mid: number;
  high: number;
  kill: { low: boolean; mid: boolean; high: boolean };
  echo: number; // 0..1 send
  echoBeats: number; // echo time in beats (0.25, 0.5, 0.75, 1)
  reverb: number; // 0..1 send
}

export const DEFAULT_FX: FxSettings = {
  filter: 0,
  low: 0,
  mid: 0,
  high: 0,
  kill: { low: false, mid: false, high: false },
  echo: 0,
  echoBeats: 0.75,
  reverb: 0,
};

const KILL_DB = -48;
const SMOOTH = 0.03; // seconds; fast but click-free

export class MasterFx {
  readonly input: GainNode;
  readonly output: GainNode;
  private ctx: AudioContext;
  private low: BiquadFilterNode;
  private mid: BiquadFilterNode;
  private high: BiquadFilterNode;
  private lp: BiquadFilterNode;
  private hp: BiquadFilterNode;
  private echoSend: GainNode;
  private delay: DelayNode;
  private feedback: GainNode;
  private revSend: GainNode;
  private bpm = 135;
  private beats = DEFAULT_FX.echoBeats;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    const g = (v = 1) => {
      const n = ctx.createGain();
      n.gain.value = v;
      return n;
    };
    const bq = (type: BiquadFilterType, freq: number, q = 0.7) => {
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      return f;
    };

    this.input = g();
    this.output = g();
    this.low = bq("lowshelf", 220);
    this.mid = bq("peaking", 1000, 0.8);
    this.high = bq("highshelf", 4000);
    this.lp = bq("lowpass", 20000);
    this.hp = bq("highpass", 10);
    this.input.connect(this.low).connect(this.mid).connect(this.high).connect(this.lp).connect(this.hp);
    this.hp.connect(this.output);

    // beat-synced echo with a darkening feedback loop
    this.echoSend = g(0);
    this.delay = ctx.createDelay(4);
    this.feedback = g(0.45);
    const darken = bq("lowpass", 3500);
    this.hp.connect(this.echoSend).connect(this.delay).connect(darken).connect(this.feedback).connect(this.delay);
    this.delay.connect(this.output);

    // reverb: a generated 'big room' impulse response
    this.revSend = g(0);
    const conv = ctx.createConvolver();
    conv.buffer = this.impulse(3.2);
    this.hp.connect(this.revSend).connect(conv).connect(this.output);

    this.updateDelay();
  }

  apply(fx: FxSettings) {
    const t = this.ctx.currentTime;
    const set = (p: AudioParam, v: number) => p.setTargetAtTime(v, t, SMOOTH);

    set(this.low.gain, fx.kill.low ? KILL_DB : fx.low);
    set(this.mid.gain, fx.kill.mid ? KILL_DB : fx.mid);
    set(this.high.gain, fx.kill.high ? KILL_DB : fx.high);

    // one-knob DJ filter: exponential sweep, a little resonance as it closes
    const v = Math.max(-1, Math.min(1, fx.filter));
    const dead = Math.abs(v) < 0.03;
    set(this.lp.frequency, !dead && v < 0 ? 20000 * Math.pow(180 / 20000, -v) : 20000);
    set(this.hp.frequency, !dead && v > 0 ? 20 * Math.pow(6000 / 20, v) : 10);
    const q = dead ? 0.7 : 0.7 + Math.abs(v) * 2.8;
    set(this.lp.Q, v < 0 ? q : 0.7);
    set(this.hp.Q, v > 0 ? q : 0.7);

    set(this.echoSend.gain, fx.echo * 0.9);
    set(this.feedback.gain, 0.3 + fx.echo * 0.35);
    set(this.revSend.gain, fx.reverb * 0.8);
    this.beats = fx.echoBeats;
    this.updateDelay();
  }

  setBpm(bpm: number) {
    if (Math.abs(bpm - this.bpm) < 0.05) return;
    this.bpm = bpm;
    this.updateDelay();
  }

  private updateDelay() {
    this.delay.delayTime.setTargetAtTime((60 / this.bpm) * this.beats, this.ctx.currentTime, 0.05);
  }

  private impulse(seconds: number) {
    const n = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(2, n, this.ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3.2);
    }
    return buf;
  }
}
