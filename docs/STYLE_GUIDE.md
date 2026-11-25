# Industrial Techno Style Guide

AutoDJ turns this guide into code. Part 1 summarizes how industrial techno
producers work, based on interviews and production breakdowns (sources at the
end). Part 2 defines the scales and rules the engine uses.

## 1. How the producers do it

### Shared techniques
| Technique | What it means | Who it comes from |
|---|---|---|
| **Stable pulse, moving details** | The kick never changes. Everything around it keeps shifting. | Surgeon |
| **Polymeter** | Several sequencers run at different lengths (for example 16, 12 and 24 steps), so the patterns drift against each other and the full combination takes many bars to repeat. | Surgeon (modular practice) |
| **Probability and per-voice modulation** | Each element has its own LFO or random source at a different speed, so filter, decay, gate and pan move constantly. | Surgeon, Blawan |
| **Distortion as a core design element** | Distortion is part of the sound from the start, not a final polish step. | Surgeon, Perc, Blawan |
| **Sound becomes rhythm** | Percussion is built from noise, clicks, resonant filter pings and FM clangs instead of drum-machine samples. | Blawan |
| **Gradual evolution** | One element at a time changes slightly (more pressure, more distortion, starts to break apart) instead of big jumps. | Blawan |
| **Rumble kick** | The kick goes through a long dark reverb, then distortion and a low-pass filter, and is side-chained to the dry kick. | Standard technique (Attack Magazine, MusicRadar) |
| **Heavy compression and side-chaining** | The pumping is used deliberately as a sound. | Paula Temple |
| **Parallel compression and distortion pedals** | Kicks and snares are hit hard, with pedals used as instruments. | Perc |
| **Call and response, bar-by-bar variation** | Bars 2 and 4 get extra open hats or FX; the groove answers itself. | Attack Magazine breakdown |
| **Subtractive arrangement** | Parts arrive and leave slowly, so their absence is felt. Includes fake drops before the real one. | Hard techno practice |

### Harmony
- Minor modes: **Phrygian** (the flat 2nd gives the dark, uneasy sound), **Aeolian**, **Locrian**, and **Phrygian dominant** for the exotic EBM and rave edge.
- Dissonant intervals such as the minor 2nd, tritone and flat 6th; static **pedal tones** and drones.
- Short 1–2 note **stabs**, sparse motifs, and resonant filters that open over time.
- Basslines are tightly sequenced (the EBM tradition: 16th notes with octave jumps).

## 2. The scale system

Every track is a point on these **0–1 scales**. A track takes the values of one
of five style profiles, plus random variation of ±0.12 on each scale. That
makes every track different, while the set still holds together.

| Scale | 0 means | 1 means | What it controls in the engine |
|---|---|---|---|
| `distortion` | clean, round | shredded | Kick, bass and lead drive; kick tone; rumble drive |
| `noise` | no noise | noise percussion everywhere | Noise-hit lane (bit-crushed bursts) |
| `rumble` | dry kick | huge rumble | Kick send to the rumble reverb |
| `groove` | straight 16 steps | heavy polymeter | Lane lengths (16 vs 6/8/12/24/32 steps; beat-aligned so it never sounds out of sync), ghost notes, perc3 |
| `swing` | straight | shuffled | Delay on off-beat 16ths for hats and percussion |
| `melody` | no melody | lead + arpeggio | Probability that the track has a lead motif or arpeggio |
| `harmony` | no chords | pads + stabs | Probability of a pad progression or chord stabs |
| `voice` | none | chants | Probability of formant-synthesized vocal chants |
| `space` | small room | cathedral | Reverb size and wet level |
| `breaks` | never stops | stops often | How often the music stops, cuts out or goes into a break |

### Style profiles
| Profile | BPM | Character | Influences |
|---|---|---|---|
| **Hypnotic Warehouse** | 130–138 | Long loops, polymeter, rumble, almost no melody | Surgeon, Regis, Berlin warehouse sound |
| **Noise Assault** | 138–150 | Max distortion, noise percussion, relentless | Perc, Paula Temple |
| **EBM Body** | 126–136 | 16th-note square bass, chants, swing | EBM / post-industrial revival |
| **Rave Industrial** | 138–148 | Pads, arpeggios, emotional breaks, big drops | Modern rave-influenced industrial |
| **Modular Mutant** | 128–140 | Maximum polymeter, pings and clangs, odd sounds | Blawan, modular techno |

