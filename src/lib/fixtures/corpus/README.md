# Round-trip corpus

Every chart in this folder is imported, exported and imported again by
`src/lib/roundTrip.corpus.test.ts`, which checks that nothing a mapper or a
player would notice changed: notes, holds, hitsounds, timing, SV, metadata and
difficulty settings. `.osu` charts are also converted to StepMania, Quaver and
Malody where the key count allows, and checked against what those formats can
hold.

To add a case, drop a `.osu`, `.osz`, `.sm`, `.ssc`, `.qua` or `.mc` file here.
Keep each file small and about one thing worth pinning down; say what it covers
in its name. The ranked sets in `public/maps` are checked the same way.

To check a whole collection without adding it to the repository:

```bash
CASCADE_CORPUS=/path/to/osu/Songs npx vitest run src/lib/roundTrip.corpus.test.ts
```

A failure prints which map, which difficulty and what changed, with a few
example notes or timing points.
