import { useState } from 'react';
import Assets from '../assets.json';
import { t } from '../locales';
import { playerLevel, SaveData } from '../game/engine';
import {
  GEAR_SLOTS,
  GearItem,
  MAX_DURABILITY,
  MAX_REFINE,
  effectiveDamage,
  effectiveMaxHp,
  gearBySlot,
  getEquipped,
  getGear,
  refineLevel,
  repairCost,
  upgradeChance,
  upgradeCost,
} from '../game/gear';
import { getMaterial, MaterialId, hasMaterials } from '../game/materials';
import { GEMS, GemId, getGem, hasGems, socketsForTier } from '../game/gems';
import GearIcon from './GearIcon';
import MaterialIcon from './MaterialIcon';

const gearText = (k: string): string => t(`gear.${k}`);
const matText = (k: string): string => t(`materials.${k}`);
const gemText = (k: string): string => t(`gems.${k}`);

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
    case 'material_gold':
      return '/assets/icons/ore_gold.png';
    default:
      return '';
  }
}

const rarityClass = (g: GearItem): string => `rarity-${g.materialKey?.replace('material_', '') ?? 'default'}`;

export default function ForgeModal({
  save,
  onForge,
  onUpgrade,
  onRepair,
  onSocket,
  onUnsocket,
  onClose,
}: {
  save: SaveData;
  onForge: (id: string) => void;
  onUpgrade: (id: string) => void;
  onRepair: (id: string, blessed: boolean) => void;
  onSocket: (itemId: string, gemId: GemId) => void;
  onUnsocket: (itemId: string, index: number) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'forge' | 'upgrade' | 'repair' | 'socket'>('forge');
  const [justForged, setJustForged] = useState<string | null>(null);

  const level = playerLevel(save.xp);

  const canForge = (item: GearItem): boolean => {
    if (save.gold < item.cost) return false;
    if (level < (item.recipe?.requiredLevel ?? 0)) return false;
    if (!hasMaterials(save.materials, item.recipe?.materials)) return false;
    if (!hasGems(save.gems, item.recipe?.gems)) return false;
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
        <p className="shop-gold">{t('ui.owned', { n: save.gold })}</p>

        <div className="forge-tabs">
          <button className={`tab${tab === 'forge' ? ' active' : ''}`} onClick={() => setTab('forge')} data-ui>
            {t('forge.forgeTab')}
          </button>
          <button className={`tab${tab === 'upgrade' ? ' active' : ''}`} onClick={() => setTab('upgrade')} data-ui>
            {t('forge.upgradeTab')}
          </button>
          <button className={`tab${tab === 'repair' ? ' active' : ''}`} onClick={() => setTab('repair')} data-ui>
            {t('forge.repairTab')}
          </button>
          <button className={`tab${tab === 'socket' ? ' active' : ''}`} onClick={() => setTab('socket')} data-ui>
            {t('forge.socketTab')}
          </button>
        </div>

        {tab === 'forge' && (
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
                            {(item.recipe?.requiredLevel ?? 0) > 0 && (
                              <span className="req-item">
                                <span className="req-plus">+</span>
                                <span className="mat-icon level">⭐</span>
                                <span className={`req-amount${level < (item.recipe?.requiredLevel ?? 0) ? ' missing' : ''}`}>
                                  {t('forge.levelReq', { n: item.recipe?.requiredLevel ?? 0 })}
                                </span>
                              </span>
                            )}
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
                                    <MaterialIcon item={getMaterial(mid as MaterialId)!} />
                                  </span>
                                  <span className={`req-amount${have < need ? ' missing' : ''}`}>
                                    {need}× {matText(`mat_${mid}`)}
                                  </span>
                                </span>
                              );
                            })}
                            {Object.entries(item.recipe?.gems ?? {}).map(([gid, count]) => {
                              const need = count as number;
                              const have = save.gems[gid as GemId] ?? 0;
                              const g = getGem(gid);
                              return (
                                <span className="req-item" key={`gem-${gid}`}>
                                  <span className="req-plus">+</span>
                                  <span className="mat-icon">{g?.icon ?? '💎'}</span>
                                  <span className={`req-amount${have < need ? ' missing' : ''}`}>
                                    {need}× {g ? gemText(g.nameKey) : gid}
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
        )}

        {tab === 'upgrade' && (
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
                      {item.slot === 'weapon' ? `+${stat} ${t('profile.damage')}` : `+${stat} ${t('profile.hp')}`}
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
                                <MaterialIcon item={getMaterial(mid as MaterialId)!} />
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
                    {!isMax && <span className="upgrade-chance">{t('forge.chance', { n: chance })}</span>}
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

        {tab === 'repair' && (
          <div className="forge-body">
            {equipped.map((item) => {
              const dur = save.durability?.[item.id] ?? MAX_DURABILITY;
              const broken = dur <= 0;
              const cost = repairCost(item.tier ?? 0);
              return (
                <div className={`craft-card ${rarityClass(item)}`} key={item.id}>
                  <span className="craft-icon">
                    <GearIcon item={item} />
                  </span>
                  <div className="craft-info">
                    <span className="craft-name">{gearText(item.nameKey)}</span>
                    <span className={`durability-text${broken ? ' broken' : dur < 30 ? ' worn' : ''}`}>
                      {broken ? t('forge.broken') : t('forge.durability', { n: dur, m: MAX_DURABILITY })}
                    </span>
                    <div className="durability-bar">
                      <div className={`durability-fill${broken ? ' broken' : dur < 30 ? ' worn' : ''}`} style={{ width: `${dur}%` }} />
                    </div>
                    <div className="repair-btns">
                      <button
                        className="craft-btn forge"
                        onClick={() => onRepair(item.id, false)}
                        disabled={save.gold < cost || dur >= MAX_DURABILITY}
                        data-ui
                      >
                        {t('forge.repair')} ({cost} 🪙)
                      </button>
                      <button
                        className="craft-btn blessed"
                        onClick={() => onRepair(item.id, true)}
                        disabled={save.gold < cost || save.shards < 1 || dur >= MAX_DURABILITY}
                        data-ui
                      >
                        {t('forge.blessedRepair')} (+1 🔷)
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === 'socket' && (
          <div className="forge-body">
            {equipped.map((item) => {
              const maxSockets = socketsForTier(item.tier ?? 0);
              const list = save.sockets?.[item.id] ?? [];
              const ownedGems = GEMS.filter((g) => (save.gems?.[g.id] ?? 0) > 0);
              return (
                <div className={`craft-card ${rarityClass(item)}`} key={item.id}>
                  <span className="craft-icon">
                    <GearIcon item={item} />
                  </span>
                  <div className="craft-info">
                    <span className="craft-name">
                      {gearText(item.nameKey)}
                      <span className="socket-count">
                        {maxSockets > 0 ? ` ${list.length}/${maxSockets}` : ''}
                      </span>
                    </span>
                    {maxSockets > 0 ? (
                      <>
                        <div className="socket-slots">
                          {Array.from({ length: maxSockets }).map((_, i) => {
                            const gem = getGem(list[i] ?? '');
                            return gem ? (
                              <button className="socket filled" key={i} onClick={() => onUnsocket(item.id, i)} title={gemText(gem.nameKey)} data-ui>
                                {gem.icon}
                              </button>
                            ) : (
                              <span className="socket empty" key={i} />
                            );
                          })}
                        </div>
                        {list.length < maxSockets && ownedGems.length > 0 && (
                          <div className="socket-gem-row">
                            {ownedGems.map((g) => (
                              <button className="socket-gem-btn" key={g.id} onClick={() => onSocket(item.id, g.id)} data-ui>
                                {g.icon} ×{save.gems?.[g.id]}
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <span className="socket-none">{t('forge.noSockets')}</span>
                    )}
                  </div>
                </div>
              );
            })}
            <div className="gem-library">
              <div className="gear-section-title">{t('gems.title')}</div>
              {GEMS.map((g) => (
                <div className="gem-library-row" key={g.id}>
                  <span className="gem-library-name">
                    {g.icon} {gemText(g.nameKey)} <span className="gem-desc">{gemText(g.descKey)}</span>
                  </span>
                  <span className="gem-library-owned">×{save.gems?.[g.id] ?? 0}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <button className="modal-x" onClick={onClose} aria-label="Close" data-ui>
          ✕
        </button>
      </div>
    </div>
  );
}
