# Cascade

A browser-based **osu!mania** beatmap editor. Upload a song, set your timing,
chart notes on a vertical scrolling playfield, hear your hitsounds, and export a
ready-to-play `.osu` or `.osz` — or save to the cloud and map **together in
realtime** with other people.

Built with **React + TypeScript + Vite + TailwindCSS**, a **Canvas** editor,
**JSZip** for packaging, **Supabase** (Postgres + Storage + Realtime) for
accounts/cloud/collab, and a small **Cloudflare Worker** for osu! OAuth.

---

## Highlights

- 🎹 Full Canvas mania editor — 1K–18K, rice + long notes, snap grid, live
  playback with falling notes.
- 🔊 Real osu! hitsounds, metronome, and tap-to-find-BPM timing.
- 👥 Google-Docs-style **realtime co-op** with presence, cursors, comments, and
  per-user roles.
- ☁️ Cloud saves + local autosave, an osu!-login account system, and a
  start screen that gathers your local, cloud, and invited maps.
- 🎨 osu! skin (`.osk`) support, pattern presets, and a star-rating / max-pp
  readout.
- 📦 Import and export `.osz` / `.osu` (verified against real ranked maps),
  plus StepMania / Etterna `.sm` import, export, and pack browsing.
- 🧩 **Pack Creator** — combine multiple songs into one local `.osz` song pack,
  with shared metadata, mapper credits, and rate detection.

---

## Running it

