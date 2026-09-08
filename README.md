# Cascade

A free osu!mania editor that runs in the browser: **https://cascade.sheepex.net**

Drop in a song, set the BPM, place notes and export a playable `.osu` or `.osz`.
Nothing to install, works on anything with a browser. Log in with osu! to save
maps to the cloud and map together with other people in realtime, google-docs
style. There is also a Windows app that talks to your osu! install directly.

![The Cascade start menu](docs/images/start-menu.jpg)

Built with React, TypeScript, Vite and a canvas renderer. Supabase handles
accounts, cloud saves and realtime collab, and a Cloudflare Worker does the
osu! OAuth, the beatmap mirror proxy and asset storage.

## The editor

![The editor with a 7K map loaded](docs/images/editor.jpg)

- Full canvas editor for 1K up to 18K, rice and long notes, snap grid and
  smooth scrolling playback
- Live map stats: note count, LN percentage, chord percentage, average and
  peak NPS, rice/LN split and per-column balance
- Star rating and a max-pp readout that update as you map
- Background images and video, waveform timeline, non-destructive audio
  trimming with fades
- Multiple difficulties per mapset, duplicated or created from scratch
- Zen mode, receptors, hitsound edit mode and bookmarks for navigation
- Rebindable editor shortcuts, edited from the info button in the bottom-left

## Playtest

![Playtest mode with judgements and an unstable rate bar](docs/images/playtest.jpg)

Press F5 to play what you just wrote, without leaving the editor. Judgements,
combo, accuracy, miss count, a live NPS graph, an unstable rate bar and a key
overlay. Rate can be changed for practice, and hit windows scale with it so the
precision you need stays honest.

## Scroll velocity

![The SV editor with a live curve preview](docs/images/sv-editor.jpg)

Generate constant, curve or stutter SV across a time range, normalize existing
points, or strip them out, with a live preview of the resulting scroll curve
before you apply.

SV is previewed the way osu!mania actually plays it, so BPM changes speed up the
scroll and BPM gimmick maps (freezes, teleports) look right in the editor and in
playtest. There is a setting to switch to Quaver-style constant scroll where
only SV matters.

Scroll speed is deliberately never written to exported files. It only changes
the editor preview, since mania players pick their own speed in game.

## Formats

Import and export in both directions, so it doubles as a converter:

| Format | Import | Export |
| --- | :---: | :---: |
| osu!mania `.osu` / `.osz` | yes | yes |
| StepMania / Etterna `.sm` / `.ssc` | yes | yes |
| Quaver `.qua` | yes | yes (4K and 7K) |

Beatmaps can also be pulled straight from osu! by pasting a beatmapset link, a
`/b/` link or a bare set ID. The **Pack Creator** merges multiple songs into one
`.osz` song pack with shared metadata and per-map mapper credits.

## Accounts and collaboration

- Cloud saves tied to your osu! account, with your editor settings syncing
  across devices
- Realtime co-op mapping with live cursors, comments and owner/editor/viewer
  roles
- Public share links that render a playable preview of a map
- Pattern presets you can publish for others and reuse across maps
- Up to two skins stored on your account, downloaded on demand

## Sound and skinning

Real osu! hitsounds, `.osk` skin support with per-keymode lane colours and note
images, adjustable hitsound volume, metronome, and UI sounds that can be turned
off.

## Timing

Tap tempo, metronome, red and green points, kiai sections and volume changes,
with a BPM detector for when you are starting from nothing.

## The Windows app

Cascade also ships as a Windows desktop app built with Tauri. It runs in its own
window without browser chrome, works offline, and stays small by using the
WebView2 runtime Windows already provides instead of bundling a browser.

Everything above works there too, plus a set of things a browser tab simply
cannot do:

- **Import into osu!** hands the current map to osu! and imports it, no export
  step
- **Save into osu! Songs** writes the map straight into your Songs folder and
  overwrites in place, so you alt-tab and press F5 instead of reimporting. It
  refuses to touch a folder it did not create, so a downloaded map can never be
  clobbered
- **Import from osu!** reads the map you have selected in song select and opens
  it in the editor
- **Skins in osu!** loads any skin already installed in your osu! folder,
  without exporting an `.osk` first
- **Open with Cascade** for `.osu`, `.osz`, `.sm`, `.ssc`, `.qua` and `.osk`
  from Explorer, whether Cascade is running or not
- **In-app updates**, signed and installed without a manual reinstall
- **Discord status** showing the song and difficulty you are working on, which
  can be reduced to just "Cascade" or turned off entirely

osu! is located automatically through the registry, `%LOCALAPPDATA%\osu!` or the
running process, and can be pointed at a folder by hand in Settings.

Installers are built in CI: push a tag starting with `desktop-v`, or run the
"Desktop build" workflow with the release input checked. The build publishes the
installers, the download manifest and the signed update manifest to R2. The
download itself is gated behind the `desktop_download` feature flag in the admin
panel.

## Languages

English, German, Russian, Simplified Chinese and Brazilian Portuguese, picked up
from the browser and switchable in the header.

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
