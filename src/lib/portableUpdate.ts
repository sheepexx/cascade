import { isDesktopApp } from "./pwa";

const WORKER = (import.meta.env.VITE_WORKER_URL ?? "").replace(/\/+$/, "");

export type PortableApp = { name: string; directory: string };

export type PortableArtifact = { name: string; signature: string };

type ManifestAsset = { name?: unknown; signature?: unknown };

type Manifest = {
  version?: unknown;
  platforms?: { windows?: { portable?: ManifestAsset } };
};

export function portableArtifact(
  manifest: unknown,
  version: string,
): PortableArtifact | null {
  const latest = (manifest ?? null) as Manifest | null;
  if (!latest || latest.version !== version) return null;
  const asset = latest.platforms?.windows?.portable;
  const name = typeof asset?.name === "string" ? asset.name : "";
  const signature = typeof asset?.signature === "string" ? asset.signature : "";
  if (!name || !signature) return null;
  return { name, signature };
}

export function portableUrl(version: string, name: string): string {
  return `${WORKER}/desktop/${encodeURIComponent(version)}/${encodeURIComponent(name)}`;
}

export async function currentPortableApp(): Promise<PortableApp | null> {
  if (!isDesktopApp()) return null;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return (await invoke<PortableApp | null>("portable_app")) ?? null;
  } catch {
    return null;
  }
}

export async function installPortableUpdate(version: string): Promise<void> {
  if (!WORKER) {
    throw new Error("This build cannot reach the download service.");
  }
  const manifest = await fetch(`${WORKER}/desktop/latest.json`).then((res) =>
    res.ok ? (res.json() as Promise<unknown>) : null,
  );
  const artifact = portableArtifact(manifest, version);
  if (!artifact) {
    throw new Error(
      `Cascade ${version} has no portable download yet. Grab it from the website instead.`,
    );
  }
  const response = await fetch(portableUrl(version, artifact.name));
  if (!response.ok) {
    throw new Error(
      `The portable update could not be downloaded (${response.status}).`,
    );
  }
  const payload = new Uint8Array(await response.arrayBuffer());
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("portable_install", payload, {
    headers: {
      "x-update-version": version,
      "x-update-signature": artifact.signature,
    },
  });
}
