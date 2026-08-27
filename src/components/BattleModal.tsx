import { useEffect, useRef, useState } from 'react';
import T from '../game/tunables';
import Text from '../locales/en.json';
import Assets from '../assets.json';
import { SaveData, playerMaxHp } from '../game/engine';
import { getEnemyDef } from '../game/enemies';
import { effectiveCrit, effectiveDamage, effectiveResistance, getEquipped, refineLevel } from '../game/gear';
import { FloorDef } from '../game/dungeon';
import { MaterialId, materialIconUrl } from '../game/materials';
import { enemySpriteUrl, spriteForArmorTier } from '../game/sprites';
import SpriteSheet from './SpriteSheet';
import { isMiniBoss, RunRewards, stageEnemyDmg, stageEnemyHp, waveRewards } from '../game/waves';

const enemyText = (k: string): string => (Text.enemies as Record<string, string>)[k];
const dungeonText = (k: string): string => (Text.dungeon as Record<string, string>)[k];
const materialName = (mid: string): string => (Text.materials as Record<string, string>)[`mat_${mid}`];
const materialIcon = (mid: string): string => materialIconUrl(mid as MaterialId);
const stageLabel = (f: number, s: number) => Text.dungeon.stageLabel.replace('{f}', String(f)).replace('{s}', String(s));

interface FloatItem {
  id: number;
  side: 'p' | 'e';
  text: string;
  kind: 'damage' | 'crit';
}

type Phase = 'battle' | 'intermission' | 'retreat' | 'defeat';

const ANIM_ROW: Record<string, number> = { idle: 0, attack: 1, hurt: 2 };

