import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../../lib/auth";
import { Button } from "../ui/Controls";

/**
 * Account control for the header / start screen. Shows a "Log in with osu!"
 * button when signed out, or an avatar chip with a dropdown (My Maps, Presets,
 * Admin, Log out) when signed in.
 */
export function AccountControl({
  onOpenMyMaps,
  onOpenPresets,
  onOpenFeedback,
  onOpenAdmin,
  compact = false,
}: {
  onOpenMyMaps: () => void;
  onOpenPresets: () => void;
  onOpenFeedback: () => void;
  onOpenAdmin: () => void;
  /** Render a smaller chip (used in the dense header). */
  compact?: boolean;
}) {
  const { user, isAdmin, loading, login, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // Fixed-position coordinates for the portaled menu, anchored to the chip.
  const [pos, setPos] = useState<{ top: number; right: number }>({
    top: 0,
    right: 0,
  });

  // Position the menu just under the chip, right-aligned to it.
  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setPos({
      top: rect.bottom + 4,
      right: Math.max(8, window.innerWidth - rect.right),
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        ref.current?.contains(t) ||
        menuRef.current?.contains(t)
      )
        return;
      setOpen(false);
    };
    const onScrollOrResize = () => setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("scroll", onScrollOrResize, true);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
    };
  }, [open]);

  if (loading) {
    return (
      <div className="h-9 w-24 animate-pulse rounded-lg bg-ink-700/60" />
    );
  }

  if (!user) {
    return (
      <Button variant="accent" onClick={login} className="whitespace-nowrap">
        Log in with osu!
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
        <span className="text-[10px] text-slate-400">▾</span>
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: "fixed", top: pos.top, right: pos.right }}
            className="z-[100] w-44 overflow-hidden rounded-xl border border-ink-500/60 bg-ink-800 py-1 shadow-2xl"
          >
            <MenuItem onClick={() => choose(onOpenMyMaps)}>My Maps</MenuItem>
            <MenuItem onClick={() => choose(onOpenPresets)}>Presets</MenuItem>
            <MenuItem onClick={() => choose(onOpenFeedback)}>Feedback</MenuItem>
            {isAdmin && (
              <MenuItem onClick={() => choose(onOpenAdmin)}>Admin</MenuItem>
            )}
            <div className="my-1 h-px bg-ink-600" />
            <a
              href="/privacy"
              target="_blank"
              rel="noreferrer"
              className="block w-full px-3 py-1.5 text-left text-sm text-slate-400 transition hover:bg-ink-600 hover:text-slate-200"
              onClick={() => setOpen(false)}
            >
              Privacy policy
            </a>
            <MenuItem onClick={() => choose(() => void logout())} danger>
              Log out
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
