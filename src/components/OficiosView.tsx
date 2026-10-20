import { ReactNode, useEffect, useState } from 'react';
import Assets from '../assets.json';
import { fmtNum, t } from '../locales';
import { SaveData, playerLevel } from '../game/engine';
import { getMaterial, MaterialId, hasMaterials } from '../game/materials';
import { RefiningRecipe, RefiningStation, getRefiningRecipe, refiningRecipesForStation } from '../game/refining';
import { POTION_RECIPES, getPotionRecipe, potionRecipeInTier, potionRecipeKey } from '../game/potions';
import { getConsumable } from '../game/consumables';
import { REFINE_CATEGORIES } from './refineCategories';
import MaterialIcon from './MaterialIcon';
import ConsumableIcon from './ConsumableIcon';
import StashHint from './StashHint';
import { applyCraftPotion, applyRefine } from '../game/craftActions';
import { QtyPicker, CraftJobPanel } from './CraftQty';
import { ItemCard, PageHeader, Panel, PrimaryButton, Screen, Tabs } from './ui';
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
  plain?: boolean; // a threshold (the hero level): shown as the number it takes, not "have / need"
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
            <span className={`fg-req-qty${short ? ' missing' : ''}`}>{r.plain ? fmtNum(r.need) : `${fmtNum(r.have)} / ${fmtNum(r.need)}`}</span>
            {r.stash && <StashHint kind="material" id={r.stash} need={r.need} />}
          </div>
        );
      })}
    </div>
  );
}

