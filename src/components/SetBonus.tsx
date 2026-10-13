import { t } from '../locales';
import { GearItem, setFamiliesOf } from '../game/gear';
import { equippedSetItems } from '../game/gearInstances';
import type { SaveData } from '../game/engine';
import { SET_DEFS, SetFamilyView, setCounts, setFamilyView, wornSetViews } from '../game/setBonuses';
import { setEffectText, setFamilyName } from './setText';

// Set bonuses on screen (game/setBonuses.ts): the "Conjunto" lines of the equipment panel, and the note under an item / a forge recipe that says which set the
// piece belongs to and what its bonuses are (the words are in setText.ts).

// "Aço 3/5": the family and how many of the highest threshold's pieces are worn.
const progressLabel = (v: SetFamilyView): string => `${setFamilyName(v.family)} ${Math.min(v.count, v.max)}/${v.max}`;

// A family is listed when a bonus is active or the next one is one piece away (two for a three-piece step): the quiet middle ground between hiding the sets and
// listing every family the hero owns one piece of.
function worthListing(v: SetFamilyView): boolean {
  if (v.steps.some((s) => s.active)) return true;
  const first = v.steps[0].pieces;
  return v.count >= first - 1;
}

export function SetLines({ save }: { save: SaveData }) {
  const views = wornSetViews(equippedSetItems(save)).filter(worthListing);
  if (views.length === 0) return null;
  return (
    <div className="set-lines" aria-label={t('set.title')}>
      {views.map((v) => {
        const active = v.steps.filter((s) => s.active);
        const next = v.steps.find((s) => !s.active);
        return (
          <div className={`set-line${active.length > 0 ? ' active' : ' near'}`} key={v.family} data-set={v.family}>
            <span className="set-line-head">
              <span className="set-line-title">{t('set.title')}</span> {progressLabel(v)}
            </span>
            {active.length > 0 && <span className="set-line-now">{active.map((s) => setEffectText(s.effect)).join(' · ')}</span>}
            {next && (
              <span className="set-line-next">
                {t('set.nextStep', { n: next.pieces })}: {setEffectText(next.effect)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Under an item (detail panel, forge recipe): the set the piece belongs to and the bonuses, every step with its piece count. When the hero's worn pieces are known the
// steps he already has are lit.
export function SetNote({ item, save }: { item: GearItem; save?: SaveData }) {
  const families = setFamiliesOf(item);
  if (families.length === 0) return null;
  const counts = save ? setCounts(equippedSetItems(save)) : null;
  return (
    <div className="set-note">
      {families.map((family) => {
        const view = setFamilyView(family, counts ? counts[family] : 0);
        return (
          <div className="set-note-family" key={family} data-set={family}>
            <span className="set-note-title">
              {t('set.title')} {setFamilyName(family)}
              {counts ? ` (${Math.min(counts[family], view.max)}/${view.max})` : ''}
              {family === 'gilded' && item.setFamily === 'dragon' ? ` · ${t('set.dragonCounts')}` : ''}
            </span>
            {SET_DEFS[family].thresholds.map((pieces, i) => (
              <span className={`set-note-step${counts && counts[family] >= pieces ? ' on' : ''}`} key={pieces}>
                {t('set.nextStep', { n: pieces })}: {setEffectText(SET_DEFS[family].effects[i])}
              </span>
            ))}
          </div>
        );
      })}
    </div>
  );
}
