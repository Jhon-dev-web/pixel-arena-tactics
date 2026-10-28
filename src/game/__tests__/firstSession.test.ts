import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import pt from '../../locales/pt.json';
import en from '../../locales/en.json';
import { defaultSave, normalizeSave, playerLevel, SaveData, xpForNextLevel } from '../engine';
import { attributePointsAvailable, nextStep } from '../nextStep';
import { suggestedSpend } from '../attributes';
import { GUIDED_DESCENT_FLOOR, nextTutorialStep, TUTORIAL_ORDER, tutorialStepDone } from '../tutorialSteps';
import { defeatGoldKept } from '../waves';
import T from '../tunables';
import { ATTRIBUTE_POINTS_PER_LEVEL, extendLevelUp, levelUpSummary } from '../levelUp';
import { depthGearRequired, HUNTING_ZONES } from '../huntingZones';
import { zoneDifficulty } from '../huntView';

// The XP at which a hero reaches `level`.
const xpAtLevel = (level: number): number => {
  let xp = 0;
  for (let l = 1; l < level; l++) xp += xpForNextLevel(l);
  return xp;
};

const spendAll = (s: SaveData): SaveData => {
  const add = suggestedSpend(s);
  return { ...s, str: s.str + add.str, vit: s.vit + add.vit, agi: s.agi + add.agi, res: s.res + add.res };
};

describe('guided tutorial: a step ends when the save shows it was done', () => {
  it('runs intro -> points -> dungeon -> hunt -> huntModal -> final, in that order', () => {
    expect(TUTORIAL_ORDER).toEqual(['intro', 'points', 'dungeon', 'hunt', 'huntModal', 'final']);
    expect(nextTutorialStep('intro')).toBe('points');
    expect(nextTutorialStep('huntModal')).toBe('final');
    expect(nextTutorialStep('final')).toBeNull();
  });

  it('points: done only when every attribute point is spent', () => {
    const s = defaultSave();
    expect(attributePointsAvailable(s)).toBe(3);
    expect(tutorialStepDone('points', s)).toBe(false);
    expect(tutorialStepDone('points', { ...s, str: 1 })).toBe(false);
    expect(tutorialStepDone('points', spendAll(s))).toBe(true);
  });

  it('dungeon: done once a descent has been finished', () => {
    const s = defaultSave();
    expect(tutorialStepDone('dungeon', s)).toBe(false);
    expect(tutorialStepDone('dungeon', { ...s, highestDungeonFloor: 5 })).toBe(true);
    expect(tutorialStepDone('dungeon', { ...s, stats: { ...s.stats, dungeonRuns: 1 } })).toBe(true);
  });

  it('hunt steps: done only when a hunt is really running', () => {
    const s = defaultSave();
    expect(tutorialStepDone('hunt', s)).toBe(false);
    expect(tutorialStepDone('huntModal', s)).toBe(false);
    const running = { ...s, activeHuntingZone: HUNTING_ZONES[0].id };
    expect(tutorialStepDone('huntModal', running)).toBe(true);
    expect(tutorialStepDone('hunt', running)).toBe(true);
  });

  it('the read-only steps are never "done" by the save', () => {
    const s = spendAll({ ...defaultSave(), highestDungeonFloor: 9, activeHuntingZone: HUNTING_ZONES[0].id });
    expect(tutorialStepDone('intro', s)).toBe(false);
    expect(tutorialStepDone('final', s)).toBe(false);
  });

  it('the guided descent stops at floor 5, before the first checkpoint', () => {
    expect(GUIDED_DESCENT_FLOOR).toBe(5);
    expect(GUIDED_DESCENT_FLOOR).toBeLessThan(T.battle.miniBossEvery);
  });

  it('a save from the first tutorial keeps its place after a reload: character -> points, forge -> final, unknown -> a safe step', () => {
    const load = (initialStep: string) =>
      normalizeSave({ ...defaultSave(), tutorial: { initial: 'in_progress', initialStep, seen: [], automatic: true } } as unknown as SaveData).tutorial;
    expect(load('character').initialStep).toBe('points');
    expect(load('forge').initialStep).toBe('final');
    expect(load('dungeon').initialStep).toBe('dungeon');
    expect(load('points').initialStep).toBe('points');
    expect(load('nonsense').initialStep).toBe('final');
  });
});

describe('suggested attribute spend', () => {
  it('spends every point, never more, and keeps a new hero balanced', () => {
    const s = defaultSave();
    const add = suggestedSpend(s);
    expect(add.str + add.vit + add.agi + add.res).toBe(attributePointsAvailable(s));
    expect(Math.max(...Object.values(add))).toBe(1);
  });

  it('is empty when nothing is left, and grows with the unspent points', () => {
    const spent = spendAll(defaultSave());
    expect(Object.values(suggestedSpend(spent)).every((n) => n === 0)).toBe(true);
    const big = { ...defaultSave(), xp: xpAtLevel(4) };
    expect(playerLevel(big.xp)).toBe(4);
    const add = suggestedSpend(big);
    expect(add.str + add.vit + add.agi + add.res).toBe(12);
    expect(attributePointsAvailable(spendAll(big))).toBe(0);
  });

  it('never pushes Agilidade past its cap', () => {
    const s = { ...defaultSave(), xp: xpAtLevel(10), agi: T.battle.agiMax };
    expect(suggestedSpend(s).agi).toBe(0);
  });
});

