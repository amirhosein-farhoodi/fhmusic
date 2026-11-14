/**
 * Live audio features, updated once per frame by <AudioDriver/> and read by
 * every visual. A plain mutable object (not React state) so 60fps updates
 * never re-render React.
 */
export const features = {
  bass: 0, // 0..1 low end (kick + bass)
  mid: 0, // 0..1
  high: 0, // 0..1 hats / noise
  kick: 0, // 1 on each kick, decays
  step: 0, // 0..16 position in the bar, in 16ths
  barProgress: 0, // 0..1
  energy: 0.3, // section energy from the engine
  bpm: 135,
  section: "intro",
  playing: false,
  time: 0, // music-driven clock (runs faster at higher BPM)
};

export const PALETTE = {
  grape: "#7B2CBF",
  lavender: "#C77DFF",
  bubblegum: "#FFB3C6",
  butter: "#FFE66D",
  plum: "#2D1E2F",
} as const;
