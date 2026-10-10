// @types/node is not a dependency of this project; cpTable.gen.ts (run by vitest under node) only needs these few declarations.
declare module 'node:fs' {
  export function writeFileSync(path: string, data: string): void;
}
declare module 'node:path' {
  export function resolve(...segments: string[]): string;
}
declare const __dirname: string;
