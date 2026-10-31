import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultSave, SaveData } from '../engine';
import {
  acceptSwitch,
  askSwitch,
  busyBlocker,
  HeroActivity,
  keepActivity,
  NO_SWITCH,
  rewardClaimed,
  rewardSetAside,
  TaskRequest,
  waitForReward,
} from '../activity';
import { applyClaimGathering, applyStartGathering } from '../gathering';
import { applyHuntClaim, applyHuntStart, applyHuntStop, requestHuntStart } from '../huntLifecycle';
import { cancelCraftJob, resolveCraftJob, startCraftJob } from '../craftJob';
import { HUNTING_ZONES } from '../huntingZones';
import { WOOD_TIERS } from '../woodcutting';
import { emptyMaterials } from '../materials';
import { skillXpToReachLevel } from '../skills';

// The hero does one task at a time, and EVERY way of asking for another one ends in the same question ("Trocar de atividade?"). These guard the rule that must never turn back into a silent refusal:
// a screen that disables a start button (or shows a toast) because the hero is busy, and a question that stops the old task but starts the wrong new one.

const T0 = new Date(2026, 9, 10, 9, 0, 0).getTime();
const NOW = T0 + 1500;
const ZONE = HUNTING_ZONES[0].id;
const WOOD = WOOD_TIERS[0].id;

const rich = (): SaveData => ({
  ...defaultSave(),
  gold: 100_000,
  materials: { ...emptyMaterials(), copper: 500 },
  lastMiningClaim: T0,
  lastWoodcuttingClaim: T0,
  huntingOfflineStart: T0,
  skillXp: { mining: skillXpToReachLevel(5, 'mining'), woodcutting: skillXpToReachLevel(5, 'woodcutting'), gardening: 0 },
});

// A hero busy with each activity, made by the game's own start transitions.
const BUSY: Record<HeroActivity, () => SaveData> = {
  hunt: () => applyHuntStart(rich(), ZONE, 'shallow', T0)!,
  mining: () => applyStartGathering(rich(), 'mining', 'copper', T0)!.save,
  woodcutting: () => applyStartGathering(rich(), 'woodcutting', WOOD, T0)!.save,
  craft: () => startCraftJob(rich(), 'refine', 'smelt_copper', 3, T0).save!,
};

// What each activity does when the player says "parar": its own stop / claim, exactly as App.tsx calls them.
const STOP: Record<HeroActivity, (s: SaveData) => SaveData> = {
  hunt: (s) => {
    const stopped = applyHuntStop(s, NOW)!;
    return applyHuntClaim(stopped, stopped.pendingHuntReward!.id)!;
  },
  mining: (s) => applyClaimGathering(s, 'mining', NOW)!.save,
  woodcutting: (s) => applyClaimGathering(s, 'woodcutting', NOW)!.save,
  craft: (s) => cancelCraftJob(resolveCraftJob(s, NOW)).save,
};

// The tasks the player can ask for, each with the pure transition that starts it and what "the same choice" means in the save afterwards.
const TASKS: { name: string; task: TaskRequest; start: (s: SaveData) => SaveData | null; started: (s: SaveData) => boolean }[] = [
  { name: 'mining', task: { kind: 'mining', oreId: 'copper' }, start: (s) => applyStartGathering(s, 'mining', 'copper', NOW)?.save ?? null, started: (s) => s.activeOreId === 'copper' },
  { name: 'woodcutting', task: { kind: 'woodcutting', woodId: WOOD }, start: (s) => applyStartGathering(s, 'woodcutting', WOOD, NOW)?.save ?? null, started: (s) => s.activeWoodId === WOOD },
  { name: 'hunt', task: { kind: 'hunt', zoneId: ZONE, depth: 'shallow' }, start: (s) => requestHuntStart(s, ZONE, 'shallow', NOW), started: (s) => s.activeHuntingZone === ZONE && s.activeHuntingDepth === 'shallow' },
  { name: 'craft', task: { kind: 'craft', craft: 'refine', recipeId: 'smelt_copper', qty: 2 }, start: (s) => startCraftJob(s, 'refine', 'smelt_copper', 2, NOW).save ?? null, started: (s) => s.craftJob?.recipeId === 'smelt_copper' && s.craftJob.qty === 2 },
  // a Dungeon run only exists on screen: there is no save transition, the question is all there is to guard
  { name: 'dungeon', task: { kind: 'dungeon', depths: false }, start: (s) => s, started: () => true },
];

