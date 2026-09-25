import { describe, it, expect, beforeAll } from "vitest";
import JSZip from "jszip";
import { importOsk } from "./skinImport";

/**
 * Fixtures are shaped after the skins people actually have installed rather
 * than after the skin.ini spec: most declare a single keymode, many declare
 * none at all, and they lean on osu!'s shared mania-note1/2/S art for
 * everything else.
 */

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);

/** The shared art osu! falls back to when a keymode names no images. */
const SHARED_ART: Record<string, Uint8Array> = {
  "mania-note1.png": PNG,
  "mania-note2.png": PNG,
  "mania-noteS.png": PNG,
  "mania-note1H.png": PNG,
  "mania-note2H.png": PNG,
  "mania-noteSH.png": PNG,
  "mania-note1L.png": PNG,
  "mania-note2L.png": PNG,
  "mania-noteSL.png": PNG,
  "mania-note1T.png": PNG,
  "mania-note2T.png": PNG,
  "mania-noteST.png": PNG,
  "mania-key1.png": PNG,
  "mania-key2.png": PNG,
  "mania-keyS.png": PNG,
};

// JSZip cannot read Node's Blob, so archives go in as bytes. importOsk only
// ever hands the value straight back on the loaded skin, so this is the same
// shape a browser would pass.
async function osk(files: Record<string, string | Uint8Array>): Promise<Blob> {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(files)) zip.file(path, content);
  const bytes = await zip.generateAsync({ type: "uint8array" });
  return bytes as unknown as Blob;
}

beforeAll(() => {
  // jsdom-free environment: object URLs only have to be unique and revocable.
  let next = 0;
  URL.createObjectURL ??= () => `blob:skin/${next++}`;
  URL.revokeObjectURL ??= () => {};
});

