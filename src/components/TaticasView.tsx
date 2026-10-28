import { useEffect, useMemo, useState } from 'react';
import { t } from '../locales';
import T from '../game/tunables';
import { SaveData, effectiveRotation, equippedAbilities } from '../game/engine';
import { AbilityDef, AbilityEffect, AbilityId, abilityDef, defaultRotation } from '../game/abilities';
import { Button, Chip, PageHeader, Panel, Screen } from './ui';
import PixelIcon from './PixelIcon';

// "Taticas": the equipment abilities (abilities.ts) and the rotation. The screen lists what the WORN weapon and chestpiece grant, grouped by where it comes from, and the player lines up to
// T.abilities.rotationSlots of them in order of priority. Same pattern as the Habilidades screen (SkillsView): moving things only changes a DRAFT held here, "Aplicar" commits it, "Desfazer" drops it,
// so a mis-click costs nothing. Every number in the text comes from the definition (abilityDef), the locale holds placeholders only.

const seconds = (ms: number): number => Math.round((ms / 1000) * 10) / 10;
const pct = (share: number): number => Math.round(share * 100);

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

interface Group {
  key: string;
  title: string;
  ids: AbilityId[];
}

export interface TaticasViewProps {
  save: SaveData;
  // a list = the player's choice ([] = cleared on purpose); null = back to automatic (follows the worn gear)
  onApply: (draft: AbilityId[] | null) => void;
}

