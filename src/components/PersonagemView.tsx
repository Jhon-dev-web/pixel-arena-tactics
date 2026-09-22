import { useState } from 'react';
import { t } from '../locales';
import SpriteSheet from './SpriteSheet';
import { EquipmentPanel, AttributesPanel, TitlesPanel, AttrKey } from './HeroPanels';
import InventoryPanel from './InventoryPanel';
import { SaveData, playerLevel, xpForNextLevel, xpToReachLevel } from '../game/engine';
import { getTitleDef } from '../game/titles';

// "Personagem" as its own main-content area (desktop: alongside the fixed sidebar; mobile: same
// cards, stacked) instead of the old small floating modal. Every card below is a straight port of
// HeroModal's/InventoryModal's real content via the shared panels in HeroPanels.tsx/InventoryPanel.tsx
// — same handlers, same state, same save fields. No mechanic changed.
export default function PersonagemView({
  save,
  spriteUrl,
  onAttrChange,
  onRename,
  onEquip,
  onUnequip,
  onSelectTitle,
  onUpgradePouch,
  onDiscard,
  onReforge,
  onSalvage,
  onUseConsumable,
}: {
  save: SaveData;
  spriteUrl: string;
  onAttrChange: (attr: AttrKey, delta: number) => void;
  onRename: (name: string) => void;
  onEquip: (id: string) => void;
  onUnequip: (id: string) => void;
  onSelectTitle: (id: string | null) => void;
  onUpgradePouch: () => void;
  onDiscard: (kind: 'gear' | 'material' | 'consumable', id: string) => void;
  onReforge: (id: string) => void;
  onSalvage: (id: string) => void;
  onUseConsumable: (id: string) => void;
}) {
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');

  const level = playerLevel(save.xp);
  const progress = Math.max(0, Math.min(1, (save.xp - xpToReachLevel(level)) / Math.max(1, xpForNextLevel(level))));
  const titleDef = save.activeTitle ? getTitleDef(save.activeTitle) : undefined;
  const titleLabel = titleDef ? t(`titles.${titleDef.nameKey}`) : null;

  return (
    <div className="desktop-home personagem-view">
      <section className="dh-card personagem-hero">
        <div className="dh-hero-portrait" aria-hidden>
          <SpriteSheet src={spriteUrl} size="148px" row={0} />
        </div>
        <div className="dh-hero-body">
          <div className="dh-hero-headline">
            {editingName ? (
              <input
                className="name-input"
                autoFocus
                value={nameDraft}
                maxLength={16}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={() => {
                  onRename((nameDraft.trim() || save.heroName).slice(0, 16));
                  setEditingName(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    onRename((nameDraft.trim() || save.heroName).slice(0, 16));
                    setEditingName(false);
                  }
                }}
              />
            ) : (
              <button
                className="name-btn"
                onClick={() => {
                  setNameDraft(save.heroName);
                  setEditingName(true);
                }}
                data-ui
              >
                {save.heroName} <span className="pencil">✏️</span>
              </button>
            )}
          </div>
          {titleLabel && <p className="hero-title-line">• {titleLabel}</p>}
          <div className="dh-hero-badges">
            <span className="dh-hero-badge level">{t('camp.level', { n: level })}</span>
          </div>
          <div className="bar dh-hero-xpbar">
            <div className="bar-fill xp-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        </div>
      </section>

      <section className="dh-card personagem-equip">
        <h3 className="dh-card-title">{t('profile.equipTab')}</h3>
        <EquipmentPanel save={save} onEquip={onEquip} onUnequip={onUnequip} onUpgradePouch={onUpgradePouch} />
      </section>

      <section className="dh-card personagem-attrs">
        <h3 className="dh-card-title">{t('profile.attrsTab')}</h3>
        <AttributesPanel save={save} onAttrChange={onAttrChange} />
      </section>

      <section className="dh-card personagem-titles">
        <h3 className="dh-card-title">{t('profile.titlesTab')}</h3>
        <TitlesPanel save={save} onSelectTitle={onSelectTitle} />
      </section>

      <section className="dh-card personagem-inventory">
        <h3 className="dh-card-title">{t('inventory.title')}</h3>
        <InventoryPanel
          save={save}
          onEquip={onEquip}
          onUnequip={onUnequip}
          onDiscard={onDiscard}
          onReforge={onReforge}
          onSalvage={onSalvage}
          onUseConsumable={onUseConsumable}
        />
      </section>
    </div>
  );
}
