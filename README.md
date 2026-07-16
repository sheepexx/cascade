# Cascade

A free osu!mania editor that runs in the browser: https://cascade.sheepex.net

Drop in a song, set the BPM, place notes and export a playable `.osu` or
`.osz`. No install, works on anything with a browser. You can also log in
with osu! to save maps to the cloud and map together with other people in
realtime, google-docs style.

Built with React, TypeScript, Vite and a canvas renderer. Supabase handles
accounts, cloud saves and the realtime collab, and a small Cloudflare Worker
does the osu! OAuth.

## What it can do

- Full canvas editor for 1K up to 18K, rice and long notes, snap grid,
  smooth scrolling playback
- Import and export `.osz` / `.osu`, plus StepMania / Etterna `.sm` and
  `.ssc` in both directions, so it doubles as a converter
- Pack Creator: merge multiple songs into one `.osz` song pack with shared
  metadata and per-map mapper credits
- Playtest mode (F5) with judgements, combo, accuracy and an unstable rate
  bar
- Realtime co-op mapping with live cursors, comments and owner/editor/viewer
  roles
- Timing tools: tap tempo, metronome, red/green points, SV presets
- Real osu! hitsounds, `.osk` skin support, star rating and a max-pp readout
- Background images and videos, waveform timeline, non-destructive audio
  trimming with fades
- Pattern presets you can publish and reuse across maps

Scroll speed is intentionally never written to exported files. It only
changes the editor preview, since mania players pick their own speed in
game.

## Running it locally

Needs Node 18+.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build
```

Local mapping works fully offline. Accounts, cloud saves and collab need a
Supabase project plus the OAuth worker; see
[docs/BACKEND_SETUP.md](docs/BACKEND_SETUP.md) if you want to self-host
that part. Without the env vars the app simply runs with accounts disabled.

## Shortcuts

| Key | Action |
| --- | --- |
| Mouse wheel | Scrub time |
| Left-click / drag | Place note / long note |
| Right-click, Delete | Delete note(s) |
| Ctrl+A / C / X / V | Select all / copy / cut / paste |
| Ctrl+Z / Ctrl+Y | Undo / redo |
| Ctrl+S | Save locally |
| Space | Play / pause |
| F5 | Playtest |
| H | Hitsound edit mode |
| T | Tap tempo |
| R | Receptors |
| Tab | Zen mode |
| W | Waveform overlay |

## Credits

Made by [sheepex_](https://osu.ppy.sh/u/sheepex_), with contributions from
[kaanreal](https://github.com/kaanreal). The UI font is Torus (the osu!lazer
font), which is proprietary and not included in the repo; see
[public/fonts/README.md](public/fonts/README.md).
