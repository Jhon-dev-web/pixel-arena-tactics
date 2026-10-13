// The game version (package.json "version"), injected at build time by vite.config.ts as __APP_VERSION__. Tests and tools that do not go through
// Vite see 'dev'. Used by the error report and by the save upload (the version that wrote the save).
declare const __APP_VERSION__: string | undefined;
export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
