import { expect, test } from "@playwright/test";
import { backend, chart, note, openClient, rpcAs, savedChart, seed, settled, type Client } from "./support";

/**
 * The live-collaboration pipeline in separate browser contexts against the
 * real database rules. Each window runs the editor's own session, undo and
 * cloud-save hooks (harness/main.tsx); the backend can hold back, reorder or
 * drop what a window receives.
 */

const at = async (client: Client, id: string) => (await client.notes()).find((n) => n.id === id);

async function converge(clients: Client[], expected: unknown) {
  for (const client of clients) {
    await expect.poll(() => client.notes(), { message: `${client.label} converges` }).toEqual(expected);
  }
}

test.describe("concurrent saves", () => {
  const scenarios = {
    "broadcasts delivered live": async () => {},
    "deliveries held, then delivered": async () => {
      for (const label of ["alice", "bob"]) await backend("/__test/release", { label });
    },
    "deliveries held, then delivered in reverse": async () => {
      for (const label of ["alice", "bob"]) await backend("/__test/release", { label, reverse: true });
    },
    "deliveries lost, then both reconnect": async () => {
      for (const label of ["alice", "bob"]) {
        await backend("/__test/release", { label, drop: true });
        await backend("/__test/disconnect", { label });
      }
    },
  };

  for (const [name, deliver] of Object.entries(scenarios)) {
    test(`two editors' edits to one map both survive reopening: ${name}`, async ({ browser }) => {
      const ids = await seed();
      const alice = await openClient(browser, { user: ids.owner, name: "alice", project: ids.project });
      const bob = await openClient(browser, { user: ids.editor, name: "bob", project: ids.project });
      if (name !== "broadcasts delivered live") {
        for (const label of ["alice", "bob"]) await backend("/__test/hold", { label });
      }
      await alice.call("moveNote", "n1", { startTime: 1100 });
      await bob.call("moveNote", "n2", { column: 3 });
      await bob.call("addNote", note("b1", 2, 1500));
      await settled(alice);
      await settled(bob);
      await deliver();

      const expected = [note("b1", 2, 1500), note("n1", 0, 1100), note("n2", 3, 2000)];
      await converge([alice, bob], expected);
      const saved = await savedChart(ids.project);
      expect([...saved.data.difficulties[0].notes].sort((a, b) => a.id.localeCompare(b.id))).toEqual(expected);
      const reopened = await openClient(browser, { user: ids.editor, name: "bob", project: ids.project, label: "reopened" });
      expect(await reopened.notes()).toEqual(expected);
    });
  }

  test("an editor whose copy is stale merges instead of overwriting, keeping its losing value recoverable", async ({ browser }) => {
    const ids = await seed();
    const alice = await openClient(browser, { user: ids.owner, name: "alice", project: ids.project });
    const bob = await openClient(browser, { user: ids.editor, name: "bob", project: ids.project });
    for (const label of ["alice", "bob"]) await backend("/__test/hold", { label });
    await alice.call("moveNote", "n1", { startTime: 1100 });
    await alice.call("setTitle", "Alice's title");
    await settled(alice);
    // Bob hasn't seen Alice's save: same note, same field, and a different field.
    await bob.call("moveNote", "n1", { startTime: 1300 });
    await bob.call("moveNote", "n2", { startTime: 2500 });
    await settled(bob);

    const bobState = await bob.state();
    expect(bobState.cloudError).toMatch(/Their version was kept; yours is in Backups/);
    expect(bobState.backups.map((b) => b.reason)).toEqual(["before-merge"]);
    expect(bobState.backups[0].notes.d1.find((n) => n.id === "n1")?.startTime).toBe(1300);
    expect(bobState.title).toBe("Alice's title");

    for (const label of ["alice", "bob"]) await backend("/__test/release", { label });
    const expected = [note("n1", 0, 1100), note("n2", 1, 2500)];
    await converge([alice, bob], expected);
    const saved = await savedChart(ids.project);
    expect(saved.data.difficulties[0].notes).toEqual(expected);
    expect(saved.data.meta.title).toBe("Alice's title");
  });

  test("a failed save keeps the edit pending and recoverable, and is acknowledged once it lands", async ({ browser }) => {
    const ids = await seed();
    const alice = await openClient(browser, { user: ids.owner, name: "alice", project: ids.project });
    const before = await savedChart(ids.project);
    await backend("/__test/fail-rpc", { fn: "save_project_snapshot", message: "connection reset" });
    await alice.call("moveNote", "n1", { startTime: 1100 });
    await expect.poll(async () => (await alice.state()).cloudError).toMatch(/connection reset/);
    const failing = await alice.state();
    expect(failing.unsaved).toBe(true);
    expect(failing.recoveryUnsaved).toBe(true);
    expect((await at(alice, "n1"))?.startTime).toBe(1100);
    expect(await savedChart(ids.project)).toEqual(before);

    await backend("/__test/fail-rpc", { fn: "save_project_snapshot" });
    await settled(alice);
    const saved = await alice.state();
    expect(saved.recoveryUnsaved).toBe(false);
    expect(saved.cloudError).toBeNull();
    expect((await savedChart(ids.project)).data.difficulties[0].notes[0].startTime).toBe(1100);
  });

  test("explicit saves name their revision too, and merge a save they hadn't seen", async ({ browser }) => {
    const ids = await seed();
    const alice = await openClient(browser, { user: ids.owner, name: "alice", project: ids.project });
    const bob = await openClient(browser, { user: ids.editor, name: "bob", project: ids.project });
    for (const label of ["alice", "bob"]) await backend("/__test/hold", { label });
    // Alice's autosave fails, so her explicit save is what lands first.
    await backend("/__test/fail-rpc", { fn: "save_project_snapshot", message: "offline" });
    await alice.call("moveNote", "n1", { startTime: 1100 });
    await bob.call("moveNote", "n2", { startTime: 2200 });
    await alice.call("save");
    await expect.poll(async () => (await alice.state()).saveStatus).toBe("saved");
    await bob.call("save");
    await expect.poll(async () => (await bob.state()).saveStatus).toBe("saved");
    await backend("/__test/fail-rpc", { fn: "save_project_snapshot" });
    const saved = await savedChart(ids.project);
    expect(saved.data.difficulties[0].notes).toEqual([note("n1", 0, 1100), note("n2", 1, 2200)]);
  });
});

