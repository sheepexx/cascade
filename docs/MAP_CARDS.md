# Map Cards

A Map Card is a PNG summary of one difficulty, meant for osu! map descriptions
and Discord. It is opened from **Tools → Map Card**, **File → Create Map Card…**,
the command palette, or the optional prompt shown after an export.

## How it fits together

| Piece | Where |
|---|---|
| Config types, built-in presets, data builder | `src/lib/mapCard.ts` |
| Canvas renderer (preview and export share it) | `src/lib/mapCardRender.ts` |
| Presets and hosted-card lookup (Supabase) | `src/lib/mapCardCloud.ts` |
| Upload and delete (Worker) | `src/lib/storage.ts` |
| Editor dialog and post-export prompt | `src/components/menus/MapCardModal.tsx`, `MapCardPrompt.tsx` |
| Editor panels | `src/components/mapCard/` |
| State hooks | `src/hooks/useMapCardPresets.ts`, `useHostedMapCard.ts`, `useLoadedImage.ts` |
| Worker routes | `worker/src/storage.ts` (`/storage/cards`, `/card/<slug>.png`) |
| Database | `supabase/migrations/0034_map_cards.sql` |

The card reads everything from the open map. Stats come from
`computeMapStats`, `computeStarRating`, `bpmRange` and `dominantBpm`, and MSD
from the existing MinaCalc worker through `useMsdRatings`, so the numbers match
the difficulty sidebar.

The preview canvas and the exported PNG are drawn by the same function at the
same 2x scale (1600 px wide), so the preview is the export.

## Hosted images

Hosted cards follow the existing storage split: metadata in Supabase, bytes in
R2 behind the Worker.

- `PUT /storage/cards?key=<map key>` (signed in) validates a PNG up to 8 MB and
  4096 px per side, then stores it in the `cascade-shared` bucket as
  `cards/<slug>.png` and upserts a `map_cards` row with the service role.
- The map key is `osu-<beatmap id>` for submitted difficulties, otherwise
  `<project id>.<difficulty id>`. Each account has one card per key, so
  uploading again replaces the image and keeps the link. Up to 100 hosted
  cards per account.
- `GET /card/<slug>.png` is public and returns the PNG itself with
  `Cache-Control: public, max-age=300` and an ETag, so an update shows up
  within minutes in osu! and Discord.
- `DELETE /storage/cards/<slug>` removes the row, then the object. Only the
  owner or an admin may delete.
- `vercel.json` rewrites `https://cascade.sheepex.net/card/:file` to the
  Worker, which is the link users copy:
  `[img]https://cascade.sheepex.net/card/<slug>.png[/img]`.

`map_cards` is readable by its owner only. Clients cannot insert, update or
delete rows; only the Worker writes them, so a row always matches its object.

## Presets

`map_card_presets` stores configuration only (`config` jsonb), never map data.
Rows are owned by `user_id`, protected by RLS (select, insert, update and
delete only your own), unique per `(user_id, name)` so saving under an
existing name updates it, and capped at 50 per account by a trigger. Configs
are normalized on read and write by `normalizeMapCardConfig`, so older or
hand-edited rows still load.

The last used settings are also kept in `localStorage` as a per-browser
convenience.

## Setup

1. Apply `supabase/migrations/0034_map_cards.sql` in the Supabase SQL editor
   or with the Supabase CLI.
2. Deploy the Worker (push to master). It reuses the existing
   `SHARED_ASSETS` binding (`cascade-shared`), so no new bucket or secret is
   needed.
3. Deploy the SPA. The `/card/:file` rewrite ships in `vercel.json`.
