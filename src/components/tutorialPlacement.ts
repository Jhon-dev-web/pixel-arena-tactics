export interface PlacementRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export type CardSide = 'below' | 'above' | 'right' | 'left' | 'center';

export interface CardPlacement {
  left: number;
  top: number;
  side: CardSide;
}

// The spotlight is drawn 5 px outside the target; keep the card clear of that ring plus a small gap.
export const SPOTLIGHT_PAD = 5;
const GAP = 12;
const EDGE = 12;
// When two sides have similar room, prefer the more natural reading order (below, right, above, left).
const ORDER: CardSide[] = ['below', 'right', 'above', 'left'];

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/**
 * Where the tutorial card goes so it never sits on the element it points at. It looks at the room on each
 * side of the spotlight, keeps the sides where the whole card fits, and takes the one with the most free
 * space (ties go by ORDER). When no side fits (a huge target on a small screen), it still takes the roomiest
 * side and clamps to the viewport. Without a target the card is centred a bit above the middle.
 */
export function placeTutorialCard(
  rect: PlacementRect | null,
  viewport: { width: number; height: number },
  card: { width: number; height: number },
): CardPlacement {
  const maxLeft = Math.max(EDGE, viewport.width - card.width - EDGE);
  const maxTop = Math.max(EDGE, viewport.height - card.height - EDGE);
  if (!rect) {
    return { left: clamp((viewport.width - card.width) / 2, EDGE, maxLeft), top: clamp(viewport.height * 0.28, EDGE, maxTop), side: 'center' };
  }
  const ring = SPOTLIGHT_PAD + GAP;
  const free: Record<Exclude<CardSide, 'center'>, number> = {
    below: viewport.height - rect.bottom - EDGE,
    above: rect.top - EDGE,
    right: viewport.width - rect.right - EDGE,
    left: rect.left - EDGE,
  };
  type Side = keyof typeof free;
  const need = (side: Side) => (side === 'below' || side === 'above' ? card.height : card.width) + ring;
  const slack = (side: Side) => free[side] - need(side);
  const sides = ORDER as Side[];
  const fitting = sides.filter((side) => slack(side) >= 0);
  const pool = fitting.length > 0 ? fitting : sides;
  const score = fitting.length > 0 ? slack : (side: Side) => free[side];
  let best: Side = pool[0];
  for (const side of pool) if (score(side) > score(best)) best = side;

  const centreX = rect.left + (rect.right - rect.left) / 2 - card.width / 2;
  const centreY = rect.top + (rect.bottom - rect.top) / 2 - card.height / 2;
  switch (best) {
    case 'below':
      return { side: 'below', left: clamp(centreX, EDGE, maxLeft), top: clamp(rect.bottom + ring, EDGE, maxTop) };
    case 'above':
      return { side: 'above', left: clamp(centreX, EDGE, maxLeft), top: clamp(rect.top - ring - card.height, EDGE, maxTop) };
    case 'right':
      return { side: 'right', left: clamp(rect.right + ring, EDGE, maxLeft), top: clamp(centreY, EDGE, maxTop) };
    default:
      return { side: 'left', left: clamp(rect.left - ring - card.width, EDGE, maxLeft), top: clamp(centreY, EDGE, maxTop) };
  }
}
