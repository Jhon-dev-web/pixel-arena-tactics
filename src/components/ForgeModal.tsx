import { useState } from 'react';
import Assets from '../assets.json';
import { t } from '../locales';
import { effectiveRepairCost, isBattlePassActive, playerLevel, SaveData } from '../game/engine';
import {
  GEAR_SLOTS,
  GearItem,
  MAX_DURABILITY,
  MAX_REFINE,
  effectiveDamage,
  effectiveMaxHp,
  gearBySlot,
  getGear,
  isInstancedSlot,
  upgradeChance,
  upgradeCost,
} from '../game/gear';
import {
  GearInstance,
  clampRefine,
  countUsableInstances,
  gearInstanceCount,
  isInstanceEquipped,
  isRelevantInstance,
  listGearInstances,
  maxGearInstances,
  planForgeIngredients,
} from '../game/gearInstances';
import { rarityDef } from '../game/rarity';
import { gearInstanceLabel, refineTag } from './gearLabel';
import { getMaterial, MaterialId, hasMaterials } from '../game/materials';
import { GEMS, GemId, getGem, hasGems, socketsForTier } from '../game/gems';
import { getConsumable } from '../game/consumables';
import GearIcon from './GearIcon';
import MaterialIcon from './MaterialIcon';
import GemIcon from './GemIcon';
import ConsumableIcon from './ConsumableIcon';

const gearText = (k: string): string => t(`gear.${k}`);
const matText = (k: string): string => t(`materials.${k}`);
const gemText = (k: string): string => t(`gems.${k}`);

function rarityIcon(key: string): string {
  switch (key) {
    case 'material_bronze':
    case 'material_iron':
      return Assets.icons.ore.url;
    case 'material_steel':
      return Assets.icons.steel.url;
    case 'material_dragon':
      return Assets.icons.dragon_scales.url;
    case 'material_obsidian':
      return '/assets/icons/ore_obsidian.png';
    case 'material_gold':
      return '/assets/icons/ore_gold.png';
    default:
      return '';
  }
}

const rarityClass = (g: GearItem): string => `rarity-${g.materialKey?.replace('material_', '') ?? 'default'}`;

export type ForgeTab = 'forge' | 'upgrade' | 'repair' | 'socket';
const ALL_TABS: ForgeTab[] = ['forge', 'upgrade', 'repair', 'socket'];