### Rules for avoiding repetition
1. **Polymetric lanes**: hats, three percussion lanes, noise, bass, lead, arpeggio and voice each have their own loop length.
2. **Modulation**: each voice has a modulator (sine LFO plus random walk, with periods of 4–24 bars) that picks from 6 pre-rendered timbre variants and moves cutoff and pan.
3. **Layer rotation**: every 8 bars, 1–2 optional layers enter and about one leaves, never a full reshuffle.
4. **Motif development**: the lead and voice motifs vary every 16–32 bars (transpose, invert, rotate, thin).
5. **Arrangement grammar**: sections are generated, not fixed: intro, groove, tension, peak, breakdown, break, stripped and outro, in a different order and with different lengths for each track.
6. **Events**: phrase-end fills, drum cuts, full stops (silence), kick rolls, risers, a moment of silence before the drop, and impacts.
7. **DJ transitions**: the next track is in a compatible key (same root, a fourth or a fifth: harmonic mixing) and fades in under the outro with its low EQ cut (thin kick, no bass). Halfway through the lows swap, the outgoing track fades out, and the tempo glides to the new BPM.
8. **Bass out before the drop**: half the tension sections play a thin kick with no bass or rumble for their last 2 bars, so the drop lands with the full low end.
9. **Set arc**: intensity warms up over the first 3 tracks, then wanders. Style choice follows intensity and avoids repeating the previous style.

## 3. Mix and master

Measured on rendered sets (EBU R128 loudness, band energy, stereo correlation) and tuned against
typical club-techno masters. The numbers are what the engine aims for:

| What | Target | How |
|---|---|---|
| Kick | Leads the mix, but bass and music are heard under it | `KICK_LEVEL`, `BASS_LEVEL`; side-chain ducks about -8 dB (`SC_DEPTH`) |
| Kick sound | Full for ~100 ms, about -10 dB at 200 ms, below -20 dB by the next beat; neither dull nor fizzy | Envelope after the distortion, parallel clean sub, and each kick design is auditioned and re-rolled if it fails (`synth.kick_quality`) |
| Loudness | About -8 LUFS integrated, -1 dBTP | Master: mono below 120 Hz, soft clipper, 3 ms look-ahead limiter |
| Width | Low end mono; above 500 Hz the side is about -8 to -13 dB under the mid | Hats panned apart, percussion spread, stereo reverb returns |
| Groove | Kick and bass exactly on the grid; hats and percussion drift ~1 ms with small level changes | `HUMAN_MS`, per-hit velocity |
| Breakdowns | A few LU under the peak, standing on a chord bed | The pad always plays in a breakdown when the track has one |

## Sources
- [Gearnews: Surgeon's synths and techniques](https://www.gearnews.com/techno-legends-gear-surgeon-synths/)
- [Gearnews: Blawan's techno sound](https://www.gearnews.com/blawan-techno-sound-synths-studio/)
- [MusicRadar: Surgeon interview](https://www.musicradar.com/news/surgeon-interview)
- [FXpansion: Perc](https://fxpansion.com/artists/perc)
- [DMY: Paula Temple interview](https://dmy.co/features/paula-temple-interview)
- [Attack Magazine: Dark cinematic hypnotic techno](https://www.attackmagazine.com/technique/beat-dissected/dark-cinematic-hypnotic-techno/)
- [Attack Magazine: Dark techno rumble](https://www.attackmagazine.com/technique/beat-dissected/dark-techno-rumble/)
- [MusicRadar: Rumbling techno kicks with reverb](https://musicradar.com/how-to/how-to-create-rumbling-techno-kick-drums-with-reverb)
- [Minimal Audio: Hard techno beat breakdown](https://blog.minimal.audio/beat-breakdown-hard-techno-tutorial/)
- [Native Instruments: Dark techno](https://blog.native-instruments.com/dark-techno/)
