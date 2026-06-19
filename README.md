# mania-editor

A browser-based **osu!mania** beatmap editor. Upload a song, set your timing,
place notes on a vertical timeline, and export a ready-to-play `.osu` or `.osz`.
Everything runs locally in the browser - there is no backend.

Built with **React + TypeScript + Vite + TailwindCSS**, a **Canvas** editor, and
**JSZip** for packaging.

---

## Running it

You need [Node.js](https://nodejs.org/) 18+ installed.

```bash
npm install      # install dependencies
npm run dev      # start the dev server (printed URL, usually http://localhost:5173)
npm run build    # type-check + production build into dist/
npm run preview  # preview the production build
```

> This repo was scaffolded on a machine without Node installed, so the build
> was not run here. The first `npm run build` will run `tsc` in strict mode and
> surface any environment-specific issues.

---

## How to use the editor

1. **Upload audio** (`.mp3` / `.ogg`) from the left panel. The transport bar
   lets you play / pause, scrub, and shows the current time **in milliseconds**.
2. **Fill in metadata** (title, artist, creator, difficulty name) and the
   **difficulty** values (key count `1K–18K`, HP drain, overall difficulty).
   Optionally upload a **background image**.
3. **Set BPM and Offset** under *Timing* - this drives the snap grid.
4. **Map**:
   - **Left-click** a lane to place a note (snapped to the grid).
   - **Click + drag** vertically to create a **long note** (hold).
   - **Right-click** a note to delete it.
   - **Mouse wheel** scrubs through time.
   - Use the toolbar to change **snap** (1/4, 1/8, 1/12, 1/16), **zoom**, and
     **scroll speed**.
5. **Export**:
   - **Export .osu** downloads a single difficulty file.
   - **Export .osz** packages the audio, the background (if any), and the
     `.osu` into a zip that osu! can import directly.

### Scroll speed is preview-only

The *Scroll* slider only changes how fast notes move on screen while editing.
osu!mania players choose their own scroll speed during play, so this value is
**never written** to the exported file - by design.

---

## osu!mania export rules (implemented in `src/lib/osuExport.ts`)

- `Mode: 3` (osu!mania).
- `CircleSize` = key count (`1`–`18`).
- HitObject `y` is always `192`.
- HitObject `x` is derived from the column:
  `x = floor((column + 0.5) * 512 / keyCount)` → osu!-compatible `0–512`.
- **Normal note**: type `1` → `x,192,time,1,0,0:0:0:0:`
- **Long note (hold)**: type `128`, with the end time prefixed onto the
  hit-sample field → `x,192,start,128,0,end:0:0:0:0:`
- A single uninherited timing point is written from BPM + Offset.

The X formula and file layout were verified against a real ranked 4K map.

---

## Project structure

```
src/
  types/index.ts          # ManiaNote, MapSettings, Timing, ViewState + defaults
  lib/
    timing.ts             # beat length, snapping, grid colors, time formatting
    osuExport.ts          # build + download a .osu file (column→X, HitObjects)
    oszExport.ts          # build + download a .osz zip via JSZip
  hooks/
    useAudio.ts           # HTMLAudioElement wrapper with an rAF ms clock
  components/
    ManiaEditor.tsx       # the Canvas editor (render loop, placement, delete)
    SettingsPanel.tsx     # metadata / difficulty / timing / file uploads
    TransportBar.tsx      # play, scrub, ms readout, snap / zoom / scroll
    ui/Controls.tsx       # small styled inputs / buttons / file picker
  App.tsx                 # state wiring + layout + export buttons
  main.tsx                # React entry
```

### Internal note model

```ts
type ManiaNote = {
  id: string;
  column: number;       // 0-indexed, 0 = leftmost lane
  startTime: number;    // ms
  endTime?: number;     // ms, present only for long notes
};
```

---

## Ideas for Version 2

- **Audio waveform** rendered behind the lanes for easier timing.
- **Hitsounds / metronome / sample playback** when notes pass the judgement line.
- **Multiple timing points** (BPM changes, inherited SV points) and a timing
  setup screen with tap-to-find-BPM.
- **Copy / paste, multi-select, box-select, and undo/redo** (command stack).
- **`.osu` / `.osz` import** to edit existing maps (parser is half-done already
  via `xToColumn`).
- **Mirror / shift / scale / note-fill tools** common to mania editors.
- **Per-column note-skin colors and a configurable playfield** (e.g. 7K+1 styles).
- **Multiple difficulties per set** in a single `.osz`.
- **Local autosave** to `localStorage` / IndexedDB and project files.
- **Playtest mode** to verify a pattern in-browser.
```
