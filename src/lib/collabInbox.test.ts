import { describe, expect, it } from "vitest";
import { CollabInbox, isOwnMessage } from "./collabInbox";

const ACCOUNT = "user-1";
const note = { id: "n1", column: 0, startTime: 1000 };
const op = (extra: Record<string, unknown>) => ({
  t: "note.add",
  diffId: "d1",
  notes: [note],
  ...extra,
});

describe("isOwnMessage", () => {
  it("tells this window from another window on the same account", () => {
    const me = { clientId: "tab-a", userId: ACCOUNT };
    expect(isOwnMessage({ _from: ACCOUNT, _clientId: "tab-a" }, me)).toBe(true);
    expect(isOwnMessage({ _from: ACCOUNT, _clientId: "tab-b" }, me)).toBe(false);
    expect(isOwnMessage({ _from: "user-2", _clientId: "tab-c" }, me)).toBe(false);
  });

  it("treats a legacy message without a window id as own only when it is this account's", () => {
    const me = { clientId: "tab-a", userId: ACCOUNT };
    expect(isOwnMessage({ _from: ACCOUNT }, me)).toBe(true);
    expect(isOwnMessage({ _from: "user-2" }, me)).toBe(false);
    expect(isOwnMessage({}, me)).toBe(false);
    expect(isOwnMessage(null, me)).toBe(false);
  });
});

describe("CollabInbox", () => {
  it("accepts an edit from another window signed in to the same account", () => {
    const inbox = new CollabInbox("tab-a");
    const accepted = inbox.accept(op({ _from: ACCOUNT, _clientId: "tab-b", _opId: "o1", _seq: 1 }), ACCOUNT);
    expect(accepted?.t).toBe("note.add");
  });

  it("drops this window's own echo", () => {
    const inbox = new CollabInbox("tab-a");
    expect(inbox.accept(op({ _from: ACCOUNT, _clientId: "tab-a", _opId: "o1", _seq: 1 }), ACCOUNT)).toBeNull();
  });

  it("keeps accepting other accounts' edits", () => {
    const inbox = new CollabInbox("tab-a");
    expect(inbox.accept(op({ _from: "user-2", _clientId: "tab-z", _opId: "o1", _seq: 1 }), ACCOUNT)).not.toBeNull();
  });

  it("applies a legacy op from another account and ignores one from this account", () => {
    const inbox = new CollabInbox("tab-a");
    expect(inbox.accept(op({ _from: "user-2", _opId: "o1" }), ACCOUNT)).not.toBeNull();
    expect(inbox.accept(op({ _from: ACCOUNT, _opId: "o2" }), ACCOUNT)).toBeNull();
  });

  it("drops a message delivered twice", () => {
    const inbox = new CollabInbox("tab-a");
    const message = op({ _from: ACCOUNT, _clientId: "tab-b", _opId: "o1", _seq: 1 });
    expect(inbox.accept(message, ACCOUNT)).not.toBeNull();
    expect(inbox.accept({ ...message }, ACCOUNT)).toBeNull();
  });

  it("drops an op that arrives after a later op from the same window", () => {
    const inbox = new CollabInbox("tab-a");
    expect(inbox.accept(op({ _clientId: "tab-b", _opId: "o2", _seq: 2 }), ACCOUNT)).not.toBeNull();
    expect(inbox.accept(op({ _clientId: "tab-b", _opId: "o1", _seq: 1 }), ACCOUNT)).toBeNull();
    // Sequences are per window, so another window's first op still arrives.
    expect(inbox.accept(op({ _clientId: "tab-c", _opId: "o3", _seq: 1 }), ACCOUNT)).not.toBeNull();
  });

  it("drops malformed ops", () => {
    const inbox = new CollabInbox("tab-a");
    expect(inbox.accept({ t: "note.add", diffId: "d1", notes: [{ id: "x" }], _clientId: "tab-b" }, ACCOUNT)).toBeNull();
  });

  it("forgets what it saw on reset, for a new session", () => {
    const inbox = new CollabInbox("tab-a");
    const message = op({ _clientId: "tab-b", _opId: "o1", _seq: 5 });
    inbox.accept(message, ACCOUNT);
    inbox.reset();
    expect(inbox.accept(message, ACCOUNT)).not.toBeNull();
  });
});
