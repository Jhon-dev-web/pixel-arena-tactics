import { useMemo } from 'react';
import { activeLocale, t } from '../locales';
import T from '../game/tunables';
import { SaveData, buildCombatStats, effectiveRotation, playerLevel } from '../game/engine';
import { AbilityEffect, AbilityId, abilityCdScale, abilityDef } from '../game/abilities';
import { resolveEquipped } from '../game/gearInstances';
import { Chip, PageHeader, Panel, Screen } from './ui';
import PixelIcon from './PixelIcon';
import { PassiveFrom, PassiveLine, tacticsPassives } from './tacticsPassives';

// "Taticas": how the hero fights, with NOTHING to choose. Three blocks, in the order the fight uses them:
//  1. the basic attack (the weapon worn, the damage of a hit and the real interval between hits, from buildCombatStats);
//  2. the abilities the worn gear grants (abilities.ts), every one of them used by itself as soon as it recharges: icon, name, where it comes from, the cooldown the hero really gets and what it does;
//  3. the passives (tacticsPassives.ts): what the gear and the skills do by themselves when something happens in the fight (a hit taken, a hit given, a tick of combat), each with when it works and its recharge,
//     or what is true instead of a recharge. Only what THIS hero has. Plain numbers (damage, life, resistance) stay on the Personagem screen.
// The rotation in force is derived from the gear (effectiveRotation): the gear grants no more abilities than there are slots, so all of them fit, and the player never orders them. Every number in the text comes from the
// definition (abilityDef, the tunables) or from the hero's real combat stats; the locale files hold none.

// One decimal, with the comma of the language: "1,0" in Portuguese, "1.0" in English.
const decimal = (n: number): string => (Math.round(n * 10) / 10).toFixed(1).replace('.', activeLocale === 'pt' ? ',' : '.');
const seconds = (ms: number): string => decimal(ms / 1000);
const pct = (share: number): number => Math.round(share * 100);
// A number of a passive line as it is printed: whole numbers as they are, the rest with one decimal and the comma of the language.
const printable = (params: Record<string, number>): Record<string, string> => Object.fromEntries(Object.entries(params).map(([k, v]) => [k, Number.isInteger(v) ? String(v) : decimal(v)]));

// One effect in words (locale tactics.effect.<kind>).
function effectText(e: AbilityEffect): string {
  switch (e.kind) {
    case 'strike':
      return t('tactics.effect.strike', { pct: pct(e.pct) });
    case 'volley':
      return t('tactics.effect.volley', { hits: e.hits, pct: pct(e.pct) });
    case 'dot':
      return t('tactics.effect.dot', { pct: pct(e.pctPerSec), tick: seconds(T.battle.effectTickMs), s: seconds(e.durationMs) });
    case 'carry':
      return t('tactics.effect.carry', { pct: pct(e.pct) });
    case 'guard':
      return t('tactics.effect.guard', { pct: pct(e.reduction), s: seconds(e.durationMs) });
    case 'heal':
      return t('tactics.effect.heal', { pct: pct(e.pct) });
    case 'haste':
      return t('tactics.effect.haste', { pct: pct(e.speedPct), s: seconds(e.durationMs) });
    case 'opener':
      return t('tactics.effect.opener', { s: seconds(e.delayMs) });
  }
}

// "Arma: Espada" / "Peitoral: Placa": where an ability comes from.
function origin(id: AbilityId): string {
  const s = abilityDef(id)!.source;
  return 'line' in s ? t('tactics.fromWeapon', { name: t(`tactics.line.${s.line}`) }) : t('tactics.fromBody', { name: t(`tactics.body.${s.weight}`) });
}

// "Escudo", "Relíquia", "Habilidade Espinhos": one contributor of a passive.
function fromText(f: PassiveFrom): string {
  switch (f.kind) {
    case 'slot':
      return t(`tactics.src.${f.slot}`);
    case 'skill':
      return t('tactics.src.skill', { name: t(`heroSkills.skills.${f.id}.name`) });
    default:
      return t(`tactics.src.${f.kind}`);
  }
}

export interface TaticasViewProps {
  save: SaveData;
}

