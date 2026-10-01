declare module "node:fs" {
  export function readFileSync(path: string | URL): Uint8Array<ArrayBuffer>;
  export function readdirSync(path: string | URL): string[];
  export function existsSync(path: string | URL): boolean;
  export function statSync(path: string | URL): { isDirectory(): boolean; size: number };
}
