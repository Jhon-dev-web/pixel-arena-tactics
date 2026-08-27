import { useState } from 'react';
import Assets from '../assets.json';
import { t } from '../locales';
import { SaveData } from '../game/engine';
import {
  GEAR,
  GEAR_SLOTS,
  GearItem,
  MAX_REFINE,
  effectiveDamage,
  effectiveMaxHp,
  gearBySlot,
  getEquipped,
  getGear,
  refineLevel,
  upgradeChance,
  upgradeCost,
} from '../game/gear';
import { MaterialId, hasMaterials, materialIconUrl } from '../game/materials';
import GearIcon from './GearIcon';

const fmt = (s: string, n: number) => s.replace('{n}', String(n));
const gearText = (k: string): string => t(`gear.${k}`);
const matText = (k: string): string => t(`materials.${k}`);

const refineTag = (lvl: number): string => (lvl > 0 ? ` +${lvl}` : '');

function rarityIcon(key: string): string {
  switch (key) {
    case 'material_bronze':
    case 'material_iron':
      return Assets.icons.ore.url;
    case 'material_steel':
      return Assets.icons.steel.url;
    case 'material_dragon':
      return Assets.icons.dragon_scales.url;
    default:
      return '';
  }
}

const rarityClass = (g: GearItem): string => `rarity-${g.materialKey?.replace('material_', '') ?? 'default'}`;

