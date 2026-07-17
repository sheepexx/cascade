declare module "node:fs" {
  export function readFileSync(path: string | URL): Uint8Array<ArrayBuffer>;
}
