import { useState, type ReactNode } from "react";
import { useT } from "../../lib/i18n";
import { relativeTime } from "./socialUtils";
import { countryFlagUrl, type Presence, type ProfileCard } from "../../lib/social";

/**
 * Small pieces every social view shares: avatars, flags, presence, user rows
 * and the cards sections sit in. They use the same surfaces as the rest of
 * Cascade (ink panels, white/10 borders, the accent for what needs a click).
 */

export function Avatar({
  url,
  name,
  size = "md",
  ring = false,
  presence,
}: {
  url: string | null;
  name: string;
  size?: "sm" | "md" | "lg" | "xl";
  ring?: boolean;
  presence?: Presence | null;
}) {
  const [failed, setFailed] = useState(false);
  const dims = {
    sm: "h-8 w-8 text-xs",
    md: "h-10 w-10 text-sm",
    lg: "h-14 w-14 text-lg",
    xl: "h-24 w-24 text-3xl sm:h-28 sm:w-28",
  }[size];
  const dot = {
    sm: "h-2.5 w-2.5 border-[1.5px]",
    md: "h-3 w-3 border-2",
    lg: "h-3.5 w-3.5 border-2",
    xl: "h-5 w-5 border-[3px] bottom-1.5 right-1.5",
  }[size];
  return (
    <span className={`relative inline-block shrink-0 ${dims}`}>
      {url && !failed ? (
        <img
          src={url}
          alt=""
          draggable={false}
          onError={() => setFailed(true)}
          className={`h-full w-full rounded-full bg-ink-700 object-cover ${
            ring ? "ring-4 ring-ink-800 shadow-[0_10px_30px_rgba(0,0,0,0.45)]" : ""
          }`}
        />
      ) : (
        <span
          className={`grid h-full w-full place-items-center rounded-full bg-ink-600 font-semibold text-slate-200 ${
            ring ? "ring-4 ring-ink-800" : ""
          }`}
        >
          {name.slice(0, 1).toUpperCase()}
        </span>
      )}
      {presence?.online && (
        <span
          aria-hidden
          className={`absolute bottom-0 right-0 rounded-full border-ink-800 bg-emerald-400 ${dot}`}
        />
      )}
    </span>
  );
}

