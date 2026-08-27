import { useEffect, useRef, useState } from 'react';
import T from '../game/tunables';
import { t } from '../locales';
import Assets from '../assets.json';
import { SaveData, playerMaxHp } from '../game/engine';
import { getEnemyDef } from '../game/enemies';
import { durabilityFactor, effectiveCrit, effectiveDamage, effectiveResistance, getEquipped, MAX_DURABILITY, refineLevel } from '../game/gear';
import { FloorDef } from '../game/dungeon';
import { MaterialId, materialIconUrl } from '../game/materials';
import { enemySpriteUrl, spriteForArmorTier } from '../game/sprites';
import { playSfx } from '../game/audio';
import SpriteSheet from './SpriteSheet';
import { isMiniBoss, RunRewards, stageEnemyDmg, stageEnemyHp, waveRewards } from '../game/waves';
import { totalGemBonuses } from '../game/gems';

const enemyText = (k: string): string => t(`enemies.${k}`);
const dungeonText = (k: string): string => t(`dungeon.${k}`);
const materialName = (mid: string): string => t(`materials.mat_${mid}`);
const materialIcon = (mid: string): string => materialIconUrl(mid as MaterialId);
const stageLabel = (f: number, s: number) => t('dungeon.stageLabel', { f, s });

interface FloatItem {
  id: number;
  side: 'p' | 'e';
  text: string;
  kind: 'damage' | 'crit' | 'heal';
}

type Phase = 'battle' | 'intermission' | 'retreat' | 'defeat';

const ANIM_ROW: Record<string, number> = { idle: 0, attack: 1, hurt: 2 };

