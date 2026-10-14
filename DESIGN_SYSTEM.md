# Cascade design system

How Cascade looks and behaves, and why. Read this before adding or restyling
interface. If something you need is not covered, extend the system here first
rather than inventing a one-off style in a component.

The values live in two places:

- `src/index.css` defines every token as a CSS custom property on `:root`
  (`--ink-800`, `--slate-400`, `--radius-lg`, `--text-sm`, `--font-sans`…),
  plus the few shared classes Tailwind cannot express (`.hit-line-*`,
  `.keycap`, `.float-chip`, motion).
- `tailwind.config.js` exposes those variables as the usual scales
  (`bg-ink-800/70`, `rounded-lg`, `text-sm`, `font-display`). Colours are
  stored as RGB channels so opacity modifiers keep working.

Because utilities read variables, a theme is just a different set of values
(see **Classic design** below, currently dormant). Never hard-code a hex value
for a surface or text colour in a component; use the scale.

Shared building blocks live in `src/components/ui/` and
`src/components/menus/settingsLayout.tsx`.

---

## 1. Philosophy

**A precise instrument with a rhythm-game soul.**

Cascade is creative software that people keep open for hours. It should feel
like a well-made tool (calm, dense, exact) and still be recognisably part of
the osu! community: the coral accent, the circular logo, the skewed main-menu
tiles, star-rating colours and Quicksand all stay.

Five rules follow from that:

1. **One surface, not stacked cards.** A dialog or panel is one surface. Group
   content with space, a heading and, where a boundary helps, a hairline.
   Never put a bordered card inside a bordered card.
2. **The accent means "this one".** Coral marks the primary action, the
   current selection, focus and states the mapper must not miss (slowed
   playback). It is not decoration and it is not the colour of every active
   control.
3. **Hierarchy from type, not capitals.** Headings are sentence case. Size,
   weight and the display face carry importance. Uppercase is reserved for
   codes (`QUA`, `RANKED`, `EN`) and in-game HUD text.
4. **Wells take input, plates take clicks.** Inputs are darker than their
   surface; buttons are lighter. You can tell what a control does before you
   read it.
5. **Explain in one place.** Long explanations go in the settings info pane or
   a tooltip, not repeated under every row.

### The hit line

Cascade's one signature mark is the **hit line**: a 2px accent bar on the edge
of a selected item, the way notes land on the judgement line. Vertical lists
(settings categories, the difficulty list, social navigation, conversations,
Pack Creator maps) mark the left edge; tab rows mark the bottom edge.

```html
<button class="hit-line-left" data-active="true">…</button>   <!-- or aria-selected / aria-current="page" -->
<button class="hit-line-bottom" aria-selected="true">…</button>
```

