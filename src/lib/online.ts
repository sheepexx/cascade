export type OnlineRosterUser = {
  id: string;
  osu_id: number;
  username: string;
  avatar_url: string | null;
  status: string | null;
  last_seen: number | null;
};

const ROSTER_URL = `${import.meta.env.VITE_WORKER_URL ?? ""}/presence/roster`;

let cachedRoster: OnlineRosterUser[] | null = null;

function avatarSvg(initials: string, color: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
    `<rect width="100" height="100" rx="26" fill="${color}"/>` +
    `<text x="50" y="62" text-anchor="middle" ` +
    `font-family="Quicksand, Arial, sans-serif" font-size="40" ` +
    `font-weight="700" fill="#ffffff">${initials}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// [username, initials, color, status, minutes since last online]
const DEMO_USERS: [string, string, string, string, number][] = [
  ["MapCat", "MC", "#f2a6a0", "Midnight Drift [Hyper]", 5],
  ["Bunni", "BN", "#f2b8d0", "Cotton Candy Machine [Marathon]", 320],
  ["Toast", "TS", "#f2d39a", "Toasted Sorrow [Insane]", 45],
  ["Mochi", "MO", "#d8b6f2", "Mochi Swirl [VSRG]", 9],
  ["Waffle", "WF", "#f2c9a8", "Butter Stack [Extra]", 1_560],
  ["Sprout", "SP", "#a8e6b8", "Greenhouse Rain [Normal]", 28],
  ["Peachy", "PC", "#f2bfa5", "Peach Blossom [Hard]", 7_200],
  ["Dango", "DG", "#c0b6f2", "Three Color Dango [Overdose]", 96],
  ["Taro", "TR", "#a8cdf2", "Root Beer Float [Basic]", 3],
  ["Kumo", "KU", "#f2b8ae", "Cloud Nine [Gimmick]", 420],
];

const DEMO_ROSTER: OnlineRosterUser[] = DEMO_USERS.map(
  ([username, initials, color, status, minutesAgo], i) => ({
    id: `demo-${i + 1}`,
    osu_id: 100_000 + i,
    username,
    avatar_url: avatarSvg(initials, color),
    status,
    last_seen: Date.now() - minutesAgo * 60_000,
  }),
);

export function isDemoRoster(users: OnlineRosterUser[]): boolean {
  return users === DEMO_ROSTER;
}

/**
 * A random sample of known players, used to seed the menu's floating avatar
 * layer with "offline" users. Who is actually online comes from Realtime
 * presence on the client; this list is just the pool of faces.
 *
 * In development the worker endpoint usually isn't reachable, so we fall back
 * to a deterministic set of demo faces so the effect can be previewed locally.
 */
export async function fetchOnlineRoster(): Promise<OnlineRosterUser[]> {
  if (cachedRoster) return cachedRoster;
  const fallback = (): OnlineRosterUser[] => {
    if (!import.meta.env.DEV) return [];
    cachedRoster = DEMO_ROSTER;
    return DEMO_ROSTER;
  };
  if (!ROSTER_URL.startsWith("http")) return fallback();
  try {
    const res = await fetch(ROSTER_URL);
    if (!res.ok) return fallback();
    const data = (await res.json()) as { users?: OnlineRosterUser[] };
    const users = (data.users ?? []).filter(
      (u) =>
        u &&
        typeof u.username === "string" &&
        typeof u.avatar_url === "string" &&
        u.avatar_url,
    );
    if (users.length === 0) return fallback();
    cachedRoster = users;
    return users;
  } catch {
    return fallback();
  }
}
