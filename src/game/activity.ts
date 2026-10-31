import type { SaveData } from './engine';
import type { CraftJobKind } from './craftJobTypes';
import type { HuntingDepth } from './huntingZones';

// What the hero is busy with. ONE task at a time: a Hunt, Mining, Woodcutting, a Dungeon run or a Forge / Oficios production job. The Garden is not a task of the hero and always runs in
// parallel. The first three and the production job live in the save; the Dungeon run only exists on screen (App.tsx knows it), so it is not listed here.
export type HeroActivity = 'hunt' | 'mining' | 'woodcutting' | 'craft';

export function heroActivity(save: Pick<SaveData, 'activeHuntingZone' | 'activeOreId' | 'activeWoodId' | 'craftJob'>): HeroActivity | null {
  if (save.activeHuntingZone) return 'hunt';
  if (save.activeOreId) return 'mining';
  if (save.activeWoodId) return 'woodcutting';
  if (save.craftJob) return 'craft';
  return null;
}

// ---- asking for another task while the hero is busy ----------------------------------------------------------------------------------------------------------------------
// Every screen that starts a task (Mining, Woodcutting, Hunt, a Dungeon run, a Forge / Oficios batch) asks the SAME question when the hero is already in another one: "Trocar de atividade?".
// The rule above does not change (one task at a time); this only says what the player sees. The task he asked for travels with the question, so one tap stops the old one and starts the new one
// with the very choice he made (the ore, the zone and depth, the recipe and quantity).

export type TaskRequest =
  | { kind: 'mining'; oreId: string }
  | { kind: 'woodcutting'; woodId: string }
  | { kind: 'hunt'; zoneId: string; depth: HuntingDepth }
  | { kind: 'dungeon'; depths: boolean }
  | { kind: 'craft'; craft: CraftJobKind; recipeId: string; qty: number; seal?: boolean };

// The name of a task in the `busy.*` texts (a Dungeon run is not a HeroActivity: it is only ever the task being asked for).
export type TaskName = HeroActivity | 'dungeon';
export const taskName = (task: TaskRequest): TaskName => task.kind;

// What stands in the way of `task` right now (null = it can start). Asking for what the hero already does is not "another task": Mining switches ore inside Mining, Woodcutting wood, and the Hunt
// ends its own session to pick another zone (that one keeps its own reward screen), so those three skip their own activity. A Dungeon run and a production batch have no running twin: any task blocks them.
export function busyBlocker(save: Pick<SaveData, 'activeHuntingZone' | 'activeOreId' | 'activeWoodId' | 'craftJob'>, task: TaskRequest): HeroActivity | null {
  const own = task.kind === 'mining' || task.kind === 'woodcutting' || task.kind === 'hunt' ? task.kind : null;
  const busy = heroActivity({
    activeHuntingZone: own === 'hunt' ? null : save.activeHuntingZone,
    activeOreId: own === 'mining' ? null : save.activeOreId,
    activeWoodId: own === 'woodcutting' ? null : save.activeWoodId,
    craftJob: save.craftJob,
  });
  return busy;
}

// The question and what waits behind it, as one value the screen keeps:
//  - asking: the hero is in `activity` and the player asked for `task` (the dialog is open);
//  - afterReward: the hunt was ended for `task` and its reward screen is open; the task starts when THAT reward is claimed (`rewardId`) and is forgotten if the player leaves it.
export interface TaskSwitchState {
  asking: { activity: HeroActivity; task: TaskRequest } | null;
  afterReward: { task: TaskRequest; rewardId: string } | null;
}
export const NO_SWITCH: TaskSwitchState = { asking: null, afterReward: null };

export const askSwitch = (activity: HeroActivity, task: TaskRequest): TaskSwitchState => ({ asking: { activity, task }, afterReward: null });

// "Manter": the old task goes on and the one asked for is forgotten.
export const keepActivity = (): TaskSwitchState => NO_SWITCH;

// "Parar e começar": what stops, what starts, and when. Ending a hunt leaves a reward screen that has to be claimed, so the new task waits for it; every other task is over at once.
export function acceptSwitch(state: TaskSwitchState): { stop: HeroActivity; task: TaskRequest; startsWhen: 'now' | 'afterReward' } | null {
  const a = state.asking;
  if (!a) return null;
  return { stop: a.activity, task: a.task, startsWhen: a.activity === 'hunt' ? 'afterReward' : 'now' };
}

// The hunt was ended and left reward `rewardId`: the task waits for that claim.
export const waitForReward = (task: TaskRequest, rewardId: string): TaskSwitchState => ({ asking: null, afterReward: { task, rewardId } });

// The player claimed reward `claimedId`: the task that waited for it (null when none did, or when it waited for a different reward). Either way nothing waits any more.
export function rewardClaimed(state: TaskSwitchState, claimedId: string): { next: TaskSwitchState; start: TaskRequest | null } {
  const w = state.afterReward;
  return { next: NO_SWITCH, start: w && w.rewardId === claimedId ? w.task : null };
}

// The player set the reward aside without claiming it (to make room in the bag, say): the task he asked for is forgotten and nothing starts later by surprise.
export const rewardSetAside = (): TaskSwitchState => NO_SWITCH;