export default function ForgeModal({
  save,
  onForge,
  onUpgrade,
  onUpgradeWithCatalyst,
  onRepair,
  onSocket,
  onUnsocket,
  onClose,
  allowedTabs = ALL_TABS,
  title,
  icon = '⚒️',
}: {
  save: SaveData;
  // consumedIds: the confirmed selection of gear instances a recipe consumes (omitted = the cheapest copies).
  onForge: (id: string, consumedIds?: string[]) => void;
  onUpgrade: (id: string) => void;
  onUpgradeWithCatalyst: (id: string) => void;
  onRepair: (id: string, blessed: boolean) => void;
  onSocket: (itemId: string, gemId: GemId) => void;
  onUnsocket: (itemId: string, index: number) => void;
  onClose: () => void;
  allowedTabs?: ForgeTab[];
  title?: string;
  icon?: string;
}) {
  const [tab, setTab] = useState<ForgeTab>(allowedTabs[0] ?? 'forge');
  const [justForged, setJustForged] = useState<string | null>(null);
  const [pendingForge, setPendingForge] = useState<{ id: string; ids: string[] } | null>(null);
  const catalystCount = save.consumables?.refine_catalyst ?? 0;

  const level = playerLevel(save.xp);

  const canForge = (item: GearItem): boolean => {
    if (save.gold < item.cost) return false;
    if (level < (item.recipe?.requiredLevel ?? 0)) return false;
    if (!hasMaterials(save.materials, item.recipe?.materials)) return false;
    if (!hasGems(save.gems, item.recipe?.gems)) return false;
    const plan = planForgeIngredients(save, item);
    if (!plan) return false;
    if (isInstancedSlot(item.slot) && gearInstanceCount(save) - plan.length + 1 > maxGearInstances()) return false;
    if ((item.recipe?.shards ?? 0) > 0 && save.shards < (item.recipe?.shards ?? 0)) return false;
    return true;
  };

  const doForge = (id: string, consumedIds?: string[]) => {
    onForge(id, consumedIds);
    setJustForged(id);
    window.setTimeout(() => setJustForged(null), 1500);
  };

  // Crafting that would consume a piece worth keeping (refined, socketed, or above common) asks first, listing
  // exactly which pieces go.
  const handleForge = (id: string) => {
    const item = getGear(id);
    const plan = item ? planForgeIngredients(save, item) : null;
    if (plan && plan.some(isRelevantInstance)) {
      setPendingForge({ id, ids: plan.map((i) => i.id) });
      return;
    }
    doForge(id);
  };

  // Every weapon / armor the player owns is its own piece; Upgrade / Repair / Gems act on the one chosen.
  const gearList = listGearInstances(save);
  const instanceTag = (inst: GearInstance) => (
    <>
      {inst.rarity !== 'common' && <span className={`rarity-line r-${inst.rarity}`}> {t(`rarity.${rarityDef(inst.rarity).nameKey}`)}</span>}
      {isInstanceEquipped(save, inst.id) && <span className="socket-count"> ✓ {t('forge.equipped')}</span>}
    </>
  );

  const canUpgrade = (inst: GearInstance): boolean => {
    const item = getGear(inst.templateId);
    const lvl = clampRefine(inst.upgrade);
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
      <div className="modal forge-modal" data-tutorial-target="forge-modal">
        <h2 className="modal-title">
          {/* A 15px inline sword sprite reads as a stray "!"/vertical dash at this size (confirmed
              live — it loads fine, it's just illegible that small), not worth the misread risk for
              a purely decorative title icon. Reuse the hammer emoji already used for Forge elsewhere. */}
          <span className="inline-icon-emoji">{icon}</span> {title ?? t('forge.title')}
        </h2>
        <p className="shop-gold">{t('ui.owned', { n: save.gold })}</p>

        {allowedTabs.length > 1 && (
        <div className="forge-tabs">
          {allowedTabs.includes('forge') && (
            <button className={`tab${tab === 'forge' ? ' active' : ''}`} onClick={() => setTab('forge')} data-ui>
              {t('forge.forgeTab')}
            </button>
          )}
          {allowedTabs.includes('upgrade') && (
            <button className={`tab${tab === 'upgrade' ? ' active' : ''}`} onClick={() => setTab('upgrade')} data-ui>
              {t('forge.upgradeTab')}
            </button>
          )}
          {allowedTabs.includes('repair') && (
            <button className={`tab${tab === 'repair' ? ' active' : ''}`} onClick={() => setTab('repair')} data-ui>
              {t('forge.repairTab')}
            </button>
          )}
          {allowedTabs.includes('socket') && (
            <button className={`tab${tab === 'socket' ? ' active' : ''}`} onClick={() => setTab('socket')} data-ui>
              <img className="inline-icon" src="/assets/icons/gem_ruby.png" alt="" /> {t('forge.socketTab')}
            </button>
          )}
        </div>
        )}

        {tab === 'forge' && (
          <div className="forge-body">
            <p className="shop-space">{t('forge.gearSpace', { n: gearInstanceCount(save), m: maxGearInstances() })}</p>
            {pendingForge && (
              <div className="salvage-preview forge-confirm">
                <span className="salvage-preview-label">{t('forge.confirmIngredients')}</span>
                {pendingForge.ids
                  .filter((id) => save.gearInstances[id])
                  .map((id) => (
                    <span className="floor-drop forge-confirm-item" key={id}>
                      <span className="forge-confirm-name">{gearInstanceLabel(save.gearInstances[id])}</span>
                      {save.gearInstances[id].sockets.length > 0 && (
                        <span className="forge-confirm-gems">
                          {t('forge.gemsBack', {
                            list: save.gearInstances[id].sockets.map((g) => gemText(getGem(g)?.nameKey ?? g)).join(', '),
                          })}
                        </span>
                      )}
                    </span>
                  ))}
                <button
                  className="craft-btn forge"
                  onClick={() => {
                    const p = pendingForge;
                    setPendingForge(null);
                    doForge(p.id, p.ids);
                  }}
                  data-ui
                >
                  {t('forge.confirmForge')}
                </button>
                <button className="craft-btn" onClick={() => setPendingForge(null)} data-ui>
                  {t('forge.cancel')}
                </button>
              </div>
            )}
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
                              const have = countUsableInstances(save, itemId);
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
                                  <span className="mat-icon">{g ? <GemIcon item={g} /> : '💎'}</span>
                                  <span className={`req-amount${have < need ? ' missing' : ''}`}>
                                    {need}× {g ? gemText(g.nameKey) : gid}
                                  </span>
                                </span>
                              );
                            })}
                            {(item.recipe?.shards ?? 0) > 0 && (
                              <span className="req-item">
                                <span className="req-plus">+</span>
                                <span className="mat-icon shard">
                                  <img src="/assets/icons/shards.png" alt="" />
                                </span>
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
            {gearList.length === 0 && <span className="socket-none">{t('forge.noGear')}</span>}
            {gearList.map((inst) => {
              const item = getGear(inst.templateId);
              const lvl = clampRefine(inst.upgrade);
              const isMax = lvl >= MAX_REFINE;
              const cost = upgradeCost(item, lvl);
              const chance = Math.round(upgradeChance(lvl) * 100);
              const stat = item.slot === 'weapon' ? effectiveDamage(item, lvl) : effectiveMaxHp(item, lvl);
              return (
                <div className={`craft-card ${rarityClass(item)}`} key={inst.id}>
                  <span className="craft-icon">
                    <GearIcon item={item} />
                  </span>
                  <div className="craft-info">
                    <div className="craft-header">
                      <span className="craft-name">
                        {gearText(item.nameKey)}
                        <span className="refine-tag">{refineTag(lvl)}</span>
                        {instanceTag(inst)}
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
                            <span className="mat-icon shard">
                              <img src="/assets/icons/shards.png" alt="" />
                            </span>
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
                    <div className="repair-btns upgrade-btns">
                      <button
                        className="craft-btn forge repair-action-btn"
                        onClick={() => onUpgrade(inst.id)}
                        disabled={!canUpgrade(inst)}
                        data-ui
                      >
                        {t('forge.upgrade')}
                      </button>
                      {catalystCount > 0 && (
                        <button
                          className="craft-btn blessed repair-action-btn"
                          onClick={() => onUpgradeWithCatalyst(inst.id)}
                          disabled={!canUpgrade(inst)}
                          data-ui
                          title={t('forge.catalystHint')}
                        >
                          <ConsumableIcon item={getConsumable('refine_catalyst')!} className="inline-icon" />
                          <span>{t('forge.useCatalyst')}</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {tab === 'repair' && (
          <div className="forge-body">
            {gearList.length === 0 && <span className="socket-none">{t('forge.noGear')}</span>}
            {gearList.map((inst) => {
              const item = getGear(inst.templateId);
              const dur = inst.durability;
              const broken = dur <= 0;
              const cost = effectiveRepairCost(save, item.tier ?? 0, Date.now());
              const discounted = isBattlePassActive(save, Date.now());
              return (
                <div className={`craft-card ${rarityClass(item)}`} key={inst.id}>
                  <span className="craft-icon">
                    <GearIcon item={item} />
                  </span>
                  <div className="craft-info">
                    <span className="craft-name">
                      {gearText(item.nameKey)}
                      <span className="refine-tag">{refineTag(clampRefine(inst.upgrade))}</span>
                      {instanceTag(inst)}
                    </span>
                    <span className={`durability-text${broken ? ' broken' : dur < 30 ? ' worn' : ''}`}>
                      {broken ? t('forge.broken') : t('forge.durability', { n: dur, m: MAX_DURABILITY })}
                    </span>
                    <div className="durability-bar">
                      <div className={`durability-fill${broken ? ' broken' : dur < 30 ? ' worn' : ''}`} style={{ width: `${dur}%` }} />
                    </div>
                    <div className="repair-btns">
                      <button
                        className="craft-btn forge repair-action-btn"
                        onClick={() => onRepair(inst.id, false)}
                        disabled={save.gold < cost || dur >= MAX_DURABILITY}
                        data-ui
                      >
                        <span>{t('forge.repair')}</span>
                        <span className="repair-cost">
                          (<img className="inline-icon" src={Assets.icons.gold.url} alt="" /> {cost}
                          {discounted && <span className="repair-discount-tag"> -20%</span>})
                        </span>
                      </button>
                      <button
                        className="craft-btn blessed repair-action-btn"
                        onClick={() => onRepair(inst.id, true)}
                        disabled={save.gold < cost || save.shards < 1 || dur >= MAX_DURABILITY}
                        data-ui
                      >
                        <span>{t('forge.blessedRepair')}</span>
                        <span className="repair-cost">
                          (+1 <img className="inline-icon" src="/assets/icons/shards.png" alt="" />)
                        </span>
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
            {gearList.length === 0 && <span className="socket-none">{t('forge.noGear')}</span>}
            {gearList.map((inst) => {
              const item = getGear(inst.templateId);
              const maxSockets = socketsForTier(item.tier ?? 0);
              const list = inst.sockets;
              const ownedGems = GEMS.filter((g) => (save.gems?.[g.id] ?? 0) > 0);
              return (
                <div className={`craft-card ${rarityClass(item)}`} key={inst.id}>
                  <span className="craft-icon">
                    <GearIcon item={item} />
                  </span>
                  <div className="craft-info">
                    <span className="craft-name">
                      {gearText(item.nameKey)}
                      <span className="refine-tag">{refineTag(clampRefine(inst.upgrade))}</span>
                      {instanceTag(inst)}
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
                              <button className="socket filled" key={i} onClick={() => onUnsocket(inst.id, i)} title={gemText(gem.nameKey)} data-ui>
                                <GemIcon item={gem} className="inline-icon" />
                              </button>
                            ) : (
                              <span className="socket empty" key={i} />
                            );
                          })}
                        </div>
                        {list.length < maxSockets && ownedGems.length > 0 && (
                          <div className="socket-gem-row">
                            {ownedGems.map((g) => (
                              <button className="socket-gem-btn" key={g.id} onClick={() => onSocket(inst.id, g.id)} data-ui>
                                <GemIcon item={g} className="inline-icon" /> ×{save.gems?.[g.id]}
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
                  <div className="gem-library-top">
                    <span className="gem-library-name">
                      <GemIcon item={g} className="inline-icon" /> {gemText(g.nameKey)}
                    </span>
                    <span className="gem-library-owned">×{save.gems?.[g.id] ?? 0}</span>
                  </div>
                  <span className="gem-desc">{gemText(g.descKey)}</span>
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
