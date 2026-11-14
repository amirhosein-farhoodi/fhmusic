/** One bar of the live set, as described by the Python engine. */
export interface BarMeta {
  id: number;
  track_no: number;
  track: string;
  style: string;
  style_key: string;
  key: string;
  section: string;
  bar: number;
  bars: number;
  energy: number;
  layers: string[];
  bpm: number;
  target_bpm: number;
  bpm_locked: boolean;
  locked_style: string | null;
  bar_len: number;
  kicks: number[]; // kick positions as fractions of the bar
  next?: string;
}

export interface StyleInfo {
  key: string;
  name: string;
  bpm: [number, number];
}

export interface ServerState {
  target_bpm: number;
  bpm_locked: boolean;
  locked_style: string | null;
}

export interface Hello extends ServerState {
  type: "hello";
  sample_rate: number;
  bpm_range: [number, number];
  styles: StyleInfo[];
}
