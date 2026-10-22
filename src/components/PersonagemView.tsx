import { ReactNode, useEffect, useState } from 'react';
import { t } from '../locales';
import { levelLabel, levelBarProgress } from './levelLabel';
import { useDisplayName } from '../game/usernameContext';
import SpriteSheet from './SpriteSheet';
import { EquipmentPanel, AttributesPanel, TitlesPanel, AttrKey } from './HeroPanels';
import InventoryPanel, { BagSelection } from './InventoryPanel';
import { SkillsSummary } from './SkillsView';
import { skillsSummaryText } from './skillText';
import { SaveData } from '../game/engine';
import { CpLine } from './CombatStats';
import { getTitleDef } from '../game/titles';
import { portraitFrameClass } from '../game/seasonItems';
import { Chip, PageHeader, Panel, Screen } from './ui';

// A collapsible section ("Habilidades", "Títulos e aparência"): a native <details> (keyboard and touch work, the state is the browser's), closed by default, with its one-line summary beside the title.
function Fold({ title, hint, children, id }: { title: ReactNode; hint?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <details className="ui-panel pg-fold" id={id}>
      <summary className="pg-fold-sum">
        <span className="ui-panel-title">{title}</span>
        {hint && <span className="pg-fold-hint">{hint}</span>}
        <span className="pg-fold-chev" aria-hidden />
      </summary>
      <div className="pg-fold-body">{children}</div>
    </details>
  );
}

// "Personagem" as its own main screen, built like the approved proposal (docs/mockups/PERSONAGEM_PROPOSTA.md): a compact hero summary on top; the main column has the equipment slots, the set line and
// the Inventário | Baú tabs with the grid right after them; the side column has the ONE item sheet (the picked piece or stack, with every action the inventory always had), the attributes and the
// attribute points; Habilidades and Títulos e aparência are folds at the end. Every panel is the shared one (HeroPanels.tsx / InventoryPanel.tsx): same handlers, same state, same save fields. No mechanic changed.
// The item sheet is drawn ONCE, into `.pg-host`: beside the grid on a wide screen, right under the grid on a narrow one (the stylesheet moves the host, the logic is the same).
export default function PersonagemView({
  save,
  spriteUrl,
  onAttrChange,
  onSuggestAttrs,
  onEquip,
  onUnequip,
  onSelectTitle,
  onSelectFrame,
  onSelectSkin,
  onDiscard,
  onReforge,
  onLapidar,
  onSalvage,
  onUseConsumable,
  onExpandInventory,
  onOpenSkills,
}: {
  save: SaveData;
  spriteUrl: string;
  onAttrChange: (attr: AttrKey, delta: number) => void;
  onSuggestAttrs?: () => void;
  onEquip: (id: string) => void;
  onUnequip: (id: string) => void;
  onSelectTitle: (id: string | null) => void;
  onSelectFrame: (id: string | null) => void;
  onSelectSkin: (id: string | null) => void;
  onDiscard: (kind: 'gear' | 'material' | 'consumable', id: string) => void;
  onReforge: (id: string) => void;
  onLapidar: (id: string, lockIndex: number) => void;
  onSalvage: (id: string) => void;
  onUseConsumable: (id: string) => void;
  onExpandInventory: () => void;
  onOpenSkills: () => void;
}) {
  const displayName = useDisplayName(save.heroName);
  const progress = levelBarProgress(save);
  const pct = Math.round(progress * 100);
  const titleDef = save.activeTitle ? getTitleDef(save.activeTitle) : undefined;
  const titleLabel = titleDef ? t(`titles.${titleDef.nameKey}`) : null;

  // the pick (a grid stack, a Baú stack or a worn piece on the slots) and where the single item sheet is drawn
  const [selected, setSelected] = useState<BagSelection | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const pickKey = selected ? `${selected.src}:${selected.kind}:${selected.id}:${selected.variant ?? ''}` : '';
  // After a pick, bring the sheet into view (its top) if it is not wholly on screen (on a phone it opens under the grid; on a wide screen it can be above the part of the grid the player is looking at).
  useEffect(() => {
    if (!pickKey || !host) return;
    const frame = requestAnimationFrame(() => {
      const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const r = host.getBoundingClientRect();
      const view = (host.closest('.ui-screen') ?? document.documentElement).getBoundingClientRect();
      if (r.top >= view.top && r.bottom <= view.bottom) return;
      host.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
    });
    return () => cancelAnimationFrame(frame);
  }, [pickKey, host]);

  const pickWorn = (id: string) => setSelected((cur) => (cur && cur.src === 'bag' && cur.kind === 'gear' && cur.id === id ? null : { src: 'bag', kind: 'gear', id }));
  const selectedGearId = selected && selected.src === 'bag' && selected.kind === 'gear' ? selected.id : null;

  return (
    <Screen label={t('nav.hero')}>
      <PageHeader title={t('nav.hero')} />
      <div className="pg-layout">
        <Panel className="pg-hero" aria-label={displayName}>
          <div className={`pg-portrait${portraitFrameClass(save)}`} aria-hidden>
            <SpriteSheet src={spriteUrl} size="100%" row={0} />
          </div>
          <div className="pg-hero-body">
            <h3 className="pg-hero-name">{displayName}</h3>
            {titleLabel && <p className="pg-hero-title">{titleLabel}</p>}
            <div className="pg-hero-chips">
              <Chip tone="gold">{levelLabel(save)}</Chip>
              <Chip>
                <CpLine save={save} />
              </Chip>
            </div>
            <div className="pg-xp">
              <div className="bar hm-bar" role="progressbar" aria-label={t('profile.xpProgress', { n: pct })} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
                <div className="bar-fill xp-fill" style={{ width: `${pct}%` }} />
              </div>
              <span className="pg-xp-text">{t('profile.xpProgress', { n: pct })}</span>
            </div>
          </div>
        </Panel>

        <div className="pg-main">
          <Panel title={t('profile.equipTab')} className="pg-equip-panel">
            <EquipmentPanel save={save} selectedId={selectedGearId} onSelect={pickWorn} />
          </Panel>

          <Panel title={t('inventory.title')} className="pg-bag-panel">
              <InventoryPanel
                save={save}
                onEquip={onEquip}
                onUnequip={onUnequip}
                onDiscard={onDiscard}
                onReforge={onReforge}
                onLapidar={onLapidar}
                onSalvage={onSalvage}
                onUseConsumable={onUseConsumable}
                onExpand={onExpandInventory}
                selected={selected}
                onSelectedChange={setSelected}
                detailHost={host}
              />
          </Panel>

          <Fold title={t('heroSkills.ui.title')} hint={skillsSummaryText(save)} id="pg-skills">
            <SkillsSummary save={save} onOpen={onOpenSkills} />
          </Fold>

          <Fold title={t('profile.titlesFold')} hint={titleLabel ?? t('titles.none')} id="pg-titles">
            <TitlesPanel save={save} onSelectTitle={onSelectTitle} onSelectFrame={onSelectFrame} onSelectSkin={onSelectSkin} />
          </Fold>
        </div>

        <div className="pg-side">
          <div className="pg-host" ref={setHost} aria-label={t('inventory.title')} />
          <Panel title={t('profile.attrsTab')} data-highlight="attrs" className="pg-attrs-panel">
            <AttributesPanel save={save} onAttrChange={onAttrChange} onSuggest={onSuggestAttrs} />
          </Panel>
        </div>
      </div>
    </Screen>
  );
}