const ACTIVITIES = Object.keys(BUSY) as HeroActivity[];
const sameKind = (activity: HeroActivity, task: TaskRequest): boolean => (activity === 'craft' ? task.kind === 'craft' : activity === task.kind);

describe('every start asks when the hero is busy in something else', () => {
  it('no task (Mining, Woodcutting, Hunt, Dungeon, production) is refused for occupation without the question, from any activity', () => {
    for (const activity of ACTIVITIES) {
      const save = BUSY[activity]();
      for (const { name, task } of TASKS) {
        // Another activity in the way: the question names it. The only things that never ask are the hero's OWN activity (Mining switches ore, the Hunt ends its session for another zone).
        const own = activity !== 'craft' && sameKind(activity, task);
        expect(busyBlocker(save, task), `${activity} -> ${name}`).toBe(own ? null : activity);
      }
    }
  });

  it('an idle hero is never asked anything, and the game starts every task on him', () => {
    for (const { name, task, start, started } of TASKS) {
      expect(busyBlocker(rich(), task), name).toBeNull();
      expect(started(start(rich())!), name).toBe(true);
    }
  });

  it('the engine itself still refuses to start a task over a busy hero: only the question makes room', () => {
    // If a start ever began to succeed over a running task without the question, two activities would run at once.
    for (const activity of ACTIVITIES) {
      for (const { name, task, start } of TASKS) {
        if (busyBlocker(BUSY[activity](), task) === null || task.kind === 'dungeon') continue;
        expect(start(BUSY[activity]()), `${activity} -> ${name}`).toBeNull();
      }
    }
  });

  it('a Dungeon run and a production batch are blocked by ANY activity (they have no running twin to switch inside)', () => {
    for (const activity of ACTIVITIES) {
      expect(busyBlocker(BUSY[activity](), { kind: 'dungeon', depths: true }), `dungeon over ${activity}`).toBe(activity);
      expect(busyBlocker(BUSY[activity](), { kind: 'craft', craft: 'forge', recipeId: 'x', qty: 1 }), `craft over ${activity}`).toBe(activity);
    }
  });
});

describe('stopping and then starting the task that was asked for', () => {
  it('every pair that asks ends with the hero free and the new task running with the same choice (nothing refused, nothing paid twice)', () => {
    for (const activity of ACTIVITIES) {
      for (const { name, task, start, started } of TASKS) {
        const busy = BUSY[activity]();
        if (busyBlocker(busy, task) === null) continue;
        const goldBefore = busy.gold;
        const stopped = STOP[activity](busy);
        expect(busyBlocker(stopped, task), `${activity} -> ${name}: still busy after stopping`).toBeNull();
        const next = start(stopped);
        expect(next, `${activity} -> ${name}: refused after stopping`).not.toBeNull();
        expect(started(next!), `${activity} -> ${name}: not the same choice`).toBe(true);
        // the production batch's own money: stopping it gives back what it had not made, so starting a new batch never costs more than that batch's price
        if (activity === 'craft' && name === 'craft') expect(stopped.gold).toBeGreaterThan(goldBefore);
      }
    }
  });
});