describe('a defeat before the first boss costs no gold', () => {
  it('keeps everything on any descent that starts before floor 25, and the usual share from floor 25 on', () => {
    expect(defeatGoldKept(1)).toBe(1);
    expect(defeatGoldKept(T.battle.bossEvery - 1)).toBe(1);
    expect(defeatGoldKept(T.battle.bossEvery)).toBe(T.battle.defeatGoldKept);
    expect(defeatGoldKept(60)).toBe(T.battle.defeatGoldKept);
    expect(defeatGoldKept(101)).toBe(T.battle.defeatGoldKept); // Profundezas
  });
});

describe('descent summary', () => {
  // Rodada 20: the hero earns XP only from Hunting, so a descent shows floors and gold and promises no XP or levels.
  it('the descent screen and the tutorial text promise no XP, and the descent code never touches the hero XP', () => {
    const modal = readFileSync('src/components/BattleModal.tsx', 'utf8');
    expect(modal).not.toMatch(/runXp|runLevels/);
    const finish = readFileSync('src/App.tsx', 'utf8');
    const body = finish.slice(finish.indexOf('const finishRun'), finish.indexOf('// `id` is a gear INSTANCE id.'));
    expect(body).not.toMatch(/\bxp:/);
    for (const tree of [pt, en]) {
      expect(tree.tutorial.dungeon.body).not.toMatch(/XP/);
      expect(tree.dungeon.guidedSubtitle).not.toMatch(/XP/);
    }
  });
});

describe('level-up summary', () => {
  it('three attribute points per level, a skill point on the level that grants one', () => {
    expect(levelUpSummary(3, 3)).toBeNull();
    const one = levelUpSummary(1, 2)!;
    expect(one).toMatchObject({ gained: 1, attributePoints: ATTRIBUTE_POINTS_PER_LEVEL, skillPoints: 0 });
    expect(levelUpSummary(4, 5)!.skillPoints).toBe(1);
  });

  it('a batch of levels gained while away is one summary, and a later batch extends it', () => {
    const batch = levelUpSummary(2, 5)!;
    expect(batch).toMatchObject({ from: 2, to: 5, gained: 3, attributePoints: 9 });
    expect(extendLevelUp(batch, 5, 7)).toMatchObject({ from: 2, to: 7, gained: 5, attributePoints: 15 });
    expect(extendLevelUp(null, 7, 8)).toMatchObject({ from: 7, to: 8, gained: 1 });
  });

  it('lists the forge recipes whose level gate was crossed', () => {
    expect(levelUpSummary(9, 10)!.recipes.length).toBeGreaterThan(0);
    expect(levelUpSummary(10, 11)!.recipes).toEqual([]);
  });
});

describe('hunt zone difficulty', () => {
  const zone = HUNTING_ZONES[0];
  const need = depthGearRequired(HUNTING_ZONES[1], 'shallow'); // the marsh: the first depth that asks equipment (the glade shallow asks none, a brand-new hero starts there)

  it('under the equipment index the depth asks for is "too strong", whatever the estimate says', () => {
    expect(zoneDifficulty(HUNTING_ZONES[1], 'shallow', need - 0.1, 'always')).toBe('tooStrong');
    expect(zoneDifficulty(HUNTING_ZONES[1], 'shallow', 0, null)).toBe('tooStrong');
    expect(zoneDifficulty(zone, 'shallow', 0, 'always')).toBe('ready'); // the glade shallow: a fresh hero (index 0) can start it
  });

  it('startable: the estimate decides between ready, risky and too strong', () => {
    expect(zoneDifficulty(zone, 'shallow', need, 'always')).toBe('ready');
    expect(zoneDifficulty(zone, 'shallow', need, null)).toBe('ready');
    expect(zoneDifficulty(zone, 'shallow', need, 'risky')).toBe('risky');
    expect(zoneDifficulty(zone, 'shallow', need, 'cannot')).toBe('tooStrong');
  });

  it('a zone is never "ready" for a hero who cannot start it (the equipment line and the chip agree)', () => {
    for (const z of HUNTING_ZONES) {
      for (const gear of [0, 1, 2.5, 4, 8]) {
        const required = depthGearRequired(z, 'shallow');
        if (gear < required) expect(zoneDifficulty(z, 'shallow', gear, 'always')).toBe('tooStrong');
        else expect(zoneDifficulty(z, 'shallow', gear, 'always')).toBe('ready');
      }
    }
  });
});

describe('unspent points are the next step', () => {
  it('unspent attribute points are suggested before anything else that is not a full bag', () => {
    const s = { ...defaultSave(), highestDungeonFloor: 0 };
    expect(nextStep(s)).toMatchObject({ id: 'attribute_points', target: 'hero' });
  });
});
