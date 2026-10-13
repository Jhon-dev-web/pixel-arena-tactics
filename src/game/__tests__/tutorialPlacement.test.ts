import { describe, expect, it } from 'vitest';
import { placeTutorialCard, SPOTLIGHT_PAD, PlacementRect } from '../../components/tutorialPlacement';

const card = { width: 320, height: 190 };
const overlaps = (a: PlacementRect, b: PlacementRect) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
const box = (left: number, top: number, width: number, height: number): PlacementRect => ({ left, top, right: left + width, bottom: top + height });
const spot = (r: PlacementRect): PlacementRect => ({ left: r.left - SPOTLIGHT_PAD, top: r.top - SPOTLIGHT_PAD, right: r.right + SPOTLIGHT_PAD, bottom: r.bottom + SPOTLIGHT_PAD });

describe('tutorial card placement', () => {
  const viewports = [
    { width: 1920, height: 1080 },
    { width: 1280, height: 800 },
    { width: 1024, height: 768 },
    { width: 390, height: 800 },
  ];

  it('never covers the spotlight, for targets all over the screen at every size', () => {
    for (const viewport of viewports) {
      for (const w of [60, 180, 300]) {
        for (const h of [28, 44, 120]) {
          for (let fx = 0; fx <= 1; fx += 0.25) {
            for (let fy = 0; fy <= 1; fy += 0.25) {
              const rect = box((viewport.width - w) * fx, (viewport.height - h) * fy, w, h);
              const placed = placeTutorialCard(rect, viewport, card);
              const cardBox = box(placed.left, placed.top, Math.min(card.width, viewport.width - 24), card.height);
              expect(overlaps(cardBox, spot(rect)), `${JSON.stringify({ viewport, rect, placed })}`).toBe(false);
              expect(placed.left).toBeGreaterThanOrEqual(12);
              expect(placed.top).toBeGreaterThanOrEqual(12);
            }
          }
        }
      }
    }
  });

  it('the Iniciar Caca button in the middle of a desktop modal keeps the card off it', () => {
    const viewport = { width: 1280, height: 800 };
    const button = box(640 - 110, 560, 220, 44);
    const placed = placeTutorialCard(button, viewport, card);
    expect(overlaps(box(placed.left, placed.top, card.width, card.height), spot(button))).toBe(false);
  });

  it('takes the side with the most room', () => {
    const phone = { width: 390, height: 800 };
    expect(placeTutorialCard(box(20, 20, 200, 40), phone, card).side).toBe('below');
    expect(placeTutorialCard(box(20, 720, 200, 40), phone, card).side).toBe('above');
    const desktop = { width: 1280, height: 800 };
    expect(placeTutorialCard(box(20, 120, 200, 40), desktop, card).side).toBe('right');
    expect(placeTutorialCard(box(1060, 120, 200, 40), desktop, card).side).toBe('left');
  });

  it('centres the card when there is no target and keeps it on screen when no side fits', () => {
    const viewport = { width: 390, height: 800 };
    const none = placeTutorialCard(null, viewport, card);
    expect(none.side).toBe('center');
    expect(none.left + 320).toBeLessThanOrEqual(viewport.width);
    const huge = placeTutorialCard(box(0, 0, 390, 800), viewport, card);
    expect(huge.top).toBeGreaterThanOrEqual(12);
    expect(huge.top + card.height).toBeLessThanOrEqual(viewport.height);
  });
});