export function Flag({ code, name, className = "h-3.5" }: { code: string | null; name?: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const url = countryFlagUrl(code);
  if (!url || failed) return null;
  return (
    <img
      src={url}
      alt={name ?? code ?? ""}
      title={name ?? code ?? undefined}
      draggable={false}
      onError={() => setFailed(true)}
      className={`inline-block w-auto shrink-0 rounded-[2px] ${className}`}
    />
  );
}

/** "Online · Mapping X", "Last seen 2 hours ago", or nothing when hidden. */
export function PresenceLine({ presence, className = "" }: { presence: Presence | null; className?: string }) {
  const t = useT();
  if (!presence) return null;
  if (presence.online) {
    return (
      <span className={`flex min-w-0 items-center gap-1.5 ${className}`}>
        <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
        <span className="truncate">
          {presence.activity ? t("social.onlineMapping", { title: presence.activity }) : t("social.online")}
        </span>
      </span>
    );
  }
  if (!presence.last_seen_at) return null;
  return (
    <span className={`truncate ${className}`}>
      {t("social.lastSeen", { when: relativeTime(presence.last_seen_at, t) })}
    </span>
  );
}

/** A user in a list: avatar, name, flag, presence, and whatever actions fit. */
export function UserRow({
  user,
  onOpen,
  detail,
  children,
}: {
  user: ProfileCard;
  onOpen: () => void;
  detail?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <li className="group flex items-center gap-3 rounded-xl border border-white/[0.06] bg-ink-700/35 p-2.5 transition hover:border-white/10 hover:bg-ink-700/60">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
      >
        <Avatar url={user.avatar_url} name={user.username} presence={user.presence} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-slate-100">{user.username}</span>
            <Flag code={user.country_code} className="h-3" />
          </span>
          <span className="mt-0.5 block truncate text-xs text-slate-400">
            {detail ?? <PresenceLine presence={user.presence} />}
          </span>
        </span>
      </button>
      {children && <div className="flex shrink-0 items-center gap-1.5">{children}</div>}
    </li>
  );
}

export function SmallButton({
  children,
  onClick,
  tone = "plain",
  disabled,
  title,
  "aria-label": ariaLabel,
}: {
  children: ReactNode;
  onClick: () => void;
  tone?: "plain" | "accent" | "danger";
  disabled?: boolean;
  title?: string;
  "aria-label"?: string;
}) {
  const tones = {
    plain: "border-white/10 bg-ink-600/60 text-slate-200 hover:bg-ink-500/80",
    accent: "border-accent-deep/40 bg-accent/90 text-white hover:bg-accent-soft/95",
    danger: "border-transparent text-rose-300 hover:bg-rose-500/10 hover:text-rose-200",
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      className={`inline-flex min-h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 ${tones}`}
    >
      {children}
    </button>
  );
}

export function SectionCard({
  title,
  aside,
  children,
  className = "",
}: {
  title?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-white/[0.07] bg-ink-700/30 p-4 sm:p-5 ${className}`}>
      {(title || aside) && (
        <header className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
          {title && (
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</h3>
          )}
          {aside}
        </header>
      )}
      {children}
    </section>
  );
}

export function StatTile({
  label,
  value,
  hint,
  title,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  /** The exact value, when the tile shows a rounded one. */
  title?: string;
}) {
  return (
    <div className="min-w-0 rounded-xl bg-ink-800/60 px-3 py-2.5" title={title}>
      <div className="text-[11px] font-medium uppercase leading-tight tracking-wide text-slate-500 [overflow-wrap:anywhere]">
        {label}
      </div>
      <div className="mt-1 truncate text-lg font-semibold tabular-nums text-slate-100">{value}</div>
      {hint && <div className="mt-0.5 truncate text-[11px] text-slate-500">{hint}</div>}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="grid place-items-center px-6 py-12 text-center">
      {icon && (
        <span className="grid h-12 w-12 place-items-center rounded-full bg-ink-700 text-slate-400">{icon}</span>
      )}
      <p className="mt-3 text-sm font-medium text-slate-300">{title}</p>
      {body && <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorLine({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const t = useT();
  return (
    <div role="alert" className="flex flex-wrap items-center justify-center gap-3 px-4 py-6 text-center text-sm">
      <span className="text-rose-300">{message}</span>
      {onRetry && (
        <SmallButton onClick={onRetry}>{t("common.retry")}</SmallButton>
      )}
    </div>
  );
}

export function PeopleIcon({ className = "h-[18px] w-[18px]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden className={className}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10.5a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5ZM21 19v-1a4 4 0 0 0-3-3.87M15.5 4.1a3.25 3.25 0 0 1 0 6.3"
      />
    </svg>
  );
}

export function ChatIcon({ className = "h-[18px] w-[18px]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden className={className}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M7.5 18.5 4 20.5V7a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v8.5a3 3 0 0 1-3 3H7.5ZM8 9.5h8M8 13h5"
      />
    </svg>
  );
}

export function SearchIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden className={className}>
      <circle cx="11" cy="11" r="6.5" />
      <path strokeLinecap="round" d="m16 16 4 4" />
    </svg>
  );
}

export function CompassIcon({ className = "h-[18px] w-[18px]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path strokeLinejoin="round" d="m15.5 8.5-2 5-5 2 2-5 5-2Z" />
    </svg>
  );
}

export function ExternalIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 5h5v5M19 5l-8 8M10 6H6a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-4" />
    </svg>
  );
}

export function HeartIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2Z" />
    </svg>
  );
}

export function DotsIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <circle cx="5.5" cy="12" r="1.75" />
      <circle cx="12" cy="12" r="1.75" />
      <circle cx="18.5" cy="12" r="1.75" />
    </svg>
  );
}
