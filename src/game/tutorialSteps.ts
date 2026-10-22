import { InitialTutorialStep, SaveData } from './engine';
import { attributePointsAvailable } from './nextStep';

// The guided first session, in order. Each "do" step waits for the player to DO the thing; reading is the exception (intro and final):
//   points    - open Personagem and spend every attribute point (Distribuir sugerido or the "+" buttons)
//   dungeon   - the first descent (it ends at floor 5, where the hero is told to retreat with the loot)
//   hunt      - open the Hunt screen
//   huntModal - START a hunt (the step ends only when the hunt is really running)
//   final     - one closing line
// The Dungeon comes before the Hunt on purpose: the two activities exclude each other (a running hunt blocks the Dungeon), and the Hunt is the thing left running.
export const TUTORIAL_ORDER: readonly InitialTutorialStep[] = ['intro', 'points', 'dungeon', 'hunt', 'huntModal', 'final'];

export function nextTutorialStep(step: InitialTutorialStep): InitialTutorialStep | null {
  const i = TUTORIAL_ORDER.indexOf(step);
  return i >= 0 && i + 1 < TUTORIAL_ORDER.length ? TUTORIAL_ORDER[i + 1] : null;
}

// The save already shows that a "do" step was done (so a reload, or a player who did it ahead of the balloon, never gets stuck on it). intro and final are read, never "done".
export function tutorialStepDone(step: InitialTutorialStep, save: SaveData): boolean {
  switch (step) {
    case 'points':
      return attributePointsAvailable(save) === 0;
    case 'dungeon':
      return save.highestDungeonFloor > 1 || save.stats.dungeonRuns > 0;
    case 'hunt':
    case 'huntModal':
      return !!save.activeHuntingZone;
    default:
      return false;
  }
}

// The floor where the guided first descent stops and asks the hero to retreat with the loot.
export const GUIDED_DESCENT_FLOOR = 5;

// "Start the hunt" waits on the Hunt screen. When that screen is not open (the player closed it, or reloaded in the middle of the step) and no hunt runs, the card goes back one
// step, to the one that points at the Caça entry; otherwise the card would talk about a button that is not on screen.
export function stepWhenHuntScreenClosed(step: InitialTutorialStep, huntScreenOpen: boolean, save: Pick<SaveData, 'activeHuntingZone'>): InitialTutorialStep {
  return step === 'huntModal' && !huntScreenOpen && !save.activeHuntingZone ? 'hunt' : step;
}