export default function BattleModal({
  save,
  floor,
  onRetreat,
  onDefeat,
  onUsePotion,
}: {
  save: SaveData;
  floor: FloorDef;
  onRetreat: (rewards: RunRewards) => void;
  onDefeat: (rewards: RunRewards) => void;
  onUsePotion: () => void;
}) {
  const def = getEnemyDef(floor.enemyKind);
  const build = getEquipped(save.equipped);
  const weapon = build.weapon;
  const armor = build.armor;
  const wLvl = refineLevel(save.upgrades, save.equipped.weapon);
  const aLvl = refineLevel(save.upgrades, save.equipped.armor);
  const armorTier = armor?.tier ?? 0;
  const gems = totalGemBonuses(save.equipped, save.sockets ?? {});
  const wDur = save.durability?.[save.equipped.weapon] ?? MAX_DURABILITY;
  const aDur = save.durability?.[save.equipped.armor] ?? MAX_DURABILITY;
  const wFactor = durabilityFactor(wDur);
  const aFactor = durabilityFactor(aDur);
  const critMult = T.combat.critMult + (build.relic?.critMultBonus ?? 0) + gems.critDamageBonus;
  const blessedMult = save.blessed ? 1.05 : 1;

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
  const [heroProgress, setHeroProgress] = useState(0);
  const [enemyProgress, setEnemyProgress] = useState(0);
  const [potionsLeft, setPotionsLeft] = useState(save.consumables?.small_hp ?? 0);
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
  const heroNextAtkRef = useRef(0);
  const enemyNextAtkRef = useRef(0);
  const potionCooldownUntilRef = useRef(0);
  const potionsLeftRef = useRef(save.consumables?.small_hp ?? 0);
  const idRef = useRef(0);
  const onRetreatRef = useRef(onRetreat);
  onRetreatRef.current = onRetreat;
  const onDefeatRef = useRef(onDefeat);
  onDefeatRef.current = onDefeat;
  const onUsePotionRef = useRef(onUsePotion);
  onUsePotionRef.current = onUsePotion;

  const addFloat = (side: 'p' | 'e', text: string, kind: 'damage' | 'crit' | 'heal') => {
    const id = idRef.current++;
    setFloats((f) => [...f, { id, side, text, kind }]);
    window.setTimeout(() => setFloats((f) => f.filter((x) => x.id !== id)), T.advanced.textFloatMs);
  };

  const endCombat = (outcome: 'retreat' | 'defeat') => {
    if (phaseRef.current !== 'battle' && phaseRef.current !== 'intermission') return;
    phaseRef.current = outcome;
    setPhase(outcome);
    setHeroProgress(0);
    setEnemyProgress(0);
    const acc = accumRef.current;
    const gold = outcome === 'retreat' ? acc.gold : Math.floor(acc.gold / 2);
    setFinalRewards({ gold, drops: acc.drops, shards: acc.shards, stages: clearedRef.current });
  };

  useEffect(() => {
    let raf = 0;
    const now0 = performance.now();
    heroNextAtkRef.current = now0;
    enemyNextAtkRef.current = now0;
    potionCooldownUntilRef.current = 0;

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
      setHeroProgress(0);
      setEnemyProgress(0);
      const now = performance.now();
      heroNextAtkRef.current = now;
      enemyNextAtkRef.current = now;
      phaseRef.current = 'battle';
      setPhase('battle');
    };

    const clearWave = () => {
      const st = stageRef.current;
      const r = waveRewards(floor, st);
      applyLoot(r.gold, r.drops, r.shards);
      clearedRef.current += 1;
      const healed = Math.min(playerMax, Math.round(hp.current.p + playerMax * T.battle.waveHeal));
      hp.current.p = healed;
      setPlayerHp(healed);
      setWaveClear({ stage: st, gold: r.gold, drops: r.drops, shards: r.shards });
      phaseRef.current = 'intermission';
      setPhase('intermission');
      setHeroProgress(0);
      setEnemyProgress(0);
      window.setTimeout(startNextWave, T.battle.intermissionMs);
    };

    const heroAttack = () => {
      const baseDmg = (T.combat.attackMin + T.combat.attackMax) / 2;
      const total = (baseDmg + effectiveDamage(weapon, wLvl) * wFactor + save.str * T.advanced.strDmgPerPoint) * blessedMult;
      const crit = Math.random() < effectiveCrit(weapon, wLvl) * wFactor;
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
      }
    };

    const monsterAttack = () => {
      const st = stageRef.current;
      const reduction = effectiveResistance(armor, aLvl) * aFactor + save.res * T.advanced.resResistPerPoint + gems.resistance;
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

    const tryAutoPotion = (now: number) => {
      if (potionsLeftRef.current <= 0) return;
      if (now < potionCooldownUntilRef.current) return;
      if (hp.current.p >= playerMax * T.battle.potionThreshold) return;
      potionsLeftRef.current -= 1;
      setPotionsLeft(potionsLeftRef.current);
      potionCooldownUntilRef.current = now + T.battle.potionCooldownMs;
      onUsePotionRef.current();
      const heal = Math.max(1, Math.round(T.battle.potionHeal));
      hp.current.p = Math.min(playerMax, hp.current.p + heal);
      setPlayerHp(hp.current.p);
      addFloat('p', `+${heal}`, 'heal');
      playSfx('focus');
    };

    const step = (now: number) => {
      raf = requestAnimationFrame(step);
      if (phaseRef.current !== 'battle') return;
      const spd = speedRef.current;

      tryAutoPotion(now);

      const heroMs = T.battle.heroAttackMs * (1 - save.agi * T.battle.agiSpeedPerPoint);
      const heroInterval = heroMs / spd;
      const heroElapsed = now - heroNextAtkRef.current;
      setHeroProgress(Math.min(1, heroElapsed / heroInterval));
      if (heroElapsed >= heroInterval) {
        heroNextAtkRef.current = now;
        heroAttack();
        if (phaseRef.current !== 'battle') return;
      }

      const enemyInterval = def.atkSpeedMs / spd;
      const enemyElapsed = now - enemyNextAtkRef.current;
      setEnemyProgress(Math.min(1, enemyElapsed / enemyInterval));
      if (enemyElapsed >= enemyInterval) {
        enemyNextAtkRef.current = now;
        monsterAttack();
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
        <span>{t('ui.goldReward', { n: gold })}</span>
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
          <span>{t('ui.shardsReward', { n: shards })}</span>
        </span>
      )}
    </>
  );

  return (
    <div className="modal-backdrop battle-backdrop">
      <div className="battle">
        <div className="battle-controls">
          <div className="battle-left">
            <span className="stage-indicator">{stageLabel(floor.floor, stage)}</span>
            <button className="battle-speed" onClick={toggleSpeed} data-ui>
              {dungeonText('speed').replace('{n}', String(speed))}
            </button>
          </div>
          <button
            className="battle-run"
            onClick={() => endCombat('retreat')}
            disabled={phase === 'retreat' || phase === 'defeat'}
            data-ui
          >
            {t('dungeon.retreat')}
          </button>
        </div>

        <div className="battle-loot-hud">
          <span className="loot-gold">{dungeonText('accumGold').replace('{n}', String(accumGold))}</span>
          <span className="loot-potions">{dungeonText('potions').replace('{n}', String(potionsLeft))}</span>
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
                {Math.round(playerHp)} / {playerMax}
              </span>
            </div>
            <div className="battle-atkbar">
              <div className="battle-atkbar-fill hero" style={{ width: `${heroProgress * 100}%` }} />
            </div>
          </div>

          <div className="battle-hud enemy">
            <span className="hp-label">
              {enemyText(def.nameKey)}
              {miniBoss && <span className="miniboss-tag">{t('dungeon.miniBoss')}</span>}
            </span>
            <div className="battle-hp-row">
              <div className="bar hp enemy-hp">
                <div className="bar-fill enemy-hp-fill" style={{ width: `${pct(enemyHp, enemyMax)}%` }} />
              </div>
              <span className="hp-num">
                {Math.round(enemyHp)} / {enemyMax}
              </span>
            </div>
            <div className="battle-atkbar">
              <div className="battle-atkbar-fill enemy" style={{ width: `${enemyProgress * 100}%` }} />
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
                <h2 className="result-title win">{t('dungeon.retreatTitle')}</h2>
                <div className="result-rewards">{renderLoot(finalRewards.gold, finalRewards.drops, finalRewards.shards)}</div>
                <button className="result-btn" onClick={() => onRetreat(finalRewards)} data-ui>
                  {t('dungeon.collect')}
                </button>
              </>
            ) : (
              <>
                <h2 className="result-title lose">{t('dungeon.defeated')}</h2>
                <div className="gold-penalty">{t('dungeon.goldPenalty')}</div>
                <div className="result-rewards">{renderLoot(finalRewards.gold, finalRewards.drops, finalRewards.shards)}</div>
                <button className="result-btn" onClick={() => onDefeat(finalRewards)} data-ui>
                  {t('dungeon.return')}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