describe('the question and what waits behind it', () => {
  const mining: TaskRequest = { kind: 'mining', oreId: 'copper' };

  it('"Parar e começar" hands back the task that was asked for, untouched: at once, or after the reward when a hunt was ended', () => {
    const fromWood = acceptSwitch(askSwitch('woodcutting', mining));
    expect(fromWood).toEqual({ stop: 'woodcutting', task: mining, startsWhen: 'now' });
    const fromCraft = acceptSwitch(askSwitch('craft', { kind: 'craft', craft: 'forge', recipeId: 'iron_sword', qty: 4, seal: true }));
    expect(fromCraft?.task).toEqual({ kind: 'craft', craft: 'forge', recipeId: 'iron_sword', qty: 4, seal: true });
    expect(acceptSwitch(askSwitch('hunt', mining))).toEqual({ stop: 'hunt', task: mining, startsWhen: 'afterReward' });
    expect(acceptSwitch(NO_SWITCH)).toBeNull();
  });

  it('"Manter" forgets the task: nothing is left that could start later', () => {
    const asked = askSwitch('mining', { kind: 'woodcutting', woodId: WOOD });
    expect(keepActivity()).toEqual(NO_SWITCH);
    expect(acceptSwitch(keepActivity())).toBeNull();
    expect(asked.asking).not.toBeNull();
  });

  it('after a hunt, the task starts when THAT reward is claimed, once', () => {
    const waiting = waitForReward(mining, 'reward-1');
    const claimed = rewardClaimed(waiting, 'reward-1');
    expect(claimed.start).toEqual(mining);
    expect(claimed.next).toEqual(NO_SWITCH);
    // a second claim finds nothing waiting
    expect(rewardClaimed(claimed.next, 'reward-1').start).toBeNull();
  });

  it('leaving the reward without claiming forgets the task; a different reward never starts it', () => {
    const waiting = waitForReward(mining, 'reward-1');
    expect(rewardClaimed(rewardSetAside(), 'reward-1').start).toBeNull();
    expect(rewardClaimed(waiting, 'reward-2').start).toBeNull();
    // claiming a reward when nothing waits starts nothing
    expect(rewardClaimed(NO_SWITCH, 'reward-1').start).toBeNull();
  });
});

describe('the screens never turn the question back into a silent refusal', () => {
  const root = path.resolve(__dirname, '../../..');
  const read = (p: string): string => readFileSync(path.resolve(root, p), 'utf8');
  const stripComments = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const app = stripComments(read('src/App.tsx'));
  // the body of `const name = (...) => {` up to the next function declared at the same indentation
  const body = (name: string): string => {
    const start = app.indexOf(`  const ${name} = `);
    expect(start, `${name} exists`).toBeGreaterThanOrEqual(0);
    const next = app.indexOf('\n  const ', start + 10);
    return app.slice(start, next < 0 ? undefined : next);
  };

  it('Mining, Woodcutting, Hunt, Dungeon and production all go through askBeforeSwitch', () => {
    for (const fn of ['startMining', 'startWoodcutting', 'startHunt', 'startSession', 'startBatch']) {
      expect(body(fn), fn).toContain('askBeforeSwitch(');
    }
  });

  it('no start path refuses for occupation with a toast or its own notice any more', () => {
    for (const old of ['hunting.busyOther', 'mining.busyDungeon', 'mining.busyOther', 'woodcutting.busyOther', 'setBusyNotice']) expect(app, old).not.toContain(old);
    for (const fn of ['startMining', 'startWoodcutting', 'startHunt', 'startSession']) expect(body(fn), fn).not.toMatch(/s\.(craftJob|activeOreId|activeWoodId|activeHuntingZone)\)\s*\{\s*(showToast|setBusy)/);
  });

  it('the start buttons are not disabled just because the hero is busy', () => {
    for (const file of ['src/components/GatheringModal.tsx', 'src/components/DungeonMapModal.tsx']) {
      const src = stripComments(read(file));
      const disabled = [...src.matchAll(/disabled=\{([^}]*)\}/g)].map((m) => m[1]);
      for (const expr of disabled) expect(expr, `${file}: disabled={${expr}}`).not.toMatch(/busy|hunting|blocked|activeOreId|activeWoodId|craftJob/i);
    }
  });
});
