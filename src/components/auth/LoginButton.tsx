import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { sessionAuthHeaders, useAuth } from "../../lib/auth";
import { useT } from "../../lib/i18n";
import { Button } from "../ui/Controls";
import { Skeleton } from "../ui/Skeleton";
import { ChevronDownIcon } from "../ui/Icons";

const WORKER = import.meta.env.VITE_WORKER_URL;
const MENU_EXIT_MS = 160;
const COVER_KEY = "mania-editor:osu-cover";
const COVER_DELAY_MS = 700;

let coverCache: { osuId: number; url: string } | null = null;
const preloaded = new Set<string>();

function readCachedCover(osuId: number): string | null {
  if (coverCache?.osuId === osuId) return coverCache.url;
  try {
    const raw = localStorage.getItem(COVER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { osuId?: number; url?: string };
    if (parsed.osuId !== osuId || typeof parsed.url !== "string") return null;
    coverCache = { osuId, url: parsed.url };
    return parsed.url;
  } catch {
    return null;
  }
}

function storeCachedCover(osuId: number, url: string): void {
  coverCache = { osuId, url };
  try {
    localStorage.setItem(COVER_KEY, JSON.stringify(coverCache));
  } catch {
  }
}

function preloadCover(url: string): void {
  if (preloaded.has(url)) return;
  preloaded.add(url);
  const img = new Image();
  img.decoding = "async";
  img.src = url;
}

export function AccountControl({
  onOpenMyMaps,
  onOpenPresets,
  onOpenFeedback,
  onOpenAdmin,
  compact = false,
}: {
  onOpenMyMaps: () => void;
  onOpenPresets?: () => void;
  onOpenFeedback: () => void;
  onOpenAdmin: () => void;
  compact?: boolean;
}) {
  const { user, isAdmin, loading, login, logout } = useAuth();
  const t = useT();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [cover, setCover] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number }>({
    top: 0,
    right: 0,
  });

  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setPos({
      top: rect.bottom + 4,
      right: Math.max(8, window.innerWidth - rect.right),
    });
  }, [open]);

  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    if (!mounted) return;
    const id = window.setTimeout(() => setMounted(false), MENU_EXIT_MS);
    return () => window.clearTimeout(id);
  }, [open, mounted]);

  useEffect(() => {
    if (!user) {
      setCover(null);
      return;
    }
    const osuId = user.osu_id;
    const cached = readCachedCover(osuId);
    if (cached) {
      setCover(cached);
      preloadCover(cached);
    }
    if (!WORKER) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      fetch(`${WORKER}/auth/osu/cover`, {
        credentials: "include",
        headers: sessionAuthHeaders(),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data: { cover_url?: string | null } | null) => {
          const url = data?.cover_url;
          if (cancelled || !url) return;
          storeCachedCover(osuId, url);
          setCover(url);
          preloadCover(url);
        })
        .catch(() => {});
    }, COVER_DELAY_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [user]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (
        ref.current?.contains(t) ||
        menuRef.current?.contains(t)
      )
        return;
      setOpen(false);
    };
    const onScrollOrResize = () => setOpen(false);
    // pointerdown rather than mousedown so a tap outside closes the menu on
    // touch devices, where emulated mouse events are not guaranteed.
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("scroll", onScrollOrResize, true);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
    };
  }, [open]);

  if (loading) {
    return <Skeleton className="h-9 w-24 rounded-lg" />;
  }

  if (!user) {
    return (
      <Button variant="accent" onClick={login} className="whitespace-nowrap">
        {t("startModal.loginWithOsu")}
      </Button>
    );
  }

  const choose = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-2 rounded-lg border border-ink-500/60 bg-ink-700/60 transition hover:border-accent/60 hover:bg-ink-700 ${
          compact ? "px-2 py-1" : "px-2.5 py-1.5"
        }`}
        title={user.username}
      >
        {user.avatar_url ? (
          <img
            src={user.avatar_url}
            alt=""
            className="h-6 w-6 rounded-full object-cover"
          />
        ) : (
          <span className="grid h-6 w-6 place-items-center rounded-full bg-ink-600 text-xs">
            {user.username.slice(0, 1).toUpperCase()}
          </span>
        )}
        <span className="max-w-[8rem] truncate text-sm font-medium text-slate-100">
          {user.username}
        </span>
        <ChevronDownIcon
          className={`h-3 w-3 text-slate-400 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {mounted &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: "fixed", top: pos.top, right: pos.right }}
            className={`z-[100] w-52 overflow-hidden rounded-xl border border-ink-500/60 bg-ink-800 pb-1 shadow-2xl ${
              open ? "dropdown-in" : "dropdown-out pointer-events-none"
            }`}
          >
            <div className="relative h-20 w-full overflow-hidden bg-ink-700">
              {cover && (
                <img
                  src={cover}
                  alt=""
                  aria-hidden
                  className="absolute inset-0 h-full w-full object-cover"
                  style={{
                    maskImage:
                      "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.85) 45%, rgba(0,0,0,0) 100%)",
                    WebkitMaskImage:
                      "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.85) 45%, rgba(0,0,0,0) 100%)",
                  }}
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-ink-800 via-ink-800/45 to-transparent" />
              <div className="absolute inset-x-3 bottom-2 flex items-center gap-2">
                {user.avatar_url ? (
                  <img
                    src={user.avatar_url}
                    alt=""
                    className="h-7 w-7 rounded-full object-cover ring-2 ring-ink-800"
                  />
                ) : (
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-ink-600 text-xs ring-2 ring-ink-800">
                    {user.username.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-100 drop-shadow">
                  {user.username}
                </span>
              </div>
            </div>
            <div className="pt-1" />
            <MenuItem onClick={() => choose(onOpenMyMaps)}>
              {t("account.myMaps")}
            </MenuItem>
            {onOpenPresets && (
              <MenuItem onClick={() => choose(onOpenPresets)}>
                {t("nav.presets")}
              </MenuItem>
            )}
            <MenuItem onClick={() => choose(onOpenFeedback)}>
              {t("account.feedback")}
            </MenuItem>
            {isAdmin && (
              <MenuItem onClick={() => choose(onOpenAdmin)}>
                {t("account.admin")}
              </MenuItem>
            )}
            <div className="my-1 h-px bg-ink-600" />
            <a
              href="/terms"
              target="_blank"
              rel="noreferrer"
              className="block w-full px-3 py-1.5 text-left text-sm text-slate-400 transition hover:bg-ink-600 hover:text-slate-200"
              onClick={() => setOpen(false)}
            >
              {t("settings.terms")}
            </a>
            <a
              href="/privacy"
              target="_blank"
              rel="noreferrer"
              className="block w-full px-3 py-1.5 text-left text-sm text-slate-400 transition hover:bg-ink-600 hover:text-slate-200"
              onClick={() => setOpen(false)}
            >
              {t("startModal.privacyPolicy")}
            </a>
            <MenuItem onClick={() => choose(() => void logout())} danger>
              {t("account.logOut")}
            </MenuItem>
          </div>,
          document.body,
        )}
    </div>
  );
}

function MenuItem({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`block w-full px-3 py-1.5 text-left text-sm transition hover:bg-ink-600 ${
        danger ? "text-rose-300 hover:text-rose-200" : "text-slate-200"
      }`}
    >
      {children}
    </button>
  );
}
