import { APP_VERSION } from '../lib/appVersion';
import type { SaveData } from './engine';

// What the client is willing to put on the wire when it stores a save on the server (phase 1: the server only stores what it is given, so the first
// line of defence is simply not sending absurd blobs; docs/backend-phase1.md lists the matching server-side checks).
//
// The limit is 4x the biggest save we could build on purpose: an end-game hero (level 100, tier 6) with a full bag AND a full stash of 200 legendary
// gear instances with 3 substats each, and every material at 99,999 is about 72 KB of JSON (a brand-new hero is 4.7 KB, the end-game fixture 6.3 KB).
// 4 x 72 KB is about 287 KB, so 288 KiB. A real save never gets near it; a save over it is a bug or tampering.
export const MAX_SAVE_UPLOAD_BYTES = 288 * 1024;

export class SaveTooLargeError extends Error {
  constructor(public readonly bytes: number) {
    super('save_too_large');
    this.name = 'SaveTooLargeError';
  }
}

export interface UploadBlob extends SaveData {
  /** The game version that wrote this save (package.json). Informational; normalizeSave ignores it. */
  appVersion: string;
}

/** The save as it is uploaded: the save itself (it carries `schemaVersion`, the gear schema) plus the version of the app that wrote it. */
export function toUploadBlob(save: SaveData): UploadBlob {
  return { ...save, appVersion: APP_VERSION };
}

/** The inverse for the load path: removes the upload-only metadata so it never becomes part of the game state. Non-objects pass through (normalizeSave handles them). */
export function fromUploadBlob(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const { appVersion: _appVersion, ...rest } = raw as Record<string, unknown>;
  void _appVersion;
  return rest;
}

export function jsonBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

/** Throws SaveTooLargeError (before any network call) when the blob is over the limit. Returns the blob unchanged otherwise. */
export function assertUploadSize<T>(blob: T): T {
  const bytes = jsonBytes(blob);
  if (bytes > MAX_SAVE_UPLOAD_BYTES) throw new SaveTooLargeError(bytes);
  return blob;
}
