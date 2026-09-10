declare module "node:fs" {
  export function readFileSync(path: string | URL): Uint8Array<ArrayBuffer>;
  export function readdirSync(path: string | URL): string[];
}
