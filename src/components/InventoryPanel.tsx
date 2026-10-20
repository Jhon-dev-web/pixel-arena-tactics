import { useContext, useEffect, useState } from 'react';
import { useConfirmKeys } from '../hooks/useConfirmKeys';
import { fmtNum, t } from '../locales';
import { BUFF_ITEM, buffRemainingMs, isBuffActive } from '../game/buffs';
import type { ConsumableId } from '../game/consumables';
import { SaveData } from '../game/engine';
import { GEAR, GearItem, getGear, isInstancedSlot } from '../game/gear';
import { canAffordReforge, getReforgeCost } from '../game/reforge';
import T from '../game/tunables';
import { isPouchId, pouchFace } from '../game/goldPouch';
import PouchOpenButton from './PouchOpenButton';
import { type GearInstance, clampRefine, isInstanceEquipped, isTradeable, isTradeableKind, listGearInstances, tradeBlockReason, needsBindConfirm, equipLevelBlock, resolveGearInstance, salvageBlockReason } from '../game/gearInstances';
import { certState, useCertificatesVersion, verifiedPouchCount } from '../game/itemCerts';
import { MATERIALS, MaterialId, getMaterial } from '../game/materials';
import { getSalvageReturn, hasSalvageValue } from '../game/salvage';
import { CONSUMABLES, getConsumable } from '../game/consumables';
import { inventoryCapacity, inventorySlotsUsed, nextExpansion, STACK_LIMIT, slotsForQty } from '../game/inventory';
import { stashCapacity, stashCount, stashSlotsUsed } from '../game/stash';
import StackActions, { StashTake } from './StackActions';
import StashPane from './StashPane';
import { BagContext } from './bagContext';
import { Rarity, rarityDef, substatNameKey } from '../game/rarity';
import { fmtSubstat } from './substatText';
import GearIcon from './GearIcon';
import MaterialIcon from './MaterialIcon';
import ConsumableIcon from './ConsumableIcon';
import { gearInstanceLabel, refineTag } from './gearLabel';
import { gearStatLines } from './gearStats';
import ItemCompare from './ItemCompare';
import UniqueTag from './UniqueTag';
import { AppearanceLine } from './HeroThumb';
import { SetNote } from './SetBonus';
import StashHint from './StashHint';
import LapidarPanel from './LapidarPanel';
import { Button, Chip, ChipRow, Dialog, SearchField, StatList, StatRow, Tabs } from './ui';
import { normalOf, tradeableOf } from '../game/tradeableMaterials';

// The inventory grid + detail panel — extracted from what used to be InventoryModal's whole body, so
// the Personagem view (embedded, no modal chrome) and the still-existing quick-access "Inventário"
// modal (InventoryModal.tsx, kept for direct sidebar access) render the exact same component, same
// state, same handlers. No new inventory, no duplicated source of truth.

const gearText = (k: string): string => t(`gear.${k}`);
const matText = (k: string): string => t(`materials.${k}`);
const conText = (k: string): string => t(`consumables.${k}`);

// The quiet tag on a tile: only where it tells the player something - a piece that could be sold (not bound yet, and the SERVER confirms its certificate), or an Epic / Legendary / unique
// piece that is already bound. Common and rare forged pieces are never tradeable anyway and carry no tag on the tile.
const tradeTag = (inst: GearInstance): 'tradeable' | 'bound' | null => {
  if (isTradeable(inst) && certState(inst) === 'verified') return 'tradeable';
  return inst.bound && (inst.rarity === 'epic' || inst.rarity === 'legendary' || !!getGear(inst.templateId)?.unique) ? 'bound' : null;
};

// What the detail says about selling the piece: bound, tradeable AND certified by the server, "certificate not confirmed", a piece that could be sold but has no certificate (old, or made
// offline), or simply not tradeable.
type TradeLine = 'bound' | 'tradeable' | 'unverified' | 'nocert' | 'untradeable';
const TRADE_LINE_KEY: Record<TradeLine, string> = { bound: 'bound', tradeable: 'certified', unverified: 'certUnverified', nocert: 'noCertificate', untradeable: 'untradeable' };
function tradeLine(inst: GearInstance): TradeLine {
  if (inst.bound) return 'bound';
  if (!isTradeableKind(inst)) return 'untradeable';
  const state = certState(inst);
  return state === 'verified' ? 'tradeable' : state === 'unverified' ? 'unverified' : 'nocert';
}