describe("importOsk", () => {
  it("gives every keymode the shared art, not just the declared one", async () => {
    const skin = await importOsk(
      await osk({
        "skin.ini": "[General]\nName: Four Only\n\n[Mania]\nKeys: 4\n",
        ...SHARED_ART,
      }),
      "four-only.osk",
    );

    // The declared keymode is the only one osu! writes down, but 7K and 10K
    // render from the same images, so the editor has to offer them too.
    expect(skin.keymodes[4]).toBeTruthy();
    expect(skin.keymodes[7]).toBeTruthy();
    expect(skin.keymodes[10]).toBeTruthy();
    expect(skin.keymodes[7]?.columns).toHaveLength(7);
    expect(skin.keymodes[7]?.columns[0].noteUrl).toBeTruthy();
    expect(skin.keymodes[7]?.columns[3].keyUrl).toBeTruthy();

    // Only 4K is the author's own layout, and the picker says so.
    expect(skin.keymodes[4]?.declared).toBe(true);
    expect(skin.keymodes[7]?.declared).toBe(false);
  });

  it("reads a skin that ships mania art but never mentions [Mania]", async () => {
    const skin = await importOsk(
      await osk({ "skin.ini": "[General]\nName: No Block\n", ...SHARED_ART }),
      "no-block.osk",
    );

    expect(skin.name).toBe("No Block");
    expect(Object.keys(skin.keymodes)).not.toHaveLength(0);
    expect(skin.keymodes[4]?.columns[0].noteUrl).toBeTruthy();
  });

  it("reads a skin with no skin.ini at all", async () => {
    const skin = await importOsk(await osk(SHARED_ART), "bare.osk");

    expect(skin.name).toBe("bare");
    expect(skin.keymodes[4]?.columns[0].noteUrl).toBeTruthy();
  });

  it("keeps a declared keymode that only sets column backgrounds", async () => {
    const skin = await importOsk(
      await osk({
        "skin.ini":
          "[Mania]\nKeys: 5\nColour1: 255,0,0\nColour2: 0,255,0\n" +
          "Colour3: 0,0,255\nColour4: 255,255,0\nColour5: 0,255,255\n",
      }),
      "colours.osk",
    );

    // Colours alone are a deliberate choice, so 5K survives; nothing else has
    // anything to draw, so nothing else is claimed.
    expect(Object.keys(skin.keymodes)).toEqual(["5"]);
    expect(skin.keymodes[5]?.columns[0].columnBackground).toBe("rgb(255, 0, 0)");
    expect(skin.keymodes[5]?.columns[0].noteUrl).toBeNull();
  });

  it("reads ColourN as the column background, never as a note tint", async () => {
    // Nearly every real skin sets ColourN to black, because osu! paints it
    // behind the column. Feeding that to the notes would draw them black on a
    // black stage, so it has to stay on its own field.
    const skin = await importOsk(
      await osk({
        "skin.ini":
          "[Mania]\nKeys: 4\nColour1: 0,0,0\nColour2: 0,0,0\n" +
          "Colour3: 0,0,0\nColour4: 0,0,0\n",
        "mania-key1.png": PNG,
        "mania-key2.png": PNG,
      }),
      "black-columns.osk",
    );

    const columns = skin.keymodes[4]!.columns;
    expect(columns.map((c) => c.columnBackground)).toEqual([
      "rgb(0, 0, 0)",
      "rgb(0, 0, 0)",
      "rgb(0, 0, 0)",
      "rgb(0, 0, 0)",
    ]);
    expect(columns.every((c) => c.noteUrl === null)).toBe(true);
    expect("colour" in columns[0]).toBe(false);
  });

  it("picks up the stage frame, which is all some skins draw", async () => {
    const skin = await importOsk(
      await osk({
        "skin.ini": "[General]\nName: Stage Only\n",
        "mania-stage-left.png": PNG,
        "mania-stage-right.png": PNG,
        "mania-stage-hint.png": PNG,
        // Animated pieces are stored as frames; the first one is the still.
        "mania-stage-bottom-0.png": PNG,
      }),
      "stage.osk",
    );

    // No notes, no [Mania] block — but the stage alone is a look worth having,
    // so the keymodes exist rather than falling back to nothing.
    const stage = skin.keymodes[4]?.stage;
    expect(stage?.left).toBeTruthy();
    expect(stage?.right).toBeTruthy();
    expect(stage?.hint).toBeTruthy();
    expect(stage?.bottom).toBeTruthy();
  });

  it("lets a keymode name its own stage pieces", async () => {
    const skin = await importOsk(
      await osk({
        "skin.ini": "[Mania]\nKeys: 4\nStageHint: my-hint\n",
        "mania-stage-hint.png": PNG,
        "my-hint.png": PNG,
      }),
      "stage-override.osk",
    );

    expect(skin.keymodes[4]?.stage.hint).toBeTruthy();
    expect(skin.keymodes[4]?.stage.hint?.url).not.toBe(
      skin.keymodes[5]?.stage.hint?.url ?? null,
    );
  });

  it("halves the scale of a stage piece that only ships at @2x", async () => {
    const skin = await importOsk(
      await osk({
        "skin.ini": "[General]\nName: Doubled\n",
        "mania-stage-left@2x.png": PNG,
        "mania-stage-right.png": PNG,
      }),
      "hd-stage.osk",
    );

    // Stage pieces are the one place a skin's own pixel size is drawn as-is,
    // so an @2x image has to count for half of one — otherwise the rail comes
    // out twice as wide as the author drew it.
    const stage = skin.keymodes[4]?.stage;
    expect(stage?.left?.scale).toBe(0.5);
    expect(stage?.right?.scale).toBe(1);
  });

  it("resolves art a keymode names inside a subfolder", async () => {
    const skin = await importOsk(
      await osk({
        "skin.ini":
          "[Mania]\nKeys: 4\nNoteImage0: mania/arrows/left\n" +
          "KeyImage0: mania/arrows/k_left\n",
        "mania/arrows/left.png": PNG,
        "mania/arrows/k_left.png": PNG,
        ...SHARED_ART,
      }),
      "subfolder.osk",
    );

    const columns = skin.keymodes[4]!.columns;
    expect(columns[0].noteUrl).toBeTruthy();
    expect(columns[0].keyUrl).toBeTruthy();
    // The named art is its own file, not the shared default the others get.
    expect(columns[0].noteUrl).not.toBe(columns[1].noteUrl);
  });

  it("falls back to the shared art when a named image is missing", async () => {
    const skin = await importOsk(
      await osk({
        // The file this points at never made it into the archive.
        "skin.ini": "[Mania]\nKeys: 4\nNoteImage0: mania/arrows/left\n",
        ...SHARED_ART,
      }),
      "dangling.osk",
    );

    // osu! draws the default rather than nothing, so a reference that did not
    // travel must not blank the column.
    const columns = skin.keymodes[4]!.columns;
    expect(columns[0].noteUrl).toBeTruthy();
    expect(columns[0].noteUrl).toBe(columns[3].noteUrl);
  });

  it("falls back tail to head to note, as osu! looks them up", async () => {
    const headOnly = await importOsk(
      await osk({
        "skin.ini": "[Mania]\nKeys: 4\n",
        "mania-note1.png": PNG,
        "mania-note2.png": PNG,
        "mania-note1H.png": PNG,
        "mania-note2H.png": PNG,
        // No mania-note*T at all — most skins ship none.
      }),
      "no-tail.osk",
    );
    const columns = headOnly.keymodes[4]!.columns;
    expect(columns[0].holdTailUrl).toBe(columns[0].holdHeadUrl);

    const noteOnly = await importOsk(
      await osk({
        "skin.ini": "[Mania]\nKeys: 4\n",
        "mania-note1.png": PNG,
        "mania-note2.png": PNG,
      }),
      "note-only.osk",
    );
    const bare = noteOnly.keymodes[4]!.columns;
    expect(bare[0].holdTailUrl).toBe(bare[0].noteUrl);
  });

  it("prefers a real tail image over the fallbacks", async () => {
    const skin = await importOsk(
      await osk({ "skin.ini": "[Mania]\nKeys: 4\n", ...SHARED_ART }),
      "with-tail.osk",
    );

    const columns = skin.keymodes[4]!.columns;
    expect(columns[0].holdTailUrl).toBeTruthy();
    expect(columns[0].holdTailUrl).not.toBe(columns[0].holdHeadUrl);
    expect(columns[0].holdTailUrl).not.toBe(columns[0].noteUrl);
  });

  it("reads NoteBodyStyle as the one distinction osu! makes", async () => {
    const skin = await importOsk(
      await osk({
        "skin.ini":
          "[General]\nVersion: 2.7\n\n[Mania]\nKeys: 4\n" +
          "NoteBodyStyle: 2\nNoteBodyStyle1: 1\n",
        ...SHARED_ART,
      }),
      "bodystyle.osk",
    );

    // `LegacyNoteBodyStyle` has no member for 1, and 2 shares a branch with
    // every other non-zero value, so neither of these asks for the stretch.
    const columns = skin.keymodes[4]!.columns;
    expect(columns.map((c) => c.bodyStretch)).toEqual([false, false, false, false]);
    expect(skin.keymodes[7]!.columns[0].bodyStretch).toBe(false);
  });

  it("stretches a hold body only when NoteBodyStyle says 0", async () => {
    const plain = await importOsk(
      await osk({ "skin.ini": "[Mania]\nKeys: 4\n", ...SHARED_ART }),
      "plain-body.osk",
    );
    // Skins rely on the default: plenty ship a 20000px body and declare
    // nothing, which only works if it is drawn over osu!'s fixed strip and
    // clipped rather than squashed into the note.
    expect(plain.keymodes[4]!.columns.every((c) => !c.bodyStretch)).toBe(true);

    const stretched = await importOsk(
      await osk({
        "skin.ini":
          "[General]\nVersion: latest\n\n[Mania]\nKeys: 4\nNoteBodyStyle: 0\n",
        ...SHARED_ART,
      }),
      "stretch-body.osk",
    );
    expect(
      stretched.keymodes[4]!.columns.every((c) => c.bodyStretch),
    ).toBe(true);

    // The wiki documents a version gate on this; osu!'s decoder has none, so
    // an old skin asking for the stretch still gets it.
    const old = await importOsk(
      await osk({
        "skin.ini":
          "[General]\nVersion: 2.2\n\n[Mania]\nKeys: 4\nNoteBodyStyle: 0\n",
        ...SHARED_ART,
      }),
      "old-body.osk",
    );
    expect(old.keymodes[4]!.columns.every((c) => c.bodyStretch)).toBe(true);
  });

  it("falls back to an opaque black column, and squares a declared alpha", async () => {
    const skin = await importOsk(
      await osk({
        "skin.ini":
          "[Mania]\nKeys: 4\nColour2: 20,30,40,128\nColour3: 20,30,40,0\n",
        ...SHARED_ART,
      }),
      "colour-alpha.osk",
    );

    const columns = skin.keymodes[4]!.columns;
    // Undeclared is `?? Color4.Black`, which skin art counts on being solid.
    expect(columns[0].columnBackground).toBe("rgb(0, 0, 0)");
    // `ApplyWithDoubledAlpha` sets the drawable's alpha as well as the
    // colour's, so stable's alpha lands twice: (128/255)^2 is about 0.252.
    expect(columns[1].columnBackground).toBe("rgba(20, 30, 40, 0.252)");
    // `DisallowZeroAlpha` rescues the colour but not the drawable alpha.
    expect(columns[2].columnBackground).toBe("rgba(20, 30, 40, 0)");
  });

  it("keeps ColumnWidth in osu!'s units for scaling skin art", async () => {
    const skin = await importOsk(
      await osk({
        "skin.ini": "[Mania]\nKeys: 4\nColumnWidth: 30,70,70,70\n",
        ...SHARED_ART,
      }),
      "column-width.osk",
    );

    // skin.ini's 480-tall space onto osu!'s 768-tall one: 30 * 1.6 is 48, the
    // DEFAULT_COLUMN_SIZE everything else is measured against.
    expect(skin.keymodes[4]!.columns.map((c) => c.columnWidth)).toEqual([
      48, 112, 112, 112,
    ]);
    // An undeclared width is that same default.
    expect(skin.keymodes[7]!.columns[0].columnWidth).toBe(48);
  });

  it("sizes note height from WidthForNoteHeightScale", async () => {
    const skin = await importOsk(
      await osk({
        "skin.ini":
          "[Mania]\nKeys: 4\nColumnWidth: 52,52,52,52\nWidthForNoteHeightScale: 40\n",
        ...SHARED_ART,
      }),
      "heightscale.osk",
    );

    // Notes span the 52-wide column but are as tall as a 40-wide one.
    for (const column of skin.keymodes[4]!.columns) {
      expect(column.noteHeightScale).toBeCloseTo(40 / 52, 5);
    }
  });

  it("falls back to the narrowest column for note height", async () => {
    const skin = await importOsk(
      await osk({
        "skin.ini": "[Mania]\nKeys: 3\nColumnWidth: 30,60,30\n",
        ...SHARED_ART,
      }),
      "narrowest.osk",
    );

    // "the smallest one is scaled correctly and the others are compressed to
    // match its height" — so the wide middle column gets a squatter note.
    const columns = skin.keymodes[3]!.columns;
    expect(columns[0].noteHeightScale).toBeCloseTo(1, 5);
    expect(columns[1].noteHeightScale).toBeCloseTo(0.5, 5);
    expect(columns[2].noteHeightScale).toBeCloseTo(1, 5);
  });

  it("leaves note height alone for a skin with plain columns", async () => {
    const skin = await importOsk(
      await osk({ "skin.ini": "[Mania]\nKeys: 4\n", ...SHARED_ART }),
      "plain.osk",
    );

    for (const column of skin.keymodes[4]!.columns) {
      expect(column.noteHeightScale).toBe(1);
    }
  });

  it("claims no keymodes for a skin with no mania art or blocks", async () => {
    const skin = await importOsk(
      await osk({
        "skin.ini": "[General]\nName: Standard Only\n",
        "hitcircle.png": PNG,
        "normal-hitnormal.wav": new Uint8Array([1, 2]),
      }),
      "std.osk",
    );

    expect(skin.keymodes).toEqual({});
    expect(Object.keys(skin.hitsounds)).toContain("normal-hitnormal");
  });

  it("maps columns to osu!'s 1/2/S types", async () => {
    const skin = await importOsk(
      await osk({
        "skin.ini": "[Mania]\nKeys: 7\n",
        "mania-noteS.png": PNG,
      }),
      "special.osk",
    );

    // 7K reads 1,2,1,S,1,2,1 — only the centre lane gets the special art.
    const columns = skin.keymodes[7]!.columns;
    expect(columns[3].noteUrl).toBeTruthy();
    expect(columns[0].noteUrl).toBeNull();
    expect(columns[2].noteUrl).toBeNull();
  });

  it("lets an explicit image reference beat the shared art", async () => {
    const skin = await importOsk(
      await osk({
        "skin.ini": "[Mania]\nKeys: 4\nNoteImage0: custom-first\n",
        ...SHARED_ART,
        "custom-first.png": PNG,
      }),
      "explicit.osk",
    );

    const columns = skin.keymodes[4]!.columns;
    expect(columns[0].noteUrl).not.toBe(columns[1].noteUrl);
  });

  it("finds art nested inside the archive and behind @2x", async () => {
    const skin = await importOsk(
      await osk({
        "My Skin/skin.ini": "[Mania]\nKeys: 4\n",
        "My Skin/mania-note1@2x.png": PNG,
        "My Skin/mania-note2.png": PNG,
      }),
      "nested.osk",
    );

    expect(skin.keymodes[4]?.columns[0].noteUrl).toBeTruthy();
    expect(skin.keymodes[4]?.columns[1].noteUrl).toBeTruthy();
  });

  it("reads a skin.ini that was saved in a Windows codepage", async () => {
    // "Name: Café" with the é as a single windows-1252 byte.
    const bytes = new Uint8Array([
      ...new TextEncoder().encode("[General]\nName: Caf"),
      0xe9,
      ...new TextEncoder().encode("\n"),
    ]);
    const skin = await importOsk(
      await osk({ "skin.ini": bytes, ...SHARED_ART }),
      "cp1252.osk",
    );

    expect(skin.name).toBe("Café");
  });

  it("prefers the first block when a keymode is declared twice", async () => {
    const skin = await importOsk(
      await osk({
        "skin.ini":
          "[Mania]\nKeys: 4\nColour1: 255,0,0\n\n[Mania]\nKeys: 4\nColour1: 0,0,255\n",
      }),
      "dupe.osk",
    );

    expect(skin.keymodes[4]?.columns[0].columnBackground).toBe("rgb(255, 0, 0)");
  });

  it("rejects something that is not an archive", async () => {
    await expect(
      importOsk(new Uint8Array([1, 2, 3, 4]) as unknown as Blob, "broken.osk"),
    ).rejects.toThrow(/valid \.osk/);
  });
});
