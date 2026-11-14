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

## Develop the frontend (hot reload)

```bash
uv run fhmusic          # terminal 1: backend on :8000
cd web && npm run dev   # terminal 2: open the URL Vite prints (proxies /ws to :8000)
```

## Controls

| Action | Button | Key |
|---|---|---|
| Play / pause | yellow button | `Space` |
| Next track (quick 4-bar DJ mix) | Next | `→` |
| Tempo ±1 (hold for fast) | − / + | `↑` / `↓` (`Shift` = ±5) |
| Give tempo back to the DJ | Manual · reset | `A` |
| Lock a style | chips at the top | |

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
