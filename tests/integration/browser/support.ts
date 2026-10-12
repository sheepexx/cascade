import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import type { HarnessApi, HarnessState } from "./harness/types";

export const BACKEND_PORT = 54329;
export const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;
export const HARNESS_URL = "http://127.0.0.1:5199";

export async function backend<T = unknown>(path: string, body: unknown = {}): Promise<T> {
  const response = await fetch(`${BACKEND_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
  return (await response.json()) as T;
}

/** Calls a database function as `userId`, the way the app's client does. */
export async function rpcAs(userId: string, fn: string, args: Record<string, unknown>) {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = `${encode({ alg: "none" })}.${encode({ sub: userId, role: "authenticated" })}.test`;
  const response = await fetch(`${BACKEND_URL}/rpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ fn, args }),
  });
  return (await response.json()) as { data?: unknown; error?: { code: string; message: string } };
}

export const note = (id: string, column: number, startTime: number) => ({ id, column, startTime });

/** A 4K map with two notes, as the editor would have saved it. */
export function chart(notes = [note("n1", 0, 1000), note("n2", 1, 2000)]) {
  return {
    meta: { title: "Song", artist: "Artist", creator: "Mapper" },
    timingPoints: [
      { id: "tp", time: 0, uninherited: true, bpm: 120, sv: 1, meter: 4, sampleSet: 1, sampleIndex: 0, volume: 100, kiai: false, omitFirstBarline: false },
    ],
    difficulties: [
      {
        id: "d1",
        name: "Hard",
        keyCount: 4,
        hpDrainRate: 7,
        overallDifficulty: 7,
        previewTime: -1,
        timingPoints: [],
        notes,
      },
    ],
    activeId: "d1",
    view: { scrollSpeed: 25, snapDivisor: 4 },
    bgScope: "mapset",
  };
}

export type Seeded = { owner: string; editor: string; viewer: string; project: string };

/** A fresh database with one project: an owner, an editor and a viewer. */
export async function seed(options: { through?: string; data?: unknown } = {}): Promise<Seeded> {
  await backend("/__test/reset", { through: options.through });
  const owner = (await backend<{ id: string }>("/__test/user", { username: "alice" })).id;
  const editor = (await backend<{ id: string }>("/__test/user", { username: "bob" })).id;
  const viewer = (await backend<{ id: string }>("/__test/user", { username: "carol" })).id;
  const project = (
    await backend<{ id: string }>("/__test/project", {
      owner,
      data: options.data ?? chart(),
      share: { [editor]: "editor", [viewer]: "viewer" },
    })
  ).id;
  return { owner, editor, viewer, project };
}

export async function savedChart(project: string) {
  return backend<{ data: ReturnType<typeof chart>; revision: number }>("/__test/project-data", { id: project });
}

export type Client = {
  page: Page;
  context: BrowserContext;
  label: string;
  state(): Promise<HarnessState>;
  call<K extends keyof HarnessApi>(name: K, ...args: Parameters<HarnessApi[K]>): Promise<void>;
  notes(): Promise<{ id: string; column: number; startTime: number }[]>;
};

/** One editor window, in its own browser context, signed in as `user`. */
export async function openClient(
  browser: Browser,
  options: { user: string; name: string; project: string; label?: string; ready?: boolean },
): Promise<Client> {
  const label = options.label ?? options.name;
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on("pageerror", (error) => console.error(`[${label}]`, error));
  const query = new URLSearchParams({ user: options.user, name: options.name, project: options.project, label });
  await page.goto(`/?${query}`);
  await page.waitForFunction(() => !!window.harness);
  const client: Client = {
    page,
    context,
    label,
    state: () => page.evaluate(() => window.harness!.state()),
    call: async (name, ...args) => {
      await page.evaluate(
        async ([method, values]) => {
          const api = window.harness! as unknown as Record<string, (...a: unknown[]) => unknown>;
          await api[method as string](...(values as unknown[]));
        },
        [name, args] as const,
      );
    },
    notes: async () => {
      const state = await client.state();
      return (state.notes.d1 ?? []).map(({ id, column, startTime }) => ({ id, column, startTime }));
    },
  };
  if (options.ready !== false) {
    await expect.poll(async () => (await client.state()).ready, { message: `${label} ready` }).toBe(true);
  }
  return client;
}

/** Waits until a client has nothing unsaved. */
export async function settled(client: Client) {
  await expect.poll(async () => (await client.state()).unsaved, { message: `${client.label} saved` }).toBe(false);
}