You need [Node.js](https://nodejs.org/) 18+.

```bash
npm install      # install dependencies
npm run dev      # start the dev server (usually http://localhost:5173)
npm run build    # type-check (strict) + production build into dist/
npm run preview  # preview the production build
```

### Backend / environment

The editor runs fully offline for **local** mapping (audio, charting, import,
export, local saves). The **account, cloud, and collaboration** features need a
Supabase project and the OAuth worker. Copy `.env.example` to `.env.local` and
fill in:

```
VITE_SUPABASE_URL=…          # your Supabase project URL
VITE_SUPABASE_ANON_KEY=…     # Supabase anon key (public)
VITE_WORKER_URL=…            # Cloudflare Worker that runs osu! OAuth
```

- `supabase/migrations/` — database schema (projects, assets, collaborators,
  comments, presets, feedback, admin stats, RLS policies, Realtime).
- `worker/` — Cloudflare Worker handling the osu! OAuth login bounce.
- `scripts/build-sample-maps.mjs` — builds the bundled "try these maps" gallery.

---

## Features

### Charting

- **Vertical scrolling playfield** rendered on Canvas, **1K–18K** key counts.
- **Left-click** a lane to place a note; **click + drag** vertically for a
  **long note** (hold); **right-click** or **Delete/Backspace** to remove.
- **Mouse-wheel** scrubs through time; the playfield follows the audio clock.
- **Snap grid** at 1/1 through 1/9 plus 1/12 and 1/16, with osu!-style
  beat-division colors.
- Adjustable **zoom**, **scroll speed** (preview-only — see below), playfield
  scale, and long-note body scale.
- **Selection & clipboard**: Ctrl+click to multi-select, **box-select** (drag),
  **Ctrl+A** select all, **Ctrl+C/X/V** copy / cut / paste (columns preserved),
  and **drag to move** notes.
- A **pasteboard history** of recent copied patterns, with hover previews.
- **Undo / redo** (Ctrl+Z / Ctrl+Shift+Z or Ctrl+Y) over the whole document.
- **Receptors** toggle (R) to show the judgement-line keys, and a **Zen mode**
  (Tab) that hides all chrome for a distraction-free notefield.

### Hitsounds

- Plays the map's actual **osu! hitsounds** as notes cross the judgement line,
  with a dedicated hitsound-volume control.
- **Hitsound edit mode** (H): toggle **whistle / finish / clap** additions on
  the selection with W / F / C, with per-note letters drawn on the notes.
- Hitsounds can come from the **default** set, the loaded **visual skin**, or a
  separately loaded **hitsound skin**.

### Timing

- **Multiple timing points**: red (uninherited, BPM) and green (inherited, SV)
  points, with quick **SV presets** (0.5×–2×).
- **Tap tempo** — tap along with **T** (or a button) to detect BPM + offset; it
  auto-applies once you've tapped enough.
- **Metronome** that clicks the beat during playback while the Timing panel is
  open, with an on-beat indicator.
- **Offset** set / nudge controls and adjustable **playback speed**.

### Audio & timeline

- **Waveform** decoded with the Web Audio API and drawn behind the playfield;
  the song plays through Web Audio for near-zero latency vs. the falling notes.
- **Bottom timeline** with the full waveform, **bookmarks**, an audio
  **preview point**, comment markers, and the playhead.
- **Sound crop**: non-destructive **trim brackets** and **fade-in / fade-out**
  envelope you drag on the timeline; "Crop to brackets" bakes the cut into the
  notes (the same cut `.osz` export applies).

### Tools

- **Full LN** — convert every note to a long note ending a set number of ticks
  before the next note in its lane.
- **Full RC** — convert every long note back to a rice note.
- **Crop to brackets** — delete notes outside the trim region and clamp holds
  that overrun the end bracket. All tools are undoable.

### Difficulties & metadata

- **Multiple difficulties per mapset**, with a sidebar to switch, add,
  duplicate, rename, and delete them (sorted by star rating).
- **Reference mode** — show a second difficulty (same audio) side-by-side,
  read-only and scroll-synced, for cross-referencing patterns.
- **Map settings**: title, artist, creator, difficulty name, key count, HP
  drain, overall difficulty, preview time, and a per-mapset or per-difficulty
  **background image** scope.
- **Background video** (osu! `Video` event): set a muted video that plays
  behind the playfield with an adjustable start offset, imported from and
  exported to `.osz` like ranked maps with videos.
- **Star rating** and **max pp** (perfect-play) readouts that update live.

### Skins & presets

- Load osu! **`.osk` skins** for the playfield and/or hitsounds, keep a local
  **skin library**, or apply bundled preset skins.
- **Pattern presets** — publish a copied pattern as a reusable preset (public or
  private), browse the **preset library**, and paste presets into the editor.

### Accounts, cloud & collaboration

- **Log in with osu!** (OAuth via the worker).
- **Save to cloud** (chart + audio/background assets in Supabase Storage) and
  **save locally** (IndexedDB), plus optional **local autosave**.
- **Start screen** that surfaces your **local projects**, **cloud projects**,
  and **mapping invitations** (with thumbnails and collaborator avatars), plus a
  **"My Maps"** browser and a bundled **"Try these maps"** gallery.
- **Realtime co-op**: granular note ops and document sync, **live presence**
  (who's editing, their playhead and active difficulty), join/leave toasts, and
  a connection status pill.
- **Roles**: owner / editor / viewer. The **Share** panel invites collaborators;
  viewers are read-only but can still select and comment. Invitations pop up
  live and can be joined, ignored, or archived.
- **Comments**: a threaded comments sidebar plus seekable comment markers on the
  timeline, with resolve/delete.
- **Reload-resume**: returns you to the difficulty and playhead you left.
- A full-screen **loading animation** while any map (local, cloud, invited, or
  featured) opens.

### Import / export

- **Import `.osz`** (drag-and-drop or file picker) to edit existing maps.
- **Import `.sm`** files or whole StepMania / Etterna pack folders, and
  **export `.sm`** to convert osu!mania maps for Etterna / StepMania.
- **Export `.osu`** for a single difficulty, or **export `.osz`** packaging the
  audio, background, video, and every difficulty into a zip osu! imports
  directly.
- **Export validation** warns about issues before you export.

### Pack Creator

- A separate start-menu tool that **combines multiple existing maps into one
  local `.osz` song pack** (dan courses, jumpstream collections, …).
- Import `.osz` files or pick from your **local and cloud projects**; every
  difficulty becomes one entry in the pack.
- Shared **Various Artists** metadata with configurable artist / creator field
  modes, per-map mapper credits in generated difficulty names, **rate
  detection** (`x1.2`, `0.9x`, `DT`, …), safe filename-collision renaming, an
  optional minimal **`-Delete` thumbnail difficulty**, and pre-export
  validation.
- Charts are carried over byte-for-byte; only metadata and renamed file
  references are rewritten. Meant for **local play** (multi-song sets are not
  rankable).

### Polish

- Subtle **UI sounds** (toggleable, with volume), audio **ducking** behind
  modals, and smooth modal/toast/notification animations.
- **Feedback** modal, an **admin** panel (usage stats / preset moderation), and
  anonymous usage **analytics**.

### Scroll speed is preview-only

The *Scroll* slider only changes how fast notes move on screen while editing.
osu!mania players pick their own scroll speed at play time, so this value is
**never written** to the exported file — by design.

---

## osu!mania export rules (`src/lib/osuExport.ts`)

- `Mode: 3` (osu!mania).
- `CircleSize` = key count (`1`–`18`).
- HitObject `y` is always `192`.
- HitObject `x` is derived from the column:
  `x = floor((column + 0.5) * 512 / keyCount)` → osu!-compatible `0–512`.
- **Normal note**: type `1` → `x,192,time,1,0,0:0:0:0:`
- **Long note (hold)**: type `128`, with the end time prefixed onto the
  hit-sample field → `x,192,start,128,0,end:0:0:0:0:`
- Hitsounds and timing points (red + green) are written out; the X formula and
  file layout were verified against a real ranked 4K map.

---

## Project structure

```
src/
  types/index.ts            # ManiaNote, Difficulty, Timing, AppSettings + defaults
  lib/
    timing.ts               # beat length, snapping, grid colors, time formatting
    osuExport.ts            # build + download a .osu file (column→X, HitObjects)
    oszExport.ts            # build + download a .osz zip via JSZip
    osuImport.ts            # parse an imported .osz back into the editor
    packCreator.ts          # merge multiple maps into one .osz song pack
    skinImport.ts           # parse .osk skins (playfield + hitsounds)
    noteTools.ts            # Full LN / Full RC bulk tools
    noteCollision.ts        # overlap rules for placement / paste / move
    audioTrim.ts            # non-destructive trim + fade envelope
    ops.ts / collab.ts      # granular collab ops + access roles
    cloud.ts                # Supabase project/asset save, load, share, list
    comments.ts             # project comments (CRUD + realtime)
    presets.ts              # pattern preset publish / browse
    persistence.ts          # IndexedDB local saves + localStorage prefs
    starRating.ts / performance.ts   # star rating + max pp
    auth.tsx / supabase.ts  # osu! OAuth session + Supabase client
  hooks/
    useAudio.ts             # Web Audio playback + rAF ms clock
    useWaveform.ts          # decode audio → waveform + duration
    useHitsounds.ts         # fire hitsounds at the judgement line
    useMetronome.ts / useTapTempo.ts   # timing aids
    useCollab.ts            # realtime channel (ops, presence, doc sync)
  components/
    ManiaEditor.tsx         # the Canvas editor (render loop, placement, select)
    TransportBar.tsx        # play/scrub, ms readout, volumes, scroll speed
    BottomTimeline.tsx      # waveform, bookmarks, preview point, trim/fades
    DifficultySidebar.tsx   # difficulty list + reference mode
    PackCreator.tsx         # start-menu tool: combine maps into one .osz pack
    CommentsSidebar.tsx     # threaded comments
    PPCounter.tsx           # star rating + max pp pill
    menus/                  # every modal (timing, tools, skin, share, start, …)
    ui/                     # styled controls, menus, modals, pattern previews
  App.tsx                   # state wiring, layout, menu bar, load/save/export
  main.tsx                  # React entry
worker/                     # Cloudflare Worker for osu! OAuth
supabase/migrations/        # database schema + RLS + Realtime
scripts/build-sample-maps.mjs   # builds the bundled sample-map gallery
```

### Internal note model

```ts
type ManiaNote = {
  id: string;
  column: number;       // 0-indexed, 0 = leftmost lane
  startTime: number;    // ms
  endTime?: number;     // ms, present only for long notes
  hitSound?: number;    // whistle / finish / clap additions bitmask
  sampleSet?: number;   // normal / soft / drum
};
```

---

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| Mouse wheel | Scrub time |
| Left-click / drag | Place note / long note |
| Right-click · Delete · Backspace | Delete note(s) |
| Ctrl+click | Add to selection |
| Shift+drag · drag | Box-select |
| Ctrl+A / C / X / V | Select all / copy / cut / paste |
| Ctrl+Z · Ctrl+Shift+Z · Ctrl+Y | Undo / redo |
| Ctrl+S | Save locally |
| R | Toggle receptors |
| H | Toggle hitsound edit mode |
| W / F / C | Whistle / finish / clap (in hitsound mode) |
| T | Tap tempo (Timing panel) |
| Tab | Zen mode |
