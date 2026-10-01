import { describe, expect, it } from "vitest";
import {
  presenceDetails,
  presenceState,
  type PresenceInput,
} from "./discordPresence";

const editing: PresenceInput = {
  mode: "detailed",
  projectOpen: true,
  song: "Camellia - GHOST",
  difficulty: "Insane",
  keyCount: 7,
  playtesting: false,
};

describe("Discord presence", () => {
  it("shows the main menu without claiming the default difficulty is being edited", () => {
    const menu: PresenceInput = {
      ...editing,
      projectOpen: false,
      song: null,
    };

    expect(presenceDetails(menu)).toBe("In the main menu");
    expect(presenceState(menu)).toBeNull();
  });

  it("shows map details while a project is open", () => {
    expect(presenceDetails(editing)).toBe("Camellia - GHOST");
    expect(presenceState(editing)).toBe("Editing [Insane] 7K");
  });

  it("uses the playtesting state while playtesting an open project", () => {
    expect(presenceState({ ...editing, playtesting: true })).toBe(
      "Playtesting [Insane] 7K",
    );
  });

  it("does not expose detailed fields outside detailed mode", () => {
    const minimal: PresenceInput = { ...editing, mode: "minimal" };
    expect(presenceDetails(minimal)).toBeNull();
    expect(presenceState(minimal)).toBeNull();
  });

  it("activity mode says what you are doing without naming the map", () => {
    const activity: PresenceInput = { ...editing, mode: "activity" };
    expect(presenceDetails(activity)).toBe("Mapping");
    expect(presenceState(activity)).toBe("Editing 7K");
    expect(presenceState({ ...activity, playtesting: true })).toBe("Playtesting 7K");
    expect(presenceDetails({ ...activity, projectOpen: false })).toBe("In the main menu");
    const shown = `${presenceDetails(activity)} ${presenceState(activity)}`;
    expect(shown).not.toContain("GHOST");
    expect(shown).not.toContain("Insane");
  });
});
