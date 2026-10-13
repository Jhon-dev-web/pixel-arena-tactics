import { t } from '../locales';
import { getGear } from '../game/gear';
import { rarityDef, substatNameKey } from '../game/rarity';
import { fmtSubstat } from './substatText';
import { UniqueDrop } from '../game/uniques';
import GearIcon from './GearIcon';
import UniqueTag from './UniqueTag';

// The "unique pieces" block shared by the Hunting preview / reward screens and the Dungeon loot / result screens. Uniques are whole gear pieces
// (not materials), so they sit apart from the loot chips: icon, name + Único tag, rarity and the rolled substats.
export default function UniqueDrops({ drops, held = false }: { drops: UniqueDrop[]; held?: boolean }) {
  if (drops.length === 0) return null;
  return (
    <div className="unique-drops">
      <span className="drops-label">{t('ui.uniqueDrops')}</span>
      {drops.map((d, i) => {
        const item = getGear(d.templateId);
        if (!item) return null;
        return (
          <div className={`unique-drop r-${d.rarity} reveal rv-unique`} key={`${d.templateId}-${i}`}>
            <span className="unique-drop-icon">
              <GearIcon item={item} />
            </span>
            <div className="unique-drop-info">
              <span className="unique-drop-name">
                {t(`gear.${item.nameKey}`)}
                <UniqueTag templateId={item.id} />
              </span>
              {d.rarity !== 'common' && (
                <span className={`rarity-line r-${d.rarity}`}>{t(`rarity.${rarityDef(d.rarity).nameKey}`)}</span>
              )}
              {d.substats.map((s, j) => (
                <span className="substat-line" key={j}>
                  +{fmtSubstat(s)} {t(`rarity.${substatNameKey(s.type)}`)}
                </span>
              ))}
            </div>
          </div>
        );
      })}
      {held && <p className="unique-held-note">{t('hunting.uniquesHeld')}</p>}
    </div>
  );
}
