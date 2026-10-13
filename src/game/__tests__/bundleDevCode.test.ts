import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// The real check: builds the production bundle (and a DEV control) and fails if developer tools ship. See scripts/check-bundle.mjs.
// Set SKIP_BUNDLE_CHECK=1 to skip the two builds (about 10 s) when iterating on something unrelated.
const script = pathToFileURL(path.resolve(__dirname, '../../../scripts/check-bundle.mjs')).href;
const mod = (await import(/* @vite-ignore */ script)) as {
  DEV_MARKERS: { marker: string }[];
  findMarkers: (text: string) => { marker: string }[];
  checkBundle: () => Promise<{ leaked: { marker: string }[]; missingInControl: { marker: string }[] }>;
};

describe('production bundle carries no developer tools', () => {
  it('the marker scanner finds a planted marker and ignores clean text', () => {
    expect(mod.findMarkers('console.log(1)')).toEqual([]);
    expect(mod.findMarkers('w.__uiAudit=()=>1').map((m) => m.marker)).toEqual(['__uiAudit']);
    expect(mod.DEV_MARKERS.length).toBeGreaterThanOrEqual(5);
  });

  it.skipIf(!!process.env.SKIP_BUNDLE_CHECK)(
    'no DEV marker in the production build, every marker present in the DEV control build',
    async () => {
      const { leaked, missingInControl } = await mod.checkBundle();
      expect(leaked.map((m) => m.marker)).toEqual([]);
      expect(missingInControl.map((m) => m.marker)).toEqual([]);
    },
    180_000,
  );
});