test.describe("collaborative undo", () => {
  test("undo keeps a later move by someone else, and undoes the user's own edits normally", async ({ browser }) => {
    const ids = await seed();
    const alice = await openClient(browser, { user: ids.owner, name: "alice", project: ids.project });
    const bob = await openClient(browser, { user: ids.editor, name: "bob", project: ids.project });

    // The reported case: 1000 -> 1100 (Alice) -> 1200 (Bob), then Alice undoes.
    await alice.call("moveNote", "n1", { startTime: 1100 });
    await expect.poll(async () => (await at(bob, "n1"))?.startTime).toBe(1100);
    await bob.call("moveNote", "n1", { startTime: 1200 });
    await expect.poll(async () => (await at(alice, "n1"))?.startTime).toBe(1200);
    await alice.call("undo");
    for (const client of [alice, bob]) expect((await at(client, "n1"))?.startTime).toBe(1200);
    expect((await alice.state()).notice).toMatch(/1 note was changed by a collaborator/);
    await alice.call("redo");
    await settled(alice);
    await settled(bob);
    for (const client of [alice, bob]) expect((await at(client, "n1"))?.startTime).toBe(1200);

    // Different fields of one note: Alice's undo restores her field only.
    await alice.call("moveNote", "n2", { column: 3 });
    await expect.poll(async () => (await at(bob, "n2"))?.column).toBe(3);
    await bob.call("moveNote", "n2", { startTime: 2400 });
    await expect.poll(async () => (await at(alice, "n2"))?.startTime).toBe(2400);
    await alice.call("undo");
    await converge([alice, bob], [note("n1", 0, 1200), note("n2", 1, 2400)]);

    // A note someone deleted after Alice moved it stays deleted.
    await alice.call("addNote", note("n3", 2, 3000));
    await expect.poll(async () => !!(await at(bob, "n3"))).toBe(true);
    await alice.call("moveNote", "n3", { startTime: 3100 });
    await expect.poll(async () => (await at(bob, "n3"))?.startTime).toBe(3100);
    await bob.call("removeNote", "n3");
    await expect.poll(async () => !!(await at(alice, "n3"))).toBe(false);
    await alice.call("undo");
    await alice.call("undo");
    await converge([alice, bob], [note("n1", 0, 1200), note("n2", 1, 2400)]);

    // Alice's own placement undoes and redoes as usual.
    await alice.call("addNote", note("n4", 3, 4000));
    await alice.call("undo");
    expect(await at(alice, "n4")).toBeUndefined();
    await alice.call("redo");
    await converge([alice, bob], [note("n1", 0, 1200), note("n2", 1, 2400), note("n4", 3, 4000)]);

    await settled(alice);
    await settled(bob);
    const saved = await savedChart(ids.project);
    expect([...saved.data.difficulties[0].notes].sort((a, b) => a.id.localeCompare(b.id))).toEqual(
      [note("n1", 0, 1200), note("n2", 1, 2400), note("n4", 3, 4000)],
    );
  });
});

