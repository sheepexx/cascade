import { useCallback, useEffect, useState } from "react";
import {
  deleteMapCardAdmin,
  deleteSharedMapAdmin,
  listAdminMapCards,
  listAdminSharedMaps,
  type AdminMapCard,
  type AdminSharedMap,
} from "../lib/admin";

type LinkBase = {
  id: string;
  owner: string;
  ownerName: string | null;
  ownerOsuId: number | null;
  createdAt: string;
  activityAt: string;
  bytes: number;
};

export type AdminLink =
  | (LinkBase & { kind: "preview"; preview: AdminSharedMap })
  | (LinkBase & { kind: "card"; card: AdminMapCard });

export type AdminLinkKind = AdminLink["kind"];

function fromPreview(preview: AdminSharedMap): AdminLink {
  return {
    kind: "preview",
    id: `preview:${preview.id}`,
    owner: preview.owner,
    ownerName: preview.owner_username,
    ownerOsuId: preview.owner_osu_id,
    createdAt: preview.created_at,
    activityAt: preview.last_viewed_at ?? preview.updated_at ?? preview.created_at,
    bytes: Number(preview.asset_bytes || 0),
    preview,
  };
}

function fromCard(card: AdminMapCard): AdminLink {
  return {
    kind: "card",
    id: `card:${card.id}`,
    owner: card.owner,
    ownerName: card.owner_username,
    ownerOsuId: card.owner_osu_id,
    createdAt: card.created_at,
    activityAt: card.updated_at,
    bytes: card.bytes,
    card,
  };
}

function message(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "request failed";
}

export function useAdminLinks(userId: string | null) {
  const [links, setLinks] = useState<AdminLink[] | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLinks(null);
    setErrors([]);
    void Promise.allSettled([
      listAdminSharedMaps(userId),
      listAdminMapCards(userId),
    ]).then(([previews, cards]) => {
      if (cancelled) return;
      const next: AdminLink[] = [];
      const problems: string[] = [];
      if (previews.status === "fulfilled") next.push(...previews.value.map(fromPreview));
      else problems.push(`Map previews could not be loaded: ${message(previews.reason)}`);
      if (cards.status === "fulfilled") next.push(...cards.value.map(fromCard));
      else {
        problems.push(
          `Map cards could not be loaded: ${message(cards.reason)}. Is migration 0034 applied?`,
        );
      }
      setLinks(next);
      setErrors(problems);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const remove = useCallback(async (link: AdminLink): Promise<number | null> => {
    const question =
      link.kind === "preview"
        ? "Delete this public preview and all of its files?"
        : "Delete this hosted map card? Its image stops loading everywhere it was posted.";
    if (!window.confirm(question)) return null;
    setDeletingId(link.id);
    setErrors([]);
    try {
      if (link.kind === "preview") await deleteSharedMapAdmin(link.preview);
      else await deleteMapCardAdmin(link.card);
      setLinks((previous) => previous?.filter((item) => item.id !== link.id) ?? null);
      return link.bytes;
    } catch (error) {
      setErrors([`Delete failed: ${message(error)}`]);
      return null;
    } finally {
      setDeletingId(null);
    }
  }, []);

  return { links, errors, deletingId, remove };
}
