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

You need Node.js 20 or newer.

```bash
npm ci
npm run dev
```

The editor runs at http://localhost:5173 without any backend: local
projects, playtest, import and export all work. Login, cloud saves,
collaboration and sharing need the backend described in the
[README](README.md#backend).

The desktop app also needs a stable Rust toolchain and the Tauri 2 system
dependencies; then `npm run desktop`.

## Before you open a pull request

Run what CI runs:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

and, if you touched `src-tauri`:

```bash
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
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
