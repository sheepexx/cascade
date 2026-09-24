import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useT } from "../../lib/i18n";

const STEP_MS = 90;

function sheen(step: number): CSSProperties {
  return { "--skeleton-delay": `${step * STEP_MS}ms` } as CSSProperties;
}

function range(count: number): number[] {
  return Array.from({ length: count }, (_, i) => i);
}

export function Skeleton({
  className = "",
  step = 0,
}: {
  className?: string;
  step?: number;
}) {
  return <div className={`skeleton ${className}`} style={sheen(step)} />;
}

function Group({
  label,
  className,
  children,
}: {
  label?: string;
  className?: string;
  children: ReactNode;
}) {
  const t = useT();
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={label ?? t("common.loading")}
      className={className}
    >
      {children}
    </div>
  );
}

export function SkeletonText({
  lines = 3,
  className = "",
  label,
}: {
  lines?: number;
  className?: string;
  label?: string;
}) {
  return (
    <Group label={label} className={`flex flex-col gap-2 ${className}`}>
      {range(lines).map((i) => (
        <Skeleton
          key={i}
          step={i}
          className={`h-3 rounded ${
            i === lines - 1 ? "w-2/5" : i % 2 ? "w-3/5" : "w-4/5"
          }`}
        />
      ))}
    </Group>
  );
}

export function SkeletonCards({
  count = 3,
  columns = "sm:grid-cols-2 lg:grid-cols-3",
  label,
}: {
  count?: number;
  columns?: string;
  label?: string;
}) {
  return (
    <Group label={label} className={`grid gap-3 ${columns}`}>
      {range(count).map((i) => (
        <div
          key={i}
          className="flex flex-col overflow-hidden rounded-xl border border-ink-500/60 bg-ink-700/40"
        >
          <Skeleton step={i} className="aspect-[16/9] w-full" />
          <div className="flex flex-col gap-2 p-3">
            <Skeleton step={i} className="h-3.5 w-3/5 rounded" />
            <Skeleton step={i} className="h-3 w-4/5 rounded" />
            <Skeleton step={i} className="h-2.5 w-2/5 rounded" />
          </div>
        </div>
      ))}
    </Group>
  );
}

export function SkeletonBanners({
  count = 4,
  label,
}: {
  count?: number;
  label?: string;
}) {
  return (
    <Group label={label} className="grid gap-3 sm:grid-cols-2">
      {range(count).map((i) => (
        <div
          key={i}
          className="flex flex-col overflow-hidden rounded-xl border border-ink-500/60 bg-ink-700/40"
        >
          <Skeleton step={i} className="aspect-[3.5/1] w-full" />
          <div className="flex flex-col gap-2 p-3">
            <Skeleton step={i} className="h-3.5 w-1/2 rounded" />
            <Skeleton step={i} className="h-3 w-2/5 rounded" />
            <Skeleton step={i} className="h-2.5 w-1/3 rounded" />
            <div className="mt-1 flex gap-1">
              {range(3).map((chip) => (
                <Skeleton key={chip} step={i} className="h-4 w-12 rounded" />
              ))}
            </div>
          </div>
        </div>
      ))}
    </Group>
  );
}

export function SkeletonRows({
  count = 3,
  lines = 2,
  avatar = false,
  action = true,
  className = "",
  label,
}: {
  count?: number;
  lines?: number;
  avatar?: boolean;
  action?: boolean;
  className?: string;
  label?: string;
}) {
  return (
    <Group label={label} className={`flex flex-col gap-2 ${className}`}>
      {range(count).map((i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-xl border border-ink-500/60 bg-ink-700/40 p-3"
        >
          {avatar && (
            <Skeleton step={i} className="h-8 w-8 shrink-0 rounded-full" />
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            {range(lines).map((line) => (
              <Skeleton
                key={line}
                step={i}
                className={`h-3 rounded ${
                  line === 0 ? "w-2/5" : line === 1 ? "w-3/5" : "w-1/3"
                }`}
              />
            ))}
          </div>
          {action && (
            <Skeleton step={i} className="h-7 w-16 shrink-0 rounded-lg" />
          )}
        </div>
      ))}
    </Group>
  );
}

export function SkeletonMediaCards({
  count = 4,
  columns = "sm:grid-cols-2",
  label,
}: {
  count?: number;
  columns?: string;
  label?: string;
}) {
  return (
    <Group label={label} className={`grid gap-3 ${columns}`}>
      {range(count).map((i) => (
        <div
          key={i}
          className="flex gap-3 rounded-xl border border-ink-500/60 bg-ink-700/40 p-3"
        >
          <Skeleton
            step={i}
            className="h-[150px] w-[4.75rem] shrink-0 rounded-lg"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton step={i} className="h-3.5 w-3/5 rounded" />
            <Skeleton step={i} className="h-2.5 w-2/5 rounded" />
            <Skeleton step={i} className="h-2.5 w-1/2 rounded" />
            <div className="mt-auto flex gap-1 pt-2">
              <Skeleton step={i} className="h-7 w-28 rounded-lg" />
            </div>
          </div>
        </div>
      ))}
    </Group>
  );
}

export function SkeletonTable({
  rows = 6,
  columns = 4,
  label,
}: {
  rows?: number;
  columns?: number;
  label?: string;
}) {
  const template: CSSProperties = {
    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
  };
  return (
    <Group label={label} className="flex flex-col gap-3">
      <div
        className="grid gap-3 border-b border-ink-600 pb-2"
        style={template}
      >
        {range(columns).map((col) => (
          <Skeleton key={col} step={col} className="h-2.5 w-16 rounded" />
        ))}
      </div>
      {range(rows).map((row) => (
        <div key={row} className="grid items-center gap-3" style={template}>
          {range(columns).map((col) => (
            <Skeleton
              key={col}
              step={row}
              className={`h-3.5 rounded ${col === 0 ? "w-4/5" : "w-1/2"}`}
            />
          ))}
        </div>
      ))}
    </Group>
  );
}

export function SkeletonStats({
  count = 4,
  label,
}: {
  count?: number;
  label?: string;
}) {
  return (
    <Group
      label={label}
      className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"
    >
      {range(count).map((i) => (
        <div
          key={i}
          className="rounded-xl border border-ink-600 bg-ink-800 p-4"
        >
          <Skeleton step={i} className="h-2.5 w-20 rounded" />
          <Skeleton step={i} className="mt-3 h-7 w-16 rounded" />
        </div>
      ))}
    </Group>
  );
}

export function AsyncImage({
  src,
  alt = "",
  className = "",
  pending = false,
  fallback = null,
}: {
  src?: string;
  alt?: string;
  className?: string;
  pending?: boolean;
  fallback?: ReactNode;
}) {
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (!src) {
    return pending ? <Skeleton className="h-full w-full" /> : <>{fallback}</>;
  }
  if (failedSrc === src) return <>{fallback}</>;

  const loaded = loadedSrc === src;
  return (
    <>
      {!loaded && <Skeleton className="absolute inset-0" />}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onLoad={() => setLoadedSrc(src)}
        onError={() => setFailedSrc(src)}
        className={`${className} transition-opacity duration-300 ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
      />
    </>
  );
}
