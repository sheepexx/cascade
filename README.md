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
- Import beatmaps straight from osu! by pasting a beatmapset link, a `/b/`
  link or a bare set ID
- Timing tools: tap tempo, metronome, red/green points, kiai and volume
- SV editor that generates constant, ramp and stutter scroll velocity over a
  range, with a live curve preview
- Real osu! hitsounds, `.osk` skin support, star rating and a max-pp readout
- Background images and videos, waveform timeline, non-destructive audio
  trimming with fades
- Pattern presets you can publish and reuse across maps
- Rebindable editor shortcuts, edited from the info button in the bottom-left
  corner

Scroll velocity is previewed the way osu!mania plays it, so BPM changes speed
up the scroll and BPM gimmick maps (freezes, teleports) look right in the
editor and in playtest. There is a setting to switch to Quaver style constant
scroll where only SV matters.

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

Copied notes can be dragged from the Clipboard card or any Pasteboard history
entry onto the playfield. The preview snaps to the hovered time and lane, with
blocked notes shown in red. Dropping adds a copy that can be undone with Ctrl+Z.

Single-key shortcuts are the defaults and can all be rebound: open the info
button in the bottom-left corner, click a key and press a new one. The Ctrl
combos are fixed.

| Key | Action |
| --- | --- |
| Mouse wheel | Scrub time |
| Left-click / drag | Place note / long note |
| Right-click, Delete | Delete note(s) |
| Ctrl+A / C / X / V | Select all / copy / cut / paste |
| Ctrl+Z / Ctrl+Y | Undo / redo |
| Ctrl+S | Save locally |
| Space | Play / pause |
| Hold S | Ease playback to 25% |
| F5 | Playtest |
| F3 / F4 | Scroll speed down / up |
| B, Page Up / Down | Add bookmark, jump between bookmarks |
| H | Hitsound edit mode |
| R | Receptors |
| Tab | Zen mode |
| W | Waveform overlay |
| M / F / S | Mirror, reverse or shuffle the selection |
| T | Tap tempo, while the Timing window is open |

## Credits

Made by [sheepex_](https://osu.ppy.sh/u/sheepex_), with contributions from
[kaanreal](https://github.com/kaanreal).
