import PixelIcon from './PixelIcon';
import { Fragment, ReactNode, useEffect, useRef, useState } from 'react';
import Assets from '../assets.json';
import { fmtNum, t } from '../locales';
import { SaveData, playerLevel } from '../game/engine';
import { getMaterial, MaterialId } from '../game/materials';
import { RefiningStation, getRefiningRecipe, refiningRecipesForStation } from '../game/refining';
import { POTION_RECIPES, getPotionRecipe, potionRecipeInTier, potionRecipeKey } from '../game/potions';
import { getConsumable } from '../game/consumables';
import { REFINE_CATEGORIES } from './refineCategories';
import MaterialIcon from './MaterialIcon';
import ConsumableIcon from './ConsumableIcon';
import StashHint from './StashHint';
import { QtyPicker, CraftJobPanel } from './CraftQty';
import { clampCraftQty, craftBlock } from '../game/craftJob';
import type { CraftJobKind } from '../game/craftJobTypes';
import { heroActivity } from '../game/activity';
import { oficioBlockKind, oficioLocked, orderOficios, pickOficioId } from '../game/oficiosList';
import useIsPhone from '../hooks/useIsPhone';
import { ItemFrame, PageHeader, Panel, PrimaryButton, Screen, ScreenLayout, Tabs } from './ui';
import type { TabItem } from './ui';

const matText = (k: string): string => t(`materials.${k}`);
const conText = (k: string): string => t(`consumables.${k}`);

// One requirement of a recipe, shown like the Forja's: what the hero has against what it takes.
interface Req {
  key: string;
  icon: ReactNode;
  label: ReactNode;
  have: number;
  need: number;
  stash?: string;
}

function Reqs({ rows }: { rows: Req[] }) {
  return (
    <div className="fg-reqs" role="list">
      {rows.map((r) => {
        const short = r.have < r.need;
        return (
          <div className="fg-req" role="listitem" key={r.key}>
            <span className="fg-req-icon" aria-hidden>
              {r.icon}
            </span>
            <span className="fg-req-label">{r.label}</span>
            <span className={`fg-req-qty${short ? ' missing' : ''}`}>{`${fmtNum(r.have)} / ${fmtNum(r.need)}`}</span>
            {r.stash && short && <StashHint kind="material" id={r.stash} need={r.need} />}
          </div>
        );
      })}
    </div>
  );
}

// A recipe of any station (refining or potion) in one shape, so the list and the sheet do not care which it is.
interface Recipe {
  id: string;
  kind: CraftJobKind;
  requiredLevel: number;
  craftable: boolean;
  name: string;
  icon: ReactNode;
  owned: number;
  gold: number;
  input: Record<string, number | undefined>;
  desc?: string;
}

