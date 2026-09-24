# Translations

Cascade ships English plus German, Russian, Simplified Chinese and Brazilian
Portuguese. Locale files live in `src/lib/i18n/locales/`.

## How it works

- `en.ts` is the source of truth. Every key must exist there.
- Other locales are partial. Any key they omit falls back to English at
  runtime, so a half-finished locale never shows a raw key to a user.
- `t("some.key", { name })` replaces `{name}` in the string. Placeholders must
  survive translation exactly, including their spelling. `npx vitest run
  src/lib/i18n` fails if a locale drops or renames one.
- Passing `count` selects a plural form via `Intl.PluralRules`. English and
  German need `.one` / `.other`; Portuguese the same; Russian needs `.one` /
  `.few` / `.many`; Chinese needs only `.other`. Missing forms fall back to
  `.other`, then to English.

## Adding a language

1. Add the code to `Locale` and `LOCALES` in `src/lib/i18n/core.ts`, plus a
   branch in `resolveLocale` so browser language detection picks it up.
2. Add `src/lib/i18n/locales/<code>.ts` exporting a `PartialCatalog`, and
   register it in the `CATALOGS` map.
3. Run `npx vitest run src/lib/i18n`.

Fonts: the sans stack in `src/index.css`, `tailwind.config.js`, `index.html`
and `CANVAS_FONT_STACK` in `src/components/ManiaEditor.tsx` all end with CJK
families. A language needing a different script must be added to all four.

## Terms that need a native review

The strings below use rhythm-game jargon where the community convention
matters more than a literal translation. Each one is a judgement call that a
native speaker who plays mania should confirm or correct.

### Left in English on purpose, all locales

`SV`, `BPM`, `OD`, `HP`, `UR`, `AiMod`, `Pack Creator`, `Map Card`, `MSD`, `BBCode`, `kiai`, `normal` /
`soft` / `drum`, `whistle` / `finish` / `clap`, `.osu` / `.osz` / `.sm` /
`.ssc`, `Live`, `Realtime`, the `#SUBTITLE`-style StepMania header tags, and the Etterna skillset names
(`Stream`, `Jumpstream`, `Handstream`, `Stamina`, `Jackspeed`, `Chordjack`,
`Technical`, and `Chordstream` / `Bracketing` above 4K) in the MSD tooltip and
the skillset graph.
These are file formats, product names, or terms every mania mapper reads in
English regardless of locale.

Third-party brand names are never translated and are deliberately not keys at
all, so no catalog can pick them up: Discord, osu!, Etterna, StepMania, Ko-fi
and Quaver are left as written wherever they appear.

`Difficulty` is also left in English in the top navigation of every locale,
because it names a menu whose contents mappers discuss in English. The word is
translated everywhere it appears as prose.

### German

| Term | Used | Note |
| --- | --- | --- |
| Downscroll / Upscroll | kept English | Standard in the German osu! community. Translating reads wrong. |
| Long Notes | kept English | "Langnoten" exists but is rare in practice. |
| Hitsounds | kept English | Same. |
| Playtest | kept English | Used as the tab label; "Testspiel" was rejected as unidiomatic. |
| Snap-Linien | hybrid | "Snap" kept, "Linien" translated. Confirm this reads naturally. |
| Receptors | kept English | No settled German term. |
| Bewertungslinie | translated | For "judgement line". Some players say "Judgement Line". |
| Diff / Diffs | kept English | Used in the project cards. |
| Rate | kept English | Confirm against "Geschwindigkeit" in practice. |

### Russian

| Term | Used | Note |
| --- | --- | --- |
| даунскролл / апскролл | transliterated | Confirm against Latin "downscroll" which is also common in chat. |
| хитсаунды | transliterated | Widely used. |
| плейтест | transliterated | Confirm against "тест". |
| снап | transliterated | In "линиями снапа". |
| рейт | transliterated | For playback rate. |
| рецепторов | transliterated | For receptors. |
| сложность | translated | For difficulty. Note the plural forms in `startModal.projectNote` use `сложность` / `сложности` / `сложностей`; a mapper may prefer the borrowed "дифф". |
| линии судейства | translated | For judgement line. |

### Simplified Chinese

| Term | Used | Note |
| --- | --- | --- |
| 长条 | translated | For long notes. 面条 is the common slang; 长条 was chosen as the neutral register. Worth confirming which fits the product voice. |
| 下落 / 上滚 | translated | For downscroll / upscroll. Many Chinese players use the English words directly. |
| 打击音效 | translated | For hitsounds. |
| 试玩 | translated | For playtest. |
| 谱面 / 图组 | translated | Beatmap / mapset. 图组 for the set, 谱面 for a single map. |
| 谱师 | translated | For the map creator. |
| 吸附线 | translated | For snap lines. |
| 判定线 | translated | Used for both the judgement line and, in `settings.hitPositionOffsetHint`, the receptors. Confirm that reads correctly. |
| 变速 | translated | For playback rate. Distinct from SV, which stays English. |
| 时间点 | translated | For timing points, and the Timing menu label. |

### Brazilian Portuguese

| Term | Used | Note |
| --- | --- | --- |
| Downscroll / Upscroll | kept English | Standard in the Brazilian community. |
| lanes | kept English | "pistas" was rejected; confirm. |
| Hitsounds | kept English | Same. |
| Rate | kept English | Confirm against "velocidade". |
| snap | kept English | In "linhas de snap". |
| receptores | translated | Confirm against the English "receptors". |
| notas longas | translated | Confirm against "LN", which is also common. |
| Teste | translated | Tab label for Playtest. Confirm against keeping "Playtest". |
| diff / diffs | kept English | In the project cards. |

## Known gaps

Extraction is partial. These surfaces are still hardcoded English and will
render in English regardless of the selected language:

- `src/App.tsx` beyond the top navigation and File menu: progress labels,
  notices and confirmation dialogs.
- `BottomTimeline.tsx`.
- `TimingModal`, `SvModal`, `ToolsModal`, `DifficultyModal`, `SkinModal`,
  `AiModModal`, `MyMapsModal`, `PackBrowserModal`, `PresetBrowserModal`,
  `PublishPresetModal`, `FeedbackModal`, `ExportValidationModal`,
  `BackgroundScopeModal`.
- `PackCreator` and its child components, `CommentsSidebar`,
  `NotificationInbox`, `PlaytestOverlay`, `RateChangerPanel`, `AdminPanel`.
- `src/lib/validation.ts` and `src/lib/aimod.ts` issue messages. These are
  generated outside React; use the module-level `t` from `src/lib/i18n/core.ts`
  when extracting them, which keeps the English assertions in
  `validation.test.ts` passing because the module defaults to `en`.
- The standalone landing pages in `public/` and the meta tags in `index.html`.
  These need their own hreflang and sitemap work.

## Layout

Translated labels run 30-40% longer than English in German and Russian. The
editor header caps the nav and the right-hand controls at `max-w-[68rem]`
(`src/App.tsx`); raising label lengths past that will clip again. The left
group carries `min-w-0` and the right group `shrink-0` so the language picker
and account button are never the thing that gets squeezed.
