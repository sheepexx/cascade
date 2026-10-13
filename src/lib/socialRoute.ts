/**
 * Where the social overlay is, as a path, so a profile or a conversation has
 * a link that can be shared, reloaded and walked back through with the
 * browser's back button. The overlay sits above whatever else is open; the
 * editor keeps its own state underneath.
 */

export type FriendsTab = "all" | "online" | "pending" | "add" | "blocked";
export type ProfileTab = "overview" | "maps" | "activity";

export type SocialRoute =
  | { view: "profile"; name: string; tab: ProfileTab }
  | { view: "friends"; tab: FriendsTab }
  | { view: "messages"; conversationId: string | null }
  | { view: "community" };

const FRIEND_TABS: FriendsTab[] = ["all", "online", "pending", "add", "blocked"];
const PROFILE_TABS: ProfileTab[] = ["overview", "maps", "activity"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// osu! usernames: letters, digits, spaces, -, _, [ and ]; up to 15 today,
// older ones a little longer.
const USERNAME = /^[A-Za-z0-9 _\-[\]]{1,32}$/;

function decode(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

export function parseSocialPath(pathname: string): SocialRoute | null {
  const parts = pathname.replace(/\/+$/, "").split("/").slice(1);
  const [head, second, third] = parts;
  if (head === "user" && second) {
    const name = decode(second);
    if (!name || !USERNAME.test(name)) return null;
    if (parts.length > 3) return null;
    const tab = (third ?? "overview") as ProfileTab;
    if (!PROFILE_TABS.includes(tab)) return null;
    return { view: "profile", name, tab };
  }
  if (head === "friends" && parts.length <= 2) {
    const tab = (second ?? "all") as FriendsTab;
    return FRIEND_TABS.includes(tab) ? { view: "friends", tab } : null;
  }
  if (head === "messages" && parts.length <= 2) {
    if (!second) return { view: "messages", conversationId: null };
    return UUID.test(second) ? { view: "messages", conversationId: second.toLowerCase() } : null;
  }
  if (head === "community" && parts.length === 1) return { view: "community" };
  return null;
}

export function socialPath(route: SocialRoute): string {
  switch (route.view) {
    case "profile":
      return `/user/${encodeURIComponent(route.name)}${route.tab === "overview" ? "" : `/${route.tab}`}`;
    case "friends":
      return route.tab === "all" ? "/friends" : `/friends/${route.tab}`;
    case "messages":
      return route.conversationId ? `/messages/${route.conversationId}` : "/messages";
    case "community":
      return "/community";
  }
}

export function sameRoute(a: SocialRoute | null, b: SocialRoute | null): boolean {
  if (!a || !b) return a === b;
  if (a.view === "profile" && b.view === "profile") {
    return a.name.toLowerCase() === b.name.toLowerCase() && a.tab === b.tab;
  }
  return socialPath(a) === socialPath(b);
}
