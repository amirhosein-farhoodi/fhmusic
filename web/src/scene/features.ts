import * as THREE from "three";

/**
 * Live audio features, updated once per frame by <AudioDriver/> and read by
 * every visual. A plain mutable object (not React state) so 60fps updates
 * never re-render React.
 *
 * Two kinds of signal feed it:
 *  - the engine's own timeline (bar position, kick times, section, energy), which is exact, and
 *  - the analyser after the DJ effects (bands, snare / hat onsets), so filter sweeps, EQ kills
 *    and mutes show up in the visuals too.
 */
export const features = {
  // ---- spectrum (0..1, smoothed)
  bass: 0, // low end (kick + bass)
  mid: 0,
  high: 0, // hats / noise
  spectrum: new Float32Array(32), // log-spaced bands, bass first (0..1, smoothed)

  // ---- hits (1 on the hit, then decay)
  kick: 0, // exact, from the engine's kick positions
  snare: 0, // onset detected in the snare / clap band
  hat: 0, // onset detected in the hat band
  beatPulse: 0, // every quarter note, kick or not

  // ---- timeline
  step: 0, // 0..16 position in the bar, in 16ths
  beat: 0, // 0..4 position in the bar, in beats
  barProgress: 0, // 0..1
  phrase: 0, // counts 8-bar phrases and section changes (the visuals "re-cut" on each)
  bpm: 135,
  section: "intro",

  // ---- structure (0..1, smoothed)
  energy: 0.3, // section energy from the engine
  build: 0, // progress through a build-up ("tension"), rising into the drop
  drop: 0, // 1 the moment a drop lands, decays over ~2 bars
  calm: 0, // breakdowns and breaks: no drums, music floating
  mood: 0.4, // 0 dreamy .. 1 hot (peak)

  playing: false,
  time: 0, // music-driven clock (runs faster at higher BPM)
  motion: 1, // 1 = full motion, lower when the viewer prefers reduced motion
  clean: 0, // 0..1, visuals-only mode (UI hidden): the camera re-frames the scene
};

/**
 * Additive "light" blending that leaves the canvas alpha untouched. Plain
 * AdditiveBlending also adds to alpha, which makes the (transparent) canvas
 * opaque wherever a glow covers it and shows the glow's edge as a hard line
 * against the page background. Shaders using this output premultiplied colour.
 */
export const LIGHT_BLENDING = {
  blending: THREE.CustomBlending,
  blendEquation: THREE.AddEquation,
  blendSrc: THREE.OneFactor,
  blendDst: THREE.OneFactor,
  blendSrcAlpha: THREE.ZeroFactor,
  blendDstAlpha: THREE.OneFactor,
} as const;

export const PALETTE = {
  grape: "#7B2CBF",
  lavender: "#C77DFF",
  bubblegum: "#FFB3C6",
  butter: "#FFE66D",
  plum: "#2D1E2F",
} as const;
