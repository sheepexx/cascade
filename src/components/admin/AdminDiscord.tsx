import { useCallback, useEffect, useState } from "react";
import { sessionAuthHeaders } from "../../lib/auth";
import { Button } from "../ui/Controls";

const WORKER = import.meta.env.VITE_WORKER_URL;

type DiscordStatus = {
  login: boolean;
  applicationId: boolean;
  publicKey: boolean;
  clientSecret: boolean;
  botToken: boolean;
  guild: boolean;
  contributorRole: boolean;
  reviewChannel: boolean;
  interactionsUrl: string;
  redirectUri: string;
};

const CHECKS: { key: keyof DiscordStatus; label: string; where: string }[] = [
  { key: "applicationId", label: "Application ID", where: "worker/wrangler.jsonc, DISCORD_APPLICATION_ID" },
  { key: "clientSecret", label: "OAuth2 client secret", where: "Cloudflare secret DISCORD_CLIENT_SECRET" },
  { key: "publicKey", label: "Public key", where: "worker/wrangler.jsonc, DISCORD_PUBLIC_KEY" },
  { key: "botToken", label: "Bot token", where: "Cloudflare secret DISCORD_BOT_TOKEN" },
  { key: "guild", label: "Server ID", where: "worker/wrangler.jsonc, DISCORD_GUILD_ID" },
  { key: "contributorRole", label: "Contributor role ID", where: "worker/wrangler.jsonc, DISCORD_CONTRIBUTOR_ROLE_ID" },
  { key: "reviewChannel", label: "Review channel ID", where: "worker/wrangler.jsonc, DISCORD_REVIEW_CHANNEL_ID" },
];

/**
 * Setting up the Discord login and bot from Cascade itself: what the Worker
 * has, the two URLs to paste into Discord's Developer Portal, and the button
 * that registers the slash commands (the Worker does it with the bot token,
 * which never leaves Cloudflare).
 */
export function DiscordBotSection() {
  const [status, setStatus] = useState<DiscordStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setError(null);
    fetch(`${WORKER}/discord/status`, { headers: sessionAuthHeaders() })
      .then(async (res) => {
        if (!res.ok) throw new Error(res.status === 404 ? "The Worker doesn't have the Discord routes yet. Deploy it first." : `Status check failed (${res.status}).`);
        setStatus((await res.json()) as DiscordStatus);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Status check failed."));
  }, []);

  useEffect(load, [load]);

  const register = async () => {
    setBusy(true);
    setResult(null);
    setError(null);
    try {
      const res = await fetch(`${WORKER}/discord/commands`, { method: "POST", headers: sessionAuthHeaders() });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; count?: number; scope?: string; status?: number; error?: string };
      if (res.ok && body.ok) {
        setResult(`Registered ${body.count} commands ${body.scope === "guild" ? "in your server (they show up right away)" : "everywhere (they can take up to an hour to show up)"}.`);
      } else {
        setError(body.error ?? `Discord refused the commands (status ${body.status ?? res.status}). Check the application ID and bot token.`);
      }
    } catch {
      setError("Couldn't reach the Worker.");
    } finally {
      setBusy(false);
    }
  };

  const copy = (text: string) => void navigator.clipboard?.writeText(text).catch(() => {});

  return (
    <section className="rounded-lg bg-white/[0.03] p-5">
      <h2 className="text-sm font-semibold text-slate-100">Discord login and bot</h2>
      <p className="mt-1 text-sm text-slate-400">
        Set up with docs/DISCORD_SETUP.md. Public IDs go in worker/wrangler.jsonc; the client secret and bot token
        are encrypted secrets in the Cloudflare dashboard.
      </p>
      {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}
      {status && (
        <>
          <ul className="mt-4 flex flex-col gap-1.5 text-sm">
            {CHECKS.map((check) => (
              <li key={check.key} className="flex items-start gap-2">
                <span
                  aria-hidden
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${status[check.key] ? "bg-emerald-400" : "bg-slate-500"}`}
                />
                <span className="text-slate-200">
                  {check.label}
                  <span className="text-slate-500">
                    {" "}
                    · {status[check.key] ? "set" : `missing (${check.where})`}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <dl className="mt-4 flex flex-col gap-3 text-xs">
            {[
              { label: "OAuth2 redirect (Developer Portal, OAuth2, Redirects)", value: status.redirectUri },
              { label: "Interactions endpoint URL (Developer Portal, General Information)", value: status.interactionsUrl },
            ].map((row) => (
              <div key={row.label}>
                <dt className="text-slate-400">{row.label}</dt>
                <dd className="mt-1 flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded bg-black/25 px-2 py-1 font-mono text-slate-200">{row.value}</code>
                  <Button size="sm" onClick={() => copy(row.value)}>
                    Copy
                  </Button>
                </dd>
              </div>
            ))}
          </dl>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button variant="primary" onClick={() => void register()} disabled={busy || !status.applicationId || !status.botToken}>
              {busy ? "Registering…" : "Register slash commands"}
            </Button>
            <Button onClick={load}>Check again</Button>
            <span className="text-xs text-slate-400">
              Discord login {status.login ? "is on" : "is off until the application ID and client secret are set"}.
            </span>
          </div>
          {result && <p className="mt-3 text-sm text-emerald-300">{result}</p>}
        </>
      )}
    </section>
  );
}
