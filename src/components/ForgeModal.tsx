import { useEffect, useState } from 'react';
import Assets from '../assets.json';
import { fmtNum, t } from '../locales';
import { effectiveRepairCost, playerLevel, SaveData } from '../game/engine';
import { ownsAdventurerPass } from '../game/entitlements';
import {
  GearItem,
  MAX_DURABILITY,
  MAX_REFINE,
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
  applyForge,
} from '../game/gearInstances';
import { inventoryCapacity, inventorySlotsUsed } from '../game/inventory';
import { rarityDef } from '../game/rarity';
import { gearInstanceLabel, refineTag } from './gearLabel';
import { getMaterial, MaterialId, hasMaterials } from '../game/materials';
import { GEMS, GemId, getGem, hasGems, socketsForTier } from '../game/gems';
import { getConsumable } from '../game/consumables';
import GearIcon from './GearIcon';
import UniqueTag from './UniqueTag';
import { gearStatLines } from './gearStats';
import MaterialIcon from './MaterialIcon';
import GemIcon from './GemIcon';
import StashHint from './StashHint';
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

// The "Forjar" tab groups recipes by their real GearSlot (see gear.ts), so this is a display grouping of the
// existing gear data, not a new taxonomy. Unique (drop-only) pieces have no recipe and never show here.
// 'axe' is the second weapon line (gear.ts `line: 'axe'`), shown as its own tab next to the swords.
type ForgeCategory = 'weapon' | 'axe' | 'armor' | 'shield' | 'helmet' | 'gloves' | 'boots' | 'ring' | 'relic';
const FORGE_CATEGORIES: ForgeCategory[] = ['weapon', 'axe', 'armor', 'shield', 'helmet', 'gloves', 'boots', 'ring', 'relic'];
const CATEGORY_LABEL_KEY: Record<ForgeCategory, string> = {
  weapon: 'weaponsSection',
  axe: 'axesSection',
  shield: 'shieldsSection',
  armor: 'armorSection',
  helmet: 'helmetsSection',
  gloves: 'glovesSection',
  boots: 'bootsSection',
  ring: 'ringsSection',
  relic: 'relicsSection',
};
const categoryOf = (g: GearItem): ForgeCategory => (g.line === 'axe' ? 'axe' : (g.slot as ForgeCategory));
const forgeRecipes = (cat: ForgeCategory): GearItem[] => gearBySlot(cat === 'axe' ? 'weapon' : cat).filter((g) => g.recipe && !g.unique && categoryOf(g) === cat);

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
  initialTab,
  focusItemId,
}: {
  save: SaveData;
  // consumedIds: the confirmed selection of gear instances a recipe consumes (omitted = the cheapest copies).
  onForge: (id: string, consumedIds?: string[], useSeal?: boolean) => void;
  onUpgrade: (id: string) => void;
  onUpgradeWithCatalyst: (id: string) => void;
  onRepair: (id: string, blessed: boolean) => void;
  onSocket: (itemId: string, gemId: GemId) => void;
  onUnsocket: (itemId: string, index: number) => void;
  onClose: () => void;
  allowedTabs?: ForgeTab[];
  title?: string;
  icon?: string;
  // Opened from an item's "Usar em...": the tab to start on and the recipe to bring into view (its category opens and the card is highlighted).
  initialTab?: ForgeTab;
  focusItemId?: string;
}) {
  const focusItem = focusItemId ? getGear(focusItemId) : undefined;
  const [tab, setTab] = useState<ForgeTab>(initialTab && allowedTabs.includes(initialTab) ? initialTab : allowedTabs[0] ?? 'forge');
  const [forgeCategory, setForgeCategory] = useState<ForgeCategory>(() => (focusItem && FORGE_CATEGORIES.includes(categoryOf(focusItem)) ? categoryOf(focusItem) : 'weapon'));
  useEffect(() => {
    if (!focusItemId) return;
    document.querySelector(`[data-recipe-id="${focusItemId}"]`)?.scrollIntoView({ block: 'center' });
  }, [focusItemId]);
  const [justForged, setJustForged] = useState<string | null>(null);
  const [pendingForge, setPendingForge] = useState<{ id: string; ids: string[] } | null>(null);
  // Blacksmith's Seal (season reward): the toggle is on offer only while one is held; the forge spends it only when the forge really happens (gearInstances.applyForge).
  const sealCount = save.consumables?.forge_seal ?? 0;
  const [sealOn, setSealOn] = useState(false);
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
    // the result must fit the inventory (the forge itself decides: it counts the stacks the materials come out of)
    if (applyForge(save, item.id, { level }).reason === 'capacity') return false;
    if ((item.recipe?.shards ?? 0) > 0 && save.shards < (item.recipe?.shards ?? 0)) return false;
    return true;
  };

  // Only the shared inventory stands in the way (everything else is in order): the card says so instead of just greying out.
  const blockedByBag = (item: GearItem): boolean => save.gold >= item.cost && applyForge(save, item.id, { level }).reason === 'capacity';

  const doForge = (id: string, consumedIds?: string[]) => {
    const item = getGear(id);
    onForge(id, consumedIds, sealOn && sealCount > 0 && !!item && isInstancedSlot(item.slot));
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
      <UniqueTag templateId={inst.templateId} />
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
        <p className="shop-gold">{t('ui.owned', { n: fmtNum(save.gold) })}</p>

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
            <p className="shop-space">{t('inventory.space', { n: inventorySlotsUsed(save), m: inventoryCapacity(save) })}</p>
            {pendingForge && (
              <div className="salvage-preview forge-confirm">
                <span className="salvage-preview-label">{t('forge.confirmIngredients')}</span>
                {pendingForge.ids
                  .filter((id) => save.gearInstances[id])
                  .map((id) => (
                    <span className="floor-drop forge-confirm-item" key={id}>
                      <span className="forge-confirm-name">
                        {gearInstanceLabel(save.gearInstances[id])}
                        <UniqueTag templateId={save.gearInstances[id].templateId} />
                      </span>
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
            <div className="forge-tabs forge-category-tabs">
              {FORGE_CATEGORIES.map((cat) => {
                const count = forgeRecipes(cat).length;
                return (
                  <button
                    key={cat}
                    className={`tab${forgeCategory === cat ? ' active' : ''}`}
                    onClick={() => setForgeCategory(cat)}
                    data-ui
                  >
                    {t(`forge.${CATEGORY_LABEL_KEY[cat]}`)} ({count})
                  </button>
                );
              })}
            </div>
            {sealCount > 0 && forgeCategory !== 'relic' && (
              <button className={`forge-seal-toggle${sealOn ? ' on' : ''}`} onClick={() => setSealOn(!sealOn)} aria-pressed={sealOn} data-ui>
                <img className="forge-seal-icon" src="/assets/icons/forge_seal.png" alt="" />
                <span className="forge-seal-text">
                  <span className="forge-seal-name">{t('forge.useSeal')}</span>
                  <span className="forge-seal-hint">{t('forge.sealHint', { n: sealCount })}</span>
                </span>
                <span className="forge-seal-state">{sealOn ? t('forge.sealOn') : t('forge.sealOff')}</span>
              </button>
            )}
            {(() => {
              const items = forgeRecipes(forgeCategory);
              if (items.length === 0) {
                return <span className="socket-none">{t('forge.noCategoryRecipes')}</span>;
              }
              return (
                <div className="gear-section">
                  {items.map((item) => {
                    const ok = canForge(item);
                    const forged = justForged === item.id;
                    return (
                      <div className={`craft-card ${rarityClass(item)}${item.id === focusItemId ? ' focus' : ''}`} key={item.id} data-recipe-id={item.id}>
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
                          <span className="craft-stats">{gearStatLines(item).map((l) => l.text).join(' · ')}</span>
                          {blockedByBag(item) && <span className="craft-bag-full">{t('inventory.bagFullAction')}</span>}
                          <div className="craft-req">
                            <span className="req-item">
                              <span className="mat-icon">
                                <img src={Assets.icons.gold.url} alt="" />
                              </span>
                              <span className={`req-amount${save.gold < item.cost ? ' missing' : ''}`}>{fmtNum(item.cost)}</span>
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
                                    {gearText(g.nameKey)}: {fmtNum(have)}/{fmtNum(need)}
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
                                  <StashHint kind="material" id={mid} need={need} />
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
            })()}
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
                      {gearStatLines(item, lvl).map((l) => l.text).join(' · ')}
                    </span>
                    {!isMax && (
                      <div className="craft-req">
                        <span className="req-item">
                          <span className="mat-icon">
                            <img src={Assets.icons.gold.url} alt="" />
                          </span>
                          <span className={`req-amount${save.gold < cost.gold ? ' missing' : ''}`}>{fmtNum(cost.gold)}</span>
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
                              <StashHint kind="material" id={mid} need={need} />
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
              const cost = effectiveRepairCost(save, item.tier ?? 0);
              const discounted = ownsAdventurerPass(save);
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
                          (<img className="inline-icon" src={Assets.icons.gold.url} alt="" /> {fmtNum(cost)}
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
