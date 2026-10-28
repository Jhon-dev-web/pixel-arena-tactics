import { t } from '../locales';
import { affinityView } from '../game/affinity';
import { equippedSetItems } from '../game/gearInstances';
import type { SaveData } from '../game/engine';
import type { SetEffect } from '../game/setBonuses';
import { setEffectText } from './setText';

// The class affinity on the Character screen (game/affinity.ts). It is a REFLECTION of what is worn, never a trait of the hero, and the text says so: it names the leading armor weight and how far it is from the next
// step, and only says "matches the Archer style" while five pieces and the matching weapon are on. Same lines as the set bonus beside it (the .set-line look, tokens.css), so it reads as part of the same panel.
const effectsText = (effects: SetEffect[]): string => effects.map((e) => setEffectText(e)).join(' · ');

export function AffinitySeal({ save }: { save: SaveData }) {
  const view = affinityView(equippedSetItems(save));
  if (!view) return null;
  const w = t(`affinity.weight.${view.weight}`);
  const next = view.next;
  return (
    <div className="set-lines" aria-label={t('affinity.title')}>
      <div className={`set-line${view.step > 0 ? ' active' : ' near'}`} data-affinity={view.weight} data-step={view.step}>
        <span className="set-line-head">
          <span className="set-line-title">{t('affinity.title')}</span> {t('affinity.head', { w, n: Math.min(view.pieces, 5) })}
        </span>
        {view.step > 0 && <span className="set-line-now">{effectsText(view.now)}</span>}
        {view.classActive && <span className="set-line-head">{t('affinity.classOn', { style: t(`affinity.style.${view.cls}`) })}</span>}
        {next && (
          <span className="set-line-next">
            {next.kind === 'weapon'
              ? t('affinity.nextWeapon', { w, weapons: t(`affinity.weapons.${view.weight}`), effect: setEffectText(next.effect) })
              : t(next.missing === 1 ? 'affinity.nextOne' : 'affinity.next', { missing: next.missing, step: next.kind === 'three' ? 3 : 5, effect: setEffectText(next.effect) })}
          </span>
        )}
        <span className="set-line-next">{t('affinity.reflection')}</span>
      </div>
    </div>
  );
}
