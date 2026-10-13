/**
 * GIF search and trending from KLIPY. KLIPY asks that requests and media
 * loads come straight from the user's browser or app, never through our
 * servers, so the app key ships with the client like any other public key.
 * Results are shown in the order they arrive, and media URLs are used
 * exactly as returned.
 */

const API = "https://api.klipy.com/api/v1";
const PER_PAGE = 24;

export const KLIPY_APP_KEY: string = import.meta.env.VITE_KLIPY_APP_KEY ?? "";

export function klipyEnabled(): boolean {
  return KLIPY_APP_KEY.length > 0;
}

type Media = { url: string; width: number; height: number; size?: number };
type Formats = Partial<Record<"gif" | "webp" | "jpg" | "mp4" | "webm", Media>>;

type KlipyItem = {
  id: number | string;
  slug: string;
  title?: string;
  type?: string;
  blur_preview?: string;
  file?: Partial<Record<"hd" | "md" | "sm" | "xs", Formats>>;
};

type KlipyResponse = {
  result?: boolean;
  data?: { data?: KlipyItem[]; current_page?: number; has_next?: boolean };
};

export type Gif = {
  slug: string;
  title: string;
  /** Small, for the picker grid. */
  preview: Media;
  /** What gets sent: the medium size, which still looks right in a chat. */
  full: Media;
  blur: string | null;
};

export type GifPage = { gifs: Gif[]; page: number; hasNext: boolean };

function pick(formats: Formats | undefined): Media | null {
  const media = formats?.webp ?? formats?.gif;
  return media?.url ? media : null;
}

export function toGif(item: KlipyItem): Gif | null {
  const preview = pick(item.file?.sm) ?? pick(item.file?.xs) ?? pick(item.file?.md) ?? pick(item.file?.hd);
  const full = pick(item.file?.md) ?? pick(item.file?.hd) ?? preview;
  if (!preview || !full || !item.slug) return null;
  return { slug: item.slug, title: item.title ?? "", preview, full, blur: item.blur_preview ?? null };
}

async function request(path: string, params: Record<string, string>, signal?: AbortSignal): Promise<GifPage> {
  if (!klipyEnabled()) throw new Error("GIFs aren't set up in this build.");
  const query = new URLSearchParams({ per_page: String(PER_PAGE), content_filter: "medium", ...params });
  const res = await fetch(`${API}/${encodeURIComponent(KLIPY_APP_KEY)}/gifs/${path}?${query}`, { signal });
  if (!res.ok) throw new Error(`KLIPY answered ${res.status}`);
  const body = (await res.json()) as KlipyResponse;
  const gifs = (body.data?.data ?? []).map(toGif).filter((g): g is Gif => g !== null);
  return { gifs, page: body.data?.current_page ?? Number(params.page ?? 1), hasNext: !!body.data?.has_next };
}

export function trendingGifs(page: number, customerId: string, signal?: AbortSignal): Promise<GifPage> {
  return request("trending", { page: String(page), customer_id: customerId }, signal);
}

export function searchGifs(q: string, page: number, customerId: string, signal?: AbortSignal): Promise<GifPage> {
  return request("search", { q, page: String(page), customer_id: customerId }, signal);
}

/** Tells KLIPY a GIF was sent, which tunes what it suggests. Best effort. */
export function reportGifShare(slug: string, customerId: string, q: string): void {
  if (!klipyEnabled()) return;
  void fetch(`${API}/${encodeURIComponent(KLIPY_APP_KEY)}/gifs/share/${encodeURIComponent(slug)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ customer_id: customerId, q }),
  }).catch(() => {});
}

/**
 * A stable id for KLIPY that isn't the account id itself: a hash of it, so
 * the same person gets the same suggestions without KLIPY learning who they are.
 */
export async function klipyCustomerId(userId: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`cascade-klipy:${userId}`)));
  return Array.from(bytes.slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
}

const MEDIA_HOST = /^static\d*\.klipy\.com$/i;

/** The KLIPY media URL a message consists of, or null when it is anything else. */
export function gifInMessage(body: string): string | null {
  const text = body.trim();
  if (!text || /\s/.test(text)) return null;
  try {
    const url = new URL(text);
    if (url.protocol !== "https:" || !MEDIA_HOST.test(url.hostname)) return null;
    if (!/\.(gif|webp)$/i.test(url.pathname)) return null;
    return url.href;
  } catch {
    return null;
  }
}
