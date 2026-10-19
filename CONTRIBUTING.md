# Contributing to Cascade

Thanks for helping. Bug reports, chart files that break an import or export,
translations and code are all welcome.

## Reporting a problem

- **A crash or a broken map:** the crash screen and the export check both
  have a *Copy error details* button. Paste that into an issue or the
  [Discord](https://discord.gg/zczMegSvgG) along with what you were doing.
- **A file that imports or exports wrongly:** attach the file if you can. If
  it's a ranked map, the beatmap link is enough.
- **Something confusing:** that counts as a bug too. Say what you expected.

Check the open issues first; adding a comment or a file to an existing one
helps more than a duplicate.

## Getting the code running

You need Node.js 22.13 or newer (24 and later work too; `.nvmrc` names the
version CI uses). Install the editor's packages and the Worker's: the root
test run includes the Worker's tests, which need its own packages.

```bash
npm ci
npm ci --prefix worker
npm run dev
```

The editor runs at http://localhost:5173 without any backend: local
projects, playtest, import and export all work. Login, cloud saves,
collaboration and sharing need the backend described in the
[README](README.md#backend).

The desktop app also needs a stable Rust toolchain and the Tauri 2 system
dependencies; then `npm run desktop`.

Linux AppImages must include their own GStreamer plugins and scanner alongside
the bundled WebKitGTK libraries. Keep `bundle.linux.appimage.bundleMediaFramework`
enabled and install `gstreamer1.0-plugins-base`, `gstreamer1.0-plugins-good`, and
`gstreamer1.0-libav` on the Ubuntu build runner. Using host plugins with the
bundled libraries can cause ABI conflicts on newer distributions (issue #10).
The desktop workflow extracts each built AppImage and runs
`bash scripts/check-appimage-media.sh /path/to/squashfs-root` on the build system
(with `gstreamer1.0-tools` installed) to check its relocated plugin/scanner paths,
plugin blacklist, and audio elements with a fresh registry. A release still
needs a manual UI, fullscreen, and audio check on the target Linux desktop.

For local AppImage testing on Arch, install `patchelf`, `gst-plugins-base`,
`gst-plugins-good`, and `gst-libav`, then prepare separate plugin and helper directories. Arch puts helpers and
plugins together; copying that directory as the helpers duplicates plugins.
The Python plugin also needs a complete Python runtime and is unnecessary for
Cascade's media playback, so leave it out:

```bash
media=$(mktemp -d)
mkdir "$media/plugins" "$media/helpers"
cp /usr/lib/gstreamer-1.0/libgst*.so "$media/plugins/"
rm -f "$media/plugins/libgstpython.so"
cp /usr/lib/gstreamer-1.0/gst-plugin-scanner "$media/helpers/"
cp /usr/lib/gstreamer-1.0/gst-ptp-helper "$media/helpers/"
export GSTREAMER_PLUGINS_DIR="$media/plugins"
export GSTREAMER_HELPERS_DIR="$media/helpers"
npm run desktop:build -- --bundles appimage
# After a packaging failure, retry without recompiling:
npx tauri bundle --bundles appimage --no-sign --verbose
```

On NVIDIA with WebKitGTK 2.54, Cascade selects the previous accelerated
compositor to avoid overlapping frames and initializes GTK's GL renderer before
the first Wayland frame. This preserves DMA-BUF and explicit synchronization;
disabling either may trade startup failures for low FPS or flicker. Explicit
`GDK_GL` and `WEBKIT_USE_SKIA_FOR_COMPOSITION` settings override these defaults.
On Linux, Cascade also disables WebKit's preference for page updates near 60 FPS
so animation and editor frames can follow high refresh rate displays. The public
feature API is resolved at runtime; older WebKit installations without it keep
their existing behavior.
Some NVIDIA drivers reject DRM vblank waits, causing WebKit to use a fixed
60 Hz fallback even on a faster display. Cascade adapts only unsupported
relative single-frame waits to an absolute monotonic timer at the active CRTC's
rate. Supported driver calls, event/signal requests, and permission errors pass
through. This changes scheduling inside Cascade; EGL/Wayland still controls
presentation. Set `CASCADE_DISABLE_VBLANK_FALLBACK=1` to opt out.
See the [WebKit compositor notes](https://blogs.igalia.com/carlosgc/tag/webkit/)
and [GTK/NVIDIA synchronization issue](https://bugs.webkit.org/show_bug.cgi?id=324551).
On NVIDIA/Wayland, GTK 3's GL path can also retain a 60 Hz
window-paint timer. When the window's monitor is faster than GTK's reported
clock, Cascade processes pending paint regions on the GTK main thread at a
shorter interval. It does not invalidate idle content, disable synchronization,
or change system GTK libraries. Hidden/minimized windows use a slower check.
Set `CASCADE_DISABLE_PRESENT_FALLBACK=1` to opt out.
For rendering bug reports, launch with `CASCADE_RENDER_DIAGNOSTICS=1` to log the
frame rate, frame-time percentiles, and animation callback cost. The diagnostics are off
by default and do not record project content.

## Before you open a pull request

Run what CI runs:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run typecheck --prefix worker
npm run test:integration
```

`npm run test:integration` runs the workflows unit tests can't reach (see
below). The first time, install its browser with
`npx playwright install chromium`.

and, if you touched `src-tauri`:

```bash
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

Linux display-clock changes also have a headless native protocol check:

```bash
cc -std=c11 -Wall -Wextra -Werror $(pkg-config --cflags libdrm) \
  src-tauri/tests/linux_vblank_test.c -o /tmp/cascade-vblank-test -ldl -pthread
/tmp/cascade-vblank-test
```

Please also:

- **Add or update tests** for logic you change. Pure functions in `src/lib`
  are tested with Vitest next to the file (`thing.ts` and `thing.test.ts`).
- **Don't skip, loosen or delete a failing test** to get green. If a test is
  wrong, say why in the pull request.
- **Keep TypeScript strict.** No `any`; prefer a precise type or `unknown`
  narrowed with a check.
- **Check the editor still feels fast** if you touch the editor, the canvas
  or anything that runs per note. `npm run perf` prints timings for 10k, 50k
  and 100k-note charts; compare before and after.
- **Try it in the browser.** Open a map, place and undo notes, play, playtest
  and export. Type checks don't catch a broken dialog.

## Integration tests

`tests/integration` checks whole workflows rather than single functions:

- `db/` applies every migration in `supabase/migrations` to a real Postgres
  ([PGlite](https://pglite.dev), in-process, no Docker) and calls the
  database functions as owners, editors, viewers and strangers, under the
  real row-level security.
- `browser/` opens the editor's collaboration pipeline (the live session,
  undo history and cloud save hooks App uses) in separate Playwright browser
  contexts, one per collaborator. `browser/backend.ts` stands in for
  Supabase on top of the same PGlite database: requests run as the signed-in
  user, and Realtime joins and broadcasts are checked against the
  `realtime.messages` policies. Tests can hold back, reorder or drop what a
  window receives to play out delays and reconnects.

What they don't cover: the backend speaks a reduced protocol to a stand-in
client (`browser/fakeSupabase.ts`), not supabase-js to the real Supabase
services, and the harness page doesn't draw the editor's canvas or play
audio. Changes to supabase-js usage or the Realtime setup still need a try
against a real project.

When you change saving, collaboration or a migration, add a scenario there.
New migrations are picked up automatically.

## Import and export changes

Format code is where small mistakes hurt most, because they change people's
maps. `src/lib/roundTrip.corpus.test.ts` imports, exports and re-imports every
chart in `src/lib/fixtures/corpus` and the sample maps, and fails on any
difference a mapper or player would notice. To check a whole osu! Songs
folder without adding it to the repository:

```bash
CASCADE_CORPUS=/path/to/osu/Songs npx vitest run src/lib/roundTrip.corpus.test.ts
```

If you fix a format bug, add a small chart to `src/lib/fixtures/corpus` that
shows it, named after what it covers.

## Translations

See [docs/TRANSLATIONS.md](docs/TRANSLATIONS.md). English in
`src/lib/i18n/locales/en.ts` is the source; other locales may be partial and
fall back to English.

## Database changes

Schema changes go in a new numbered file in `supabase/migrations`, never in an
old one, and should be safe to run twice. Anything that reads usage data must
stay aggregate: the privacy policy promises usage events carry no ID that links
one to another.

## Code style

- Match the code around you: its naming, comment density and patterns.
- Comments explain why, in plain sentences; the code says what.
- User-facing text goes through `t()` with a key in `en.ts`.
- Keep changes focused. A refactor and a behaviour change are easier to
  review as separate pull requests.

## License

The repository doesn't have a license file yet. Until one is added, please
open an issue to talk about a larger change before you start on it.