const rarityClass = (g: GearItem): string => `rarity-${g.materialKey?.replace('material_', '') ?? 'default'}`;
const rarClass = (r: Rarity | undefined): string => `r-${r ?? 'common'}`;
// Everything the bag can use by itself: every timed elixir / tonic (buffs.ts BUFF_ITEM) and the Whetstone Oil. Fertilizer is used on a Garden plot.
const MANUALLY_USABLE = new Set<string>(['whetstone_oil', 'repair_kit', 'master_repair_kit', 'stash_deed', ...Object.keys(BUFF_ITEM)]);

function formatBuffLeft(ms: number): string {
  const m = Math.ceil(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`;
}

type SelKind = 'gear' | 'material' | 'consumable';
type Variant = 'normal' | 'tradeable';

// A type holding more than one stack of STACK_LIMIT occupies several slots: the unit count shown in each of them.
const stackCells = (qty: number): number[] => Array.from({ length: slotsForQty(qty) }, (_, i) => Math.min(STACK_LIMIT, qty - i * STACK_LIMIT));

export default function InventoryPanel({
  save,
  onEquip,
  onUnequip,
  onDiscard,
  onReforge,
  onLapidar,
  onSalvage,
  onUseConsumable,
  onExpand,
  layout = 'compact',
}: {
  save: SaveData;
  onEquip: (id: string) => void;
  onUnequip: (id: string) => void;
  // kind 'gear' with an instance id discards that piece; qty only matters for stacks. `variant` 'tradeable': the units come from the tradeable stack of a material (tradeableMaterials.ts)
  onDiscard: (kind: SelKind, id: string, qty?: number | 'all', variant?: Variant) => void;
  onReforge: (id: string) => void;
  onLapidar: (id: string, lockIndex: number) => void;
  onSalvage: (id: string) => void;
  onUseConsumable: (id: string) => void;
  onExpand: () => void;
  // 'wide': the bag and the item detail side by side when the screen is wide enough (the Inventory screen); 'compact': the grid on its own, the detail below it (a wide screen) or as a sheet (a phone) - embedded in Personagem.
  layout?: 'wide' | 'compact';
}) {
  // stash / merchant / "Usar em..." actions come from App through the context (see bagContext.ts)
  const bag = useContext(BagContext);
  useCertificatesVersion(); // the server's list of certificates changed: the "Certificado" lines follow it
  const [tab, setTab] = useState<'all' | 'equipment' | 'materials' | 'consumables' | 'tradeable'>('all');
  // src: where the picked stack lives (the inventory or the Baú). Phones show one pane at a time.
  // variant: a material's tradeable stack is a stack of its own (the same icon, a badge, its own actions)
  const [selected, setSelected] = useState<{ src: 'bag' | 'stash'; kind: SelKind; id: string; variant?: Variant } | null>(null);
  const [pane, setPane] = useState<'bag' | 'stash'>('bag');
  const [query, setQuery] = useState('');
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [confirmSalvage, setConfirmSalvage] = useState(false);
  // Bind on equip: wearing a TRADEABLE piece for the first time binds it for good, so that one case asks first (the panel's own inline confirm, like discard).
  const [confirmEquip, setConfirmEquip] = useState(false);
  const [expandOpen, setExpandOpen] = useState(false);

  // Escape closes the bag-expansion dialog first (stopPropagation keeps App's Escape handler from also
  // closing the inventory modal behind it).
  useEffect(() => {
    if (!expandOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setExpandOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [expandOpen]);

  // The search box filters what the grid shows by the item's name (the bag itself, its space and every action stay as they are).
  const needle = query.trim().toLocaleLowerCase();
  const matches = (name: string): boolean => !needle || name.toLocaleLowerCase().includes(needle);
  // The 'Negociavel' filter: only what can be sold to other players - the tradeable material stacks and the pieces the SERVER certified.
  const onlyTradeable = tab === 'tradeable';
  const gearInstances = listGearInstances(save).filter((inst) => matches(gearInstanceLabel(inst)) && (!onlyTradeable || (isTradeable(inst) && certState(inst) === 'verified')));
  const stackableGear = onlyTradeable ? [] : GEAR.filter((g) => !isInstancedSlot(g.slot) && (save.inventory?.[g.id] ?? 0) > 0 && matches(gearText(g.nameKey)));
  // `qty` = the normal units, `trade` = the tradeable ones: two stacks of the same material, each in its own slots
  const materialItems = MATERIALS.map((m) => ({ ...m, qty: onlyTradeable ? 0 : normalOf(save, m.id), trade: tradeableOf(save, m.id) })).filter((m) => (m.qty > 0 || m.trade > 0) && matches(matText(m.nameKey)));
  const consumableItems = onlyTradeable ? [] : CONSUMABLES.map((c) => ({ ...c, qty: save.consumables?.[c.id] ?? 0 })).filter((c) => c.qty > 0 && matches(conText(c.nameKey)));

  const showEquipment = tab === 'all' || tab === 'equipment' || tab === 'tradeable';
  const showMaterials = tab === 'all' || tab === 'materials' || tab === 'tradeable';
  const showConsumables = tab === 'all' || tab === 'consumables';

  const slots = inventorySlotsUsed(save);
  const capacity = inventoryCapacity(save);
  const expansion = nextExpansion(save);
  const canAffordExpansion = !!expansion && save.gold >= expansion.goldCost;

  const select = (kind: SelKind, id: string, src: 'bag' | 'stash' = 'bag', variant?: Variant) => {
    setSelected({ src, kind, id, ...(variant === 'tradeable' ? { variant } : {}) });
    setConfirmDiscard(false);
    setConfirmSalvage(false);
    setConfirmEquip(false);
  };

  const fromStash = selected?.src === 'stash';
  const selectedInstance = selected?.kind === 'gear' && !fromStash ? resolveGearInstance(save, selected.id)?.instance ?? null : null;
  const selectedGear: GearItem | null =
    selected?.kind === 'gear' ? (selectedInstance ? getGear(selectedInstance.templateId) : getGear(selected.id) ?? null) : null;
  const selectedMaterial =
    selected?.kind === 'material' ? MATERIALS.find((m) => m.id === (selected.id as MaterialId)) : null;
  const selectedConsumable =
    selected?.kind === 'consumable' ? getConsumable(selected.id) : null;

  const selQty = selectedInstance
    ? 1
    : fromStash && selected
      ? stashCount(save, selected.kind, selected.id)
      : selectedGear
        ? save.inventory?.[selectedGear.id] ?? 0
        : selectedMaterial
          ? selected?.variant === 'tradeable'
            ? tradeableOf(save, selectedMaterial.id)
            : normalOf(save, selectedMaterial.id)
          : selectedConsumable
            ? save.consumables?.[selectedConsumable.id] ?? 0
            : 0;

  const isEquipped = selectedInstance
    ? isInstanceEquipped(save, selectedInstance.id)
    : !fromStash && !!selectedGear && save.equipped[selectedGear.slot as 'relic'] === selectedGear.id;
  // Every instanced slot (weapon, armor, helmet, gloves, boots, ring, shield) and the relic slot equip straight from the bag.
  const isEquippable = !!selectedGear && (isInstancedSlot(selectedGear.slot) || selectedGear.slot === 'relic');
  // Wearing needs the hero level the piece needs: the button is disabled and says so. A piece already worn above the level (an old save) stays on, with a warning.
  const levelBlock = isEquippable && !fromStash && selectedGear ? equipLevelBlock(save, selectedGear.id) : null;
  const selectedRarity: Rarity = selectedInstance?.rarity ?? 'common';
  const selectedSubs = selectedInstance?.substats ?? [];
  const selectedLevel = selectedInstance ? clampRefine(selectedInstance.upgrade) : 0;

  // what was picked is gone (moved, sold, discarded): nothing left to show a detail for
  useEffect(() => {
    if (selected && selQty <= 0) setSelected(null);
  }, [selected, selQty]);

  const salvageReason = selected?.kind === 'gear' && !fromStash ? salvageBlockReason(save, selected.id) : null;
  const salvagePreview = selectedGear ? getSalvageReturn(selectedGear) : null;

  const handleEquip = () => {
    if (!selected || levelBlock) return;
    if (selected.kind === 'gear' && needsBindConfirm(save, selected.id) && !confirmEquip) {
      setConfirmEquip(true);
      return;
    }
    setConfirmEquip(false);
    onEquip(selected.id);
  };

  const handleSalvage = () => {
    if (!selected || !selectedGear) return;
    if (!confirmSalvage) {
      setConfirmSalvage(true);
      return;
    }
    onSalvage(selected.id);
    setSelected(null);
    setConfirmSalvage(false);
  };

  const handleDiscard = () => {
    if (!selected) return;
    if (!confirmDiscard) {
      setConfirmDiscard(true);
      return;
    }
    onDiscard(selected.kind, selected.id, 'all', selected.variant === 'tradeable' ? 'tradeable' : undefined);
    setSelected(null);
    setConfirmDiscard(false);
  };

  // Enter confirms and Escape cancels whichever question (bind on equip, salvage, discard) is open.
  useConfirmKeys(
    confirmEquip || confirmSalvage || confirmDiscard,
    () => (confirmEquip ? handleEquip() : confirmSalvage ? handleSalvage() : handleDiscard()),
    () => {
      setConfirmEquip(false);
      setConfirmSalvage(false);
      setConfirmDiscard(false);
    },
  );

  const cellsShown = gearInstances.length + [...stackableGear.map((g) => save.inventory[g.id]), ...materialItems.flatMap((m) => [m.qty, m.trade]), ...consumableItems.map((c) => c.qty)].reduce((sum, q) => sum + slotsForQty(q), 0);

  return (
    <div className={`inv-root ${layout}`}>
      <Tabs<'bag' | 'stash'>
        className="inv-pane-tabs"
        label={t('inventory.title')}
        value={pane}
        onChange={setPane}
        items={[
          { id: 'bag', label: `${t('inventory.bagTitle')} ${slots}/${capacity}` },
          { id: 'stash', icon: <img src="/assets/icons/camp_stash.png" alt="" />, label: `${t('stash.title')} ${stashSlotsUsed(save)}/${stashCapacity(save)}` },
        ]}
      />
      <div className="inv-panes">
      <section className={`inv-pane inv-pane-bag${pane === 'bag' ? ' active' : ''}`}>
      <div className="inventory-summary">
        <span className={`inventory-summary-chip${slots > capacity ? ' over' : ''}`} title={slots > capacity ? t('inventory.overCapacity') : undefined}>
          {t('inventory.space', { n: slots, m: capacity })}
          {slots > capacity && ` · ${t('inventory.overCapacity')}`}
        </span>
        <Button size="sm" className="inventory-expand-btn" onClick={() => setExpandOpen(true)} aria-label={t('inventory.expandTitle')}>
          +
        </Button>
        <Button size="sm" className="inv-storeall" onClick={() => bag?.storeAllMaterials()} disabled={!materialItems.length}>
          {t('stash.storeAllMaterials')}
        </Button>
      </div>

      {expandOpen && (
        <Dialog
          title={t('inventory.expandTitle')}
          footer={
            <>
              {expansion && (
                <Button
                  variant="primary"
                  block
                  disabled={!canAffordExpansion}
                  onClick={() => {
                    onExpand();
                    setExpandOpen(false);
                  }}
                >
                  {t('inventory.confirmExpand')}
                </Button>
              )}
              <Button block onClick={() => setExpandOpen(false)}>
                {t('inventory.cancel')}
              </Button>
            </>
          }
        >
          <StatList>
            <StatRow label={t('inventory.currentCapacity')} value={capacity} />
            {expansion && (
              <>
                <StatRow label={t('inventory.newCapacity')} value={expansion.nextCapacity} />
                <StatRow label={t('inventory.expandCost')} value={`${fmtNum(expansion.goldCost)} ${t('inventory.reforgeGold')}`} tone={canAffordExpansion ? 'gold' : 'bad'} />
              </>
            )}
          </StatList>
          {!expansion && <p className="ui-note">{t('inventory.maxCapacityReached')}</p>}
        </Dialog>
      )}

      <div className="inv-toolbar">
        <SearchField label={t('inventory.search')} placeholder={t('inventory.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
        <ChipRow<'all' | 'equipment' | 'materials' | 'consumables' | 'tradeable'>
          className="inv-tabs"
          label={t('inventory.title')}
          value={tab}
          onChange={setTab}
          items={[
            { id: 'all', label: t('inventory.all') },
            { id: 'equipment', label: t('inventory.equipment') },
            { id: 'materials', label: t('inventory.materials') },
            { id: 'consumables', label: t('inventory.consumables') },
            { id: 'tradeable', label: t('tradeable.filter') },
          ]}
        />
      </div>

      <div className="inv-grid">
        {showEquipment &&
          gearInstances.map((inst) => {
            const g = getGear(inst.templateId);
            const equipped = isInstanceEquipped(save, inst.id);
            return (
              <button
                key={inst.id}
                className={`inv-slot ${rarityClass(g)} ${rarClass(inst.rarity)}${g.unique ? ' unique' : ''}${selected?.kind === 'gear' && selected.id === inst.id ? ' active' : ''}`}
                onClick={() => select('gear', inst.id)}
                title={gearInstanceLabel(inst)}
                aria-label={gearInstanceLabel(inst)}
                data-ui
              >
                <span className="inv-icon">
                  <GearIcon item={g} />
                </span>
                <span className="inv-qty">
                  {refineTag(clampRefine(inst.upgrade)).trim()}
                  {equipped ? ' ✓' : ''}
                </span>
                {tradeTag(inst) && (
                  <span className={`inv-trade-tag ${tradeTag(inst)}`} title={t(`inventory.${tradeTag(inst) === 'tradeable' ? 'tradeable' : 'bound'}`)} aria-label={t(`inventory.${tradeTag(inst) === 'tradeable' ? 'tradeable' : 'bound'}`)}>
                    {tradeTag(inst) === 'tradeable' ? '◆' : '🔒'}
                  </span>
                )}
              </button>
            );
          })}
        {showEquipment &&
          stackableGear.flatMap((g) =>
            stackCells(save.inventory[g.id]).map((n, i) => (
              <button
                key={`${g.id}:${i}`}
                className={`inv-slot ${rarityClass(g)} ${rarClass(undefined)}${selected?.kind === 'gear' && selected.id === g.id ? ' active' : ''}`}
                onClick={() => select('gear', g.id)}
                title={gearText(g.nameKey)}
                aria-label={`${gearText(g.nameKey)} ×${fmtNum(n)}`}
                data-ui
              >
                <span className="inv-icon">
                  <GearIcon item={g} />
                </span>
                <span className="inv-qty">×{fmtNum(n)}</span>
              </button>
            )),
          )}
        {showMaterials &&
          materialItems.flatMap((m) => [
            ...stackCells(m.qty).map((n, i) => (
              <button
                key={`${m.id}:${i}`}
                className={`inv-slot${selected?.kind === 'material' && selected.id === m.id && selected.variant !== 'tradeable' ? ' active' : ''}`}
                onClick={() => select('material', m.id)}
                title={matText(m.nameKey)}
                aria-label={`${matText(m.nameKey)} ×${fmtNum(n)}`}
                data-ui
              >
                <span className="inv-icon">
                  <MaterialIcon item={m} />
                </span>
                <span className="inv-qty">×{fmtNum(n)}</span>
              </button>
            )),
            // the tradeable units of the same material: another stack, the same icon, a gold corner and the diamond (the market's mark)
            ...stackCells(m.trade).map((n, i) => (
              <button
                key={`${m.id}:t${i}`}
                className={`inv-slot tradeable-mat${selected?.kind === 'material' && selected.id === m.id && selected.variant === 'tradeable' ? ' active' : ''}`}
                onClick={() => select('material', m.id, 'bag', 'tradeable')}
                title={`${matText(m.nameKey)} · ${t('tradeable.tag')}`}
                aria-label={t('tradeable.tileLabel', { name: matText(m.nameKey), n: fmtNum(n) })}
                data-ui
              >
                <span className="inv-icon">
                  <MaterialIcon item={m} />
                </span>
                <span className="inv-trade-tag tradeable" aria-hidden>
                  ◆
                </span>
                <span className="inv-qty">×{fmtNum(n)}</span>
              </button>
            )),
          ])}
        {showConsumables &&
          consumableItems.flatMap((c) =>
            stackCells(c.qty).map((n, i) => (
              <button
                key={`${c.id}:${i}`}
                className={`inv-slot${selected?.kind === 'consumable' && selected.id === c.id ? ' active' : ''}`}
                onClick={() => select('consumable', c.id)}
                title={conText(c.nameKey)}
                aria-label={`${conText(c.nameKey)} ×${fmtNum(n)}`}
                data-ui
              >
                <span className="inv-icon">
                  <ConsumableIcon item={c} />
                </span>
                <span className="inv-qty">×{fmtNum(n)}</span>
              </button>
            )),
          )}
        {cellsShown === 0 && !!needle && <p className="inv-nomatch">{t('inventory.noMatches')}</p>}
        {Array.from({ length: Math.max(0, (needle ? 0 : 24) - cellsShown) }).map((_, i) => (
          <span key={`empty-${i}`} className="inv-slot empty" />
        ))}
      </div>
      </section>

      <section className={`inv-pane inv-pane-stash${pane === 'stash' ? ' active' : ''}`}>
        <StashPane save={save} selected={fromStash && selected ? { kind: selected.kind, id: selected.id } : null} onSelect={(sel) => select(sel.kind, sel.id, 'stash')} onUpgrade={() => bag?.upgradeStash()} />
      </section>
      </div>

      <div className={`inv-detail-backdrop${selected ? ' open' : ''}`} onClick={() => setSelected(null)}>
      <div className="inv-detail" onClick={(event) => event.stopPropagation()}>
        {selected && <button className="inv-detail-close" onClick={() => setSelected(null)} aria-label={t('ui.close')} data-ui>✕</button>}
        {selectedGear ? (
          <>
            <div className="inv-detail-name">
              <span className="inv-detail-icon">
                <GearIcon item={selectedGear} />
              </span>
              <span className="inv-detail-name-text">
                {gearText(selectedGear.nameKey)}
                <span className="refine-tag">{refineTag(selectedLevel)}</span>
                <UniqueTag templateId={selectedGear.id} />
              </span>
              {!selectedInstance && <span className="inv-qty">×{fmtNum(selQty)}</span>}
              {isEquipped && <span className="inv-qty">{t('inventory.equipped')}</span>}
            </div>
            <div className="inv-detail-desc">{gearText(selectedGear.descKey)}</div>
            <AppearanceLine item={selectedGear} />
            <div className="gear-stat-list">
              {gearStatLines(selectedGear, selectedLevel, selectedRarity).map((l) => (
                <span className={`gear-stat gear-stat-${l.kind}`} key={l.kind}>
                  {l.text}
                </span>
              ))}
            </div>
            <SetNote item={selectedGear} save={save} />
            {!isEquipped && selQty > 0 && (selectedInstance || selectedGear.slot === 'relic') && !fromStash && (
              <ItemCompare save={save} slot={selectedGear.slot} templateId={selectedGear.id} instance={selectedInstance} />
            )}
            {selectedRarity !== 'common' && (
              <div className={`rarity-line ${rarClass(selectedRarity)}`}>{t(`rarity.${rarityDef(selectedRarity).nameKey}`)}</div>
            )}
            {selectedInstance && (
              <>
                <div className={`trade-line ${tradeLine(selectedInstance)}`}>{tradeBlockReason(selectedInstance) ? t(`inventory.tradeReason.${tradeBlockReason(selectedInstance)}`) : t(`inventory.${TRADE_LINE_KEY[tradeLine(selectedInstance)]}`)}</div>
                {tradeLine(selectedInstance) === 'nocert' && <div className="trade-line untradeable">{t('inventory.noCertificateHint')}</div>}
              </>
            )}
            {selectedSubs.length > 0 && (
              <div className="substat-list">
                {selectedSubs.map((s, i) => (
                  <span className="substat-line" key={i}>
                    +{fmtSubstat(s)} {t(`rarity.${substatNameKey(s.type)}`)}
                  </span>
                ))}
              </div>
            )}
            {selectedInstance && (
              <div className="substat-list">
                <span className="substat-line">{t('forge.durability', { n: selectedInstance.durability, m: 100 })}</span>
                {selectedInstance.sockets.length > 0 && (
                  <span className="substat-line">{t('inventory.socketsCount', { n: selectedInstance.sockets.length })}</span>
                )}
              </div>
            )}
            {isEquippable &&
              (isEquipped ? (
                <Button block onClick={() => onUnequip(selected!.id)}>
                  {t('inventory.unequip')}
                </Button>
              ) : (
                <Button block variant="primary" onClick={handleEquip} disabled={!!levelBlock}>
                  {levelBlock ? t('inventory.requiresLevel', { n: levelBlock.requiredLevel }) : t('inventory.equip')}
                </Button>
              ))}
            {isEquipped && levelBlock && <p className="ui-alert bad">{t('inventory.wornAboveLevel', { n: levelBlock.requiredLevel })}</p>}
            {confirmEquip && (
              <Dialog
                title={t('inventory.bindTitle')}
                footer={
                  <>
                    <Button variant="primary" block onClick={handleEquip}>
                      {t('inventory.equip')}
                    </Button>
                    <Button block onClick={() => setConfirmEquip(false)}>
                      {t('inventory.bindCancel')}
                    </Button>
                  </>
                }
              >
                <p>{t('inventory.bindConfirm')}</p>
              </Dialog>
            )}
            {selectedInstance &&
              selectedRarity !== 'common' &&
              (() => {
                const cost = getReforgeCost(save, selectedInstance.id);
                if (!cost) return null;
                const rows: { key: string; label: string; have: number; need: number; mat?: MaterialId }[] = [
                  { key: 'gold', label: t('inventory.reforgeGold'), have: save.gold, need: cost.gold },
                  { key: 'shard', label: t('inventory.reforgeShard'), have: save.shards, need: cost.shards },
                  ...Object.entries(cost.materials).map(([mid, need]) => ({
                    key: mid,
                    label: matText(`mat_${mid}`),
                    have: save.materials[mid as MaterialId] ?? 0,
                    need: need as number,
                    mat: mid as MaterialId,
                  })),
                ];
                return (
                  <div className="reforge-panel">
                    <div className="substat-line">{t('inventory.reforgeCount', { n: selectedInstance.reforgeCount })}</div>
                    <p className="salvage-hint">{t('forge.reforgeExplanation')}</p>
                    <div className="salvage-preview reforge-costs">
                      {rows.map((r) => (
                        <span className="floor-drop" key={r.key}>
                          <span className="reforge-cost-name">
                            {r.mat && (
                              <span className="mat-icon">
                                <MaterialIcon item={getMaterial(r.mat)!} />
                              </span>
                            )}
                            {r.label}
                          </span>
                          <span className={`req-amount${r.have < r.need ? ' missing' : ''}`}>
                            {fmtNum(r.have)} / {fmtNum(r.need)}
                          </span>
                          {r.mat && <StashHint kind="material" id={r.mat} need={r.need} />}
                        </span>
                      ))}
                    </div>
                    <Button block variant="primary" onClick={() => onReforge(selectedInstance.id)} disabled={!canAffordReforge(save, cost)}>
                      {t('forge.reforge')}
                    </Button>
                  </div>
                );
              })()}
            {selectedInstance && selectedInstance.substats.length >= 2 && <LapidarPanel key={selectedInstance.id} save={save} instanceId={selectedInstance.id} onLapidar={onLapidar} />}
            {hasSalvageValue(selectedGear) &&
              (salvageReason === 'equipped' ? (
                <p className="salvage-hint">{t('inventory.unequipToSalvage')}</p>
              ) : (
                <div className="salvage-block">
                  <p className="salvage-hint">{t('inventory.salvageRounding', { pct: Math.round(T.economySinks.salvageRecoveryRate * 100) })}</p>
                  {confirmSalvage && salvagePreview && (
                    <div className="salvage-preview">
                      <span className="salvage-preview-label">{t('inventory.salvagePreview')}</span>
                      {Object.entries(salvagePreview.materials).map(([mid, qty]) => (
                        <span className="floor-drop" key={mid}>
                          <span className="mat-icon">
                            <MaterialIcon item={getMaterial(mid as MaterialId)!} />
                          </span>
                          <span>
                            +{qty as number} {matText(`mat_${mid}`)}
                          </span>
                        </span>
                      ))}
                      {Object.keys(salvagePreview.materials).length === 0 && <span className="salvage-hint">{t('inventory.salvageEmpty')}</span>}
                      {selectedInstance && selectedInstance.sockets.length > 0 && (
                        <span className="floor-drop">{t('inventory.gemsReturn', { n: selectedInstance.sockets.length })}</span>
                      )}
                    </div>
                  )}
                  {salvageReason === 'bag' && <p className="salvage-hint bad">{t('inventory.salvageBagFull')}</p>}
                  <Button block variant={confirmSalvage ? 'primary' : 'secondary'} onClick={handleSalvage} disabled={salvageReason === 'bag'}>
                    {confirmSalvage ? t('inventory.confirmSalvage') : t('inventory.salvage')}
                  </Button>
                </div>
              ))}
          </>
        ) : selectedMaterial ? (
          <>
            <div className="inv-detail-name">
              <MaterialIcon item={selectedMaterial} className="mat-icon-img" />
              <span className="inv-detail-name-text">
                {matText(selectedMaterial.nameKey)}
                {selected?.variant === 'tradeable' && (
                  <>
                    {' '}
                    <Chip tone="gold">{t('tradeable.tag')}</Chip>
                  </>
                )}
              </span>
              <span className="inv-qty">×{fmtNum(selQty)}</span>
            </div>
            <div className="inv-detail-desc">{t('inventory.materialDesc')}</div>
            {selected?.variant === 'tradeable' ? (
              <>
                <div className="trade-line tradeable">{t('tradeable.detailLine')}</div>
                <div className="inv-detail-desc">{t('tradeable.desc')}</div>
              </>
            ) : (
              tradeableOf(save, selectedMaterial.id) > 0 && <div className="inv-detail-desc">{t('tradeable.normalDesc')}</div>
            )}
          </>
        ) : selectedConsumable ? (
          <>
            <div className="inv-detail-name">
              <ConsumableIcon item={selectedConsumable} className="mat-icon-img" />
              <span className="inv-detail-name-text">{conText(selectedConsumable.nameKey)}</span>
              <span className="inv-qty">×{fmtNum(selQty)}</span>
            </div>
            <div className="inv-detail-desc">{conText(selectedConsumable.descKey)}</div>
          </>
        ) : (
          <div className="inv-detail-empty">{t('inventory.hint')}</div>
        )}

        {selected?.kind === 'consumable' && BUFF_ITEM[selected.id as ConsumableId] && isBuffActive(save, BUFF_ITEM[selected.id as ConsumableId]!, Date.now()) && (
          <div className="inv-buff-active">{t('inventory.buffActive', { t: formatBuffLeft(buffRemainingMs(save, Date.now(), BUFF_ITEM[selected.id as ConsumableId]!)) })}</div>
        )}

        {selected?.kind === 'consumable' && selected.id === 'fertilizer' && <div className="inv-detail-desc">{t('inventory.useOnPlot')}</div>}

        {selected?.kind === 'consumable' && isPouchId(selected.id) && !fromStash && selQty > 0 && (
          <div className="inv-actions">
            <div className="inv-detail-desc">{t('pouch.worth', { g: fmtNum(pouchFace(selected.id)) })}</div>
            <div className="inv-detail-desc">{t('pouch.certifiedLine', { n: verifiedPouchCount(save, selected.id), m: Math.max(0, (save.consumables?.[selected.id] ?? 0) + (save.stash?.consumables?.[selected.id] ?? 0) - verifiedPouchCount(save, selected.id)) })}</div>
            <PouchOpenButton id={selected.id} onOpen={(id) => bag?.openPouch(id)} />
          </div>
        )}

        {selected?.kind === 'consumable' && MANUALLY_USABLE.has(selected.id) && selQty > 0 && (
          <div className="inv-actions">
            <Button
              block
              variant="primary"
              onClick={() => {
                onUseConsumable(selected.id);
                setSelected(null);
              }}
            >
              {t('inventory.use')}
            </Button>
          </div>
        )}

        {selected?.variant === 'tradeable' && !fromStash && selQty > 0 && bag?.openMarket && (
          <div className="inv-actions">
            <Button variant="primary" block onClick={() => bag.openMarket?.(selected.id)}>
              {t('tradeable.sellOnMarket')}
            </Button>
          </div>
        )}

        {selected && fromStash && selQty > 0 && <StashTake save={save} kind={selected.kind} id={selected.id} onTake={(qty) => bag?.move('take', selected.kind, selected.id, qty)} />}

        {selected && !fromStash && !selectedInstance && selQty > 0 && (
          <StackActions
            save={save}
            kind={selected.kind}
            id={selected.id}
            variant={selected.variant === 'tradeable' ? 'tradeable' : 'normal'}
            onStash={(qty) => bag?.move('store', selected.kind, selected.id, qty)}
            onSell={(qty) => selected.kind !== 'gear' && bag?.sell(selected.kind, selected.id, qty, selected.variant === 'tradeable' ? 'tradeable' : undefined)}
            onDiscard={(qty) => onDiscard(selected.kind, selected.id, qty, selected.variant === 'tradeable' ? 'tradeable' : undefined)}
            onOpenUse={(use) => bag?.openUse(use)}
          />
        )}

        {selected && selectedInstance && !isEquipped && selQty > 0 && (
          <div className="inv-actions">
            {confirmDiscard && selectedInstance && selectedInstance.sockets.length > 0 && (
              <span className="salvage-hint">{t('inventory.gemsReturn', { n: selectedInstance.sockets.length })}</span>
            )}
            <Button block variant="danger" className={confirmDiscard ? 'armed' : undefined} onClick={handleDiscard}>
              {confirmDiscard ? t('inventory.confirm') : t('inventory.discard')}
            </Button>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
