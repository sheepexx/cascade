import { useMemo, useState, type ReactNode } from "react";
import { Button, Select, TextInput } from "../ui/Controls";
import { SkeletonRows } from "../ui/Skeleton";
import { sharedMapUrl } from "../../lib/sharedMap";
import {
  useAdminLinks,
  type AdminLink,
  type AdminLinkKind,
} from "../../hooks/useAdminLinks";
import { formatBytes, formatMoment } from "./format";

type KindFilter = "all" | AdminLinkKind;
type LinkSort = "recent" | "created" | "storage" | "owner";
type LinkView = "users" | "list";

const KIND_LABEL: Record<AdminLinkKind, string> = {
  preview: "Map preview",
  card: "Map card",
};

const KIND_PLURAL: Record<AdminLinkKind, [string, string]> = {
  preview: ["map preview", "map previews"],
  card: ["map card", "map cards"],
};

const KIND_STYLE: Record<AdminLinkKind, string> = {
  preview: "bg-sky-500/15 text-sky-300",
  card: "bg-violet-500/15 text-violet-300",
};

const OSU_KEY = /^osu-(\d+)$/;

function plural(kind: AdminLinkKind, count: number): string {
  return `${count} ${KIND_PLURAL[kind][count === 1 ? 0 : 1]}`;
}

function linkUrl(link: AdminLink): string {
  return link.kind === "preview" ? sharedMapUrl(link.preview.slug) : link.card.url;
}

function linkPath(link: AdminLink): string {
  return link.kind === "preview"
    ? `/m/${link.preview.slug}`
    : `/card/${link.card.slug}.png`;
}

function searchText(link: AdminLink): string {
  const own = [link.ownerName ?? "", link.owner];
  const specific =
    link.kind === "preview"
      ? [link.preview.title, link.preview.artist, link.preview.slug]
      : [link.card.slug, link.card.map_key];
  return [...own, ...specific].join(" ").toLowerCase();
}

function time(value: string): number {
  const at = new Date(value).getTime();
  return Number.isFinite(at) ? at : 0;
}

function ownerLabel(link: Pick<AdminLink, "ownerName" | "owner">): string {
  return link.ownerName ?? link.owner.slice(0, 8);
}

function compareLinks(a: AdminLink, b: AdminLink, sort: LinkSort): number {
  if (sort === "storage") return b.bytes - a.bytes;
  if (sort === "created") return time(b.createdAt) - time(a.createdAt);
  if (sort === "owner") {
    return ownerLabel(a).localeCompare(ownerLabel(b)) || time(b.activityAt) - time(a.activityAt);
  }
  return time(b.activityAt) - time(a.activityAt);
}

function countKinds(links: AdminLink[]): Record<AdminLinkKind, number> {
  const counts: Record<AdminLinkKind, number> = { preview: 0, card: 0 };
  for (const link of links) counts[link.kind] += 1;
  return counts;
}

function kindSummary(links: AdminLink[]): string {
  const counts = countKinds(links);
  return (Object.keys(counts) as AdminLinkKind[])
    .filter((kind) => counts[kind] > 0)
    .map((kind) => plural(kind, counts[kind]))
    .join(" · ");
}

type OwnerGroup = {
  owner: string;
  ownerName: string | null;
  ownerOsuId: number | null;
  links: AdminLink[];
  bytes: number;
  latest: number;
  created: number;
};

function groupByOwner(links: AdminLink[], sort: LinkSort): OwnerGroup[] {
  const groups = new Map<string, OwnerGroup>();
  for (const link of links) {
    const group = groups.get(link.owner) ?? {
      owner: link.owner,
      ownerName: link.ownerName,
      ownerOsuId: link.ownerOsuId,
      links: [],
      bytes: 0,
      latest: 0,
      created: 0,
    };
    group.links.push(link);
    group.bytes += link.bytes;
    group.latest = Math.max(group.latest, time(link.activityAt));
    group.created = Math.max(group.created, time(link.createdAt));
    groups.set(link.owner, group);
  }
  return [...groups.values()].sort((a, b) => {
    if (sort === "storage") return b.bytes - a.bytes;
    if (sort === "created") return b.created - a.created;
    if (sort === "owner") {
      return (a.ownerName ?? a.owner).localeCompare(b.ownerName ?? b.owner);
    }
    return b.latest - a.latest;
  });
}

function OwnerName({
  name,
  owner,
  osuId,
}: {
  name: string | null;
  owner: string;
  osuId: number | null;
}) {
  const label = name ?? owner.slice(0, 8);
  return osuId ? (
    <a
      href={`https://osu.ppy.sh/users/${osuId}`}
      target="_blank"
      rel="noopener noreferrer"
      className="text-accent hover:underline"
    >
      {label}
    </a>
  ) : (
    <span>{label}</span>
  );
}

