import { t } from '../locales';
import { getGear } from '../game/gear';
import { NextStep } from '../game/nextStep';

// The one line of a nextStep suggestion (Home and the Dungeon defeat screen show the same words).
export function nextStepLine(step: NextStep): string {
  return t(`nextStep.${step.id}`, {
    n: step.params.n ?? 0,
    floor: step.params.floor ?? 0,
    piece: step.params.piece ? t(`gear.${getGear(step.params.piece)?.nameKey ?? ''}`) : '',
    zone: step.params.zone ? t(`dungeon.${step.params.zone}`) : '',
  });
}
