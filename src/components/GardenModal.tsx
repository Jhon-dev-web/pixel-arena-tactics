import { useEffect, useState } from 'react';
import { t } from '../locales';
import { computeGardenSlotStatus, GARDEN_SLOTS, playerLevel, SaveData } from '../game/engine';
import { getPlant, PLANTS } from '../game/garden';
import { getMaterial } from '../game/materials';
import MaterialIcon from './MaterialIcon';

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

export default function GardenModal({
  save,
  onPlant,
  onHarvest,
  onCancel,
  onClose,
}: {
  save: SaveData;
  onPlant: (plantId: string, count: number) => void;
  onHarvest: (slotIndex: number) => void;
  onCancel: (slotIndex: number) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'slots' | 'plant'>('slots');
  const [now, setNow] = useState(() => Date.now());
  const [pickingPlant, setPickingPlant] = useState<string | null>(null);
  const [count, setCount] = useState(1);

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

  const level = playerLevel(save.xp);
  const slotStatuses = Array.from({ length: GARDEN_SLOTS }, (_, i) => computeGardenSlotStatus(save, now, i));
  const emptySlotCount = slotStatuses.filter((s) => !s.plantId).length;

  const openPicker = (plantId: string) => {
    setPickingPlant(plantId);
    setCount(Math.min(1, emptySlotCount) || 1);
  };

  const confirmPlant = () => {
    if (!pickingPlant) return;
    onPlant(pickingPlant, count);
    setPickingPlant(null);
    setTab('slots');
  };

  return (
    <div className="modal-backdrop">
      <div className="modal dungeon-modal">
        <h2 className="modal-title">{gardenText('title')}</h2>

        <div className="forge-tabs garden-tabs">
          <button className={`tab${tab === 'slots' ? ' active' : ''}`} onClick={() => setTab('slots')} data-ui>
            {gardenText('slotsTab')}
          </button>
          <button className={`tab${tab === 'plant' ? ' active' : ''}`} onClick={() => setTab('plant')} data-ui>
            {gardenText('plantTab')}
          </button>
        </div>

        <div className="dungeon-body">
          {tab === 'slots' && (
            <div className="garden-grid">
              {slotStatuses.map((status, i) => {
                const def = status.plantId ? getPlant(status.plantId) : undefined;
                const progress = status.durationMs <= 0 ? 0 : Math.max(0, Math.min(1, status.elapsedMs / status.durationMs));
                return (
                  <div className={`garden-slot compact${def ? '' : ' empty'}${status.ready ? ' equipped' : ''}`} key={i}>
                    {def ? (
                      <>
                        <span className="garden-slot-name compact">
                          <span className="mat-icon-emoji">{def.icon}</span> {gardenText(def.nameKey)}
                        </span>
                        <div className="camp-mine-bar thin">
                          <div className={`camp-mine-fill${status.ready ? ' full' : ''}`} style={{ width: `${progress * 100}%` }} />
                        </div>
                        <span className="camp-mine-time compact">
                          {status.ready ? gardenText('ready') : formatRemaining(status.remainingMs)}
                        </span>
                        <div className="repair-btns compact">
                          <button
                            className={`craft-btn forge repair-action-btn small${status.ready ? ' blink' : ''}`}
                            onClick={() => onHarvest(i)}
                            disabled={!status.ready}
                            data-ui
                          >
                            {gardenText('harvest')}
                          </button>
                          <button className="craft-btn blessed repair-action-btn small" onClick={() => onCancel(i)} data-ui>
                            {gardenText('cancel')}
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <span className="garden-slot-empty-icon">+</span>
                        <span className="garden-slot-empty">{gardenText('emptySlotHint')}</span>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {tab === 'plant' &&
            PLANTS.map((plant) => {
              const unlocked = level >= plant.requiredLevel;
              const mat = getMaterial(plant.material);
              const picking = pickingPlant === plant.id;
              return (
                <div className={`floor-card${unlocked ? '' : ' locked'}`} key={plant.id}>
                  <div className="floor-header">
                    <span className="floor-name">
                      <span className="mat-icon-emoji">{plant.icon}</span> {gardenText(plant.nameKey)}
                    </span>
                    <span className="floor-cp">{gardenText('levelReq').replace('{n}', String(plant.requiredLevel))}</span>
                  </div>

                  {unlocked ? (
                    <>
                      <div className="floor-drops">
                        <span className="drops-label">{t('dungeon.drops')}:</span>
                        <span className="floor-drop">
                          {mat && (
                            <span className="mat-icon">
                              <MaterialIcon item={mat} />
                            </span>
                          )}
                          <span>
                            +{plant.qty} {matText(plant.material)}
                          </span>
                        </span>
                      </div>
                      <span className="floor-locked">{gardenText(plant.descKey)}</span>

                      {picking ? (
                        <div className="garden-stepper">
                          <button
                            className="craft-btn blessed repair-action-btn"
                            onClick={() => setCount((c) => Math.max(1, c - 1))}
                            disabled={count <= 1}
                            data-ui
                          >
                            −
                          </button>
                          <span className="garden-stepper-count">{count}</span>
                          <button
                            className="craft-btn blessed repair-action-btn"
                            onClick={() => setCount((c) => Math.min(emptySlotCount, c + 1))}
                            disabled={count >= emptySlotCount}
                            data-ui
                          >
                            +
                          </button>
                          <button className="battle-btn" onClick={confirmPlant} data-ui>
                            {gardenText('confirm')}
                          </button>
                          <button className="camp-expedition-cancel" onClick={() => setPickingPlant(null)} data-ui>
                            {gardenText('back')}
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            className="battle-btn"
                            onClick={() => openPicker(plant.id)}
                            disabled={emptySlotCount <= 0}
                            title={emptySlotCount <= 0 ? gardenText('busy') : undefined}
                            data-ui
                          >
                            {gardenText('plant')}
                          </button>
                          {emptySlotCount <= 0 && <span className="floor-locked">{gardenText('busy')}</span>}
                        </>
                      )}
                    </>
                  ) : (
                    <span className="floor-locked">{gardenText('locked').replace('{n}', String(plant.requiredLevel))}</span>
                  )}
                </div>
              );
            })}
        </div>

        <button className="modal-x" onClick={onClose} aria-label="Close" data-ui>
          ✕
        </button>
      </div>
    </div>
  );
}