export default function BattleModal({
  save,
  floor,
  onRetreat,
  onDefeat,
}: {
  save: SaveData;
  floor: FloorDef;
  onRetreat: (rewards: RunRewards) => void;
  onDefeat: (rewards: RunRewards) => void;
}) {
  const def = getEnemyDef(floor.enemyKind);
  const build = getEquipped(save.equipped);
  const weapon = build.weapon;
  const armor = build.armor;
  const wLvl = refineLevel(save.upgrades, save.equipped.weapon);
  const aLvl = refineLevel(save.upgrades, save.equipped.armor);
  const armorTier = armor?.tier ?? 0;
  const critMult = T.combat.critMult + (build.relic?.critMultBonus ?? 0);

  const playerMax = playerMaxHp(save);

  const [stage, setStage] = useState(1);
  const [miniBoss, setMiniBoss] = useState(false);
  const [enemyMax, setEnemyMax] = useState(() => stageEnemyHp(def, 1));
  const [playerHp, setPlayerHp] = useState(playerMax);
  const [enemyHp, setEnemyHp] = useState(() => stageEnemyHp(def, 1));
  const [phase, setPhase] = useState<Phase>('battle');
  const [floats, setFloats] = useState<FloatItem[]>([]);
  const [playerAnim, setPlayerAnim] = useState<'idle' | 'attack' | 'hurt'>('idle');
  const [enemyAnim, setEnemyAnim] = useState<'idle' | 'attack' | 'hurt'>('idle');
  const [playerLunge, setPlayerLunge] = useState(false);
  const [enemyLunge, setEnemyLunge] = useState(false);
  const [playerFlash, setPlayerFlash] = useState(false);
  const [enemyFlash, setEnemyFlash] = useState(false);
  const [speed, setSpeed] = useState<1 | 2>(1);
  const [turnProgress, setTurnProgress] = useState(0);
  const [accumGold, setAccumGold] = useState(0);
  const [accumCount, setAccumCount] = useState(0);
  const [finalRewards, setFinalRewards] = useState<RunRewards | null>(null);
  const [waveClear, setWaveClear] = useState<{ stage: number; gold: number; drops: Partial<Record<MaterialId, number>>; shards: number } | null>(null);

  const hp = useRef({ p: playerMax, e: stageEnemyHp(def, 1) });
  const phaseRef = useRef<Phase>('battle');
  const speedRef = useRef<1 | 2>(1);
  const stageRef = useRef(1);
  const clearedRef = useRef(0);
  const accumRef = useRef<{ gold: number; drops: Partial<Record<MaterialId, number>>; shards: number; count: number }>({
    gold: 0,
    drops: {},
    shards: 0,
    count: 0,
  });
  const waveStartRef = useRef(0);
  const idRef = useRef(0);
  const onRetreatRef = useRef(onRetreat);
  onRetreatRef.current = onRetreat;
  const onDefeatRef = useRef(onDefeat);
  onDefeatRef.current = onDefeat;

  const addFloat = (side: 'p' | 'e', text: string, kind: 'damage' | 'crit') => {
    const id = idRef.current++;
    setFloats((f) => [...f, { id, side, text, kind }]);
    window.setTimeout(() => setFloats((f) => f.filter((x) => x.id !== id)), T.advanced.textFloatMs);
  };

  const endCombat = (outcome: 'retreat' | 'defeat') => {
    if (phaseRef.current !== 'battle' && phaseRef.current !== 'intermission') return;
    phaseRef.current = outcome;
    setPhase(outcome);
    setTurnProgress(0);
    const acc = accumRef.current;
    const gold = outcome === 'retreat' ? acc.gold : Math.floor(acc.gold / 2);
    setFinalRewards({ gold, drops: acc.drops, shards: acc.shards, stages: clearedRef.current });
  };

  useEffect(() => {
    let raf = 0;
    waveStartRef.current = performance.now();

    const applyLoot = (gold: number, drops: Partial<Record<MaterialId, number>>, shards: number) => {
      const acc = accumRef.current;
      const merged = { ...acc.drops };
      for (const [mid, qty] of Object.entries(drops)) {
        merged[mid as MaterialId] = (merged[mid as MaterialId] ?? 0) + (qty as number);
      }
      const count = Object.values(merged).reduce((a, b) => a + (b as number), 0);
      accumRef.current = { gold: acc.gold + gold, drops: merged, shards: acc.shards + shards, count };
      setAccumGold(accumRef.current.gold);
      setAccumCount(count);
    };

    const startNextWave = () => {
      if (phaseRef.current !== 'intermission') return;
      const next = stageRef.current + 1;
      stageRef.current = next;
      setStage(next);
      const nmax = stageEnemyHp(def, next);
      hp.current.e = nmax;
      setEnemyMax(nmax);
      setEnemyHp(nmax);
      setMiniBoss(isMiniBoss(next));
      setWaveClear(null);
      setTurnProgress(0);
      waveStartRef.current = performance.now();
      phaseRef.current = 'battle';
      setPhase('battle');
    };

    const clearWave = () => {
      const st = stageRef.current;
      const r = waveRewards(floor, st);
      applyLoot(r.gold, r.drops, r.shards);
      clearedRef.current += 1;
      const healed = Math.min(playerMax, hp.current.p + playerMax * T.battle.waveHeal);
      hp.current.p = healed;
      setPlayerHp(healed);
      setWaveClear({ stage: st, gold: r.gold, drops: r.drops, shards: r.shards });
      phaseRef.current = 'intermission';
      setPhase('intermission');
      setTurnProgress(0);
      window.setTimeout(startNextWave, T.battle.intermissionMs);
    };

    const runTurn = () => {
      const st = stageRef.current;
      const baseDmg = (T.combat.attackMin + T.combat.attackMax) / 2;
      const total = baseDmg + effectiveDamage(weapon, wLvl) + save.str * T.advanced.strDmgPerPoint;
      const crit = Math.random() < effectiveCrit(weapon, wLvl);
      const dmg = Math.max(1, Math.round(total * (crit ? critMult : 1)));
      hp.current.e = Math.max(0, hp.current.e - dmg);
      setEnemyHp(hp.current.e);
      setPlayerAnim('attack');
      setPlayerLunge(true);
      setEnemyFlash(true);
      addFloat('e', crit ? `💥 CRIT! -${dmg}` : `-${dmg}`, crit ? 'crit' : 'damage');
      window.setTimeout(() => {
        setPlayerLunge(false);
        setPlayerAnim('idle');
      }, T.battle.lungeMs);
      window.setTimeout(() => setEnemyFlash(false), T.battle.flashMs);

      if (hp.current.e <= 0) {
        clearWave();
        return;
      }

      const reduction = effectiveResistance(armor, aLvl) + save.res * T.advanced.resResistPerPoint;
      const eFinal = Math.max(1, Math.round(stageEnemyDmg(def, st) * (1 - reduction)));
      hp.current.p = Math.max(0, hp.current.p - eFinal);
      setPlayerHp(hp.current.p);
      setEnemyAnim('attack');
      setEnemyLunge(true);
      setPlayerFlash(true);
      addFloat('p', `-${eFinal}`, 'damage');
      window.setTimeout(() => {
        setEnemyLunge(false);
        setEnemyAnim('idle');
      }, T.battle.lungeMs);
      window.setTimeout(() => setPlayerFlash(false), T.battle.flashMs);

      if (hp.current.p <= 0) {
        endCombat('defeat');
      }
    };

    const step = (now: number) => {
      raf = requestAnimationFrame(step);
      if (phaseRef.current !== 'battle') return;
      const effTurn = T.battle.turnMs / speedRef.current;
      const elapsed = now - waveStartRef.current;
      setTurnProgress(Math.min(1, elapsed / effTurn));
      if (elapsed >= effTurn) {
        waveStartRef.current = now;
        runTurn();
      }
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleSpeed = () => {
    const next = speedRef.current === 1 ? 2 : 1;
    speedRef.current = next;
    setSpeed(next);
  };

  const pct = (cur: number, max: number) => (max <= 0 ? 0 : Math.max(0, Math.min(100, (cur / max) * 100)));

  const renderLoot = (gold: number, drops: Partial<Record<MaterialId, number>>, shards: number) => (
    <>
      <span className="floor-drop">
        <span className="mat-icon">
          <img src={Assets.icons.gold.url} alt="" />
        </span>
        <span>+{gold} Gold</span>
      </span>
      {Object.entries(drops ?? {}).map(([mid, qty]) => (
        <span className="floor-drop" key={mid}>
          <span className="mat-icon">
            <img src={materialIcon(mid)} alt="" />
          </span>
          <span>
            +{qty}× {materialName(mid)}
          </span>
        </span>
      ))}
      {shards > 0 && (
        <span className="floor-drop">
          <span className="mat-icon shard">🔷</span>
          <span>+{shards} Shards</span>
        </span>
      )}
    </>
  );

  return (
    <div className="modal-backdrop battle-backdrop">
      <div className="battle">
        <div className="battle-controls">
          <span className="stage-indicator">{stageLabel(floor.floor, stage)}</span>
          <div className="battle-control-btns">
            <button className="battle-speed" onClick={toggleSpeed} data-ui>
              {dungeonText('speed').replace('{n}', String(speed))}
            </button>
            <button
              className="battle-run"
              onClick={() => endCombat('retreat')}
              disabled={phase === 'retreat' || phase === 'defeat'}
              data-ui
            >
              {Text.dungeon.retreat}
            </button>
          </div>
        </div>

        <div className="battle-loot-hud">
          <span className="loot-gold">{dungeonText('accumGold').replace('{n}', String(accumGold))}</span>
          <span className="loot-drops">{dungeonText('accumDrops').replace('{n}', String(accumCount))}</span>
        </div>

        <div className="battle-top">
          <div className="battle-hud hero">
            <span className="hp-label">{dungeonText('heroLabel')}</span>
            <div className="battle-hp-row">
              <div className="bar hp">
                <div className="bar-fill hp-fill" style={{ width: `${pct(playerHp, playerMax)}%` }} />
              </div>
              <span className="hp-num">
                {playerHp} / {playerMax}
              </span>
            </div>
            <div className="battle-atkbar">
              <div className="battle-atkbar-fill" style={{ width: `${turnProgress * 100}%` }} />
            </div>
          </div>

          <div className="battle-hud enemy">
            <span className="hp-label">
              {enemyText(def.nameKey)}
              {miniBoss && <span className="miniboss-tag">{Text.dungeon.miniBoss}</span>}
            </span>
            <div className="battle-hp-row">
              <div className="bar hp enemy-hp">
                <div className="bar-fill enemy-hp-fill" style={{ width: `${pct(enemyHp, enemyMax)}%` }} />
              </div>
              <span className="hp-num">
                {enemyHp} / {enemyMax}
              </span>
            </div>
            <div className="battle-atkbar">
              <div className="battle-atkbar-fill" style={{ width: `${turnProgress * 100}%` }} />
            </div>
          </div>
        </div>

        <div className="battle-arena">
          <div className={`battle-side player${playerLunge ? ' lunge' : ''}${playerFlash ? ' flash' : ''}`}>
            <SpriteSheet
              src={spriteForArmorTier(armorTier)}
              size="calc(var(--sprite-size, 132px) * 1.1)"
              row={ANIM_ROW[playerAnim]}
            />
            {floats.filter((f) => f.side === 'p').map((f) => (
              <span key={f.id} className={`float float-${f.kind}`}>
                {f.text}
              </span>
            ))}
          </div>
          <div className="battle-vs">VS</div>
          <div className={`battle-side enemy${enemyLunge ? ' lunge' : ''}${enemyFlash ? ' flash' : ''}`}>
            <SpriteSheet
              src={enemySpriteUrl(floor.enemyKind)}
              size="calc(var(--sprite-size, 132px) * 1.1)"
              row={ANIM_ROW[enemyAnim]}
              flip
            />
            {floats.filter((f) => f.side === 'e').map((f) => (
              <span key={f.id} className={`float float-${f.kind}`}>
                {f.text}
              </span>
            ))}
          </div>

          {waveClear && phase === 'intermission' && (
            <div className="wave-banner">
              <div className="wave-title">{dungeonText('waveCleared').replace('{n}', String(waveClear.stage))}</div>
              <div className="wave-loot">{renderLoot(waveClear.gold, waveClear.drops, waveClear.shards)}</div>
            </div>
          )}
        </div>

        {(phase === 'retreat' || phase === 'defeat') && finalRewards && (
          <div className="battle-result">
            {phase === 'retreat' ? (
              <>
                <h2 className="result-title win">{Text.dungeon.retreatTitle}</h2>
                <div className="result-rewards">{renderLoot(finalRewards.gold, finalRewards.drops, finalRewards.shards)}</div>
                <button className="result-btn" onClick={() => onRetreat(finalRewards)} data-ui>
                  {Text.dungeon.collect}
                </button>
              </>
            ) : (
              <>
                <h2 className="result-title lose">{Text.dungeon.defeated}</h2>
                <div className="gold-penalty">{Text.dungeon.goldPenalty}</div>
                <div className="result-rewards">{renderLoot(finalRewards.gold, finalRewards.drops, finalRewards.shards)}</div>
                <button className="result-btn" onClick={() => onDefeat(finalRewards)} data-ui>
                  {Text.dungeon.return}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
