import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import Assets from '../../assets.json';
import { artGeometry, HERO_ART, HUNTING_ZONES, huntingEnemyArt, huntingEnemySpriteUrl, huntingZoneBackgroundUrl } from '../huntingZones';

// PNG width/height from the IHDR chunk (no image library needed)
const pngSize = (url: string): [number, number] => {
  const b = readFileSync(join(process.cwd(), 'public', url));
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
};
const onDisk = (url: string): boolean => existsSync(join(process.cwd(), 'public', url));

describe('Hunt scenes', () => {
  it('every zone has its own map background registered in assets.json and present on disk', () => {
    const backgrounds = Assets.background as Record<string, { url: string }>;
    for (const z of HUNTING_ZONES) {
      const entry = backgrounds[`hunt_${z.id}`];
      expect(entry, z.id).toBeDefined();
      expect(entry.url).toBe(huntingZoneBackgroundUrl(z.id));
      expect(onDisk(entry.url), entry.url).toBe(true);
    }
  });

  it('the table cell of every monster matches its sheet: a 4 x 4 grid of square cells', () => {
    for (const z of HUNTING_ZONES) {
      const [w, h] = pngSize(huntingEnemySpriteUrl(z.enemyId));
      expect(w, z.enemyId).toBe(h);
      expect(huntingEnemyArt(z.enemyId).cell * 4, z.enemyId).toBe(w);
    }
    expect(pngSize('/assets/spritesheets/knight.png')[0]).toBe(HERO_ART.cell * 4);
  });

  it('every hunting monster has its sheet on disk and an art row that lies inside its frame', () => {
    for (const z of HUNTING_ZONES) {
      expect(onDisk(huntingEnemySpriteUrl(z.enemyId)), z.enemyId).toBe(true);
      for (const art of [huntingEnemyArt(z.enemyId), HERO_ART]) {
        const [x0, y0, x1, y1] = art.box;
        expect(x0).toBeGreaterThanOrEqual(0);
        expect(y0).toBeGreaterThanOrEqual(0);
        expect(x1).toBeLessThan(art.cell);
        expect(y1).toBeLessThan(art.cell);
        expect(x1).toBeGreaterThan(x0);
        expect(y1).toBeGreaterThan(y0);
        if (art.lie !== undefined) expect(art.lie).toBeLessThan(art.cell);
        const g = artGeometry(art);
        expect(g.foot).toBeGreaterThan(g.cy);
        expect(g.foot).toBeLessThanOrEqual(1);
      }
    }
  });
});
