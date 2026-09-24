import { useCallback, useEffect, useRef, useState } from "react";
import {
  findHostedMapCard,
  toHostedMapCard,
  type HostedMapCard,
} from "../lib/mapCardCloud";
import { deleteMapCard, uploadMapCard } from "../lib/storage";
import { t } from "../lib/i18n/core";

export type HostedMapCardStatus =
  | "signedOut"
  | "checking"
  | "idle"
  | "uploading"
  | "deleting";

function friendly(error: unknown, fallback: string): string {
  const text = error instanceof Error ? error.message : "";
  if (!text) return fallback;
  if (/unauthorized/i.test(text)) {
    return t("mapCard.errSession");
  }
  if (/limit reached/i.test(text)) {
    return t("mapCard.errLimit");
  }
  if (/size limit/i.test(text)) return t("mapCard.errSize");
  if (/failed to fetch|network/i.test(text)) {
    return t("mapCard.errNetwork");
  }
  return t("mapCard.errDetail", { message: fallback, detail: text });
}

export function useHostedMapCard(
  userId: string | null,
  mapKey: string,
  active: boolean,
) {
  const [card, setCard] = useState<HostedMapCard | null>(null);
  const [status, setStatus] = useState<HostedMapCardStatus>(
    userId ? "checking" : "signedOut",
  );
  const [error, setError] = useState<string | null>(null);
  const [lookupFailed, setLookupFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const keyRef = useRef(mapKey);
  keyRef.current = mapKey;

  useEffect(() => {
    if (!active) return;
    setError(null);
    setLookupFailed(false);
    setCard(null);
    if (!userId) {
      setStatus("signedOut");
      return;
    }
    let cancelled = false;
    setStatus("checking");
    findHostedMapCard(userId, mapKey)
      .then((found) => {
        if (cancelled) return;
        setCard(found);
        setStatus("idle");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setStatus("idle");
        setLookupFailed(true);
        setError(friendly(err, t("mapCard.errLookup")));
      });
    return () => {
      cancelled = true;
    };
  }, [userId, mapKey, active, attempt]);

  const upload = useCallback(
    async (blob: Blob): Promise<HostedMapCard | null> => {
      const key = mapKey;
      setStatus("uploading");
      setError(null);
      setLookupFailed(false);
      try {
        const hosted = toHostedMapCard(await uploadMapCard(key, blob));
        if (keyRef.current === key) setCard(hosted);
        return hosted;
      } catch (err) {
        if (keyRef.current === key) setError(friendly(err, t("mapCard.errUpload")));
        return null;
      } finally {
        setStatus("idle");
      }
    },
    [mapKey],
  );

  const remove = useCallback(async (): Promise<boolean> => {
    if (!card) return false;
    setStatus("deleting");
    setError(null);
    setLookupFailed(false);
    try {
      await deleteMapCard(card.slug);
      setCard(null);
      return true;
    } catch (err) {
      setError(friendly(err, t("mapCard.errRemove")));
      return false;
    } finally {
      setStatus("idle");
    }
  }, [card]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  return { card, status, error, lookupFailed, upload, remove, retry };
}
