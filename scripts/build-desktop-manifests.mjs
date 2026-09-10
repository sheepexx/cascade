import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const UPDATER_PLATFORMS = {
  "windows-x86_64": [/-setup\.exe$/i],
  "linux-x86_64": [/\.AppImage\.tar\.gz$/i, /\.AppImage$/i],
  "darwin-x86_64": [/\.app\.tar\.gz$/i],
  "darwin-aarch64": [/\.app\.tar\.gz$/i],
};

const ASSETS = [
  { os: "windows", key: "setup", match: /-setup\.exe$/i },
  { os: "windows", key: "msi", match: /\.msi$/i },
  { os: "windows", key: "portable", match: /_portable\.exe$/i, signed: true },
  { os: "linux", key: "appimage", match: /\.AppImage$/i },
  { os: "linux", key: "deb", match: /\.deb$/i },
  { os: "linux", key: "rpm", match: /\.rpm$/i },
  { os: "macos", key: "dmg", match: /\.dmg$/i },
];

const isPayload = (file) => !file.name.endsWith(".sig");

export function classifyAssets(files) {
  const platforms = {};
  for (const { os, key, match, signed } of ASSETS) {
    const found = files.find((f) => isPayload(f) && match.test(f.name));
    if (!found) continue;
    const asset = { name: found.name, size: found.size };
    const signature = signed && files.find((f) => f.name === `${found.name}.sig`);
    if (signature) asset.signature = signature.content.trim();
    platforms[os] ??= {};
    platforms[os][key] = asset;
  }
  return platforms;
}

export function buildManifests(files, version, worker, publishedAt) {
  const platforms = classifyAssets(files);
  if (!platforms.windows?.setup) {
    throw new Error("no Windows setup installer found; refusing to publish a manifest that would strand Windows users");
  }

  const updater = {};
  for (const [target, patterns] of Object.entries(UPDATER_PLATFORMS)) {
    let artifact;
    let signature;
    for (const pattern of patterns) {
      artifact = files.find((f) => isPayload(f) && pattern.test(f.name));
      signature = artifact && files.find((f) => f.name === `${artifact.name}.sig`);
      if (signature) break;
    }
    if (!artifact || !signature) continue;
    updater[target] = {
      signature: signature.content.trim(),
      url: `${worker}/desktop/${version}/${encodeURIComponent(artifact.name)}`,
    };
  }
  if (!updater["windows-x86_64"]) {
    throw new Error("no Windows updater signature found; refusing to publish a manifest that would strand Windows users");
  }

  return {
    latest: { version, publishedAt, files: platforms.windows, platforms },
    update: { version, pub_date: publishedAt, platforms: updater },
  };
}

export function readArtifacts(dir) {
  return readdirSync(dir)
    .filter((name) => name !== "latest.json" && name !== "update.json")
    .map((name) => {
      const full = path.join(dir, name);
      return {
        name,
        size: statSync(full).size,
        content: name.endsWith(".sig") ? readFileSync(full, "utf8") : "",
      };
    });
}

function main() {
  const dir = process.env.OUT_DIR ?? "out";
  const version = process.env.VERSION;
  const worker = process.env.WORKER;
  if (!version || !worker) throw new Error("VERSION and WORKER are required");

  const { latest, update } = buildManifests(readArtifacts(dir), version, worker, new Date().toISOString());
  writeFileSync(path.join(dir, "latest.json"), JSON.stringify(latest));
  writeFileSync(path.join(dir, "update.json"), JSON.stringify(update));
  process.stdout.write(`latest.json platforms: ${Object.keys(latest.platforms).join(", ")}\n`);
  process.stdout.write(`update.json targets: ${Object.keys(update.platforms).join(", ")}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
