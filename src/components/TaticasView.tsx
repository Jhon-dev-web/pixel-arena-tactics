import { useEffect, useState } from 'react';
import { t } from '../locales';
import T from '../game/tunables';
import { SaveData, effectiveRotation, equippedAbilities } from '../game/engine';
import { AbilityEffect, AbilityId, abilityDef, defaultRotation } from '../game/abilities';
import { Button, Chip, Dialog, ItemFrame, PageHeader, Panel, Screen } from './ui';
import PixelIcon from './PixelIcon';

// "Taticas": the abilities that the WORN gear grants (abilities.ts) and the rotation. The rotation is a list of four rows (position, icon, name, source, cooldown, and up / down on the row itself: one tap per
// move; taking one out stays in the detail card, there is no room for a third 44px button on a phone); what the gear grants is a grid of icons below it (images only, on purpose: the owner asked for it) (one group per SOURCE: the weapon,
// the chestpiece, and any slot that starts granting later), and tapping an icon or a row opens its CARD (a small dialog: icon, name, source, cooldown, every effect, and the buttons to add it, take it out and move it up or down). Same pattern as the
// Habilidades screen (SkillsView): moving things only changes a DRAFT held here, "Aplicar" commits it, "Desfazer" drops it. Every number in the text comes from the definition (abilityDef).

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

export interface TaticasViewProps {
  save: SaveData;
  // a list = the player's choice ([] = cleared on purpose); null = back to automatic (follows the worn gear)
  onApply: (draft: AbilityId[] | null) => void;
}