function KindBadge({ kind }: { kind: AdminLinkKind }) {
  return (
    <span
      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${KIND_STYLE[kind]}`}
    >
      {KIND_LABEL[kind]}
    </span>
  );
}

function linkTitle(link: AdminLink): ReactNode {
  if (link.kind === "preview") {
    return (
      <>
        {link.preview.title || "Untitled"}
        {link.preview.artist && (
          <span className="text-slate-500"> - {link.preview.artist}</span>
        )}
      </>
    );
  }
  const beatmap = OSU_KEY.exec(link.card.map_key)?.[1];
  return beatmap ? (
    <a
      href={`https://osu.ppy.sh/b/${beatmap}`}
      target="_blank"
      rel="noopener noreferrer"
      className="hover:underline"
    >
      osu! beatmap {beatmap}
    </a>
  ) : (
    "Unsubmitted difficulty"
  );
}

function linkDetails(link: AdminLink): ReactNode[] {
  if (link.kind === "preview") {
    const preview = link.preview;
    const files = Number(preview.asset_count);
    return [
      `last view ${formatMoment(preview.last_viewed_at)}`,
      `${Number(preview.views).toLocaleString()} views`,
      formatBytes(link.bytes),
      `${files} ${files === 1 ? "file" : "files"}`,
    ];
  }
  const card = link.card;
  return [
    `version ${card.version}`,
    `${card.width} × ${card.height}`,
    formatBytes(link.bytes),
    `updated ${formatMoment(card.updated_at)}`,
    ...(OSU_KEY.test(card.map_key)
      ? []
      : [<span key="key" className="font-mono">{card.map_key}</span>]),
  ];
}