// Ofícios as its own main-content area (a page header, the station tabs and a responsive grid of recipe cards like the Forja's: one per row on a phone) — instead of the old narrow modal.
// Same REFINE_CATEGORIES / RefiningRecipe / POTION_RECIPES data and onRefine/onCraftPotion handlers as ForgeModal's "Refino" tab (mobile) and the previous OficiosModal;
// only the presentation changes.
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
  const [category, setCategory] = useState<RefiningStation | 'potions'>(focus?.category ?? REFINE_CATEGORIES[0].id);
  useEffect(() => {
    if (focus) document.querySelector(`[data-recipe-id="${focus.recipeId}"]`)?.scrollIntoView({ block: 'center' });
  }, [focus]);
  const [justMade, setJustMade] = useState<string | null>(null);
  const level = playerLevel(save.xp);

  const [qtys, setQtys] = useState<Record<string, number>>({});
  const qtyOf = (id: string): number => qtys[id] ?? 1;
  const produce = (recipeId: string, isPotion: boolean) => {
    if (isPotion) onCraftPotion(recipeId, qtyOf(recipeId));
    else onRefine(recipeId, qtyOf(recipeId));
    setJustMade(recipeId);
    window.setTimeout(() => setJustMade(null), 1500);
  };

  const stationRecipes: RefiningRecipe[] = category === 'potions' ? [] : refiningRecipesForStation(category);

  const goldRow = (cost: number): Req => ({ key: 'gold', icon: <img src={Assets.icons.gold.url} alt="" />, label: t('inventory.reforgeGold'), have: save.gold, need: cost });
  const levelRow = (required: number): Req => ({ key: 'level', icon: <span>⭐</span>, label: t('forge.levelReq', { n: required }), have: level, need: required, plain: true });
  const inputRows = (input: Record<string, number | undefined>): Req[] =>
    Object.entries(input).map(([mid, count]) => ({
      key: `in-${mid}`,
      icon: <MaterialIcon item={getMaterial(mid as MaterialId)!} />,
      label: matText(`mat_${mid}`),
      have: save.materials[mid as MaterialId] ?? 0,
      need: count as number,
      stash: mid,
    }));

  const tabs: TabItem<string>[] = REFINE_CATEGORIES.map((c) => ({ id: c.id, label: t(`forge.${c.titleKey}`) }));

  return (
    <Screen label={t('nav.oficios')}>
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
      <Panel className="of-panel">
        <div className="ui-grid of-grid">
          {category === 'potions'
            ? POTION_RECIPES.filter((recipe) => potionRecipeInTier(recipe, save.highestDungeonFloor, playerLevel(save.xp))).map((recipe) => {
                const key = potionRecipeKey(recipe);
                const consumable = getConsumable(recipe.id)!;
                const bagFull = applyCraftPotion(save, key).reason === 'bag';
                const ok = save.gold >= recipe.cost && level >= recipe.requiredLevel && hasMaterials(save.materials, recipe.input) && !bagFull;
                const made = justMade === key;
                const owned = save.consumables?.[recipe.id] ?? 0;
                const rows = [goldRow(recipe.cost), ...(recipe.requiredLevel > 0 ? [levelRow(recipe.requiredLevel)] : []), ...inputRows(recipe.input)];
                return (
                  <ItemCard
                    key={key}
                    className="of-card"
                    data-recipe-id={key}
                    selected={focus?.recipeId === key}
                    icon={<ConsumableIcon item={consumable} />}
                    name={
                      <>
                        {conText(consumable.nameKey)}
                        {recipe.zoneTier ? ` · ${t('forge.knowledgeTier', { n: recipe.zoneTier })}` : ''}
                      </>
                    }
                    rarityLabel={t('shop.youHave', { n: owned })}
                    action={
                      <PrimaryButton block className={made ? 'of-made' : ''} onClick={() => produce(key, true)} disabled={!ok}>
                        {made ? t('forge.forged') : qtyOf(key) > 1 ? t('craft.start', { n: qtyOf(key) }) : t('forge.forge')}
                      </PrimaryButton>
                    }
                  >
                    <p className="ui-note">{conText(consumable.descKey)}</p>
                    <Reqs rows={rows} />
                    <QtyPicker save={save} kind="potion" recipeId={key} qty={qtyOf(key)} onChange={(n) => setQtys({ ...qtys, [key]: n })} />
                    {bagFull && <p className="ui-alert bad">{t('inventory.bagFullAction')}</p>}
                  </ItemCard>
                );
              })
            : stationRecipes.map((recipe) => {
                const bagFull = applyRefine(save, recipe.id).reason === 'bag';
                const ok = save.gold >= recipe.cost && level >= recipe.requiredLevel && hasMaterials(save.materials, recipe.input) && !bagFull;
                const made = justMade === recipe.id;
                const outputMat = getMaterial(recipe.output)!;
                const owned = save.materials[recipe.output] ?? 0;
                const rows = [goldRow(recipe.cost), ...(recipe.requiredLevel > 0 ? [levelRow(recipe.requiredLevel)] : []), ...inputRows(recipe.input)];
                return (
                  <ItemCard
                    key={recipe.id}
                    className="of-card"
                    data-recipe-id={recipe.id}
                    selected={focus?.recipeId === recipe.id}
                    icon={<MaterialIcon item={outputMat} />}
                    name={
                      <>
                        {recipe.outputQty}× {matText(`mat_${recipe.output}`)}
                        {/* the four dust recipes make the same item: the title names what each one eats */}
                        {recipe.station === 'dust' && ` (${matText(`mat_${Object.keys(recipe.input)[0]}`)})`}
                      </>
                    }
                    rarityLabel={t('shop.youHave', { n: owned })}
                    action={
                      <PrimaryButton block className={made ? 'of-made' : ''} onClick={() => produce(recipe.id, false)} disabled={!ok}>
                        {made ? t('forge.forged') : qtyOf(recipe.id) > 1 ? t('craft.start', { n: qtyOf(recipe.id) }) : t('forge.refine')}
                      </PrimaryButton>
                    }
                  >
                    <Reqs rows={rows} />
                    <QtyPicker save={save} kind="refine" recipeId={recipe.id} qty={qtyOf(recipe.id)} onChange={(n) => setQtys({ ...qtys, [recipe.id]: n })} />
                    {bagFull && <p className="ui-alert bad">{t('inventory.bagFullAction')}</p>}
                  </ItemCard>
                );
              })}
        </div>
      </Panel>
    </Screen>
  );
}
