# Playtest HUD editor: remaining work

Status on 2026-09-25: the groundwork is committed, but nothing in the app opens the editor yet.

## The goal

A button in the Playtest settings opens a HUD editor. The current map plays on autoplay while you edit:

- Click any part of the HUD to select it. Its settings open in an animated sidebar on the left, with illustrations in the style of the rest of the editor.
- Drag elements to move them.
- Dragging the judgement line changes the hit position, and the receptors move with it.

It also takes the HUD settings out of the Playtest settings tab, which had become cluttered.

## Already done

- `PlaytestSettings.hud` stores a position and size (`{ x, y, scale }`) per element. There are also new `showCounts` and `showKeys` flags, and the element list `HUD_ELEMENTS`, all in `src/types/index.ts`.
- `src/lib/hudLayout.ts` holds `normalizeHudLayout`, `withPlacement`, `hudPlacement` and `HUD_VISIBILITY`, with tests. Saved layouts are normalized when settings load, both locally (`normalizeAppSettings` in `App.tsx`) and from the account (`lib/accountCloud.ts`).
- `ManiaEditor` has a new `playfieldBoundsRef` prop, filled every frame with `left`, `width`, `hitY` and `height` in canvas CSS pixels.
- `PlaytestNpsGraph` and `PlaytestRunStats` take an `embedded` prop that drops their own absolute positioning.
- `src/components/HudEditor.tsx` contains:
  - `HudItem`: select, drag and snap wrapper for one element
  - `PlayfieldHandles`: click area over the playfield, plus the draggable judgement line
  - `HudEditorPanel`: the sidebar (rendered in a portal), with a list page, a detail page per element, and SVG illustrations
  - `HUD_PANEL_WIDTH`
- English `hud.*` strings in `src/lib/i18n/locales/en.ts`.

## Still to do

1. **`PlaytestOverlay`**
   - Wrap combo, judgement, accuracy (including the rate chip), counts, error bar and keys in `HudItem`, using `hudPlacement(settings.hud, id)`.
   - Respect `showCounts` and `showKeys`.
   - In editing mode, show sample content (for example combo 0, or no judgement yet) and hide the pause, results and countdown screens.
   - Take the density graph and run stats as slot nodes (rendered with `embedded`), and remove their separate mounts in `App.tsx`.
   - New props: `editing`, `onPatch`, `playfieldBoundsRef`, plus selection state.
   - Render `PlayfieldHandles` first, then the elements, then `HudEditorPanel`.
2. **`App.tsx`**
   - Add `hudEditing` to `PlaytestRuntimeState`.
   - `startPlaytest(time, { hudEditing })` turns autoplay on.
   - In HUD mode, restart the run when it ends so it loops.
   - Set `usePlaytestInput` `active` to false while editing.
   - Esc or Done exits the run and reopens Settings on the Playtest tab.
   - While editing, give the editor container `marginLeft: HUD_PANEL_WIDTH` with a transition.
   - Pass `playfieldBoundsRef` to the editor mount.
3. **`AppSettingsModal` Playtest tab**
   - Replace hit position, playfield size, background dim and the HUD toggle grid with a single "HUD editor" card: illustration, description and a button. Disable it when no map with audio is open.
   - New prop `onOpenHudEditor`.
   - New strings `settings.hudEditorTitle`, `settings.hudEditorDesc`, `settings.hudEditorOpen` and `settings.hudEditorNeedsMap`.
4. **`src/index.css`**
   - Add `.hud-panel-in` (slides in from the left), `.hud-page-in` (fade and slide between the list and detail pages) and `.hud-tag-in`.
   - Add them to the reduced-motion block.
5. **Translations:** translate every `hud.*` string and the new settings strings into German, Russian, Simplified Chinese and Brazilian Portuguese. Only English exists so far.
6. **Browser check and release**
   - Open the editor from settings.
   - Drag the judgement line.
   - Drag and resize an element.
   - Hide and show an element.
   - Reset the layout, then press Done.
   - After that, bump the version, commit and push. The browser needs the `en-US` locale, or the app starts in German and text-based lookups fail.
   - Delete this file once the feature ships.