function LinkRow({
  link,
  showOwner,
  deleting,
  disabled,
  onDelete,
}: {
  link: AdminLink;
  showOwner: boolean;
  deleting: boolean;
  disabled: boolean;
  onDelete: () => void;
}) {
  const url = linkUrl(link);
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-lg border border-ink-700 bg-ink-800 p-3">
      {link.kind === "card" && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0"
          aria-label="Open the map card image"
        >
          <img
            src={url}
            alt=""
            loading="lazy"
            className="h-12 w-[4.65rem] rounded-md border border-white/10 bg-ink-900 object-cover"
          />
        </a>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <KindBadge kind={link.kind} />
          <span className="truncate text-sm text-slate-200">{linkTitle(link)}</span>
        </div>
        <div className="mt-0.5 text-[11px] text-slate-500">
          {showOwner && (
            <>
              owner{" "}
              <OwnerName name={link.ownerName} owner={link.owner} osuId={link.ownerOsuId} />
              {" · "}
            </>
          )}
          created {formatMoment(link.createdAt)}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-accent hover:underline"
          >
            {linkPath(link)}
          </a>
          {linkDetails(link).map((detail, index) => (
            <span key={index}>{detail}</span>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg border border-white/10 bg-ink-700 px-3 py-2 text-xs font-medium text-slate-200 transition hover:border-accent/50 hover:text-white"
        >
          Open
        </a>
        <Button disabled={disabled} onClick={onDelete}>
          {deleting ? "Deleting…" : "Delete"}
        </Button>
      </div>
    </li>
  );
}

function LinkList({
  links,
  showOwner,
  deletingId,
  onDelete,
}: {
  links: AdminLink[];
  showOwner: boolean;
  deletingId: string | null;
  onDelete: (link: AdminLink) => void;
}) {
  return (
    <ul className="flex flex-col gap-2">
      {links.map((link) => (
        <LinkRow
          key={link.id}
          link={link}
          showOwner={showOwner}
          deleting={deletingId === link.id}
          disabled={deletingId !== null}
          onDelete={() => onDelete(link)}
        />
      ))}
    </ul>
  );
}

function Errors({ errors }: { errors: string[] }) {
  return (
    <>
      {errors.map((error) => (
        <p key={error} className="mb-3 text-sm text-rose-400">
          {error}
        </p>
      ))}
    </>
  );
}

export function LinksTab() {
  const { links, errors, deletingId, remove } = useAdminLinks(null);
  const [kind, setKind] = useState<KindFilter>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<LinkSort>("recent");
  const [view, setView] = useState<LinkView>("users");

  const counts = useMemo(() => countKinds(links ?? []), [links]);
  const owners = useMemo(() => new Set((links ?? []).map((link) => link.owner)).size, [links]);
  const totalBytes = useMemo(
    () => (links ?? []).reduce((sum, link) => sum + link.bytes, 0),
    [links],
  );

  const visible = useMemo(() => {
    if (!links) return null;
    const needle = query.trim().toLowerCase();
    return links
      .filter((link) => kind === "all" || link.kind === kind)
      .filter((link) => !needle || searchText(link).includes(needle))
      .sort((a, b) => compareLinks(a, b, sort));
  }, [links, kind, query, sort]);

  const groups = useMemo(
    () => (visible && view === "users" ? groupByOwner(visible, sort) : null),
    [visible, view, sort],
  );

  const filters: { value: KindFilter; label: string; count: number }[] = [
    { value: "all", label: "All", count: links?.length ?? 0 },
    { value: "preview", label: "Map previews", count: counts.preview },
    { value: "card", label: "Map cards", count: counts.card },
  ];

  return (
    <div>
      <Errors errors={errors} />
      {!links && <SkeletonRows count={8} lines={3} label="Loading links" />}
      {links && (
        <div className="mb-4 flex flex-col gap-3">
          <div className="text-sm text-slate-400">
            <span className="font-semibold text-slate-200">{links.length}</span> public
            links from <span className="font-semibold text-slate-200">{owners}</span>{" "}
            {owners === 1 ? "user" : "users"} · total storage{" "}
            <span className="font-semibold text-slate-200">{formatBytes(totalBytes)}</span>
            {visible && visible.length !== links.length && (
              <span className="text-slate-500"> · {visible.length} shown</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-1 rounded-lg border border-ink-600 bg-ink-800 p-1">
              {filters.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => setKind(filter.value)}
                  aria-pressed={kind === filter.value}
                  className={`rounded-md px-3 py-1 text-xs transition ${
                    kind === filter.value
                      ? "bg-ink-600 text-slate-100"
                      : "text-slate-400 hover:bg-ink-700 hover:text-slate-200"
                  }`}
                >
                  {filter.label}
                  <span className="ml-1.5 tabular-nums text-slate-500">{filter.count}</span>
                </button>
              ))}
            </div>
            <TextInput
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search map, owner, slug or key"
              className="w-64"
            />
            <label className="flex items-center gap-2 text-xs text-slate-400">
              Show
              <Select
                size="sm"
                value={view}
                onChange={(event) => setView(event.target.value as LinkView)}
              >
                <option value="users">By user</option>
                <option value="list">One list</option>
              </Select>
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-400">
              Sort
              <Select
                size="sm"
                value={sort}
                onChange={(event) => setSort(event.target.value as LinkSort)}
              >
                <option value="recent">Latest activity</option>
                <option value="created">Newest</option>
                <option value="storage">Storage</option>
                <option value="owner">Owner</option>
              </Select>
            </label>
          </div>
        </div>
      )}
      {visible && visible.length === 0 && (
        <p className="text-sm text-slate-400">
          {links?.length ? "No matching links." : "No public links yet."}
        </p>
      )}
      {groups && groups.length > 0 && (
        <div className="flex flex-col gap-4">
          {groups.map((group) => (
            <section
              key={group.owner}
              className="rounded-xl border border-ink-600 bg-ink-900/40"
            >
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-ink-600 px-3 py-2">
                <span className="text-sm font-medium text-slate-200">
                  <OwnerName
                    name={group.ownerName}
                    owner={group.owner}
                    osuId={group.ownerOsuId}
                  />
                </span>
                <span className="text-[11px] text-slate-500">
                  {kindSummary(group.links)} · {formatBytes(group.bytes)} · latest{" "}
                  {formatMoment(group.latest ? new Date(group.latest).toISOString() : null)}
                </span>
              </div>
              <div className="p-2">
                <LinkList
                  links={group.links}
                  showOwner={false}
                  deletingId={deletingId}
                  onDelete={(link) => void remove(link)}
                />
              </div>
            </section>
          ))}
        </div>
      )}
      {!groups && visible && visible.length > 0 && (
        <LinkList
          links={visible}
          showOwner
          deletingId={deletingId}
          onDelete={(link) => void remove(link)}
        />
      )}
    </div>
  );
}

export function UserLinksSection({
  userId,
  onDeleted,
}: {
  userId: string;
  onDeleted: (bytes: number) => void;
}) {
  const { links, errors, deletingId, remove } = useAdminLinks(userId);
  const sorted = useMemo(
    () => (links ? [...links].sort((a, b) => compareLinks(a, b, "recent")) : null),
    [links],
  );

  return (
    <section className="mt-6 rounded-xl border border-ink-600 bg-ink-800 p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Links
        </h2>
        {sorted && sorted.length > 0 && (
          <span className="text-[11px] text-slate-500">{kindSummary(sorted)}</span>
        )}
      </div>
      <Errors errors={errors} />
      {!sorted && (
        <SkeletonRows count={2} lines={2} action={false} label="Loading links" />
      )}
      {sorted && sorted.length === 0 && (
        <p className="text-sm text-slate-500">No public links.</p>
      )}
      {sorted && sorted.length > 0 && (
        <LinkList
          links={sorted}
          showOwner={false}
          deletingId={deletingId}
          onDelete={(link) =>
            void remove(link).then((bytes) => {
              if (bytes !== null) onDeleted(bytes);
            })
          }
        />
      )}
    </section>
  );
}