function PassiveRow({ line }: { line: PassiveLine }) {
  const key = `tactics.passive.${line.id}`;
  const params = printable(line.params);
  return (
    <li className="tc-ps">
      <span className="tc-ps-head">
        <span className="tc-ps-name">{t(`${key}.name`)}</span>
        <span className="tc-ps-from">
          {t('tactics.passives.from')}: {line.from.map(fromText).join(', ')}
        </span>
      </span>
      <span className="tc-ps-when">
        <strong>{t('tactics.passives.when')}:</strong> {t(`${key}.when`, params)}
      </span>
      <span className="tc-ps-what">{t(`${key}.what`, params)}</span>
      <span className="tc-ps-rate">{t(`${key}.rate`, params)}</span>
    </li>
  );
}

export default function TaticasView({ save }: TaticasViewProps) {
  // The cooldown the hero actually gets: every cooldown is multiplied by abilityCdScale(level) in combat (abilities.ts, engine.ts).
  const cdScale = abilityCdScale(playerLevel(save.xp));
  const shownCooldown = (ms: number): string => seconds(ms * cdScale);
  const stats = useMemo(() => buildCombatStats(save), [save]);
  const passives = useMemo(() => tacticsPassives(save), [save]);
  // What the combat fires: every ability the worn gear grants (the starting gear grants none).
  const abilities = effectiveRotation(save);
  const weapon = resolveEquipped(save).weapon.item;

  return (
    <Screen label={t('tactics.title')} className="tactics-view" data-highlight="tactics-view">
      <PageHeader icon={<PixelIcon name="tactics" />} title={t('tactics.title')} />

      <div className="tc-root">
        <Panel title={t('tactics.basic.title')} className="tc-basic">
          <p className="tc-basic-row">
            <span className="tc-basic-weapon">{t(`gear.${weapon.nameKey}`)}</span>
            <span className="tc-basic-meta">
              <span>{t('tactics.basic.hit', { n: Math.round(stats.dmgBase) })}</span>
              <span>{t('tactics.basic.every', { s: seconds(stats.heroMs) })}</span>
            </span>
          </p>
        </Panel>

        <Panel title={t('tactics.auto.title')} className="tc-auto">
          {abilities.length === 0 ? (
            // the starting gear (tier 0) grants nothing: say why it is empty and what to do
            <p className="ui-note tc-nogear">{t('tactics.noGear')}</p>
          ) : (
            <>
              <p className="ui-note tc-auto-rule">{t('tactics.auto.rule')}</p>
              <ul className="tc-ab-list">
                {abilities.map((id) => {
                  const def = abilityDef(id)!;
                  return (
                    <li key={id} className="tc-ab">
                      <img className="tc-ab-icon" src={def.icon} alt="" />
                      <div className="tc-ab-body">
                        <span className="tc-ab-name">{t(`tactics.names.${id}`)}</span>
                        <span className="tc-ab-meta">
                          <span>{origin(id)}</span>
                          <span>{t('tactics.cooldown', { s: shownCooldown(def.cooldownMs) })}</span>
                        </span>
                        {def.effects.map((e, i) => (
                          <span className="tc-ab-fx" key={i}>
                            {effectText(e)}
                          </span>
                        ))}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </Panel>

        {passives.length === 0 ? (
          <Panel title={t('tactics.passives.title')} className="tc-passives">
            <p className="ui-note">{t('tactics.passives.none')}</p>
          </Panel>
        ) : (
          // a fold (the same one as Personagem's): a hero with many passives does not push the rest of the page down; with a few it starts open
          <details className="ui-panel pg-fold tc-passives" open={passives.length <= 3}>
            <summary className="pg-fold-sum">
              <span className="ui-panel-title">{t('tactics.passives.title')}</span>
              <Chip tone="gold">{passives.length}</Chip>
              <span className="pg-fold-chev" aria-hidden />
            </summary>
            <div className="pg-fold-body">
              <p className="ui-note tc-passives-intro">{t('tactics.passives.intro')}</p>
              <ul className="tc-ps-list">
                {passives.map((line) => (
                  <PassiveRow key={line.id} line={line} />
                ))}
              </ul>
            </div>
          </details>
        )}
      </div>
    </Screen>
  );
}
