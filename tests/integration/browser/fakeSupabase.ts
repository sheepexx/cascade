import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Replaces src/lib/supabase.ts in the integration harness. It offers the
 * slice of the supabase-js client the editor uses (rpc, table queries,
 * Realtime channels with broadcast, presence and Postgres changes) and talks
 * to the test backend, which runs everything against a real database as the
 * signed-in user. The harness build swaps it in by path (see vite.config.ts),
 * so the editor's own modules import it unchanged.
 */

const BACKEND = import.meta.env.VITE_SUPABASE_URL as string;

let currentToken: string | null = null;
let label = "";

export function setSupabaseToken(token: string | null): void {
  currentToken = token;
}

export function getSupabaseToken(): string | null {
  return currentToken;
}

/** Which window this is, so tests can hold or drop what it receives. */
export function setConnectionLabel(name: string): void {
  label = name;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${BACKEND}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(currentToken ? { Authorization: `Bearer ${currentToken}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return (await response.json()) as T;
}

type Result = { data: unknown; error: { code: string; message: string } | null };

function result(raw: { data?: unknown; error?: { code: string; message: string } }): Result {
  return { data: raw.data ?? null, error: raw.error ?? null };
}

class Query implements PromiseLike<Result> {
  private action: "select" | "update" | "insert" = "select";
  private columns = "*";
  private filters: [string, "eq" | "in", unknown][] = [];
  private values: Record<string, unknown> | undefined;
  private rows: "single" | "maybe" | null = null;

  constructor(private readonly table: string) {}

  select(columns = "*") {
    this.columns = columns;
    return this;
  }
  update(values: Record<string, unknown>) {
    this.action = "update";
    this.values = values;
    return this;
  }
  insert(values: Record<string, unknown>) {
    this.action = "insert";
    this.values = values;
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push([column, "eq", value]);
    return this;
  }
  in(column: string, values: unknown[]) {
    this.filters.push([column, "in", values]);
    return this;
  }
  order() {
    return this;
  }
  single() {
    this.rows = "single";
    return this;
  }
  maybeSingle() {
    this.rows = "maybe";
    return this;
  }
  then<A = Result, B = never>(
    onFulfilled?: ((value: Result) => A | PromiseLike<A>) | null,
    onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return post<{ data?: unknown; error?: { code: string; message: string } }>("/table", {
      table: this.table,
      action: this.action,
      columns: this.columns,
      filters: this.filters,
      values: this.values,
      single: this.rows,
    })
      .then(result)
      .then(onFulfilled, onRejected);
  }
}

type Listener = { type: string; filter: Record<string, unknown>; callback: (payload: unknown) => void };
type Status = "SUBSCRIBED" | "CHANNEL_ERROR" | "TIMED_OUT" | "CLOSED";

let connection: { id: string } | null = null;
let connecting: Promise<{ id: string }> | null = null;
const channels = new Set<FakeChannel>();

function connect(): Promise<{ id: string }> {
  if (connection) return Promise.resolve(connection);
  if (connecting) return connecting;
  connecting = new Promise((resolve) => {
    const source = new EventSource(
      `${BACKEND}/realtime?label=${encodeURIComponent(label)}&token=${encodeURIComponent(currentToken ?? "")}`,
    );
    source.addEventListener("hello", (event) => {
      connection = JSON.parse((event as MessageEvent<string>).data) as { id: string };
      connecting = null;
      resolve(connection);
      // After a reconnect, channels the app still holds join again, as
      // realtime-js does.
      for (const channel of channels) if (channel.wasJoined) void channel.rejoin();
    });
    source.onmessage = (event) => {
      const delivery = JSON.parse(event.data) as { type: string; topic: string; body: unknown };
      for (const channel of channels) channel.receive(delivery);
    };
    source.onerror = () => {
      // The backend closed the stream: every channel is closed, and the
      // browser reconnects the stream by itself shortly.
      connection = null;
      for (const channel of channels) channel.drop();
    };
  });
  return connecting;
}

class FakeChannel {
  private listeners: Listener[] = [];
  private status: ((status: Status, error?: Error) => void) | null = null;
  private state: Record<string, unknown[]> = {};
  wasJoined = false;
  private joined = false;

  constructor(
    readonly topic: string,
    private readonly config: { config?: { private?: boolean; presence?: { key?: string } } },
  ) {}

  on(type: string, filter: Record<string, unknown>, callback: (payload: unknown) => void) {
    this.listeners.push({ type, filter, callback });
    return this;
  }

  private kind() {
    return this.listeners.some((l) => l.type === "postgres_changes") ? "postgres" : "realtime";
  }

  subscribe(callback?: (status: Status, error?: Error) => void) {
    this.status = callback ?? null;
    channels.add(this);
    void this.rejoin();
    return this;
  }

  async rejoin() {
    const { id } = await connect();
    const answer = await post<{ ok: boolean; error?: string }>("/realtime/join", {
      connection: id,
      topic: this.topic,
      kind: this.kind(),
      private: !!this.config.config?.private,
    });
    if (!channels.has(this)) return;
    this.joined = answer.ok;
    this.wasJoined = this.wasJoined || answer.ok;
    if (answer.ok) this.status?.("SUBSCRIBED");
    else this.status?.("CHANNEL_ERROR", new Error(answer.error ?? "join refused"));
  }

  drop() {
    if (!this.joined) return;
    this.joined = false;
    this.status?.("CLOSED");
  }

  receive(delivery: { type: string; topic: string; body: unknown }) {
    if (delivery.topic !== this.topic || !this.joined) return;
    if (delivery.type === "broadcast") {
      const { event, payload } = delivery.body as { event: string; payload: unknown };
      for (const l of this.listeners) {
        if (l.type === "broadcast" && l.filter.event === event) l.callback({ event, payload });
      }
    } else if (delivery.type === "presence") {
      this.state = delivery.body as Record<string, unknown[]>;
      for (const l of this.listeners) if (l.type === "presence") l.callback({});
    } else if (delivery.type === "postgres") {
      for (const l of this.listeners) if (l.type === "postgres_changes") l.callback(delivery.body);
    }
  }

  async send(message: { type: string; event: string; payload: unknown }): Promise<"ok" | "error"> {
    if (!this.joined || !connection) return "error";
    const answer = await post<{ ok: boolean }>("/realtime/send", {
      connection: connection.id,
      topic: this.topic,
      event: message.event,
      payload: message.payload,
    });
    return answer.ok ? "ok" : "error";
  }

  async track(payload: unknown) {
    if (!connection) return "error";
    await post("/realtime/track", {
      connection: connection.id,
      topic: this.topic,
      key: this.config.config?.presence?.key ?? "",
      payload,
    });
    return "ok";
  }

  async untrack() {
    if (!connection) return "error";
    await post("/realtime/track", { connection: connection.id, topic: this.topic, payload: null });
    return "ok";
  }

  presenceState() {
    return this.state;
  }

  async leave() {
    channels.delete(this);
    this.joined = false;
    if (connection) await post("/realtime/leave", { connection: connection.id, topic: this.topic });
  }
}

const client = {
  rpc: (fn: string, args: Record<string, unknown>) =>
    post<{ data?: unknown; error?: { code: string; message: string } }>("/rpc", { fn, args }).then(result),
  from: (table: string) => new Query(table),
  channel: (topic: string, config: ConstructorParameters<typeof FakeChannel>[1] = {}) =>
    new FakeChannel(topic, config),
  removeChannel: async (channel: FakeChannel) => {
    await channel.leave();
    return "ok";
  },
  realtime: { setAuth: () => {} },
};

export function getSupabase(): Promise<SupabaseClient> {
  return Promise.resolve(client as unknown as SupabaseClient);
}

export function subscribeSupabase(
  open: (supabase: SupabaseClient) => ReturnType<SupabaseClient["channel"]>,
): () => void {
  let closed = false;
  let channel: ReturnType<SupabaseClient["channel"]> | null = null;
  void getSupabase().then((supabase) => {
    if (closed) return;
    channel = open(supabase);
  });
  return () => {
    closed = true;
    if (channel) void client.removeChannel(channel as unknown as FakeChannel);
  };
}

export const MAPS_BUCKET = "maps";