export default function ForgeModal({
  save,
  onForge,
  onUpgrade,
  onClose,
}: {
  save: SaveData;
  onForge: (id: string) => void;
  onUpgrade: (id: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'forge' | 'upgrade'>('forge');
  const [justForged, setJustForged] = useState<string | null>(null);

  const canForge = (item: GearItem): boolean => {
    if (save.gold < item.cost) return false;
    if (!hasMaterials(save.materials, item.recipe?.materials)) return false;
    for (const [itemId, need] of Object.entries(item.recipe?.items ?? {})) {
      if ((save.inventory[itemId] ?? 0) < (need as number)) return false;
    }
    if ((item.recipe?.shards ?? 0) > 0 && save.shards < (item.recipe?.shards ?? 0)) return false;
    return true;
  };

  const handleForge = (id: string) => {
    onForge(id);
    setJustForged(id);
    window.setTimeout(() => setJustForged(null), 1500);
  };

  const { weapon, armor } = getEquipped(save.equipped);
  const equipped = [weapon, armor];

  const canUpgrade = (item: GearItem): boolean => {
    const lvl = refineLevel(save.upgrades, item.id);
    if (lvl >= MAX_REFINE) return false;
    const cost = upgradeCost(item, lvl);
    return (
      save.gold >= cost.gold &&
      hasMaterials(save.materials, cost.materials) &&
      save.shards >= (cost.shards ?? 0)
    );
  };

  return (
    <div className="modal-backdrop">
      <div className="modal forge-modal">
        <h2 className="modal-title">{t('forge.title')}</h2>
        <p className="shop-gold">{fmt(t('ui.owned'), save.gold)}</p>

        <div className="forge-tabs">
          <button className={`tab${tab === 'forge' ? ' active' : ''}`} onClick={() => setTab('forge')} data-ui>
            {t('forge.forgeTab')}
          </button>
          <button className={`tab${tab === 'upgrade' ? ' active' : ''}`} onClick={() => setTab('upgrade')} data-ui>
            {t('forge.upgradeTab')}
          </button>
        </div>

        {tab === 'forge' ? (
          <div className="forge-body">
            {GEAR_SLOTS.map((slot) => {
              const items = gearBySlot(slot).filter((g) => g.recipe);
              if (items.length === 0) return null;
              return (
                <div className="gear-section" key={slot}>
                  <div className="gear-section-title">{gearText(slot)}</div>
                  {items.map((item) => {
                    const ok = canForge(item);
                    const forged = justForged === item.id;
                    return (
                      <div className={`craft-card ${rarityClass(item)}`} key={item.id}>
                        <span className="craft-icon">
                          <GearIcon item={item} />
                        </span>
                        <div className="craft-info">
                          <div className="craft-header">
                            <span className="craft-name">{gearText(item.nameKey)}</span>
                            {item.materialKey && (
                              <span className={`gear-material ${item.materialKey.replace('material_', '')}`}>
                                {rarityIcon(item.materialKey) && (
                                  <img className="rarity-icon" src={rarityIcon(item.materialKey)} alt="" />
                                )}
                                {gearText(item.materialKey)}
                              </span>
                            )}
                          </div>
                          <span className="craft-desc">{gearText(item.descKey)}</span>
                          <div className="craft-req">
                            <span className="req-item">
                              <span className="mat-icon">
                                <img src={Assets.icons.gold.url} alt="" />
                              </span>
                              <span className={`req-amount${save.gold < item.cost ? ' missing' : ''}`}>{item.cost}</span>
                            </span>
                            {Object.entries(item.recipe?.items ?? {}).map(([itemId, count]) => {
                              const need = count as number;
                              const have = save.inventory[itemId] ?? 0;
                              const g = getGear(itemId);
                              return (
                                <span className="req-item" key={`item-${itemId}`}>
                                  <span className="req-plus">+</span>
                                  <span className="mat-icon">
                                    <GearIcon item={g} />
                                  </span>
                                  <span className={`req-amount${have < need ? ' missing' : ''}`}>
                                    {gearText(g.nameKey)}: {have}/{need}
                                  </span>
                                </span>
                              );
                            })}
                            {Object.entries(item.recipe?.materials ?? {}).map(([mid, count]) => {
                              const need = count as number;
                              const have = save.materials[mid as MaterialId] ?? 0;
                              return (
                                <span className="req-item" key={`mat-${mid}`}>
                                  <span className="req-plus">+</span>
                                  <span className="mat-icon">
                                    <img src={materialIconUrl(mid as MaterialId)} alt="" />
                                  </span>
                                  <span className={`req-amount${have < need ? ' missing' : ''}`}>
                                    {need}× {matText(`mat_${mid}`)}
                                  </span>
                                </span>
                              );
                            })}
                            {(item.recipe?.shards ?? 0) > 0 && (
                              <span className="req-item">
                                <span className="req-plus">+</span>
                                <span className="mat-icon shard">🔷</span>
                                <span className={`req-amount${save.shards < (item.recipe?.shards ?? 0) ? ' missing' : ''}`}>
                                  {t('ui.shardsX', { n: item.recipe?.shards ?? 0 })}
                                </span>
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          className={`craft-btn forge${forged ? ' forged' : ''}`}
                          onClick={() => handleForge(item.id)}
                          disabled={!ok}
                          data-ui
                        >
                          {forged ? t('forge.forged') : t('forge.forge')}
                        </button>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="forge-body">
            {equipped.map((item) => {
              const lvl = refineLevel(save.upgrades, item.id);
              const isMax = lvl >= MAX_REFINE;
              const cost = upgradeCost(item, lvl);
              const chance = Math.round(upgradeChance(lvl) * 100);
              const stat = item.slot === 'weapon' ? effectiveDamage(item, lvl) : effectiveMaxHp(item, lvl);
              return (
                <div className={`craft-card ${rarityClass(item)}`} key={item.id}>
                  <span className="craft-icon">
                    <GearIcon item={item} />
                  </span>
                  <div className="craft-info">
                    <div className="craft-header">
                      <span className="craft-name">
                        {gearText(item.nameKey)}
                        <span className="refine-tag">{refineTag(lvl)}</span>
                      </span>
                    </div>
                    <span className="craft-desc">
                      {item.slot === 'weapon'
                        ? `+${stat} ${t('profile.damage')}`
                        : `+${stat} ${t('profile.hp')}`}
                    </span>
                    {!isMax && (
                      <div className="craft-req">
                        <span className="req-item">
                          <span className="mat-icon">
                            <img src={Assets.icons.gold.url} alt="" />
                          </span>
                          <span className={`req-amount${save.gold < cost.gold ? ' missing' : ''}`}>{cost.gold}</span>
                        </span>
                        {Object.entries(cost.materials ?? {}).map(([mid, count]) => {
                          const need = count as number;
                          const have = save.materials[mid as MaterialId] ?? 0;
                          return (
                            <span className="req-item" key={`up-${mid}`}>
                              <span className="req-plus">+</span>
                              <span className="mat-icon">
                                <img src={materialIconUrl(mid as MaterialId)} alt="" />
                              </span>
                              <span className={`req-amount${have < need ? ' missing' : ''}`}>
                                {need}× {matText(`mat_${mid}`)}
                              </span>
                            </span>
                          );
                        })}
                        {(cost.shards ?? 0) > 0 && (
                          <span className="req-item">
                            <span className="req-plus">+</span>
                            <span className="mat-icon shard">🔷</span>
                            <span className={`req-amount${save.shards < (cost.shards ?? 0) ? ' missing' : ''}`}>
                              {t('ui.shardsX', { n: cost.shards ?? 0 })}
                            </span>
                          </span>
                        )}
                      </div>
                    )}
                    {!isMax && <span className="upgrade-chance">{fmt(t('forge.chance'), chance)}</span>}
                  </div>
                  {isMax ? (
                    <button className="craft-btn equipped" disabled data-ui>
                      {t('forge.max')}
                    </button>
                  ) : (
                    <button
                      className="craft-btn forge"
                      onClick={() => onUpgrade(item.id)}
                      disabled={!canUpgrade(item)}
                      data-ui
                    >
                      {t('forge.upgrade')}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <button className="modal-x" onClick={onClose} aria-label="Close" data-ui>
          ✕
        </button>
      </div>
    </div>
  );
}
