import { useEffect, useRef, useState } from 'react';
import { fmtNum, t } from '../locales';
import { computeGardenSlotStatus, GARDEN_SLOTS, GardenStatus, SaveData } from '../game/engine';
import { getPlant, plantHarvestXp, PLANTS, PlantDef, plotUnlockLevel, unlockedGardenPlots } from '../game/garden';
import { applyHarvest, readySlots } from '../game/gardenActions';
import { skillLevel } from '../game/skills';
import SkillLevelBadge from './SkillLevelBadge';
import TitleIcon from './TitleIcon';
import UnlockList from './UnlockList';
import { plantGrowthMs } from '../game/mastery';
import { Button, Chip, ItemCard, ItemFrame, ModalShell, Panel, ScreenLayout } from './ui';
import type { CardRarity } from './ui';
import { Meter } from './HuntParts';

const gardenText = (k: string): string => t(`garden.${k}`);
const matText = (k: string): string => t(`materials.mat_${k}`);
const plantRarity = (r: PlantDef['rarity']): CardRarity => (r === 'rare' ? 'epic' : r === 'uncommon' ? 'rare' : 'common');

function formatRemaining(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// Total growth time of a plant, for the picker ("2h", "6h", "1h 30m").
function formatDuration(ms: number): string {
  const totalMin = Math.max(1, Math.round(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}

function Plot({
  index,
  status,
  lastPlant,
  gardeningLevel,
  armedUproot,
  fertilized,
  fertilizerQty,
  onPick,
  onPlantAgain,
  onHarvest,
  onUproot,
  onFertilize,
}: {
  index: number;
  status: GardenStatus;
  lastPlant: PlantDef | undefined;
  gardeningLevel: number;
  armedUproot: boolean;
  fertilized: boolean;
  fertilizerQty: number;
  onPick: () => void;
  onPlantAgain: (plantId: string) => void;
  onHarvest: () => void;
  onUproot: () => void;
  onFertilize: () => void;
}) {
  const def = status.plantId ? getPlant(status.plantId) : undefined;
  const title = gardenText('plotName').replace('{n}', String(index + 1));

  if (!def) {
    const canAgain = !!lastPlant && gardeningLevel >= lastPlant.requiredLevel;
    return (
      <ItemCard
        className="gd-plot empty"
        icon={<span className="gd-soil">+</span>}
        name={title}
        rarityLabel={gardenText('empty')}
        action={
          <div className="gd-actions">
            <Button block onClick={onPick}>
              {gardenText('plant')}
            </Button>
            {canAgain && lastPlant && (
              <Button block size="sm" className="gd-again" onClick={() => onPlantAgain(lastPlant.id)} aria-label={gardenText('plantAgain')}>
                <span>↻ {gardenText('plantAgain')}</span>
                <span>
                  <TitleIcon src={lastPlant.iconUrl} fallback={lastPlant.icon} className="garden-inline-icon" /> {gardenText(lastPlant.nameKey)}
                </span>
              </Button>
            )}
          </div>
        }
      />
    );
  }

  const progress = status.durationMs <= 0 ? 0 : Math.max(0, Math.min(1, status.elapsedMs / status.durationMs));
  const pct = status.ready ? 100 : Math.min(99, Math.floor(progress * 100));
  return (
    <ItemCard
      className={`gd-plot ${status.ready ? 'ready' : 'growing'}`}
      icon={<TitleIcon src={def.iconUrl} fallback={def.icon} className="garden-item-icon" />}
      rarity={plantRarity(def.rarity)}
      name={gardenText(def.nameKey)}
      rarityLabel={title}
      tag={<Chip tone={status.ready ? 'good' : 'gold'}>{gardenText(status.ready ? 'statusReady' : 'statusGrowing')}</Chip>}
      selected={status.ready}
      action={
        status.ready ? (
          <Button variant="primary" block onClick={onHarvest}>
            {gardenText('harvest')}
          </Button>
        ) : (
          <div className="gd-actions">
            {fertilized ? (
              <Chip tone="good">{gardenText('fertilized')}</Chip>
            ) : (
              fertilizerQty > 0 && (
                <Button block size="sm" onClick={onFertilize} title={gardenText('fertilizeHint').replace('{n}', String(fertilizerQty))}>
                  <img className="garden-inline-icon" src="/assets/icons/fertilizer.png" alt="" /> {gardenText('fertilize')} ({fertilizerQty})
                </Button>
              )
            )}
            <Button block size="sm" variant="danger" onClick={onUproot}>
              {armedUproot ? gardenText('uprootConfirm') : gardenText('cancel')}
            </Button>
          </div>
        )
      }
    >
      <p className="gd-yield">{gardenText('yield').replace('{qty}', String(def.qty)).replace('{name}', matText(def.material))}</p>
      {/* Ready is said once, by the "Pronto" tag and the green frame; the bar and the time only matter while it grows. */}
      {!status.ready && (
        <>
          <Meter pct={pct} label={gardenText(def.nameKey)} />
          <p className="gd-time">
            <span>{formatRemaining(status.remainingMs)}</span>
            <span>{pct}%</span>
          </p>
        </>
      )}
    </ItemCard>
  );
}

export default function GardenModal({
  save,
  onPlant,
  onHarvest,
  onUproot,
  onFertilize,
  onClose,
}: {
  save: SaveData;
  onPlant: (plantId: string, slotIndices: number[]) => void;
  onHarvest: (slotIndices: number[]) => void;
  onUproot: (slotIndex: number) => void;
  onFertilize: (slotIndex: number) => void;
  onClose: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [pickerFor, setPickerFor] = useState<number | null>(null);
  const [plantAll, setPlantAll] = useState(false);
  const [armedUproot, setArmedUproot] = useState<number | null>(null);
  const [floats, setFloats] = useState<{ id: number; slot: number; text: string }[]>([]);
  const floatSeq = useRef(0);

  useEffect(() => {
    const iv = window.setInterval(() => setNow(Date.now()), 1000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') setNow(Date.now());
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(iv);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // "Uproot" needs a second tap; the arm wears off by itself so a stray tap never leaves it loaded.
  useEffect(() => {
    if (armedUproot === null) return;
    const id = window.setTimeout(() => setArmedUproot(null), 3000);
    return () => window.clearTimeout(id);
  }, [armedUproot]);

  // Escape closes the plant picker first (stopPropagation keeps App's Escape-closes-modal handler from also
  // closing the whole garden behind it).
  useEffect(() => {
    if (pickerFor === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setPickerFor(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pickerFor]);

  const gardeningLevel = skillLevel(save.skillXp.gardening, 'gardening');
  const statuses = Array.from({ length: GARDEN_SLOTS }, (_, i) => computeGardenSlotStatus(save, now, i));
  const openPlots = unlockedGardenPlots(gardeningLevel);
  const emptyIdx = statuses.flatMap((s, i) => (s.plantId || i >= openPlots ? [] : [i]));
  const nextPlant = PLANTS.filter((p) => p.requiredLevel > gardeningLevel).sort((a, b) => a.requiredLevel - b.requiredLevel)[0];
  // the locked plots are ONE row ("+4 canteiros trancados (Jardinagem Nv 15, 25, 40, 60)"), not one row each
  const lockedLevels = Array.from({ length: GARDEN_SLOTS - openPlots }, (_, k) => plotUnlockLevel(openPlots + k));
  const fertilizerQty = save.consumables.fertilizer ?? 0;
  const readyIdx = readySlots(save, now);
  // ready plots whose yield has no room in the inventory (a harvest is refused for them; the crop stays ready)
  const bagBlocked = applyHarvest(save, readyIdx, now)?.blocked ?? [];

  const harvest = (indices: number[]) => {
    const harvestable = new Set(applyHarvest(save, indices, now)?.harvested.map((h) => h.slot) ?? []);
    const fresh = indices
      // one float per plot even if the tap arrives twice before the card re-renders as empty; none for a plot the full inventory refuses
      .filter((i) => harvestable.has(i) && statuses[i]?.ready && statuses[i].plantId && !floats.some((f) => f.slot === i))
      .map((i) => {
        const plant = getPlant(statuses[i].plantId as string)!;
        return { id: ++floatSeq.current, slot: i, text: `+${plant.qty} ${matText(plant.material)}` };
      });
    onHarvest(indices);
    if (fresh.length === 0) return;
    setFloats((prev) => [...prev, ...fresh]);
    window.setTimeout(() => setFloats((prev) => prev.filter((f) => !fresh.some((x) => x.id === f.id))), 1500);
  };

  const uproot = (i: number) => {
    if (armedUproot === i) {
      setArmedUproot(null);
      onUproot(i);
    } else {
      setArmedUproot(i);
    }
  };

  const choose = (plantId: string) => {
    if (pickerFor === null) return;
    onPlant(plantId, plantAll && emptyIdx.length > 1 ? emptyIdx : [pickerFor]);
    setPickerFor(null);
    setPlantAll(false);
  };

  const summary = (
    <>
      <Panel>
        <SkillLevelBadge xp={save.skillXp.gardening} labelKey="garden.skillLabel" skillId="gardening">
          <p className="pf-meta">
            {nextPlant ? gardenText('nextUnlock').replace('{name}', gardenText(nextPlant.nameKey)).replace('{n}', String(nextPlant.requiredLevel)) : gardenText('allUnlocked')}
          </p>
        </SkillLevelBadge>
      </Panel>
    </>
  );

  const main = (
    <>
      {bagBlocked.length > 0 && <p className="ui-alert bad gd-bagfull">{t('garden.bagFull')}</p>}
      {readyIdx.length >= 2 && (
        <Button variant="primary" block onClick={() => harvest(readyIdx)}>
          {gardenText('harvestAll').replace('{n}', String(readyIdx.length))}
        </Button>
      )}
      <Panel title={gardenText('slotsTitle')}>
        <div className="ui-grid gd-plots">
          {statuses.slice(0, openPlots).map((status, i) => (
            <div className="gd-plot-wrap" key={i}>
              <Plot
                index={i}
                status={status}
                lastPlant={save.gardenSlots[i]?.lastPlantId ? getPlant(save.gardenSlots[i].lastPlantId as string) : undefined}
                gardeningLevel={gardeningLevel}
                armedUproot={armedUproot === i}
                fertilized={!!save.gardenSlots[i]?.fertilized}
                fertilizerQty={fertilizerQty}
                onFertilize={() => onFertilize(i)}
                onPick={() => {
                  setPlantAll(false);
                  setPickerFor(i);
                }}
                onPlantAgain={(plantId) => onPlant(plantId, [i])}
                onHarvest={() => harvest([i])}
                onUproot={() => uproot(i)}
              />
              {floats
                .filter((f) => f.slot === i)
                .map((f) => (
                  <span className="gd-float" key={f.id} aria-hidden="true">
                    {f.text}
                  </span>
                ))}
            </div>
          ))}
          {lockedLevels.length > 0 && (
            <div className="gd-plot-wrap is-locked">
              <div className="gd-plot locked" role="group" aria-label={gardenText('moreSlots').replace('{n}', String(lockedLevels.length)).replace('{levels}', lockedLevels.join(', '))}>
                <img className="pixel-icon" src="/assets/icons/garden_plot_locked.png" alt="" />
                <span className="gd-lock-name">{gardenText('moreSlots').replace('{n}', String(lockedLevels.length)).replace('{levels}', lockedLevels.join(', '))}</span>
              </div>
            </div>
          )}
        </div>
      </Panel>
      <UnlockList skill="gardening" level={gardeningLevel} collapsed />
    </>
  );

  return (
    <ModalShell
      className={`pf-modal gd-modal${pickerFor !== null ? ' picking' : ''}`}
      tutorialTarget="garden-modal"
      icon={<img className="pixel-icon" src="/assets/icons/common_herb.png" alt="" />}
      title={gardenText('title')}
      subtitle={`${t('skills.level', { n: gardeningLevel })} · ${gardenText('plotsOpen').replace('{n}', String(openPlots)).replace('{max}', String(GARDEN_SLOTS))}`}
      closeLabel={t('ui.close')}
      onClose={onClose}
    >
      <div className="ui-cq">
        <ScreenLayout main={main} side={summary} className="pf-layout" />
      </div>

      {pickerFor !== null && (
        <div className="gd-picker" role="dialog" aria-label={gardenText('pickerTitle').replace('{n}', String(pickerFor + 1))}>
          <Panel className="gd-picker-panel" title={gardenText('pickerTitle').replace('{n}', String(pickerFor + 1))}>
            <div className="gd-picker-list">
              {PLANTS.map((plant) => {
                const unlocked = gardeningLevel >= plant.requiredLevel;
                return (
                  <button className={`gd-plant${unlocked ? '' : ' locked'}`} key={plant.id} onClick={() => choose(plant.id)} disabled={!unlocked} title={gardenText(plant.descKey)} data-ui>
                    <ItemFrame size="sm" rarity={plantRarity(plant.rarity)}>
                      <TitleIcon src={plant.iconUrl} fallback={plant.icon} className="garden-item-icon" />
                    </ItemFrame>
                    <span className="gd-plant-info">
                      <span className="gd-plant-name">
                        {gardenText(plant.nameKey)}
                        <span className={`ui-item-rarity r-${plantRarity(plant.rarity)}`}>{gardenText(`rarity_${plant.rarity}`)}</span>
                      </span>
                      <span className="gd-plant-meta">
                        {formatDuration(plantGrowthMs(plant, gardeningLevel))} · {gardenText('yieldShort').replace('{qty}', String(plant.qty))} · {fmtNum(plantHarvestXp(plant))} XP
                      </span>
                      <span className="gd-plant-use">{gardenText(plant.useKey)}</span>
                      {!unlocked && <span className="gd-plant-lock">{gardenText('locked').replace('{n}', String(plant.requiredLevel))}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
            {emptyIdx.length > 1 && (
              <label className="gd-picker-all">
                <input type="checkbox" checked={plantAll} onChange={(e) => setPlantAll(e.target.checked)} />
                <span>{gardenText('pickerAll').replace('{n}', String(emptyIdx.length))}</span>
              </label>
            )}
            <Button block variant="secondary" className="gd-picker-close" onClick={() => setPickerFor(null)}>
              {gardenText('close')}
            </Button>
          </Panel>
        </div>
      )}
    </ModalShell>
  );
}