test.describe("windows on the same account", () => {
  test("receive each other's edits, while other accounts still do and echoes apply once", async ({ browser }) => {
    const ids = await seed();
    // With saves failing, edits can only travel as broadcasts.
    await backend("/__test/fail-rpc", { fn: "save_project_snapshot", message: "offline" });
    const first = await openClient(browser, { user: ids.owner, name: "alice", project: ids.project, label: "alice-1" });
    const second = await openClient(browser, { user: ids.owner, name: "alice", project: ids.project, label: "alice-2" });
    const bob = await openClient(browser, { user: ids.editor, name: "bob", project: ids.project });

    await first.call("moveNote", "n1", { startTime: 1100 });
    await expect.poll(async () => (await at(second, "n1"))?.startTime).toBe(1100);
    await expect.poll(async () => (await at(bob, "n1"))?.startTime).toBe(1100);
    await second.call("moveNote", "n2", { column: 2 });
    await expect.poll(async () => (await at(first, "n2"))?.column).toBe(2);
    await bob.call("moveNote", "n2", { startTime: 2100 });
    await expect.poll(async () => (await at(first, "n2"))?.startTime).toBe(2100);
    await expect.poll(async () => (await at(second, "n2"))?.startTime).toBe(2100);

    // Sent through the REST fallback, a broadcast comes back to its sender
    // too. Were the echo of the move applied after the undo, n3 would jump
    // back to 3300 in the sending window.
    await backend("/__test/fail-sends", { label: "alice-1", on: true });
    await first.call("addNote", note("n3", 3, 3000));
    await first.call("moveNote", "n3", { startTime: 3300 });
    await first.call("undo");
    // The undo is the last message sent, so once it arrives everything has.
    await expect.poll(async () => (await at(second, "n3"))?.startTime).toBe(3000);
    await expect.poll(async () => (await at(bob, "n3"))?.startTime).toBe(3000);
    const notes = await first.notes();
    expect(notes.filter((n) => n.id === "n3")).toEqual([note("n3", 3, 3000)]);
    expect((await first.state()).peerNotice ?? "").not.toMatch(/didn't fit/);
  });
});

test.describe("invalid chart data", () => {
  test("a collaborator's op that doesn't fit the map is refused and reported", async ({ browser }) => {
    const ids = await seed();
    const alice = await openClient(browser, { user: ids.owner, name: "alice", project: ids.project });
    const bob = await openClient(browser, { user: ids.editor, name: "bob", project: ids.project });
    await bob.call("sendRawOp", { t: "note.add", diffId: "d1", notes: [note("bad", 17, 500)] });
    await bob.call("sendRawOp", { t: "note.add", diffId: "d1", notes: [{ id: "nan", column: 0, startTime: null }] });
    await expect.poll(async () => (await alice.state()).peerNotice).toMatch(/didn't fit this map/);
    expect(await alice.notes()).toEqual([note("n1", 0, 1000), note("n2", 1, 2000)]);
  });

  test("a saved snapshot that fails its checks is reported and doesn't reach the editor", async ({ browser }) => {
    const ids = await seed();
    const alice = await openClient(browser, { user: ids.owner, name: "alice", project: ids.project });
    await backend("/__test/sql", {
      sql: `update public.projects
               set data = jsonb_set(data, '{difficulties,0,notes,0,column}', '17')
             where id = $1`,
      params: [ids.project],
    });
    await expect.poll(async () => (await alice.state()).cloudError).toMatch(
      /cloud copy of this map has 1 invalid value[\s\S]*notes\[0\]\.column/,
    );
    expect(await alice.notes()).toEqual([note("n1", 0, 1000), note("n2", 1, 2000)]);

    const fresh = await openClient(browser, { user: ids.owner, name: "alice", project: ids.project, label: "fresh", ready: false });
    await expect.poll(async () => (await fresh.state()).cloudError).toMatch(/wasn't opened/);
    expect((await fresh.state()).notes).toEqual({});
  });

  test("a map saved with a NaN time can't be opened, and nothing is half-loaded", async ({ browser }) => {
    const data = chart();
    (data.difficulties[0].notes[1] as { startTime: unknown }).startTime = null;
    const ids = await seed({ data });
    const alice = await openClient(browser, { user: ids.owner, name: "alice", project: ids.project, ready: false });
    await expect.poll(async () => (await alice.state()).cloudError).toMatch(/notes\[1\]\.startTime/);
    expect((await alice.state()).notes).toEqual({});
  });
});

test.describe("permissions on the save paths", () => {
  test("a viewer can follow along but can't save or broadcast edits", async ({ browser }) => {
    const ids = await seed();
    const alice = await openClient(browser, { user: ids.owner, name: "alice", project: ids.project });
    const carol = await openClient(browser, { user: ids.viewer, name: "carol", project: ids.project });
    expect((await carol.state()).role).toBe("viewer");
    expect((await carol.state()).canEdit).toBe(false);

    await carol.call("moveNote", "n1", { startTime: 1500 });
    expect((await at(carol, "n1"))?.startTime).toBe(1000);
    await carol.call("sendRawOp", { t: "note.update", diffId: "d1", before: [note("n1", 0, 1000)], after: [note("n1", 0, 1500)] });
    const before = await savedChart(ids.project);
    await carol.call("save");
    await expect.poll(async () => (await carol.state()).cloudError).toMatch(/project edit access required/);
    expect(await savedChart(ids.project)).toEqual(before);

    // Saving straight to the database as the viewer is refused as well.
    const direct = await rpcAs(ids.viewer, "save_project_snapshot", {
      p_project: ids.project,
      p_data: chart(),
      p_mutation_id: crypto.randomUUID(),
      p_expected_revision: before.revision,
    });
    expect(direct.error?.message).toBe("project edit access required");

    // Alice still has the original note: the viewer's broadcast was refused.
    await alice.call("moveNote", "n2", { startTime: 2100 });
    await expect.poll(async () => (await at(carol, "n2"))?.startTime).toBe(2100);
    expect((await at(alice, "n1"))?.startTime).toBe(1000);
  });

  test("owner and editor saves go through", async ({ browser }) => {
    const ids = await seed();
    const alice = await openClient(browser, { user: ids.owner, name: "alice", project: ids.project });
    const bob = await openClient(browser, { user: ids.editor, name: "bob", project: ids.project });
    await alice.call("moveNote", "n1", { startTime: 1100 });
    await settled(alice);
    await expect.poll(async () => (await at(bob, "n1"))?.startTime).toBe(1100);
    await bob.call("moveNote", "n2", { startTime: 2100 });
    await settled(bob);
    await bob.call("save");
    await expect.poll(async () => (await bob.state()).saveStatus).toBe("saved");
    await alice.call("save");
    await expect.poll(async () => (await alice.state()).saveStatus).toBe("saved");
    expect((await savedChart(ids.project)).data.difficulties[0].notes).toEqual([note("n1", 0, 1100), note("n2", 1, 2100)]);
  });
});

test.describe("before migration 0038 is applied", () => {
  test("the app's fallback saves still refuse to overwrite and both edits survive", async ({ browser }) => {
    const ids = await seed({ through: "0037_usage_milestones.sql" });
    const alice = await openClient(browser, { user: ids.owner, name: "alice", project: ids.project });
    const bob = await openClient(browser, { user: ids.editor, name: "bob", project: ids.project });
    for (const label of ["alice", "bob"]) await backend("/__test/hold", { label });
    await alice.call("moveNote", "n1", { startTime: 1100 });
    await settled(alice);
    await bob.call("moveNote", "n2", { column: 3 });
    await settled(bob);
    await bob.call("save");
    await expect.poll(async () => (await bob.state()).saveStatus).toBe("saved");
    for (const label of ["alice", "bob"]) await backend("/__test/release", { label });
    const expected = [note("n1", 0, 1100), note("n2", 3, 2000)];
    await converge([alice, bob], expected);
    expect((await savedChart(ids.project)).data.difficulties[0].notes).toEqual(expected);
  });
});