// Ofícios as its own main-content area, built like the Forja: a station tab row, a compact list of recipes (what the hero can make first and highlighted, what a level still locks
// compacted to one line) and ONE production sheet for the picked recipe. Same REFINE_CATEGORIES / RefiningRecipe / POTION_RECIPES data and onRefine/onCraftPotion handlers as before;
// only the presentation changes (no recipe, cost, timer or batch rule is touched).
export default function OficiosView({
  save,
  onRefine,
  onCraftPotion,
  onCancelCraft,
  craftStalled,
  focus,
}: {
  save: SaveData;
  // qty: how many units the batch makes (the hero makes them one after another, craftJob.ts).
  onRefine: (recipeId: string, qty: number) => void;
  onCraftPotion: (recipeId: string, qty: number) => void;
  onCancelCraft?: () => void;
  craftStalled?: boolean;
  // Opened from an item's "Usar em...": the station (or 'potions') to open and the recipe to bring into view.
  focus?: { category: RefiningStation | 'potions'; recipeId: string } | null;
}) {
  const phone = useIsPhone();
  const [category, setCategory] = useState<RefiningStation | 'potions'>(focus?.category ?? REFINE_CATEGORIES[0].id);
  // the recipe picked at each station (the deep link picks one for its station)
  const [picked, setPicked] = useState<Record<string, string>>(focus ? { [focus.category]: focus.recipeId } : {});
  const [justMade, setJustMade] = useState<string | null>(null);
  const [openLocked, setOpenLocked] = useState(false);
  const rowRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const panelRef = useRef<HTMLDivElement | null>(null);
  const level = playerLevel(save.xp);
  const busy = heroActivity(save);

  useEffect(() => {
    if (focus) document.querySelector(`[data-recipe-id="${focus.recipeId}"]`)?.scrollIntoView({ block: 'center' });
  }, [focus]);

  const [qtys, setQtys] = useState<Record<string, number>>({});
  // the quantity the batch really runs (the picker's raw value held to what the hero can afford now): label, action, requirement rows and feedback all use it
  const qtyOf = (r: Recipe): number => clampCraftQty(save, r.kind, r.id, qtys[r.id] ?? 1);
  // the hero's own busy state is a separate notice (a click on a busy hero explains it); a recipe is "craftable" by what it asks of the stock
  const idle: SaveData = { ...save, activeHuntingZone: null, activeOreId: null, activeWoodId: null, craftJob: null };

  const recipes: Recipe[] =
    category === 'potions'
      ? POTION_RECIPES.filter((recipe) => potionRecipeInTier(recipe, save.highestDungeonFloor, level)).map((recipe) => {
          const key = potionRecipeKey(recipe);
          const consumable = getConsumable(recipe.id)!;
          return {
            id: key,
            kind: 'potion' as const,
            requiredLevel: recipe.requiredLevel,
            craftable: craftBlock(idle, 'potion', key, 1) === null,
            name: `${conText(consumable.nameKey)}${recipe.zoneTier ? ` · ${t('forge.knowledgeTier', { n: recipe.zoneTier })}` : ''}`,
            icon: <ConsumableIcon item={consumable} />,
            owned: save.consumables?.[recipe.id] ?? 0,
            gold: recipe.cost,
            input: recipe.input,
            desc: conText(consumable.descKey),
          };
        })
      : refiningRecipesForStation(category).map((recipe) => ({
          id: recipe.id,
          kind: 'refine' as const,
          requiredLevel: recipe.requiredLevel,
          craftable: craftBlock(idle, 'refine', recipe.id, 1) === null,
          // the four dust recipes make the same item: the name says what each one eats
          name: `${recipe.outputQty}× ${matText(`mat_${recipe.output}`)}${recipe.station === 'dust' ? ` (${matText(`mat_${Object.keys(recipe.input)[0]}`)})` : ''}`,
          icon: <MaterialIcon item={getMaterial(recipe.output)!} />,
          owned: save.materials[recipe.output] ?? 0,
          gold: recipe.cost,
          input: recipe.input,
        }));

  const { available, locked } = orderOficios(recipes, level);
  const currentId = pickOficioId(recipes, level, picked[category]);
  const current = recipes.find((r) => r.id === currentId) ?? null;

  const pick = (id: string) => {
    setPicked({ ...picked, [category]: id });
    // phone: the sheet opens under the row, so bring the row to the top; a narrow window: the sheet under the list
    window.setTimeout(() => (phone ? rowRefs.current[id] : panelRef.current)?.scrollIntoView({ block: phone ? 'start' : 'nearest', behavior: 'smooth' }), 0);
  };

  const produce = (r: Recipe) => {
    const qty = qtyOf(r);
    // "made!" only when a batch can really start (a busy hero or a short stock gets the usual notice, not a green flash)
    const startable = craftBlock(save, r.kind, r.id, qty) === null;
    if (r.kind === 'potion') onCraftPotion(r.id, qty);
    else onRefine(r.id, qty);
    if (!startable) return;
    setJustMade(r.id);
    window.setTimeout(() => setJustMade(null), 1500);
  };

  const sheet = (r: Recipe): ReactNode => {
    const qty = qtyOf(r);
    const rows: Req[] = [];
    if (r.requiredLevel > 0) rows.push({ key: 'level', icon: <PixelIcon name="level" />, label: t('oficios.levelRow'), have: level, need: r.requiredLevel });
    rows.push({ key: 'gold', icon: <img src={Assets.icons.gold.url} alt="" />, label: t('inventory.reforgeGold'), have: save.gold, need: r.gold * qty });
    for (const [mid, count] of Object.entries(r.input)) {
      rows.push({ key: `in-${mid}`, icon: <MaterialIcon item={getMaterial(mid as MaterialId)!} />, label: matText(`mat_${mid}`), have: save.materials[mid as MaterialId] ?? 0, need: (count as number) * qty, stash: mid });
    }
    // why this batch cannot start (level, stock, Gold, room); the hero being busy is told apart, because its button still opens the "stop what you are doing" notice
    const block = craftBlock(idle, r.kind, r.id, qty);
    const blockKind = oficioBlockKind(block?.reason);
    const blockText =
      blockKind === 'level'
        ? t('oficios.blockLevel', { n: r.requiredLevel })
        : blockKind === 'materials'
          ? t('oficios.blockMaterials')
          : blockKind === 'gold'
            ? t('oficios.blockGold')
            : blockKind === 'bag'
              ? t('inventory.bagFullAction')
              : blockKind
                ? t('oficios.blockOther')
                : null;
    const made = justMade === r.id;
    return (
      <div className={`fg-panel-wrap${phone ? ' inline' : ''}`} ref={panelRef}>
        <Panel title={r.name} className="fg-panel of-sheet" icon={<ItemFrame size="md">{r.icon}</ItemFrame>}>
          <div className="fg-panel-body">
            {r.desc && <p className="fg-desc">{r.desc}</p>}
            <p className="ui-note of-stock">{t('oficios.stock', { n: fmtNum(r.owned) })}</p>
            <Reqs rows={rows} />
            <QtyPicker save={save} kind={r.kind} recipeId={r.id} qty={qty} onChange={(n) => setQtys({ ...qtys, [r.id]: n })} />
            {blockText && (
              <p className="ui-alert bad" role="status">
                {blockText}
              </p>
            )}
            {busy && (
              <p className="ui-alert info" role="status">
                {t('oficios.blockBusy', { activity: t(`busy.${busy}`) })}
              </p>
            )}
            <PrimaryButton block className={made ? 'of-made' : ''} onClick={() => produce(r)} disabled={!!block}>
              {made ? t('forge.forged') : qty > 1 ? t('craft.start', { n: qty }) : r.kind === 'potion' ? t('forge.forge') : t('forge.refine')}
            </PrimaryButton>
          </div>
        </Panel>
      </div>
    );
  };

  const tabs: TabItem<string>[] = REFINE_CATEGORIES.map((c) => ({ id: c.id, label: t(`forge.${c.titleKey}`) }));

  const row = (r: Recipe, isLocked: boolean): ReactNode => {
    const selected = current?.id === r.id;
    return (
      <Fragment key={r.id}>
        <button
          className={`fg-recipe of-row${isLocked ? ' locked' : ''}${selected ? ' selected' : ''}${r.craftable && !isLocked ? ' ok' : ''}${focus?.recipeId === r.id && !selected ? ' focus' : ''}`}
          onClick={() => pick(r.id)}
          aria-pressed={selected}
          data-recipe-id={r.id}
          ref={(el) => {
            rowRefs.current[r.id] = el;
          }}
          data-ui
        >
          <ItemFrame size={isLocked ? 'sm' : 'md'}>{r.icon}</ItemFrame>
          <span className="fg-recipe-text">
            <span className="fg-recipe-name">{r.name}</span>
            {isLocked ? <span className="of-lock">{t('forge.levelReq', { n: r.requiredLevel })}</span> : <span className="fg-recipe-stats">{t('oficios.stock', { n: fmtNum(r.owned) })}</span>}
          </span>
          {r.craftable && !isLocked && (
            <span className="fg-ready" role="img" aria-label={t('oficios.ready')}>
              ✓
            </span>
          )}
        </button>
        {phone && selected && sheet(r)}
      </Fragment>
    );
  };

  // a picked locked recipe keeps its group open
  const lockedOpen = openLocked || (current !== null && oficioLocked(current.requiredLevel, level));

  return (
    <Screen label={t('nav.oficios')} className="of-page">
      <PageHeader icon={<img className="pixel-icon" src="/assets/icons/refine_catalyst.png" alt="" />} title={t('nav.oficios')} />
      <CraftJobPanel
        save={save}
        name={(rid) => {
          const r = getRefiningRecipe(rid);
          if (r) return matText(`mat_${r.output}`);
          const p = getPotionRecipe(rid);
          return p ? conText(getConsumable(p.id)?.nameKey ?? p.id) : rid;
        }}
        stalled={craftStalled}
        onCancel={() => onCancelCraft?.()}
      />
      <Tabs items={tabs} value={category} onChange={(id) => setCategory(id as RefiningStation | 'potions')} label={t('nav.oficios')} className="of-tabs" />
      <ScreenLayout
        className="fg-layout of-layout"
        main={
          recipes.length === 0 ? (
            <span className="socket-none">{t('oficios.empty')}</span>
          ) : (
            <>
              {available.length > 0 && (
                <section className="of-group" aria-label={t('oficios.recipes')}>
                  <h3 className="of-group-title">{t('oficios.available', { n: available.length })}</h3>
                  <div className="fg-recipes of-list">{available.map((r) => row(r, false))}</div>
                </section>
              )}
              {locked.length > 0 && (
                <section className="of-group" aria-label={t('oficios.lockedGroup', { n: locked.length })}>
                  <button className="of-group-toggle" onClick={() => setOpenLocked(!lockedOpen)} aria-expanded={lockedOpen} data-ui>
                    <span>{t('oficios.lockedGroup', { n: locked.length })}</span>
                    <span aria-hidden>{lockedOpen ? '▾' : '▸'}</span>
                  </button>
                  {lockedOpen && <div className="fg-recipes of-list of-list-locked">{locked.map((r) => row(r, true))}</div>}
                </section>
              )}
            </>
          )
        }
        side={phone || !current ? undefined : sheet(current)}
      />
    </Screen>
  );
}
