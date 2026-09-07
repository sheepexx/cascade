# Clipboard and editor audit

## Fixed

| Problem | Change |
| --- | --- |
| At minimum timeline zoom, Shift-drag selects notes but Ctrl+C does nothing. Clearing the clipboard temporarily helps. | Selection now focuses the note canvas. Note clipboard shortcuts also work while sliders have focus. Text inputs, editable content, selects and dialogs retain their own shortcuts. Clearing the clipboard was moving focus away from the slider. |
| Paste immediately after seeking uses an earlier position. | Paste uses the requested editor time, including a queued wheel seek, instead of the animated display position. Reproduced a seek to 5,000 ms pasting at 0 ms before the fix. |
| Paste silently rejects all or some notes. | A brief status message reports pasted notes and notes skipped for overlaps, song/trim boundaries or unavailable columns. The clipboard remains available. Added Copy and Paste at playhead buttons. |
| Clipboard updates can lag until React renders. | Copy, clear, preset loading and history selection update the clipboard reference immediately. |
| Selection counts and SV selection ranges survive deleted notes or refer to old positions after edits. | Reconcile selected IDs and their range when the note collection changes, and redraw selection changes even when the count stays the same. |
| Reference view handles the same global shortcuts as the active editor. | Disable keyboard handlers for the reference view. Read-only editor actions also guard against mutations. |
| Mirror bypasses the selection collision check; keyboard transforms can leave the song/trim bounds. | Apply the shared transform validation to mirror and reject transforms that take previously valid notes outside playable bounds. Existing notes outside a subsequently changed trim are preserved. |
| Large copies create thousands of visible and hidden SVG elements. | Draw clipboard thumbnails on memoized canvases. |
| Large selections can exceed JavaScript's function argument limit when copied. | Calculate the pattern start with a reduction instead of spreading all start times into `Math.min`. |
| Large pastes repeatedly compare each note against the entire map. | Index occupied intervals by column and start time. Preserve input priority, same-ID handling and long-note tail adjacency. Small edits retain the direct scan. |
| Selection actions can run beyond the canvas edge on narrow windows. | Allow the selection toolbar to wrap within the editor width. Give the zoom slider an accessible name. |

The browser focus behavior is documented in [MDN's focus reference](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/focus).

## Local measurements

These are individual Chrome measurements on this machine, without CPU or network throttling. They are comparisons for the synthetic fixtures, not production latency guarantees.

| Operation | Before | After |
| --- | ---: | ---: |
| Copy 10,000 notes through the next paint in the development component harness | 446 ms | 68 ms |
| SVG rectangles for that clipboard preview | 20,000 | 0 |
| Collision filtering for 5,000 new notes against 20,000 existing notes | 840 ms | 13 ms |

A local production-preview reload recorded LCP of 201 ms and CLS of 0.00. This was a warm-cache localhost trace; it does not establish real-user loading or interaction performance. DevTools estimated no LCP savings from changing render-blocking resources or the network dependency chain, so those were left alone. Accounts were unauthenticated; the production backend rejects localhost CORS requests, so authenticated collaboration was not exercised.

## Validation

- Full Vitest suite: 690 tests across 52 files. TypeScript check and production build pass. ESLint has seven existing warnings and no errors.
- Chrome component checks: low-zoom box selection, upscroll selection, slider-focused copy/paste, immediate seek/paste, text-field shortcuts, overlap feedback, consecutive copy/paste, clipboard history and clear, selection cleanup, read-only actions, reference shortcut suppression and mirror collision rejection.
- Full production editor: place four notes, lower zoom to 3, select and copy, queue a wheel seek to 5,000 ms, paste while the zoom slider has focus, then undo and redo. Note counts were 4 → 8 → 4 → 8.
- Regression tests cover paste timing, hitsounds, long notes, BPM changes, collisions, partial pastes, bounds, key counts, text focus, a 150,000-note copy and indexed collision behavior against an independent pairwise filter.

## Suggested next improvements

1. **Paste preview:** show translucent notes at the destination, color blocked notes red, and display the accepted/skipped counts before committing.
2. **Zoom to selection:** fit the selected phrase in view and offer one action to return to the previous zoom and time.
3. **Repeat pattern:** duplicate a selection after its beat span, with an adjustable repetition count and gap.
4. **Pinned clipboard patterns:** name and pin frequently used patterns, and collapse the clipboard panel when space is tight.
5. **Clearer selection summary:** show note count, beat span and lane range beside the actions, with shortcut hints drawn from the user's current key bindings.
