// Gapless PCM player running on the audio thread.
// Receives one bar at a time ({type:'chunk', id, l, r}) into a ring buffer and
// reports when each bar actually starts playing (sample-accurate) so the UI
// and visuals stay locked to what you hear.
class PcmPlayer extends AudioWorkletProcessor {
  constructor() {
    super();
    this.cap = sampleRate * 30;
    this.l = new Float32Array(this.cap);
    this.r = new Float32Array(this.cap);
    this.w = 0; // total frames written
    this.rd = 0; // total frames played
    this.marks = []; // bar starts: {id, at}
    this.tick = 0;
    this.port.onmessage = (e) => {
      const m = e.data;
      if (m.type !== "chunk") return;
      const n = m.l.length;
      if (this.w - this.rd + n > this.cap) return; // never happens with sane pulling
      this.marks.push({ id: m.id, at: this.w });
      for (let i = 0; i < n; i++) {
        const k = (this.w + i) % this.cap;
        this.l[k] = m.l[i];
        this.r[k] = m.r[i];
      }
      this.w += n;
    };
  }

  process(_inputs, outputs) {
    const L = outputs[0][0];
    const R = outputs[0][1] || L;
    const n = L.length;
    const k = Math.min(n, this.w - this.rd);
    for (let i = 0; i < k; i++) {
      const j = (this.rd + i) % this.cap;
      L[i] = this.l[j];
      R[i] = this.r[j];
    }
    for (let i = k; i < n; i++) {
      L[i] = 0;
      R[i] = 0;
    }
    while (this.marks.length && this.marks[0].at < this.rd + k) {
      const mk = this.marks.shift();
      this.port.postMessage({ type: "started", id: mk.id, frame: currentFrame + (mk.at - this.rd) });
    }
    this.rd += k;
    if (++this.tick % 12 === 0) {
      this.port.postMessage({ type: "level", buffered: this.w - this.rd, underrun: k < n && this.w > 0 });
    }
    return true;
  }
}

registerProcessor("pcm-player", PcmPlayer);
