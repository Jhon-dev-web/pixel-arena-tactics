import { SaveData } from '../game/engine';
import { HuntingDepth } from '../game/huntingZones';
import HuntRunning from './HuntRunning';
import HuntSelection from './HuntSelection';

// The Hunt screen has two states: picking where to hunt (nothing running) and the hunt in progress. Closing the view never stops a running hunt.
export default function HuntModal({
  save,
  onStartHunt,
  onStopHunt,
  onClose,
}: {
  save: SaveData;
  onStartHunt: (zoneId: string, depth: HuntingDepth) => void;
  onStopHunt: () => void;
  onClose: () => void;
}) {
  return save.activeHuntingZone ? (
    <HuntRunning save={save} onStopHunt={onStopHunt} onClose={onClose} />
  ) : (
    <HuntSelection save={save} onStartHunt={onStartHunt} onClose={onClose} />
  );
}
