import { describe, expect, it } from "vitest";
import type { Translate } from "./i18n";
import { describeImportFailure } from "./importErrors";

const t: Translate = (key) => key;

describe("describeImportFailure", () => {
  it("passes Cascade's own messages through", () => {
    expect(
      describeImportFailure(new Error("This .osz has no osu!mania difficulties."), "fallback", t),
    ).toEqual({ message: "This .osz has no osu!mania difficulties." });
  });

  it("explains a damaged archive and keeps the zip reader's words as details", () => {
    const problem = describeImportFailure(
      new Error("Can't find end of central directory : is this a zip file ?"),
      "fallback",
      t,
    );
    expect(problem.message).toBe("import.notAnArchive");
    expect(problem.details).toContain("end of central directory");
  });

  it("hides programming errors behind the fallback", () => {
    const problem = describeImportFailure(
      new TypeError("Cannot read properties of undefined (reading 'time')"),
      "Couldn't open the map",
      t,
    );
    expect(problem).toEqual({
      message: "Couldn't open the map",
      details: "TypeError: Cannot read properties of undefined (reading 'time')",
    });
  });

  it("uses the fallback for anything that isn't an Error", () => {
    expect(describeImportFailure("nope", "fallback", t)).toEqual({ message: "fallback" });
    expect(describeImportFailure(new Error(""), "fallback", t)).toEqual({ message: "fallback" });
  });

  it("explains a file the browser couldn't read and keeps its words", () => {
    const webkit = new Error("The I/O read operation failed.");
    expect(describeImportFailure(webkit, "fallback", t)).toEqual({
      message: "import.notReadable",
      details: "Error: The I/O read operation failed.",
    });
    const named = new Error("The requested file could not be read.");
    named.name = "NotReadableError";
    expect(describeImportFailure(named, "fallback", t).message).toBe("import.notReadable");
  });
});