export default function TaticasView({ save, onApply }: TaticasViewProps) {
  const slots = T.abilities.rotationSlots;
  const granted = equippedAbilities(save);
  const committed = effectiveRotation(save);
  const committedKey = committed.join(',');
  const committedAuto = save.rotation === undefined;
  const [draft, setDraftList] = useState<AbilityId[]>(committed);
  const [auto, setAuto] = useState(committedAuto);
  // The ability whose card is open (null = none yet). A tap on an empty slot opens the "empty" hint instead.
  const [selected, setSelected] = useState<AbilityId | null>(null);
  const [emptySlot, setEmptySlot] = useState<number | null>(null);
  // Any change by hand leaves the automatic mode; "Automatica" goes back to it.
  const setDraft = (next: AbilityId[]) => {
    setDraftList(next);
    setAuto(false);
  };
  // The draft starts over whenever what is in force changes (applied here, or the gear changed under an automatic rotation).
  useEffect(() => {
    setDraftList(committedKey ? (committedKey.split(',') as AbilityId[]) : []);
    setAuto(committedAuto);
  }, [committedKey, committedAuto]);

  // Escape closes the card first (stopPropagation: the same pattern as the bag-expansion dialog, so nothing behind it also reacts).
  const cardOpen = selected !== null;
  useEffect(() => {
    if (!cardOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setSelected(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [cardOpen]);

  const pending = auto !== committedAuto || draft.join(',') !== committedKey;
  // The stored list still names something the worn gear no longer grants: it left the rotation by itself (activeRotation), and the screen says so once, calmly.
  const dropped = Array.isArray(save.rotation) && save.rotation.some((id) => !granted.includes(id));

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
  // "Arma: Espada" / "Peitoral: Placa": where an ability comes from, the same words as the title of its group in the grid
  const origin = (id: AbilityId): string => {
    const s = abilityDef(id)!.source;
    return 'line' in s ? t('tactics.fromWeapon', { name: t(`tactics.line.${s.line}`) }) : t('tactics.fromBody', { name: t(`tactics.body.${s.weight}`) });
  };
  const defaults = defaultRotation(granted);
  const goAuto = () => {
    setDraftList(defaults);
    setAuto(true);
  };
  const open = (id: AbilityId) => {
    setSelected(id);
    setEmptySlot(null);
  };

  // The card shows an ability that is granted by the worn weapon or is still in the draft (never one that is neither).
  const shownId = selected && (granted.includes(selected) || draft.includes(selected)) ? selected : null;
  const shown = shownId ? abilityDef(shownId) : undefined;
  const shownAt = shownId ? draft.indexOf(shownId) : -1;
  // One group per source of the granted abilities, in definition order. A new source (another slot granting abilities) only needs a case in groupTitle.
  const groups: { key: string; title: string; ids: AbilityId[] }[] = [];
  for (const id of granted) {
    const s = abilityDef(id)!.source;
    const key = 'line' in s ? `line:${s.line}` : `weight:${s.weight}`;
    let g = groups.find((x) => x.key === key);
    if (!g) {
      g = { key, title: origin(id), ids: [] };
      groups.push(g);
    }
    g.ids.push(id);
  }

  // A rotation row. A filled one: the main part opens the card of the ability (as before), and the two buttons on the row move it up or down. An empty one is the target of the next pick.
  const renderSlot = (index: number) => {
    const id = draft[index];
    const def = id ? abilityDef(id) : undefined;
    if (!def) {
      return (
        <li key={index} className="tc-row">
          <button
            type="button"
            className={`tc-row-main empty${emptySlot === index ? ' selected' : ''}`}
            aria-pressed={emptySlot === index}
            aria-label={t('tactics.emptySlot', { n: index + 1 })}
            onClick={() => {
              setSelected(null);
              setEmptySlot(index);
            }}
          >
            <span className="tc-row-n" aria-hidden="true">
              {index + 1}
            </span>
            <span className="tc-row-empty">{t('tactics.empty')}</span>
          </button>
        </li>
      );
    }
    const label = name(def.id);
    return (
      <li key={index} className="tc-row">
        <button
          type="button"
          className={`tc-row-main filled${shownId === def.id ? ' selected' : ''}`}
          aria-pressed={shownId === def.id}
          aria-label={t('tactics.slotAria', { n: index + 1, name: label })}
          onClick={() => open(def.id)}
        >
          <span className="tc-row-n" aria-hidden="true">
            {index + 1}
          </span>
          <img className="tc-row-icon" src={def.icon} alt="" />
          <span className="tc-row-text">
            <span className="tc-row-name">{label}</span>
            <span className="tc-row-meta">
              <span>{origin(def.id)}</span>
              <span>{t('tactics.cooldown', { s: seconds(def.cooldownMs) })}</span>
            </span>
          </span>
        </button>
        <div className="tc-row-actions">
          <Button className="tc-step" disabled={index === 0} aria-label={`${t('tactics.up')}: ${label}`} onClick={() => move(index, -1)}>
            <span aria-hidden="true">{'\u25B2'}</span>
          </Button>
          <Button className="tc-step" disabled={index === draft.length - 1} aria-label={`${t('tactics.down')}: ${label}`} onClick={() => move(index, 1)}>
            <span aria-hidden="true">{'\u25BC'}</span>
          </Button>
        </div>
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
          {granted.length === 0 ? (
            // the starting gear (tier 0) grants nothing: say why it is empty and what to do, instead of four rows that ask for a pick from a grid that is not there
            <p className="ui-note tc-nogear">{t('tactics.noGear')}</p>
          ) : (
            <ol className="tc-rows">{Array.from({ length: slots }, (_, i) => renderSlot(i))}</ol>
          )}
          {granted.length > 0 && <p className="ui-note tc-hint">{emptySlot !== null ? t('tactics.emptyHint', { n: emptySlot + 1 }) : t('tactics.pickHint')}</p>}
          {auto && granted.length > 0 && <p className="ui-note tc-auto">{t('tactics.auto')}</p>}
          {draft.length === 0 && granted.length > 0 && <p className="ui-note">{t('tactics.emptyAll')}</p>}
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

        {groups.map((g) => (
          <Panel as="section" key={g.key} title={g.title} className="tc-group" actions={<Chip>{t('tactics.granted')}</Chip>}>
            <ul className="tc-grid">
              {g.ids.map((id) => {
                const def = abilityDef(id)!;
                const at = draft.indexOf(id);
                return (
                  <li key={id}>
                    <button
                      type="button"
                      className={`tc-tile tc-pick${at >= 0 ? ' used' : ''}${shownId === id ? ' selected' : ''}`}
                      aria-pressed={shownId === id}
                      aria-label={t('tactics.grantedAria', { name: name(id), s: seconds(def.cooldownMs) })}
                      onClick={() => open(id)}
                    >
                      <img className="tc-icon" src={def.icon} alt="" />
                      {at >= 0 && (
                        <span className="tc-n" aria-hidden="true">
                          {at + 1}
                        </span>
                      )}
                      <span className="tc-label">{name(id)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Panel>
        ))}

        {shown && (
          <Dialog
            className="tc-card"
            title={name(shown.id)}
            subtitle={origin(shown.id)}
            onClose={() => setSelected(null)}
            closeLabel={t('ui.close')}
            footer={
              <div className="tc-card-actions">
                {shownAt >= 0 ? (
                  <>
                    <Button disabled={shownAt === 0} onClick={() => move(shownAt, -1)}>
                      {t('tactics.up')}
                    </Button>
                    <Button disabled={shownAt === draft.length - 1} onClick={() => move(shownAt, 1)}>
                      {t('tactics.down')}
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() => {
                        remove(shown.id);
                        setSelected(null);
                      }}
                    >
                      {t('tactics.remove')}
                    </Button>
                  </>
                ) : (
                  <Button variant="primary" disabled={draft.length >= slots} onClick={() => add(shown.id)}>
                    {draft.length >= slots ? t('tactics.full') : t('tactics.addRotation')}
                  </Button>
                )}
              </div>
            }
          >
            <div className="tc-card-top">
              <ItemFrame size="lg" rarity={shownAt >= 0 ? 'legendary' : 'common'}>
                <img className="tc-detail-icon" src={shown.icon} alt="" />
              </ItemFrame>
              <div className="tc-card-chips">
                <Chip>{t('tactics.cooldown', { s: seconds(shown.cooldownMs) })}</Chip>
                {shownAt >= 0 && <Chip tone="gold">{t('tactics.position', { n: shownAt + 1, m: slots })}</Chip>}
              </div>
            </div>
            {shown.effects.map((e, i) => (
              <p className="tc-effect" key={i}>
                {effectText(e)}
              </p>
            ))}
          </Dialog>
        )}
      </div>
    </Screen>
  );
}
