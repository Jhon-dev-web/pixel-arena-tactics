import PixelIcon from './PixelIcon';
import { Fragment, ReactNode, useEffect, useRef, useState } from 'react';
import useIsPhone from '../hooks/useIsPhone';
import Assets from '../assets.json';
import { fmtNum, t } from '../locales';
import { effectiveRepairCost, playerLevel, SaveData } from '../game/engine';
import { ownsAdventurerPass } from '../game/entitlements';
import { deepRefineText } from '../game/lateSinks';
import {
  GearItem,
  MAX_DURABILITY,
  BASE_MAX_REFINE,
  maxRefineFor,
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
import { gearInstanceLabel } from './gearLabel';
import { getMaterial, MaterialId, hasMaterials } from '../game/materials';
import { GEMS, GemId, getGem, hasGems, socketsForTier } from '../game/gems';
import { getConsumable } from '../game/consumables';
import GearIcon from './GearIcon';
import UniqueTag from './UniqueTag';
import { gearStatLines } from './gearStats';
import ItemCompare from './ItemCompare';
import { AppearanceLine } from './HeroThumb';
import { SetNote } from './SetBonus';
import MaterialIcon from './MaterialIcon';
import GemIcon from './GemIcon';
import StashHint from './StashHint';
import ConsumableIcon from './ConsumableIcon';
import { QtyPicker, CraftJobPanel } from './CraftQty';
import { clampCraftQty, craftBlock, planBatchIngredients } from '../game/craftJob';
import { ChipRow, ItemFrame, PageHeader, Panel, PrimaryButton, Screen, ScreenLayout, SecondaryButton, Tabs } from './ui';
import type { TabItem } from './ui';
import { FORGE_CLASS_FILTERS, ForgeClassFilter, matchesForgeClass } from './forgeFilter';

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

// One requirement of a recipe in the craft panel: what the hero has against what it takes.
interface ReqRow {
  key: string;
  icon: ReactNode;
  label: string;
  have: number;
  need: number;
  // a threshold (the hero level): shown as the number it takes, not "have / need"
  plain?: boolean;
  // a material that may sit in the Baú: the hint that says so
  stash?: string;
}

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
const forgeRecipes = (cat: ForgeCategory, classFilter: ForgeClassFilter = 'all'): GearItem[] =>
  gearBySlot(cat === 'axe' ? 'weapon' : cat).filter((g) => g.recipe && !g.unique && categoryOf(g) === cat && matchesForgeClass(g, classFilter));

// The brief result line of a forge / refine, glowing in the colour of its rarity (round11.css .reveal); `id` restarts the animation for every new result.
export interface ForgeReveal {
  id: number;
  text: string;
  tone: 'common' | 'rare' | 'epic' | 'legendary' | 'ok' | 'fail';
}

// The Forja as its own main-content area (like Ofícios and the Passe): a page header, the four tabs and the same lists / craft panel the old modal had.
export default function ForgeView({
  save,
  onForge,
  onCancelCraft,
  craftStalled,
  onUpgrade,
  onUpgradeWithCatalyst,
  onRepair,
  onSocket,
  onUnsocket,
  reveal = null,
  allowedTabs = ALL_TABS,
  title,
  initialTab,
  focusItemId,
}: {
  save: SaveData;
  // consumedIds: the confirmed selection of gear instances a recipe consumes (omitted = the cheapest copies).
  // qty: how many units the batch makes (the hero makes them one after another, craftJob.ts).
  onForge: (id: string, consumedIds?: string[], useSeal?: boolean, qty?: number) => void;
  // The running production job's controls (the panel at the top of the page).
  onCancelCraft?: () => void;
  craftStalled?: boolean;
  onUpgrade: (id: string) => void;
  onUpgradeWithCatalyst: (id: string) => void;
  onRepair: (id: string, blessed: boolean) => void;
  onSocket: (itemId: string, gemId: GemId) => void;
  onUnsocket: (itemId: string, index: number) => void;
  reveal?: ForgeReveal | null;
  allowedTabs?: ForgeTab[];
  title?: string;
  // Opened from an item's "Usar em...": the tab to start on and the recipe to bring into view (its category opens and the card is highlighted).
  initialTab?: ForgeTab;
  focusItemId?: string;
}) {
  const focusItem = focusItemId ? getGear(focusItemId) : undefined;
  const [tab, setTab] = useState<ForgeTab>(initialTab && allowedTabs.includes(initialTab) ? initialTab : allowedTabs[0] ?? 'forge');
  const [forgeCategory, setForgeCategoryRaw] = useState<ForgeCategory>(() => (focusItem && FORGE_CATEGORIES.includes(categoryOf(focusItem)) ? categoryOf(focusItem) : 'weapon'));
  // The class filter (Guerreiro / Arqueiro / Mago, or all): a view over every category, 'all' by default; a change drops the picked recipe like a category change does.
  const [classFilter, setClassFilterRaw] = useState<ForgeClassFilter>('all');
  const setClassFilter = (f: ForgeClassFilter) => {
    setClassFilterRaw(f);
    setSelectedId(null);
    setQty(1);
  };
  // a category change drops the picked recipe: the panel falls back to the first of the new category
  const setForgeCategory = (cat: ForgeCategory) => {
    setForgeCategoryRaw(cat);
    setSelectedId(null);
    setQty(1);
  };
  useEffect(() => {
    if (!focusItemId) return;
    document.querySelector(`[data-recipe-id="${focusItemId}"]`)?.scrollIntoView({ block: 'center' });
  }, [focusItemId]);
  const [justForged, setJustForged] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  // the recipe shown in the craft panel (the first of the category until one is picked)
  const [selectedId, setSelectedId] = useState<string | null>(focusItemId ?? null);
  const panelRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Record<string, HTMLButtonElement | null>>({});
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

  // the quantity the batch really runs: the picker's raw value held to what the hero can afford now
  const qtyFor = (id: string): number => clampCraftQty(save, 'forge', id, qty);
  const doForge = (id: string, consumedIds?: string[]) => {
    const item = getGear(id);
    const n = qtyFor(id);
    const startable = craftBlock(save, 'forge', id, n) === null;
    onForge(id, consumedIds, sealOn && sealCount > 0 && !!item && isInstancedSlot(item.slot), n);
    if (!startable) return;
    setJustForged(id);
    window.setTimeout(() => setJustForged(null), 1500);
  };

  // Crafting that would consume a piece worth keeping (refined, socketed, or above common) asks first, listing
  // exactly which pieces go.
  const handleForge = (id: string) => {
    const item = getGear(id);
    const plan = item ? planBatchIngredients(save, id, qtyFor(id)) : null;
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
    if (lvl >= maxRefineFor(item)) return false;
    const cost = upgradeCost(item, lvl);
    return (
      save.gold >= cost.gold &&
      hasMaterials(save.materials, cost.materials) &&
      save.shards >= (cost.shards ?? 0)
    );
  };

  // The recipe the craft panel shows: the picked one, else (a category change, first open) the first of the category; `focusItemId` (from "Usar em...") starts on its recipe.
  const phone = useIsPhone();
  const categoryItems = forgeRecipes(forgeCategory, classFilter);
  const current = categoryItems.find((i) => i.id === selectedId) ?? categoryItems[0] ?? null;
  const pickRecipe = (id: string) => {
    setSelectedId(id);
    setQty(1);
    // when the craft panel sits under the list (a narrow page) bring it into view; side by side it is already visible, so 'nearest' leaves the page alone
    // phone: the panel opens under the row, so bring the row to the top; narrow tablet: the panel under the list; wide: it is already on screen
    window.setTimeout(() => (phone ? rowRefs.current[id] : panelRef.current)?.scrollIntoView({ block: phone ? 'start' : 'nearest', behavior: 'smooth' }), 0);
  };

  // the requirement rows of a recipe: what the player has against what it takes
  const reqRows = (item: GearItem): ReqRow[] => {
    const rows: ReqRow[] = [{ key: 'gold', icon: <img src={Assets.icons.gold.url} alt="" />, label: t('inventory.reforgeGold'), have: save.gold, need: item.cost }];
    if ((item.recipe?.requiredLevel ?? 0) > 0) rows.push({ key: 'level', icon: <PixelIcon name="level" />, label: t('forge.levelReq', { n: item.recipe?.requiredLevel ?? 0 }), have: level, need: item.recipe?.requiredLevel ?? 0, plain: true });
    for (const [itemId, count] of Object.entries(item.recipe?.items ?? {})) {
      const g = getGear(itemId);
      rows.push({ key: `item-${itemId}`, icon: <GearIcon item={g} />, label: gearText(g.nameKey), have: countUsableInstances(save, itemId), need: count as number });
    }
    for (const [mid, count] of Object.entries(item.recipe?.materials ?? {})) {
      rows.push({ key: `mat-${mid}`, icon: <MaterialIcon item={getMaterial(mid as MaterialId)!} />, label: matText(`mat_${mid}`), have: save.materials[mid as MaterialId] ?? 0, need: count as number, stash: mid });
    }
    for (const [gid, count] of Object.entries(item.recipe?.gems ?? {})) {
      const g = getGem(gid);
      rows.push({ key: `gem-${gid}`, icon: g ? <GemIcon item={g} /> : <PixelIcon name="gem" />, label: g ? gemText(g.nameKey) : gid, have: save.gems[gid as GemId] ?? 0, need: count as number });
    }
    if ((item.recipe?.shards ?? 0) > 0) rows.push({ key: 'shards', icon: <img src="/assets/icons/shards.png" alt="" />, label: t('ui.shardsX', { n: '' }).replace(/[\d\s×x]+/g, '').trim() || t('inventory.reforgeShard'), have: save.shards, need: item.recipe?.shards ?? 0 });
    return rows;
  };

  // The craft panel of the picked recipe: the selection, what it needs, the quantity and the produce button together. Wide screens: the right column. Phone: it opens right under the picked row of the list.
  const craftPanel = current ? (
        <div className={`fg-panel-wrap${phone ? ' inline' : ''}`} ref={panelRef}>
          <Panel
            title={gearText(current.nameKey)}
            className={`fg-panel ${rarityClass(current)}`}
            icon={
              <ItemFrame size="md">
                <GearIcon item={current} />
              </ItemFrame>
            }
          >
            <div className="fg-panel-body">
              <p className="fg-desc">{gearText(current.descKey)}</p>
              <div className="gear-stat-list">
                {gearStatLines(current).map((l) => (
                  <span className={`gear-stat gear-stat-${l.kind}`} key={l.kind}>
                    {l.text}
                  </span>
                ))}
              </div>
              <AppearanceLine item={current} />
              <SetNote item={current} save={save} />
              <ItemCompare save={save} slot={current.slot} templateId={current.id} />

              <div className="fg-reqs" role="list">
                {reqRows(current).map((r) => {
                  const short = r.have < r.need;
                  return (
                    <div className="fg-req" role="listitem" key={r.key}>
                      <span className="fg-req-icon" aria-hidden>
                        {r.icon}
                      </span>
                      <span className="fg-req-label">{r.label}</span>
                      <span className={`fg-req-qty${short ? ' missing' : ''}`}>
                        {r.plain ? `${fmtNum(r.need)}` : `${fmtNum(r.have)} / ${fmtNum(r.need)}`}
                      </span>
                      {r.stash && <StashHint kind="material" id={r.stash} need={r.need} />}
                    </div>
                  );
                })}
              </div>

              {blockedByBag(current) && <span className="craft-bag-full">{t('inventory.bagFullAction')}</span>}

              {reqRows(current).some((r) => r.key.startsWith('mat-') && r.have < r.need) && <p className="fg-where-hint">{t('forge.whereHint')}</p>}

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
                  <PrimaryButton
                    block
                    onClick={() => {
                      const p = pendingForge;
                      setPendingForge(null);
                      doForge(p.id, p.ids);
                    }}
                  >
                    {t('forge.confirmForge')}
                  </PrimaryButton>
                  <SecondaryButton block onClick={() => setPendingForge(null)}>
                    {t('forge.cancel')}
                  </SecondaryButton>
                </div>
              )}

              <QtyPicker save={save} kind="forge" recipeId={current.id} qty={qty} onChange={setQty} />
              <PrimaryButton block className={justForged === current.id ? 'forged' : undefined} onClick={() => handleForge(current.id)} disabled={!canForge(current)}>
                {justForged === current.id ? t('forge.forged') : qtyFor(current.id) > 1 ? t('craft.start', { n: qtyFor(current.id) }) : t('forge.forge')}
              </PrimaryButton>
              {!canForge(current) && !blockedByBag(current) && (
                <span className="craft-bag-full fg-blocked" role="status">
                  {t('forge.missing')}
                </span>
              )}
            </div>
          </Panel>
        </div>
  ) : null;

  const tabItems: TabItem<ForgeTab>[] = [
    { id: 'forge', label: t('forge.forgeTab'), icon: <img src="/assets/icons/steel.png" alt="" /> },
    { id: 'upgrade', label: t('forge.upgradeTab'), icon: <img src="/assets/icons/refine_catalyst.png" alt="" /> },
    { id: 'repair', label: t('forge.repairTab'), icon: <img src="/assets/icons/repair_kit.png" alt="" /> },
    { id: 'socket', label: t('forge.socketTab'), icon: <img src="/assets/icons/gem_ruby.png" alt="" /> },
  ].filter((it) => allowedTabs.includes(it.id as ForgeTab)) as TabItem<ForgeTab>[];

  return (
    <Screen label={title ?? t('forge.title')} className="fg-page" data-tutorial-target="forge-modal">
      <PageHeader icon={<img className="pixel-icon" src="/assets/icons/steel.png" alt="" />} title={title ?? t('forge.title')} subtitle={t('ui.owned', { n: fmtNum(save.gold) })} />
      <div className="fg-root">
        <CraftJobPanel save={save} name={(rid) => gearText(getGear(rid)?.nameKey ?? rid)} stalled={craftStalled} onCancel={() => onCancelCraft?.()} />
        {/* a slot of its own: the result line appearing / going away never moves the list under the player's finger */}
        <div className="fg-reveal-slot" aria-live="polite">
          {reveal && (
            <div key={reveal.id} className={`forge-reveal reveal rv-${reveal.tone}`} role="status">
              {reveal.text}
            </div>
          )}
        </div>

        {tabItems.length > 1 && <Tabs<ForgeTab> items={tabItems} value={tab} onChange={setTab} label={title ?? t('forge.title')} className="fg-tabs" />}

        {tab === 'forge' && (
          <ScreenLayout
            className="fg-layout"
            main={
              <>
                <div className="fg-toolbar">
                  <ChipRow<ForgeCategory>
                    className="fg-categories"
                    label={t('forge.forgeTab')}
                    value={forgeCategory}
                    onChange={setForgeCategory}
                    items={FORGE_CATEGORIES.map((cat) => ({ id: cat, label: `${t(`forge.${CATEGORY_LABEL_KEY[cat]}`)} (${forgeRecipes(cat, classFilter).length})` }))}
                  />
                  <ChipRow<ForgeClassFilter>
                    className="fg-categories fg-classes"
                    label={t('forge.classFilter')}
                    value={classFilter}
                    onChange={setClassFilter}
                    items={FORGE_CLASS_FILTERS.map((f) => ({ id: f, label: t(`forge.class_${f}`) }))}
                  />
                  <span className="fg-space">{t('inventory.space', { n: inventorySlotsUsed(save), m: inventoryCapacity(save) })}</span>
                </div>
                {categoryItems.length === 0 ? (
                  <span className="socket-none">{t(classFilter === 'all' ? 'forge.noCategoryRecipes' : 'forge.noClassRecipes')}</span>
                ) : (
                  <div className="fg-recipes">
                    {categoryItems.map((item) => {
                      const ok = canForge(item);
                      const selected = current?.id === item.id;
                      return (
                        <Fragment key={item.id}>
                        <button
                          className={`fg-recipe ${rarityClass(item)}${selected ? ' selected' : ''}${ok ? ' ok' : ''}${item.id === focusItemId ? ' focus' : ''}`}
                          onClick={() => pickRecipe(item.id)}
                          aria-pressed={selected}
                          data-recipe-id={item.id}
                          ref={(el) => {
                            rowRefs.current[item.id] = el;
                          }}
                          data-ui
                        >
                          <ItemFrame>
                            <GearIcon item={item} />
                          </ItemFrame>
                          <span className="fg-recipe-text">
                            <span className="fg-recipe-name">{gearText(item.nameKey)}</span>
                            {item.materialKey && (
                              <span className={`gear-material ${item.materialKey.replace('material_', '')}`}>
                                {rarityIcon(item.materialKey) && <img className="rarity-icon" src={rarityIcon(item.materialKey)} alt="" />}
                                {gearText(item.materialKey)}
                              </span>
                            )}
                            <span className="fg-recipe-stats">{gearStatLines(item).map((l) => l.text).join(' · ')}</span>
                          </span>
                          {ok && (
                            <span className="fg-ready" aria-hidden>
                              ✓
                            </span>
                          )}
                        </button>
                        {phone && selected && craftPanel}
                        </Fragment>
                      );
                    })}
                  </div>
                )}
              </>
            }
            side={phone ? undefined : craftPanel}
          />
        )}

        {tab === 'upgrade' && (
          <div className="fg-list">
            {gearList.length === 0 && <span className="socket-none">{t('forge.noGear')}</span>}
            {gearList.map((inst) => {
              const item = getGear(inst.templateId);
              const lvl = clampRefine(inst.upgrade);
              const isMax = lvl >= maxRefineFor(item);
              const cost = upgradeCost(item, lvl);
              const chance = Math.round(upgradeChance(lvl) * 100);
              return (
                <div className={`fg-card ${rarityClass(item)}`} key={inst.id}>
                  <ItemFrame rarity={inst.rarity} qty={lvl > 0 ? `+${lvl}` : undefined}>
                    <GearIcon item={item} />
                  </ItemFrame>
                  <div className="fg-card-info">
                    <span className="craft-name">
                      {gearText(item.nameKey)}
                      {instanceTag(inst)}
                    </span>
                    <span className="craft-desc">{gearStatLines(item, lvl, inst.rarity).map((l) => l.text).join(' · ')}</span>
                    <ItemCompare save={save} slot={item.slot} templateId={item.id} instance={inst} />
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
                            <span className={`req-amount${save.shards < (cost.shards ?? 0) ? ' missing' : ''}`}>{t('ui.shardsX', { n: cost.shards ?? 0 })}</span>
                          </span>
                        )}
                      </div>
                    )}
                    {!isMax && <span className="upgrade-chance">{t('forge.chance', { n: chance })}</span>}
                    {!isMax && lvl >= BASE_MAX_REFINE && <span className="upgrade-chance deep-note">{t(deepRefineText().key, deepRefineText().params)}</span>}
                  </div>
                  <div className="fg-card-actions">
                    {isMax ? (
                      <SecondaryButton disabled>{t('forge.max')}</SecondaryButton>
                    ) : (
                      <>
                        <PrimaryButton onClick={() => onUpgrade(inst.id)} disabled={!canUpgrade(inst)}>
                          {t('forge.upgrade')}
                        </PrimaryButton>
                        {catalystCount > 0 && lvl < BASE_MAX_REFINE && (
                          <SecondaryButton
                            onClick={() => onUpgradeWithCatalyst(inst.id)}
                            disabled={!canUpgrade(inst)}
                            title={t('forge.catalystHint')}
                            icon={<ConsumableIcon item={getConsumable('refine_catalyst')!} className="inline-icon" />}
                          >
                            {t('forge.useCatalyst')}
                          </SecondaryButton>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === 'repair' && (
          <div className="fg-list">
            {gearList.length === 0 && <span className="socket-none">{t('forge.noGear')}</span>}
            {gearList.map((inst) => {
              const item = getGear(inst.templateId);
              const dur = inst.durability;
              const broken = dur <= 0;
              const cost = effectiveRepairCost(save, item.tier ?? 0);
              const discounted = ownsAdventurerPass(save);
              const lvl = clampRefine(inst.upgrade);
              return (
                <div className={`fg-card ${rarityClass(item)}`} key={inst.id}>
                  <ItemFrame rarity={inst.rarity} qty={lvl > 0 ? `+${lvl}` : undefined}>
                    <GearIcon item={item} />
                  </ItemFrame>
                  <div className="fg-card-info">
                    <span className="craft-name">
                      {gearText(item.nameKey)}
                      {instanceTag(inst)}
                    </span>
                    <span className={`durability-text${broken ? ' broken' : dur < 30 ? ' worn' : ''}`}>{broken ? t('forge.broken') : t('forge.durability', { n: dur, m: MAX_DURABILITY })}</span>
                    <div className="durability-bar">
                      <div className={`durability-fill${broken ? ' broken' : dur < 30 ? ' worn' : ''}`} style={{ width: `${dur}%` }} />
                    </div>
                  </div>
                  <div className="fg-card-actions">
                    <PrimaryButton onClick={() => onRepair(inst.id, false)} disabled={save.gold < cost || dur >= MAX_DURABILITY}>
                      <span>{t('forge.repair')}</span>
                      <span className="repair-cost">
                        (<img className="inline-icon" src={Assets.icons.gold.url} alt="" /> {fmtNum(cost)}
                        {discounted && <span className="repair-discount-tag"> -20%</span>})
                      </span>
                    </PrimaryButton>
                    <SecondaryButton onClick={() => onRepair(inst.id, true)} disabled={save.gold < cost || save.shards < 1 || dur >= MAX_DURABILITY}>
                      <span>{t('forge.blessedRepair')}</span>
                      <span className="repair-cost">
                        (+1 <img className="inline-icon" src="/assets/icons/shards.png" alt="" />)
                      </span>
                    </SecondaryButton>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === 'socket' && (
          <div className="fg-list">
            {gearList.length === 0 && <span className="socket-none">{t('forge.noGear')}</span>}
            {gearList.map((inst) => {
              const item = getGear(inst.templateId);
              const maxSockets = socketsForTier(item.tier ?? 0);
              const list = inst.sockets;
              const ownedGems = GEMS.filter((g) => (save.gems?.[g.id] ?? 0) > 0);
              const lvl = clampRefine(inst.upgrade);
              return (
                <div className={`fg-card socket-card ${rarityClass(item)}`} key={inst.id}>
                  <ItemFrame rarity={inst.rarity} qty={lvl > 0 ? `+${lvl}` : undefined}>
                    <GearIcon item={item} />
                  </ItemFrame>
                  <div className="fg-card-info">
                    <span className="craft-name">
                      {gearText(item.nameKey)}
                      {instanceTag(inst)}
                      <span className="socket-count">{maxSockets > 0 ? ` ${list.length}/${maxSockets}` : ''}</span>
                    </span>
                    {maxSockets > 0 ? (
                      <>
                        <div className="socket-slots">
                          {Array.from({ length: maxSockets }).map((_, i) => {
                            const gem = getGem(list[i] ?? '');
                            return gem ? (
                              <button className="socket filled" key={i} onClick={() => onUnsocket(inst.id, i)} title={gemText(gem.nameKey)} aria-label={gemText(gem.nameKey)} data-ui>
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
                              <button
                                className="socket-gem-btn"
                                key={g.id}
                                onClick={() => onSocket(inst.id, g.id)}
                                title={`${gemText(g.nameKey)}: ${gemText(g.descKey)}`}
                                aria-label={t('forge.socketGem', { name: gemText(g.nameKey), effect: gemText(g.descKey) })}
                                data-ui
                              >
                                <GemIcon item={g} className="inline-icon" />
                                <span className="socket-gem-text">
                                  <span className="socket-gem-name">{gemText(g.nameKey)}</span>
                                  <span className="socket-gem-effect">{gemText(g.descKey)}</span>
                                </span>
                                <span className="socket-gem-qty">×{save.gems?.[g.id]}</span>
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
            <Panel tone="inset" title={t('gems.title')} className="gem-library">
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
            </Panel>
          </div>
        )}
      </div>
    </Screen>
  );
}
