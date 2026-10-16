import { t } from '../locales';
import { levelLabel, levelBarProgress } from './levelLabel';
import { useDisplayName } from '../game/usernameContext';
import SpriteSheet from './SpriteSheet';
import HeroThumb from './HeroThumb';
import { EquipmentPanel, AttributesPanel, TitlesPanel, AttrKey } from './HeroPanels';
import InventoryPanel from './InventoryPanel';
import { SkillsSummary } from './SkillsView';
import { SaveData } from '../game/engine';
import { CpLine } from './CombatStats';
import { getTitleDef } from '../game/titles';
import { heroBaseLook } from '../game/sprites';
import { portraitFrameClass } from '../game/seasonItems';
import { Chip, PageHeader, Panel, Screen, ScreenLayout } from './ui';

// "Personagem" as its own main screen: the page header, then the hero art with the attributes in the summary column on the right (first on a phone, where the points to spend matter most) and the
// equipment, the skills, the titles and the inventory in the main column. Every panel is a straight port of the old cards via the shared panels in HeroPanels.tsx / InventoryPanel.tsx: same handlers,
// same state, same save fields. No mechanic changed; only the presentation moved onto the shared pieces (src/components/ui).
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
  const titleDef = save.activeTitle ? getTitleDef(save.activeTitle) : undefined;
  const titleLabel = titleDef ? t(`titles.${titleDef.nameKey}`) : null;

  return (
    <Screen label={t('nav.hero')}>
      <PageHeader icon={<HeroThumb sheet={heroBaseLook(save)} size={52} />} title={t('nav.hero')} subtitle={titleLabel ? `${displayName} • ${titleLabel}` : displayName} />
      <ScreenLayout
        sideFirst
        main={
          <>
            <Panel title={t('profile.equipTab')} className="pg-equip-panel">
              <EquipmentPanel save={save} />
            </Panel>

            <Panel title={t('heroSkills.ui.title')}>
              <SkillsSummary save={save} onOpen={onOpenSkills} />
            </Panel>

            <Panel title={t('profile.titlesTab')}>
              <TitlesPanel save={save} onSelectTitle={onSelectTitle} onSelectFrame={onSelectFrame} onSelectSkin={onSelectSkin} />
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
              />
            </Panel>
          </>
        }
        side={
          <>
            <Panel className="pg-hero">
              <div className={`pg-portrait${portraitFrameClass(save)}`} aria-hidden>
                <SpriteSheet src={spriteUrl} size="min(132px, 100%)" row={0} />
              </div>
              <div className="pg-hero-body">
                <h3 className="pg-hero-name">{displayName}</h3>
                {titleLabel && <p className="pg-hero-title">• {titleLabel}</p>}
                <div className="pg-hero-chips">
                  <Chip tone="gold">{levelLabel(save)}</Chip>
                  <Chip>
                    <CpLine save={save} />
                  </Chip>
                </div>
                <div className="bar hm-bar">
                  <div className="bar-fill xp-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
                </div>
              </div>
            </Panel>

            <Panel title={t('profile.attrsTab')} data-highlight="attrs" className="pg-attrs-panel">
              <AttributesPanel save={save} onAttrChange={onAttrChange} onSuggest={onSuggestAttrs} />
            </Panel>
          </>
        }
      />
    </Screen>
  );
}
