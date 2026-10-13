import T from './tunables';

// What the late-game sinks tell the player, as lines of text whose every number is read from the same tunables the engine reads (the refinement past +8 in gear.ts,
// Lapidar in lapidar.ts), so the screen cannot promise anything the code does not do. lateSinks.test.ts checks each number against the real behaviour, in both languages.
// (The costs themselves are not in these lines: the screens list them from upgradeCost / getLapidarCost, per piece.)
export interface LateSinkText {
  key: string;
  params: Record<string, number>;
}

const pct = (x: number): number => Math.round(x * 100);

// Shown under a piece in the Forge's upgrade tab once it stands at +8 or more.
export function deepRefineText(): LateSinkText {
  const L = T.lateSinks;
  return {
    key: 'forge.deepNote',
    params: {
      tier: L.deepMinTier,
      b: pct(L.deepBonus),
      c9: pct(L.deepChance9),
      c10: pct(L.deepChance10),
      c11: pct(L.deepChance11),
      c12: pct(L.deepChance12),
      d10: pct(L.deepDrop10),
      d11: pct(L.deepDrop11),
      d12: pct(L.deepDrop12),
    },
  };
}

// Shown in the Lapidar panel of a piece.
export function lapidarText(): LateSinkText {
  const L = T.lateSinks;
  return { key: 'inventory.lapidarExplanation', params: { tier: L.lapidarMinTier, lvl: L.minLevel, g: pct(L.lapidarGrowth), max: L.lapidarMaxGrowth } };
}

// "Sorry, not yet" lines of the panel (the level that opens it and the lowest tier).
export const lateSinksOpenLevel = (): number => T.lateSinks.minLevel;
