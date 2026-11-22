# fhmusic

Endless industrial techno, generated live for your party. Every sound is
synthesized on the spot: no samples, no recordings, no internet needed.

- **Backend** (`src/autodj/`, Python): the music engine plus a WebSocket server.
- **Frontend** (`web/`, React + TypeScript + Tailwind + Three.js): the player,
  live controls and 3D visuals.

## Run it

Requirements: [uv](https://docs.astral.sh/uv/) and Node.js.

```bash
git clone https://github.com/amirhosein-farhoodi/fhmusic.git && cd fhmusic

# one-time setup
cd web && npm install && npm run build && cd ..

# start fhmusic (the backend also serves the built web app)
uv run fhmusic
```

Then open **http://127.0.0.1:8000** and press **Start the party**.

Options: `uv run fhmusic --port 9000`.

## Develop (hot reload)

```bash
./dev.sh   # backend on :8000 + frontend on :5173 (opens the browser); Ctrl+C stops both
```

It installs the web dependencies on first run. Locally the app always talks to the
local backend; the Railway address in `netlify.toml` only applies to Netlify builds.

## Deploy (Netlify + Railway)

- **Backend → Railway.** Railway builds the [`Dockerfile`](Dockerfile) (engine + WebSocket
  server only) and sets `PORT`. Generate a public domain under Settings → Networking.
- **Frontend → Netlify.** [`netlify.toml`](netlify.toml) builds `web/`, publishes
  `web/dist`, and sets `VITE_WS_URL` to the Railway address
  (`wss://fhmusic-production.up.railway.app/ws`). It is baked in at build time, so
  change it there and push if the backend address ever changes.

Without `VITE_WS_URL` the app connects to `/ws` on its own host, which is what local
development and `uv run fhmusic` use.

## Controls

| Action | Button | Key |
|---|---|---|
| Play / pause | yellow button | `Space` |
| Next track (quick 4-bar DJ mix) | Next | `→` |
| Tempo ±1 (hold for fast) | − / + | `↑` / `↓` (`Shift` = ±5) |
| Give tempo back to the DJ | Manual · reset | `A` |
| Lock a style | chips at the top | |
| Open DJ Mode | DJ Mode | `D` (`Esc` closes) |

## DJ Mode (for DJs)

| Section | What it does | Timing |
|---|---|---|
| **Performance pads** | **Build up** (riser and snare roll into a drop), **Drop** (straight to the peak), **Breakdown** (drums out, music in, then it builds back) | next bar |
| **Loop** | Repeat the last 1, 2 or 4 bars; turn it off and the set carries on | next bar |
| **Filter** | One-knob DJ filter: left = low-pass (darker), right = high-pass (thinner) | instant |
| **EQ** | High / mid / low with kill switches | instant |
| **FX** | Beat-synced echo (1/16 to 1/4) and reverb | instant |
| **Channels** | Kick, drums, bass, synths and atmos faders with mutes | next bar |

### DJ Mode keyboard (while the panel is open)

The keyboard rows follow the controls, so you can play it without the mouse:

| Keys | Control |
|---|---|
| `Z` `X` `C` | Pads: Build up / Drop / Breakdown |
| `1` `2` `4` | Loop 1 / 2 / 4 bars (press again to release) |
| `Q` `W` `E` | Filter darker / thinner / center (hold to sweep) |
| `R` `T` `Y` | EQ high: down / up / kill |
| `F` `G` `H` | EQ mid: down / up / kill |
| `V` `B` `N` | EQ low: down / up / kill |
| `U` `I` `O` | Echo less / more / cycle echo time |
| `J` `K` | Reverb less / more |
| `5` `6` `7` `8` `9` | Mute kick / drums / bass / synths / atmos |
| `0` | Reset everything |

Every control also shows its keys as small keycaps in the panel. Shortcuts are
ignored while Cmd/Ctrl is held, so browser shortcuts keep working.

Double-click any fader to reset it. **Reset** puts everything back. The filter,
EQ and FX run in the browser, so they react instantly. Pads, loops and channels
change the music itself in the engine, so you hear them on the next bar.

## Terminal-only player (no browser)

```bash
uv run autodj                       # plays on the laptop speakers
uv run autodj --style ebm           # lock a style
uv run autodj --render 600 --out set.wav   # write 10 minutes to a file
```

## How it works

- `synth.py`: every sound (kick, hats, metal hits, bass, pads, chants, textures)
- `patterns.py`: rhythms, basslines, motifs, harmony
- `style.py`: the style scale (see `docs/STYLE_GUIDE.md`)
- `track.py`: one generated track: arrangement, layer rotation, breaks, drops
- `engine.py`: the DJ: picks styles, mixes tracks, applies live controls
- `server.py`: WebSocket stream: the browser pulls one bar at a time just ahead of playback

Note: browsers only allow audio worklets on `localhost` or HTTPS, so open
fhmusic on the machine that runs it (for example, plug that laptop into the speakers).
