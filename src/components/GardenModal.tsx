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

const gardenText = (k: string): string => t(`garden.${k}`);
const matText = (k: string): string => t(`materials.mat_${k}`);

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

// Plots 5 and 6 unlock with the Gardening level (garden.ts GARDEN_PLOT_UNLOCK_LEVELS): a locked plot renders the padlock card with the level it needs.
type PlotLock = { locked: true; level: number } | { locked?: false };

function Plot({
  index,
  status,
  lastPlant,
  gardeningLevel,
  armedUproot,
  fertilized,
  fertilizerQty,
  lock = {},
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
  lock?: PlotLock;
  onPick: () => void;
  onPlantAgain: (plantId: string) => void;
  onHarvest: () => void;
  onUproot: () => void;
  onFertilize: () => void;
}) {
  const def = status.plantId ? getPlant(status.plantId) : undefined;
  const title = gardenText('plotName').replace('{n}', String(index + 1));

  if (lock.locked) {
    return (
      <div className="garden-plot locked">
        <div className="garden-plot-head">
          <span className="garden-plot-num">{title}</span>
        </div>
        <img className="garden-plot-lock" src="/assets/icons/garden_plot_locked.png" alt="" />
        <span className="garden-plot-hint">{gardenText('plotLockedBody')}</span>
        <span className="garden-plot-chip lock-level">{gardenText('plotLockedLevel').replace('{n}', String(lock.level))}</span>
      </div>
    );
  }

  if (!def) {
    const canAgain = !!lastPlant && gardeningLevel >= lastPlant.requiredLevel;
    return (
      <div className="garden-plot empty">
        <div className="garden-plot-head">
          <span className="garden-plot-num">{title}</span>
          <span className="garden-plot-chip">{gardenText('empty')}</span>
        </div>
        <span className="garden-plot-soil" aria-hidden="true">
          +
        </span>
        <button className="garden-plot-btn plant" onClick={onPick} data-ui>
          {gardenText('plant')}
        </button>
        {canAgain && lastPlant && (
          <button className="garden-plot-again" onClick={() => onPlantAgain(lastPlant.id)} aria-label={gardenText('plantAgain')} data-ui>
            <span className="garden-plot-again-label">↻ {gardenText('plantAgain')}</span>
            <span>
              <TitleIcon src={lastPlant.iconUrl} fallback={lastPlant.icon} className="garden-inline-icon" /> {gardenText(lastPlant.nameKey)}
            </span>
          </button>
        )}
      </div>
    );
  }

  const progress = status.durationMs <= 0 ? 0 : Math.max(0, Math.min(1, status.elapsedMs / status.durationMs));
  const pct = status.ready ? 100 : Math.min(99, Math.floor(progress * 100));
  return (
    <div className={`garden-plot ${status.ready ? 'ready' : 'growing'} rarity-${def.rarity}`}>
      <div className="garden-plot-head">
        <span className="garden-plot-num">{title}</span>
        <span className="garden-plot-chip">{gardenText(status.ready ? 'statusReady' : 'statusGrowing')}</span>
      </div>
      <div className="garden-plot-plant">
        <span className="garden-plot-icon" aria-hidden="true">
          <TitleIcon src={def.iconUrl} fallback={def.icon} className="garden-item-icon" />
        </span>
        <span className="garden-plot-name">{gardenText(def.nameKey)}</span>
      </div>
      <span className="garden-plot-yield">
        {gardenText('yield').replace('{qty}', String(def.qty)).replace('{name}', matText(def.material))}
      </span>
      <div
        className="garden-plot-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={gardenText(def.nameKey)}
      >
        <div className="garden-plot-fill" style={{ width: `${pct}%` }} />
      </div>
      {status.ready ? (
        <>
          <span className="garden-plot-ready-text">{gardenText('readyLong')}</span>
          <button className="garden-plot-btn harvest" onClick={onHarvest} data-ui>
            {gardenText('harvest')}
          </button>
        </>
      ) : (
        <>
          <span className="garden-plot-time">
            <span className="garden-plot-remaining">{formatRemaining(status.remainingMs)}</span>
            <span className="garden-plot-pct">{pct}%</span>
          </span>
          {fertilized ? (
            <span className="garden-plot-fertilized">{gardenText('fertilized')}</span>
          ) : (
            fertilizerQty > 0 && (
              <button className="garden-plot-fertilize" onClick={onFertilize} title={gardenText('fertilizeHint').replace('{n}', String(fertilizerQty))} data-ui>
                <img className="garden-inline-icon" src="/assets/icons/fertilizer.png" alt="" /> {gardenText('fertilize')} ({fertilizerQty})
              </button>
            )
          )}
          <button className={`garden-plot-uproot${armedUproot ? ' armed' : ''}`} onClick={onUproot} data-ui>
            {armedUproot ? gardenText('uprootConfirm') : gardenText('cancel')}
          </button>
        </>
      )}
    </div>
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
  const nextPlotLevel = openPlots < GARDEN_SLOTS ? plotUnlockLevel(openPlots) : 0;
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

  return (
    <div className="modal-backdrop">
      <div className={`modal dungeon-modal garden-modal${pickerFor !== null ? ' picking' : ''}`} data-tutorial-target="garden-modal">
        <h2 className="modal-title">{gardenText('title')}</h2>

        <SkillLevelBadge xp={save.skillXp.gardening} labelKey="garden.skillLabel" skillId="gardening">
          <span className="skill-level-meta">
            {gardenText('plotsOpen').replace('{n}', String(openPlots)).replace('{max}', String(GARDEN_SLOTS))}
            {nextPlotLevel > 0 && ` · ${gardenText('nextPlot').replace('{n}', String(nextPlotLevel))}`}
          </span>
          <span className="skill-level-meta">
            {nextPlant
              ? gardenText('nextUnlock').replace('{name}', gardenText(nextPlant.nameKey)).replace('{n}', String(nextPlant.requiredLevel))
              : gardenText('allUnlocked')}
          </span>
        </SkillLevelBadge>

        <div className="dungeon-body">
          {bagBlocked.length > 0 && <p className="craft-bag-full">{t('garden.bagFull')}</p>}
          {readyIdx.length >= 2 && (
            <button className="garden-harvest-all" onClick={() => harvest(readyIdx)} data-ui>
              {gardenText('harvestAll').replace('{n}', String(readyIdx.length))}
            </button>
          )}
          <div className="garden-plots">
            {statuses.map((status, i) => (
              <div className="garden-plot-wrap" key={i}>
                <Plot
                  index={i}
                  status={status}
                  lastPlant={save.gardenSlots[i]?.lastPlantId ? getPlant(save.gardenSlots[i].lastPlantId as string) : undefined}
                  gardeningLevel={gardeningLevel}
                  armedUproot={armedUproot === i}
                  fertilized={!!save.gardenSlots[i]?.fertilized}
                  fertilizerQty={fertilizerQty}
                  lock={i >= openPlots ? { locked: true, level: plotUnlockLevel(i) } : {}}
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
                    <span className="garden-float" key={f.id} aria-hidden="true">
                      {f.text}
                    </span>
                  ))}
              </div>
            ))}
          </div>
          <UnlockList skill="gardening" level={gardeningLevel} />
        </div>

        <button className="modal-x" onClick={onClose} aria-label="Close" data-ui>
          ✕
        </button>

        {pickerFor !== null && (
          <div className="garden-picker" role="dialog" aria-label={gardenText('pickerTitle').replace('{n}', String(pickerFor + 1))}>
            <div className="garden-picker-panel">
              <h3 className="garden-picker-title">{gardenText('pickerTitle').replace('{n}', String(pickerFor + 1))}</h3>
              <div className="garden-picker-list">
                {PLANTS.map((plant) => {
                  const unlocked = gardeningLevel >= plant.requiredLevel;
                  return (
                    <button
                      className={`garden-plant-row rarity-${plant.rarity}${unlocked ? '' : ' locked'}`}
                      key={plant.id}
                      onClick={() => choose(plant.id)}
                      disabled={!unlocked}
                      title={gardenText(plant.descKey)}
                      data-ui
                    >
                      <span className="garden-plant-icon" aria-hidden="true">
                        <TitleIcon src={plant.iconUrl} fallback={plant.icon} className="garden-item-icon" />
                      </span>
                      <span className="garden-plant-info">
                        <span className="garden-plant-name">
                          {gardenText(plant.nameKey)}
                          <span className="garden-plant-rarity">{gardenText(`rarity_${plant.rarity}`)}</span>
                        </span>
                        <span className="garden-plant-meta">
                          {formatDuration(plantGrowthMs(plant, gardeningLevel))} · {gardenText('yieldShort').replace('{qty}', String(plant.qty))} · {fmtNum(plantHarvestXp(plant))} XP
                        </span>
                        <span className="garden-plant-use">{gardenText(plant.useKey)}</span>
                        {!unlocked && <span className="garden-plant-lock">{gardenText('locked').replace('{n}', String(plant.requiredLevel))}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
              {emptyIdx.length > 1 && (
                <label className="garden-picker-all">
                  <input type="checkbox" checked={plantAll} onChange={(e) => setPlantAll(e.target.checked)} />
                  <span>{gardenText('pickerAll').replace('{n}', String(emptyIdx.length))}</span>
                </label>
              )}
              <button className="camp-expedition-cancel garden-picker-close" onClick={() => setPickerFor(null)} data-ui>
                {gardenText('close')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