Set `--hit-line` to recolour it for a surface with its own accent (the Skin
dialog's tabs).

---

## 2. Colour

### Surfaces (`ink`)

Darkest to lightest by role. Use the role, not the nearest-looking shade.

| Token | Hex | Role |
| --- | --- | --- |
| `ink-950` / `--surface-canvas` | `#09090d` | The well behind the playfield |
| `ink-900` / `--surface-ground` | `#0d0d12` | Application ground: header, sidebars, timeline, full views |
| `ink-800` / `--surface-panel` | `#14141a` | Dialogs and panels |
| `ink-700` / `--surface-raised` | `#1b1b23` | Floating layers: menus, popovers, tooltips, toasts |
| `ink-600` | `#24242e` | Solid control fill (rare; prefer the white tints below) |
| `ink-500` | `#2f2f3b` | Selected segment of a segmented control |
| `ink-400` | `#3e3e4c` | Strong neutral marks |

On a surface, controls use **white tints** so they work on any level:
`bg-white/[0.04]` hover row, `bg-white/[0.07]` secondary button and selected
row, `bg-white/[0.11]` pressed or hovered button. Inputs use `bg-black/25`.

### Lines

| Token | Value | Use |
| --- | --- | --- |
| `--line-soft` | `white / 6%` | Dividers between groups and rows (`border-white/[0.06]`, `divide-white/[0.05]`) |
| `--line` | `white / 9%` | Floating-layer outlines (`ring-white/[0.09]`) |
| `--line-strong` | `white / 15%` | Hover outlines on inputs |

Borders are for boundaries that mean something: a pane edge, a floating
layer, a field. Not for decoration.

### Text (`slate`, re-tinted)

The Tailwind `slate` scale is replaced with a neutral that matches the ink hue,
with the low end lifted so secondary text stays readable.

| Class | Use |
| --- | --- |
| `text-slate-50` | Titles, selected items, key numbers |
| `text-slate-100` / `200` | Primary text, row labels |
| `text-slate-300` | Secondary text, labels above fields |
| `text-slate-400` | Descriptions, metadata (still ≥ 4.5:1 on panels) |
| `text-slate-500` | Tertiary meta, placeholders, units |
| `text-slate-600` | Disabled, decorative separators only |

### Accent and status

- `accent` `#e86868` (with `accent-soft`, `accent-deep`): see rule 2.
- Status colours are semantic only: emerald = ok/online/saved, amber =
  warning/selection in the editor, rose = error/destructive, sky = multi-
  selection, teal = AiMod readiness.
- **Domain colours stay authentic**: star-rating colours (`starColor`), MSD
  colours, lane colours and osu! status colours come from the game and are
  never restyled to fit the palette.

Per-tool accents (`MENU_ACCENTS`) appear only as the small tick beside a
dialog title, so a dialog keeps the colour of the main-menu tile that opened
it without a coloured wash.

---

## 3. Typography

Two faces, each with a job. No others.

| Family | Class | Use |
| --- | --- | --- |
| **Inter** (with `cv11`, single-storey *a*) | `font-sans` (default) | All interface text, controls, data |
| **Quicksand** | `font-display` | Cascade's voice: dialog and page titles, section headings, song titles, usernames, big numbers, the main menu |
| System mono | `font-mono` | Timestamps, millisecond values, file names, keycaps |

Tabular figures are on everywhere (`font-variant-numeric: tabular-nums` on
`html`): numbers in Cascade are data and must not shuffle as they change.

### Scale

13px is the working size.

| Class | Size / line | Use |
| --- | --- | --- |
| `text-2xs` | 11 / 16 | Meta, counts, keycaps, timestamps |
| `text-xs` | 12 / 18 | Secondary text, field labels, descriptions |
| `text-sm` | 13 / 20 | Body, rows, buttons, inputs |
| `text-base` | 15 / 22 | Large inputs (search) |
| `text-lg` | 17 / 24 | Page titles inside a workspace |
| `text-xl` – `2xl` | 20–24 | Hero titles, key statistics |

Headings:

- Dialog title: `font-display text-[0.9375rem] font-semibold text-slate-50`
  (the `Modal` does this).
- Section heading: `<SectionHeading>` (display, 14px, semibold, slate-100).
- Group label inside dense chrome: `text-xs font-semibold text-slate-300`.
- Statistic: label `text-xs text-slate-400` above
  `font-display text-2xl font-bold text-slate-50` (see `StatTile`).

Never set interface text below 11px in a dialog (`.modal-body` lifts
`text-[10px]`). 10px is allowed only in the dense editor chrome and HUD.

---

## 4. Spacing, radius, elevation

**Spacing** uses Tailwind's 4px scale. Common values:

- Row height: 28px controls (`h-7`), 32px buttons/inputs (`h-8`), 44px
  settings rows (`min-h-[2.75rem]`), 36px list rows.
- Dialog body padding `px-5 py-4`; workspace content `px-6`–`px-8`.
- Gaps: 4 / 8 / 12 / 16 / 24 / 32. Groups are separated by 24–32px or a
  hairline with 16px above.

**Radius** is tight and tool-like:

| Class | px | Use |
| --- | --- | --- |
| `rounded-sm` | 3 | Tags, small badges, checkboxes |
| `rounded` | 4 | Keycaps, segments inside a control |
| `rounded-md` | 5 | Buttons, inputs, rows |
| `rounded-lg` | 6 | Segmented controls, list thumbnails, wells |
| `rounded-xl` | 8 | Popovers, menus, floating chips, toasts |
| `rounded-2xl` | 10 | Dialogs |
| `rounded-full` | – | Avatars, status dots, switches, star-rating pills only |

**Elevation** has three levels. Shadows only for things that float.

1. Ground (no shadow): header, sidebars, timeline, full views.
2. Panel: dialogs, `shadow-[var(--shadow-float)]` + `ring-1 ring-white/[0.08]`.
3. Floating: menus, popovers, tooltips, toasts, `bg-ink-700` +
   `ring-white/[0.09]` + `--shadow-float`.

No glassmorphism: no `backdrop-blur` on panels, menus or controls. Blur is
left only where it belongs to the game: the main menu's artwork and the
playtest's pause and countdown screens.

---

## 5. Components

Prefer these over hand-built equivalents.

### Buttons — `Button`, `buttonClass()` (`ui/Controls`, `ui/buttonStyles`)

| Variant | Use |
| --- | --- |
| `accent` | The one primary action of a surface (Export .osz, Log in, Apply SV) |
| `primary` | Secondary actions on a raised plate (the name predates the system; it is the neutral button) |
| `ghost` | Tertiary actions, toolbar buttons |
| `danger` | Destructive actions |

Sizes `md` (32px) and `sm` (28px). There is at most one `accent` button per
surface; in a list of equal tools (the Tools dialog) every action is
`primary`. No press-scale animations.

`buttonClass(variant, size, extra)` gives the same look to a `<label>` file
picker or a link. `mergeClasses` (`ui/cx`) lets a caller's size classes
override the base ones, so `className="px-2"` actually wins.

### Inputs — `TextInput`, `NumberInput`, `INPUT_CLASS`, `Dropdown`

Wells: `bg-black/25 ring-1 ring-inset ring-white/[0.08]`, accent ring on
focus. `Dropdown` uses the same field look and the shared popover. Hand-built
fields (search with an icon, number with a unit) spread `INPUT_CLASS`.

### Field and SectionHeading

`Field` puts a sentence-case label (`text-xs text-slate-300`) above a control
with an optional hint. `SectionHeading` titles a group.

### SegmentedControl

- `variant="segmented"` (default): choosing a value (sort order, mode, rate).
  Inset track, selected option is a raised neutral plate. Never accent.
- `variant="tabs"`: navigation inside a dialog or page. Text tabs on a
  hairline, the current one marked with the hit line.

If switching it changes *what you are looking at*, it is tabs. If it changes a
*value*, it is segmented.

### Toggle, Slider

Switch: 32×18, accent when on. Slider: 4px neutral track with an accent fill, light thumb,
focus ring around the thumb, value shown beside it in `SliderValue`.

### Menus and popovers — `Menu`, `POPOVER_CLASS`, `POPOVER_ITEM_CLASS`

One floating surface for the File menu, dropdown lists, the language picker,
the account menu, timeline context menus and the inbox. Items are 28px rows
with `rounded-md` hover tint; the selected option shows a check, not accent
text; shortcuts sit right-aligned in mono.

### Keycaps — `.keycap`, `Kbd`, `.keycap-editable`

Keys are the one control drawn as a physical object: a small plate with a
heavier lower edge. A key the reader can rebind has its lower edge lit in the
accent (`.keycap-editable`). Conflicts are outlined in amber.

### Floating editor tools — `.float-chip`

Anything that floats over the playfield (mode switch, receptor status,
selection bar, clipboard, hitsound bar, speed and pp, playtest panels) uses
`.float-chip`: a near-opaque dark plate with a hairline, no blur.

### Lists and rows

Lists are rows on the surface, not cards in a grid: thumbnail, a display-face
title, one line of secondary text, actions revealed on hover or focus (and
always shown on touch devices). Used by the sample-map browser, My Maps,
project pickers, the profile's maps, the mapper directory, conversations and
friends.

For difficulties of a set use the **difficulty spread** (one tick per
difficulty in its star colour) instead of a badge per difficulty.

### Status

Status is text beside a dot (`Saved`, `Live`, `Synced`), not a badge or pill.
Counts on icons use `HEADER_BADGE`.

### Empty and loading states

Empty: a quiet icon in `slate-600`, a display-face title, one sentence, and
the action that fixes it. Loading: skeletons shaped like the content they
replace (`SkeletonListRows`, `SkeletonRows`), never a centred spinner for
lists.

---

## 6. Layout and navigation patterns

Choose the container by what the feature is, not by habit.

| Pattern | When | Examples |
| --- | --- | --- |
| **Menu bar** | Every editor tool, always one click away | `AppHeader`: a solid bar; File first, then the tools; the open tool is highlighted |
| **Dialog** (`Modal`) | A focused task that returns to the map | Difficulty, Timing (modeless, draggable), SV, Tools, AiMod, Map Card |
| **Workspace dialog** | Many settings or long content with its own navigation | Settings: category rail, rows, info pane |
| **Full view** | A place you go, with its own navigation, that should not feel like a popup | Social (profiles, friends, messages, community), Pack Creator |
| **Popover** | Quick choices anchored to a control | Menus, dropdowns, inbox, history |
| **Small dialog** | Confirmation or one input | New map, Import, Hold-to-confirm |

Rules:

- **Never lose work.** Full views and dialogs open over the editor; the editor
  stays mounted underneath and is exactly as it was on return.
- **No dialog inside a dialog**, except a confirmation.
- **No navigation inside navigation.** A dialog may have one tab row.
- Dialog anatomy: title (with the tool's accent tick) and close in a 48px
  header; body `px-5 py-4`; footer right-aligned with the primary action last.
  The header separator appears only when the body scrolls.
- Inside a dialog, groups are divided by a hairline
  (`border-t border-white/[0.06] pt-4`), never boxed.

### Settings workspace

`settingsLayout.tsx`: `SettingsSection` (heading + rows divided by
hairlines), `SettingRow` (label left, control right, `indent` for a setting
that depends on the one above), `SettingsInfoPane`. The info pane shows the
description and diagram of the row under the pointer or focus; below about
920px of dialog width it disappears and the same text opens as a tooltip.
Content is capped at `max-w-[44rem]` so labels and controls stay close.

---

## 7. Interaction

- **Motion is short and decisive**: `--motion-quick` 110ms (hover, press),
  `--motion-enter` 200ms, `--motion-exit` 150ms. Dialogs lift 6px and fade;
  menus drop 4px. No overshoot or bounce outside the main menu and HUD,
  where it is part of the rhythm-game feel. Keep `src/lib/motion.ts` in step.
- **Hover** tints; **pressed** tints darker. No scale-on-press.
- **Focus**: every focusable element shows an accent outline or ring on
  keyboard focus only (`:focus-visible`). A global rule covers anything that
  does not draw its own.
- **Disabled**: 40% opacity and `cursor-not-allowed`; it never changes
  colour.
- **Selection** uses the hit line or a neutral raised plate, multi-selection
  sky, editor note selection amber.
- **Reduced motion** (`prefers-reduced-motion`) and **performance mode**
  (`data-performance="on"`) cut animations to 1ms; new animations must be
  added to the reduced-motion list in `index.css`.
- Destructive actions use `danger` styling and a confirmation; irreversible
  ones use hold-to-confirm.

---

## 8. Accessibility

- Text contrast ≥ 4.5:1 for anything you need to read (`slate-400` and up on
  panels); `slate-500` only for meta that repeats information.
- Interactive targets at least 24px high in the dense editor chrome (selection
  bar, timeline zoom), 28px elsewhere in chrome and 32px in dialogs.
- Tabs use `role="tablist"`/`tab` with `aria-selected`; current page links use
  `aria-current="page"`. Toggles are `role="switch"`.
- Information is never carried by colour alone: status has text, conflicts
  have a written warning, the slowed-playback state shows the percentage.
- Icon-only buttons have `aria-label` and `title`.
- Keep the existing keyboard handling (menus, dropdowns, dialog focus trap via
  `useDialog`) when restyling.

---

## 9. Responsive behaviour

Desktop and phone use the same editor actions. A narrow touch screen, including
a phone in landscape, gets a full-width playfield and a thumb toolbar. Phone
styles key off `html[data-phone]`; the hook also tracks the visible viewport so
the keyboard and browser bars do not hide a sheet's controls.

- Use the interface-scale-aware variants `uimd:`, `uilg:`, `uixl:` for chrome
  that depends on available space, since the interface scale changes the root
  font size.
- The menu bar folds tools into **More** below `uixl`.
- Settings: info pane above ~920px of dialog width; category rail as a
  vertical list above 600px, a horizontal scroller below.
- Social: navigation rail on `md` and up, a horizontal strip below; messages
  show one pane at a time on narrow screens.
- The phone start screen is one screen of actions: no menu music, background
  or landing copy (the static page carries that copy for search engines).
- On phones, All tools browses and searches the same commands as the desktop
  palette. File actions, account controls and notifications remain available.
- Difficulties sit two to a row on phones; their actions share one bar under
  the grid instead of growing each card.
- Difficulties, selection, clipboard, hitsounds, statistics and the timeline
  open as sheets. Sheets preserve the mounted canvas and use the shared Modal.
- Move navigates; Note places taps or drags long notes; Select toggles notes or
  boxes empty space; Erase removes a tapped note. Pinch zooms without committing
  a provisional note. Pointer cancellation never commits an edit.
- Phone controls have 44px targets; editable fields use at least 16px type.
  Sheets do not open the software keyboard until a field is tapped. Labels
  explain touch actions; desktop keyboard hints stay in desktop chrome.
- Phone focus mode keeps a tool picker, undo, playback, time and All tools.
- Pack Creator scrolls horizontally on desktop and switches between Maps,
  Selected map and Pack settings on phones, retaining each pane's state.
- No horizontal page scroll at any width; dropdowns and menus flip and clamp to
  the viewport. Right-aligned popovers use `popoverRight` so a trigger near the
  left edge cannot push them off screen.

---

## 10. Classic design (dormant)

The classic look (Cascade's earlier design) is kept in the Classic block of
`index.css` but is **not offered in Settings at the moment**, and nothing sets
it. Putting `data-theme="classic"` on `<html>`:

- swaps the token values: Quicksand for all text, the previous ink and slate
  palettes, rounder radii, the larger type scale, no forced tabular figures;
- restyles the shared primitives through hook classes: translucent blurred
  chrome (`.app-header`), dialog headers washed in the tool colour with the
  glow line (`.ui-modal-header`), filled coral buttons and tab or segment
  pills (`.ui-btn-*`, `.ui-tabs`, `.ui-segmented`), lighter fields
  (`.ui-input`), frosted popovers (`.ui-popover`), uppercase section labels
  (`.ui-section-title`), a coral outline instead of the hit line, and the
  springier entrance.

To offer it again, add a setting that toggles that attribute before paint
(in `useAppSettings`, as performance mode does). Keep the hook classes on the
primitives so the block keeps working.

## 11. Settings search

The search field at the top of the settings rail (Ctrl/Cmd+F; Esc clears)
lists every category at once and keeps the rows whose name or description
contains all the typed words (`src/lib/settingsSearch.ts`). A query that
names a category or section shows all of it. Content that is not a row (a
preview, the key grid, a note) goes in `<SettingsExtra keywords={…}>` so it
takes part. A new setting written as a `SettingRow` inside a
`SettingsSection` is searchable with no extra work.

---

## 12. Checklist for new UI

1. Is it one surface? Remove any border or background that only frames.
2. Is there exactly one accent element, and does it mean "this one"?
3. Are headings sentence case, with hierarchy from size and weight?
4. Do inputs look like wells and buttons like plates?
5. Does it use the shared primitives (Button, Field, Dropdown, Menu,
   SegmentedControl, SettingRow, Modal) instead of new classes?
6. Does keyboard focus show? Does it work with reduced motion?
7. Does it hold at 1024px wide and at 150% interface scale?
8. Would it make sense in Cascade's main menu, editor and settings at once?