export default function TaticasView({ save, onApply }: TaticasViewProps) {
  const slots = T.abilities.rotationSlots;
  const granted = equippedAbilities(save);
  const grantedKey = granted.join(',');
  const committed = effectiveRotation(save);
  const committedKey = committed.join(',');
  const committedAuto = save.rotation === undefined;
  const [draft, setDraftList] = useState<AbilityId[]>(committed);
  const [auto, setAuto] = useState(committedAuto);
  // Any change by hand leaves the automatic mode; "Padrao" goes back to it.
  const setDraft = (next: AbilityId[]) => {
    setDraftList(next);
    setAuto(false);
  };
  // The draft starts over whenever what is in force changes (applied here, or the gear changed under an automatic rotation).
  useEffect(() => {
    setDraftList(committedKey ? (committedKey.split(',') as AbilityId[]) : []);
    setAuto(committedAuto);
  }, [committedKey, committedAuto]);

  const pending = auto !== committedAuto || draft.join(',') !== committedKey;
  // The stored list still names something the worn gear no longer grants: it left the rotation by itself (activeRotation), and the screen says so once, calmly.
  const dropped = Array.isArray(save.rotation) && save.rotation.some((id) => !granted.includes(id));

  const groups = useMemo<Group[]>(() => {
    const ids = grantedKey ? (grantedKey.split(',') as AbilityId[]) : [];
    const out: Group[] = [];
    const weapon = ids.filter((id) => 'line' in abilityDef(id)!.source);
    const body = ids.filter((id) => 'weight' in abilityDef(id)!.source);
    if (weapon.length > 0) {
      const s = abilityDef(weapon[0])!.source;
      out.push({ key: 'weapon', title: t('tactics.fromWeapon', { name: t(`tactics.line.${'line' in s ? s.line : 'sword'}`) }), ids: weapon });
    }
    if (body.length > 0) {
      const s = abilityDef(body[0])!.source;
      out.push({ key: 'body', title: t('tactics.fromBody', { name: t(`tactics.body.${'weight' in s ? s.weight : 'plate'}`) }), ids: body });
    }
    return out;
  }, [grantedKey]);

  const add = (id: AbilityId) => {
    if (draft.includes(id) || draft.length >= slots) return;
    setDraft([...draft, id]);
  };
  const remove = (id: AbilityId) => setDraft(draft.filter((x) => x !== id));
  const move = (index: number, by: -1 | 1) => {
    const to = index + by;
    if (to < 0 || to >= draft.length) return;
    const next = [...draft];
    [next[index], next[to]] = [next[to], next[index]];
    setDraft(next);
  };

  const name = (id: AbilityId) => t(`tactics.names.${id}`);
  const effects = (def: AbilityDef) => def.effects.map(effectText).join(' · ');
  const cooldown = (def: AbilityDef) => t('tactics.cooldown', { s: seconds(def.cooldownMs) });
  const defaults = defaultRotation(granted);
  const goAuto = () => {
    setDraftList(defaults);
    setAuto(true);
  };

  const renderSlot = (index: number) => {
    const id = draft[index];
    const def = id ? abilityDef(id) : undefined;
    return (
      <li className={`tc-slot${def ? ' filled' : ''}`} key={index}>
        <span className="tc-slot-n" aria-hidden="true">
          {index + 1}
        </span>
        {def ? (
          <>
            <div className="tc-slot-body">
              <div className="tc-slot-head">
                <h4 className="tc-name">{name(def.id)}</h4>
                <Chip>{cooldown(def)}</Chip>
              </div>
              <p className="tc-effect">{effects(def)}</p>
            </div>
            <div className="tc-slot-actions" role="group" aria-label={name(def.id)}>
              <Button size="sm" disabled={index === 0} onClick={() => move(index, -1)}>
                {t('tactics.up')}
              </Button>
              <Button size="sm" disabled={index === draft.length - 1} onClick={() => move(index, 1)}>
                {t('tactics.down')}
              </Button>
              <Button size="sm" variant="danger" onClick={() => remove(def.id)}>
                {t('tactics.remove')}
              </Button>
            </div>
          </>
        ) : (
          <p className="tc-slot-empty">{t('tactics.empty')}</p>
        )}
      </li>
    );
  };

  return (
    <Screen label={t('tactics.title')} className="tactics-view" data-highlight="tactics-view">
      <PageHeader
        icon={<PixelIcon name="tactics" />}
        title={t('tactics.title')}
        subtitle={t('tactics.rule')}
        actions={<Chip tone={draft.length > 0 ? 'gold' : 'plain'}>{t('tactics.filled', { n: draft.length, m: slots })}</Chip>}
      />

      <div className="tc-root">
        <Panel title={t('tactics.rotation')} className="tc-rotation" aria-live="polite">
          <ol className="tc-slots">{Array.from({ length: slots }, (_, i) => renderSlot(i))}</ol>
          {auto && <p className="ui-note tc-auto">{t('tactics.auto')}</p>}
          {draft.length === 0 && <p className="ui-note">{t('tactics.emptyAll')}</p>}
          {dropped && <p className="ui-note tc-dropped">{t('tactics.dropped')}</p>}
          <div className="tc-apply-row">
            <Button variant={pending ? 'primary' : 'secondary'} disabled={!pending} onClick={() => onApply(auto ? null : draft)}>
              {pending ? t('tactics.applyPending') : t('tactics.apply')}
            </Button>
            <Button
              disabled={!pending}
              onClick={() => {
                setDraftList(committed);
                setAuto(committedAuto);
              }}
            >
              {t('tactics.undo')}
            </Button>
            <Button disabled={auto} onClick={goAuto}>
              {t('tactics.default')}
            </Button>
          </div>
          <p className="ui-note">
            {pending ? t('tactics.pending') : t('tactics.saved')}. {t('tactics.when')}
          </p>
        </Panel>

        <div className="tc-groups">
          {groups.map((g) => (
            <Panel as="section" key={g.key} title={g.title} className="tc-group" actions={<Chip>{t('tactics.granted')}</Chip>}>
              <ul className="tc-list">
                {g.ids.map((id) => {
                  const def = abilityDef(id)!;
                  const at = draft.indexOf(id);
                  const full = at < 0 && draft.length >= slots;
                  return (
                    <li className={`tc-card${at >= 0 ? ' used' : ''}`} key={id}>
                      <div className="tc-card-body">
                        <div className="tc-slot-head">
                          <h4 className="tc-name">{name(id)}</h4>
                          <Chip>{cooldown(def)}</Chip>
                        </div>
                        <p className="tc-effect">{effects(def)}</p>
                      </div>
                      {at >= 0 ? (
                        <Button size="sm" onClick={() => remove(id)}>
                          {t('tactics.inRotation', { n: at + 1 })}
                        </Button>
                      ) : (
                        <Button size="sm" variant="primary" disabled={full} onClick={() => add(id)} title={full ? t('tactics.full') : undefined}>
                          {full ? t('tactics.full') : t('tactics.add')}
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Panel>
          ))}
        </div>
      </div>
    </Screen>
  );
}
