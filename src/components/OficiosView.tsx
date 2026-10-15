import { useEffect, useState } from 'react';
import Assets from '../assets.json';
import { fmtNum, t } from '../locales';
import { SaveData, playerLevel } from '../game/engine';
import { getMaterial, MaterialId, hasMaterials } from '../game/materials';
import { RefiningRecipe, RefiningStation, refiningRecipesForStation } from '../game/refining';
import { POTION_RECIPES, potionRecipeInTier, potionRecipeKey } from '../game/potions';
import { getConsumable } from '../game/consumables';
import { REFINE_CATEGORIES } from './refineCategories';
import MaterialIcon from './MaterialIcon';
import ConsumableIcon from './ConsumableIcon';
import StashHint from './StashHint';
import { applyCraftPotion, applyRefine } from '../game/craftActions';

const matText = (k: string): string => t(`materials.${k}`);
const conText = (k: string): string => t(`consumables.${k}`);

// Ofícios as its own main-content area (desktop: big panel + category tabs + a responsive grid of
// recipe cards; mobile: same categories/cards, one per row) — instead of the old narrow modal. Same
// REFINE_CATEGORIES / RefiningRecipe / POTION_RECIPES data and onRefine/onCraftPotion handlers as
// ForgeModal's "Refino" tab (mobile) and the previous OficiosModal; only the presentation changes.
export default function OficiosView({
  save,
  onRefine,
  onCraftPotion,
  focus,
}: {
  save: SaveData;
  onRefine: (recipeId: string) => void;
  onCraftPotion: (recipeId: string) => void;
  // Opened from an item's "Usar em...": the station (or 'potions') to open and the recipe to bring into view.
  focus?: { category: RefiningStation | 'potions'; recipeId: string } | null;
}) {
  const [category, setCategory] = useState<RefiningStation | 'potions'>(focus?.category ?? REFINE_CATEGORIES[0].id);
  useEffect(() => {
    if (focus) document.querySelector(`[data-recipe-id="${focus.recipeId}"]`)?.scrollIntoView({ block: 'center' });
  }, [focus]);
  const [justMade, setJustMade] = useState<string | null>(null);
  const level = playerLevel(save.xp);

  const produce = (recipeId: string, isPotion: boolean) => {
    if (isPotion) onCraftPotion(recipeId);
    else onRefine(recipeId);
    setJustMade(recipeId);
    window.setTimeout(() => setJustMade(null), 1500);
  };

  const stationRecipes: RefiningRecipe[] = category === 'potions' ? [] : refiningRecipesForStation(category);

  return (
    <div className="desktop-home oficios-view">
      <section className="dh-card oficios-panel">
        <h3 className="dh-card-title">{t('nav.oficios')}</h3>
        <div className="forge-tabs oficios-tabs">
          {REFINE_CATEGORIES.map((c) => (
            <button
              key={c.id}
              className={`tab${category === c.id ? ' active' : ''}`}
              onClick={() => setCategory(c.id)}
              data-ui
            >
              {t(`forge.${c.titleKey}`)}
            </button>
          ))}
        </div>

        <div className="oficios-grid">
          {category === 'potions'
            ? POTION_RECIPES.filter((recipe) => potionRecipeInTier(recipe, save.highestDungeonFloor)).map((recipe) => {
                const key = potionRecipeKey(recipe);
                const consumable = getConsumable(recipe.id)!;
                const bagFull = applyCraftPotion(save, key).reason === 'bag';
                const ok = save.gold >= recipe.cost && level >= recipe.requiredLevel && hasMaterials(save.materials, recipe.input) && !bagFull;
                const made = justMade === key;
                const owned = save.consumables?.[recipe.id] ?? 0;
                return (
                  <div className={`oficios-card${focus?.recipeId === key ? ' focus' : ''}`} key={key} data-recipe-id={key}>
                    <div className="oficios-card-head">
                      <span className="oficios-card-icon">
                        <ConsumableIcon item={consumable} />
                      </span>
                      <div className="oficios-card-title">
                        <span className="craft-name">{conText(consumable.nameKey)}{recipe.zoneTier ? ` · ${t('forge.knowledgeTier', { n: recipe.zoneTier })}` : ''}</span>
                        <span className="gear-count">{t('shop.youHave', { n: owned })}</span>
                      </div>
                    </div>
                    <span className="craft-desc">{conText(consumable.descKey)}</span>
                    <div className="craft-req">
                      <span className="req-item">
                        <span className="mat-icon">
                          <img src={Assets.icons.gold.url} alt="" />
                        </span>
                        <span className={`req-amount${save.gold < recipe.cost ? ' missing' : ''}`}>{recipe.cost}</span>
                      </span>
                      {recipe.requiredLevel > 0 && (
                        <span className="req-item">
                          <span className="req-plus">+</span>
                          <span className="mat-icon level">⭐</span>
                          <span className={`req-amount${level < recipe.requiredLevel ? ' missing' : ''}`}>
                            {t('forge.levelReq', { n: recipe.requiredLevel })}
                          </span>
                        </span>
                      )}
                      {Object.entries(recipe.input).map(([mid, count]) => {
                        const need = count as number;
                        const have = save.materials[mid as MaterialId] ?? 0;
                        return (
                          <span className="req-item" key={`in-${mid}`}>
                            <span className="req-plus">+</span>
                            <span className="mat-icon">
                              <MaterialIcon item={getMaterial(mid as MaterialId)!} />
                            </span>
                            <span className={`req-amount${have < need ? ' missing' : ''}`}>
                              {fmtNum(have)}/{fmtNum(need)} {matText(`mat_${mid}`)}
                            </span>
                            <StashHint kind="material" id={mid} need={need} />
                          </span>
                        );
                      })}
                    </div>
                    {bagFull && <span className="craft-bag-full">{t('inventory.bagFullAction')}</span>}
                    <button
                      className={`craft-btn forge oficios-produce${made ? ' forged' : ''}`}
                      onClick={() => produce(key, true)}
                      disabled={!ok}
                      data-ui
                    >
                      {made ? t('forge.forged') : t('forge.forge')}
                    </button>
                  </div>
                );
              })
            : stationRecipes.map((recipe) => {
                const bagFull = applyRefine(save, recipe.id).reason === 'bag';
                const ok = save.gold >= recipe.cost && level >= recipe.requiredLevel && hasMaterials(save.materials, recipe.input) && !bagFull;
                const made = justMade === recipe.id;
                const outputMat = getMaterial(recipe.output)!;
                const owned = save.materials[recipe.output] ?? 0;
                return (
                  <div className={`oficios-card${focus?.recipeId === recipe.id ? ' focus' : ''}`} key={recipe.id} data-recipe-id={recipe.id}>
                    <div className="oficios-card-head">
                      <span className="oficios-card-icon">
                        <MaterialIcon item={outputMat} />
                      </span>
                      <div className="oficios-card-title">
                        <span className="craft-name">
                          {recipe.outputQty}× {matText(`mat_${recipe.output}`)}
                          {/* the four dust recipes make the same item: the title names what each one eats */}
                          {recipe.station === 'dust' && ` (${matText(`mat_${Object.keys(recipe.input)[0]}`)})`}
                        </span>
                        <span className="gear-count">{t('shop.youHave', { n: owned })}</span>
                      </div>
                    </div>
                    <div className="craft-req">
                      <span className="req-item">
                        <span className="mat-icon">
                          <img src={Assets.icons.gold.url} alt="" />
                        </span>
                        <span className={`req-amount${save.gold < recipe.cost ? ' missing' : ''}`}>{recipe.cost}</span>
                      </span>
                      {recipe.requiredLevel > 0 && (
                        <span className="req-item">
                          <span className="req-plus">+</span>
                          <span className="mat-icon level">⭐</span>
                          <span className={`req-amount${level < recipe.requiredLevel ? ' missing' : ''}`}>
                            {t('forge.levelReq', { n: recipe.requiredLevel })}
                          </span>
                        </span>
                      )}
                      {Object.entries(recipe.input).map(([mid, count]) => {
                        const need = count as number;
                        const have = save.materials[mid as MaterialId] ?? 0;
                        return (
                          <span className="req-item" key={`in-${mid}`}>
                            <span className="req-plus">+</span>
                            <span className="mat-icon">
                              <MaterialIcon item={getMaterial(mid as MaterialId)!} />
                            </span>
                            <span className={`req-amount${have < need ? ' missing' : ''}`}>
                              {fmtNum(have)}/{fmtNum(need)} {matText(`mat_${mid}`)}
                            </span>
                            <StashHint kind="material" id={mid} need={need} />
                          </span>
                        );
                      })}
                    </div>
                    {bagFull && <span className="craft-bag-full">{t('inventory.bagFullAction')}</span>}
                    <button
                      className={`craft-btn forge oficios-produce${made ? ' forged' : ''}`}
                      onClick={() => produce(recipe.id, false)}
                      disabled={!ok}
                      data-ui
                    >
                      {made ? t('forge.forged') : t('forge.refine')}
                    </button>
                  </div>
                );
              })}
        </div>
      </section>
    </div>
  );
}
