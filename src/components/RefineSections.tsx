import { useState } from 'react';
import Assets from '../assets.json';
import { t } from '../locales';
import { SaveData } from '../game/engine';
import { getMaterial, MaterialId, hasMaterials } from '../game/materials';
import { RefiningRecipe, RefiningStation, refiningRecipesForStation } from '../game/refining';
import { POTION_RECIPES, PotionRecipe } from '../game/potions';
import { getConsumable } from '../game/consumables';
import MaterialIcon from './MaterialIcon';
import ConsumableIcon from './ConsumableIcon';

const matText = (k: string): string => t(`materials.${k}`);
const conText = (k: string): string => t(`consumables.${k}`);

export function RefineStationSection({
  station,
  sectionTitle,
  save,
  level,
  onRefine,
}: {
  station: RefiningStation;
  sectionTitle: string;
  save: SaveData;
  level: number;
  onRefine: (recipeId: string) => void;
}) {
  const [justRefined, setJustRefined] = useState<string | null>(null);
  const recipes = refiningRecipesForStation(station);
  if (recipes.length === 0) return null;

  const canRefine = (recipe: RefiningRecipe): boolean => {
    if (save.gold < recipe.cost) return false;
    if (level < recipe.requiredLevel) return false;
    return hasMaterials(save.materials, recipe.input);
  };

  const handleRefine = (recipeId: string) => {
    onRefine(recipeId);
    setJustRefined(recipeId);
    window.setTimeout(() => setJustRefined(null), 1500);
  };

  return (
    <div className="gear-section">
      <div className="gear-section-title">{sectionTitle}</div>
      {recipes.map((recipe) => {
        const ok = canRefine(recipe);
        const refined = justRefined === recipe.id;
        const outputMat = getMaterial(recipe.output)!;
        return (
          <div className="craft-card refine-card" key={recipe.id}>
            <span className="craft-icon">
              <MaterialIcon item={outputMat} />
            </span>
            <div className="craft-info">
              <div className="craft-header">
                <span className="craft-name">
                  {recipe.outputQty}× {matText(`mat_${recipe.output}`)}
                </span>
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
                        {need}× {matText(`mat_${mid}`)}
                      </span>
                    </span>
                  );
                })}
              </div>
            </div>
            <button
              className={`craft-btn forge${refined ? ' forged' : ''}`}
              onClick={() => handleRefine(recipe.id)}
              disabled={!ok}
              data-ui
            >
              {refined ? t('forge.forged') : t('forge.refine')}
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function PotionsSection({
  sectionTitle,
  save,
  level,
  onCraftPotion,
}: {
  sectionTitle: string;
  save: SaveData;
  level: number;
  onCraftPotion: (recipeId: string) => void;
}) {
  const [justCraftedPotion, setJustCraftedPotion] = useState<string | null>(null);

  const canCraftPotion = (recipe: PotionRecipe): boolean => {
    if (save.gold < recipe.cost) return false;
    if (level < recipe.requiredLevel) return false;
    return hasMaterials(save.materials, recipe.input);
  };

  const handleCraftPotion = (recipeId: string) => {
    onCraftPotion(recipeId);
    setJustCraftedPotion(recipeId);
    window.setTimeout(() => setJustCraftedPotion(null), 1500);
  };

  return (
    <div className="gear-section">
      <div className="gear-section-title">{sectionTitle}</div>
      {POTION_RECIPES.map((recipe) => {
        const consumable = getConsumable(recipe.id)!;
        const ok = canCraftPotion(recipe);
        const crafted = justCraftedPotion === recipe.id;
        const owned = save.consumables?.[recipe.id] ?? 0;
        return (
          <div className="craft-card refine-card" key={recipe.id}>
            <span className="craft-icon">
              <ConsumableIcon item={consumable} />
            </span>
            <div className="craft-info">
              <div className="craft-header">
                <span className="craft-name">{conText(consumable.nameKey)}</span>
                <span className="gear-count">{t('shop.youHave', { n: owned })}</span>
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
                        {need}× {matText(`mat_${mid}`)}
                      </span>
                    </span>
                  );
                })}
              </div>
            </div>
            <button
              className={`craft-btn forge${crafted ? ' forged' : ''}`}
              onClick={() => handleCraftPotion(recipe.id)}
              disabled={!ok}
              data-ui
            >
              {crafted ? t('forge.forged') : t('forge.forge')}
            </button>
          </div>
        );
      })}
    </div>
  );
}
