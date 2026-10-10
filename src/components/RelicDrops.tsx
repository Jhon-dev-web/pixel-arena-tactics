import { t } from '../locales';
import { getGear } from '../game/gear';
import GearIcon from './GearIcon';
import { gearStatLines } from './gearStats';

// The "relic" block of the Dungeon loot / result screens: boss relics are stackable pieces (not materials), shown like the unique drops above them - icon, name
// and the effect lines generated from the data.
export default function RelicDrops({ ids }: { ids: string[] }) {
  if (ids.length === 0) return null;
  return (
    <div className="unique-drops relic-drops">
      <span className="drops-label">{t('ui.relicDrops')}</span>
      {ids.map((id, i) => {
        const item = getGear(id);
        if (!item) return null;
        return (
          <div className="unique-drop r-epic" key={`${id}-${i}`}>
            <span className="unique-drop-icon">
              <GearIcon item={item} />
            </span>
            <div className="unique-drop-info">
              <span className="unique-drop-name">{t(`gear.${item.nameKey}`)}</span>
              {gearStatLines(item).map((l) => (
                <span className="substat-line" key={l.kind}>
                  {l.text}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
