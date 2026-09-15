import { useEffect, useRef, useState } from 'react';
import T from '../game/tunables';
import { t } from '../locales';
import Assets from '../assets.json';
import { buffRemainingMs, isBuffActive, SaveData, playerMaxHp } from '../game/engine';
import { ConsumableId } from '../game/consumables';
import { EnemyDef, getEnemyDef } from '../game/enemies';
import { durabilityFactor, effectiveCrit, effectiveDamage, effectiveResistance, getEquipped, MAX_DURABILITY, refineLevel } from '../game/gear';
import { crossedMilestoneFloors, dungeonEnemyKindForFloor, getBiomeForFloor, getMilestoneReward, MAX_DUNGEON_FLOOR } from '../game/dungeon';
import { MaterialId, materialIconUrl } from '../game/materials';
import { enemySpriteUrl, playerSpriteUrl } from '../game/sprites';
import { playSfx } from '../game/audio';
import SpriteSheet from './SpriteSheet';
import { eliteBossDmg, eliteBossHp, isDungeonBoss, isDungeonCheckpoint, RunRewards, stageEnemyDmg, stageEnemyHp, waveRewards } from '../game/waves';
import { getEliteReward } from '../game/dungeon';
import { getGem, GemId, totalGemBonuses } from '../game/gems';
import { rarityStatMult, totalSubstatTotals } from '../game/rarity';
import { getTitleDef } from '../game/titles';
import GemIcon from './GemIcon';

const enemyText = (k: string): string => t(`enemies.${k}`);
const dungeonText = (k: string): string => t(`dungeon.${k}`);
const biomeText = (k: string): string => t(`dungeon.${k}`);
const materialName = (mid: string): string => t(`materials.mat_${mid}`);
const materialIcon = (mid: string): string => materialIconUrl(mid as MaterialId);
const enemyDefForFloor = (floor: number): EnemyDef => getEnemyDef(dungeonEnemyKindForFloor(floor));

function formatBuffTime(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

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
  startFloor,
  onRetreat,
  onDefeat,
  onUsePotion,
  elite = false,
  alreadyDefeatedElite = false,
  onEliteWin,
}: {
  save: SaveData;
  startFloor: number;
  onRetreat: (rewards: RunRewards) => void;
  onDefeat: (rewards: RunRewards) => void;
  onUsePotion: (id: ConsumableId) => void;
  // Optional Elite re-fight of an already-beaten gate boss: single stage, own (harsher) HP/DMG
  // curve, own exclusive loot, zero effect on floor progress/milestones/XP.
  elite?: boolean;
  alreadyDefeatedElite?: boolean;
  onEliteWin?: () => void;
}) {
  const build = getEquipped(save.equipped);
  const weapon = build.weapon;
  const armor = build.armor;
  const wLvl = refineLevel(save.upgrades, save.equipped.weapon);
  const aLvl = refineLevel(save.upgrades, save.equipped.armor);
  const gems = totalGemBonuses(save.equipped, save.sockets ?? {});
  const subs = totalSubstatTotals(save.equipped, save.itemSubstats ?? {});
  const wRarity = rarityStatMult(save.itemRarity?.[save.equipped.weapon]);
  const aRarity = rarityStatMult(save.itemRarity?.[save.equipped.armor]);
  const wDur = save.durability?.[save.equipped.weapon] ?? MAX_DURABILITY;
  const aDur = save.durability?.[save.equipped.armor] ?? MAX_DURABILITY;
  const wFactor = durabilityFactor(wDur);
  const aFactor = durabilityFactor(aDur);
  const critMult = T.combat.critMult + (build.relic?.critMultBonus ?? 0) + gems.critDamageBonus + subs.critDamage / 100;
  const blessedMult = save.blessed ? 1.05 : 1;

  const playerMax = playerMaxHp(save);
  const enemyHpForStage = (st: number) => (elite ? eliteBossHp(enemyDefForFloor(st), st) : stageEnemyHp(enemyDefForFloor(st), st));
  const enemyDmgForStage = (st: number) => (elite ? eliteBossDmg(enemyDefForFloor(st), st) : stageEnemyDmg(enemyDefForFloor(st), st));

  const [stage, setStage] = useState(startFloor);
  const [milestone, setMilestone] = useState<'checkpoint' | 'boss' | null>(
    elite ? 'boss' : isDungeonBoss(startFloor) ? 'boss' : isDungeonCheckpoint(startFloor) ? 'checkpoint' : null,
  );
  const [enemyMax, setEnemyMax] = useState(() => enemyHpForStage(startFloor));
  const [playerHp, setPlayerHp] = useState(playerMax);
  const [enemyHp, setEnemyHp] = useState(() => enemyHpForStage(startFloor));
  const [eliteWon, setEliteWon] = useState(false);
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
  const totalPotions = (c: SaveData['consumables']) => (c?.greater_elixir ?? 0) + (c?.large_hp ?? 0) + (c?.small_hp ?? 0);
  const [potionsLeft, setPotionsLeft] = useState(totalPotions(save.consumables));
  const [accumGold, setAccumGold] = useState(0);
  const [accumCount, setAccumCount] = useState(0);
  const [finalRewards, setFinalRewards] = useState<RunRewards | null>(null);
  const [waveClear, setWaveClear] = useState<{
    stage: number;
    gold: number;
    drops: Partial<Record<MaterialId, number>>;
    shards: number;
    gems: Partial<Record<GemId, number>>;
  } | null>(null);
  const [dungeonComplete, setDungeonComplete] = useState(false);

  const hp = useRef({ p: playerMax, e: enemyHpForStage(startFloor) });
  const phaseRef = useRef<Phase>('battle');
  const speedRef = useRef<1 | 2>(1);
  const stageRef = useRef(startFloor);
  const clearedRef = useRef(0);
  const accumRef = useRef<{ gold: number; drops: Partial<Record<MaterialId, number>>; shards: number; gems: Partial<Record<GemId, number>>; count: number }>({
    gold: 0,
    drops: {},
    shards: 0,
    gems: {},
    count: 0,
  });
  const heroNextAtkRef = useRef(0);
  const enemyNextAtkRef = useRef(0);
  const potionCooldownUntilRef = useRef(0);
  const potionStockRef = useRef({
    greater_elixir: save.consumables?.greater_elixir ?? 0,
    large_hp: save.consumables?.large_hp ?? 0,
    small_hp: save.consumables?.small_hp ?? 0,
  });
  const idRef = useRef(0);
  const onRetreatRef = useRef(onRetreat);
  onRetreatRef.current = onRetreat;
  const onDefeatRef = useRef(onDefeat);
  onDefeatRef.current = onDefeat;
  const onUsePotionRef = useRef(onUsePotion);
  onUsePotionRef.current = onUsePotion;
  const dungeonCompleteRef = useRef(false);

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
    setDungeonComplete(dungeonCompleteRef.current);
    const acc = accumRef.current;
    const gold = outcome === 'retreat' ? acc.gold : Math.floor(acc.gold / 2);
    setFinalRewards({ gold, drops: acc.drops, shards: acc.shards, gems: acc.gems, stages: clearedRef.current });
  };

  useEffect(() => {
    let raf = 0;
    const now0 = performance.now();
    heroNextAtkRef.current = now0;
    enemyNextAtkRef.current = now0;
    potionCooldownUntilRef.current = 0;

    const applyLoot = (gold: number, drops: Partial<Record<MaterialId, number>>, shards: number, gemDrops: Partial<Record<GemId, number>>) => {
      const acc = accumRef.current;
      const merged = { ...acc.drops };
      for (const [mid, qty] of Object.entries(drops)) {
        merged[mid as MaterialId] = (merged[mid as MaterialId] ?? 0) + (qty as number);
      }
      const mergedGems = { ...acc.gems };
      for (const [gid, qty] of Object.entries(gemDrops)) {
        mergedGems[gid as GemId] = (mergedGems[gid as GemId] ?? 0) + (qty as number);
      }
      const count = Object.values(merged).reduce((a, b) => a + (b as number), 0);
      accumRef.current = { gold: acc.gold + gold, drops: merged, shards: acc.shards + shards, gems: mergedGems, count };
      setAccumGold(accumRef.current.gold);
      setAccumCount(count);
    };

    const startNextWave = () => {
      if (phaseRef.current !== 'intermission') return;
      const next = stageRef.current + 1;
      if (next > MAX_DUNGEON_FLOOR) {
        dungeonCompleteRef.current = true;
        endCombat('retreat');
        return;
      }
      stageRef.current = next;
      setStage(next);
      const nmax = enemyHpForStage(next);
      hp.current.e = nmax;
      setEnemyMax(nmax);
      setEnemyHp(nmax);
      setMilestone(isDungeonBoss(next) ? 'boss' : isDungeonCheckpoint(next) ? 'checkpoint' : null);
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
      if (elite) {
        // Single-encounter mode: no next wave, no floor-progress side effects — just the win screen.
        phaseRef.current = 'retreat';
        setPhase('retreat');
        setDungeonComplete(false);
        setFinalRewards({ gold: 0, drops: {}, shards: 0, gems: {}, stages: 0 });
        setHeroProgress(0);
        setEnemyProgress(0);
        setEliteWon(true);
        return;
      }
      const r = waveRewards(getBiomeForFloor(st), st);
      applyLoot(r.gold, r.drops, r.shards, r.gems);
      clearedRef.current += 1;
      const healed = Math.min(playerMax, Math.round(hp.current.p + playerMax * T.battle.waveHeal));
      hp.current.p = healed;
      setPlayerHp(healed);
      setWaveClear({ stage: st, gold: r.gold, drops: r.drops, shards: r.shards, gems: r.gems });
      phaseRef.current = 'intermission';
      setPhase('intermission');
      setHeroProgress(0);
      setEnemyProgress(0);
      window.setTimeout(startNextWave, T.battle.intermissionMs);
    };

    const heroAttack = () => {
      const baseDmg = (T.combat.attackMin + T.combat.attackMax) / 2;
      const strengthMult = isBuffActive(save, 'strength', Date.now()) ? 1 + T.battle.strengthElixirDmgPct : 1;
      const total =
        (baseDmg + effectiveDamage(weapon, wLvl) * wFactor * wRarity + save.str * T.advanced.strDmgPerPoint) * blessedMult * strengthMult;
      const crit = Math.random() < effectiveCrit(weapon, wLvl) * wFactor + subs.critRate / 100;
      const dmg = Math.max(1, Math.round(total * (crit ? critMult : 1)));
      hp.current.e = Math.max(0, hp.current.e - dmg);
      setEnemyHp(hp.current.e);
      setPlayerAnim('attack');
      setPlayerLunge(true);
      setEnemyFlash(true);
      addFloat('e', crit ? `💥 CRIT! -${dmg}` : `-${dmg}`, crit ? 'crit' : 'damage');
      if (subs.lifesteal > 0) {
        const heal = Math.max(1, Math.round(dmg * (subs.lifesteal / 100)));
        hp.current.p = Math.min(playerMax, hp.current.p + heal);
        setPlayerHp(hp.current.p);
        addFloat('p', `+${heal}`, 'heal');
      }
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
      const reduction =
        effectiveResistance(armor, aLvl) * aFactor * aRarity + save.res * T.advanced.resResistPerPoint + gems.resistance + subs.defense / 100;
      const eFinal = Math.max(1, Math.round(enemyDmgForStage(st) * (1 - reduction)));
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
      if (now < potionCooldownUntilRef.current) return;
      if (hp.current.p >= playerMax * save.autoPotionThreshold) return;
      const stock = potionStockRef.current;
      // Greater Elixir (Alchemy-tier, % heal) is always the best pick when available. Between the two
      // flat-heal potions, which goes first is the player's own call (save.autoPotionPriority) — Strength
      // Elixir stays out of this automation entirely, per design.
      let id: ConsumableId | null = null;
      let heal = 0;
      if (stock.greater_elixir > 0) {
        id = 'greater_elixir';
        heal = playerMax * T.battle.greaterElixirHealPct;
      } else if (save.autoPotionPriority === 'small_first') {
        if (stock.small_hp > 0) {
          id = 'small_hp';
          heal = T.battle.potionHeal;
        } else if (stock.large_hp > 0) {
          id = 'large_hp';
          heal = T.battle.largePotionHeal;
        }
      } else if (stock.large_hp > 0) {
        id = 'large_hp';
        heal = T.battle.largePotionHeal;
      } else if (stock.small_hp > 0) {
        id = 'small_hp';
        heal = T.battle.potionHeal;
      }
      if (!id) return;
      stock[id] -= 1;
      setPotionsLeft(stock.greater_elixir + stock.large_hp + stock.small_hp);
      potionCooldownUntilRef.current = now + T.battle.potionCooldownMs;
      onUsePotionRef.current(id);
      const healRounded = Math.max(1, Math.round(heal));
      hp.current.p = Math.min(playerMax, hp.current.p + healRounded);
      setPlayerHp(hp.current.p);
      addFloat('p', `+${healRounded}`, 'heal');
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

      const enemyInterval = enemyDefForFloor(stageRef.current).atkSpeedMs / spd;
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

  const currentEnemyKind = dungeonEnemyKindForFloor(stage);
  const currentDef = getEnemyDef(currentEnemyKind);
  const currentBiome = getBiomeForFloor(stage);

  const renderLoot = (
    gold: number,
    drops: Partial<Record<MaterialId, number>>,
    shards: number,
    gemsReward?: Partial<Record<GemId, number>>,
  ) => (
    <>
      {gold > 0 && (
        <span className="floor-drop">
          <span className="mat-icon">
            <img src={Assets.icons.gold.url} alt="" />
          </span>
          <span>{t('ui.goldReward', { n: gold })}</span>
        </span>
      )}
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
          <span className="mat-icon shard">
            <img src="/assets/icons/shards.png" alt="" />
          </span>
          <span>{t('ui.shardsReward', { n: shards })}</span>
        </span>
      )}
      {Object.entries(gemsReward ?? {}).map(([gid, qty]) => {
        const gemDef = getGem(gid);
        if (!gemDef) return null;
        return (
          <span className="floor-drop" key={gid}>
            <span className="mat-icon">
              <GemIcon item={gemDef} />
            </span>
            <span>
              +{qty}× {t(`gems.${gemDef.nameKey}`)}
            </span>
          </span>
        );
      })}
    </>
  );

  const eliteReward = getEliteReward(startFloor, alreadyDefeatedElite);

  const renderEliteLoot = () => {
    if (!eliteReward) return null;
    return (
      <>
        {renderLoot(eliteReward.gold, {}, eliteReward.shards, eliteReward.gems)}
        {eliteReward.catalysts > 0 && (
          <span className="floor-drop">
            <span className="mat-icon">⚗️</span>
            <span>+{eliteReward.catalysts}× {t('consumables.refine_catalyst')}</span>
          </span>
        )}
        {!!eliteReward.oneTokenBalance && (
          <span className="floor-drop">
            <span className="mat-icon">🪙</span>
            <span>ONE +{eliteReward.oneTokenBalance}</span>
          </span>
        )}
      </>
    );
  };

  // Milestones only ever bank on a successful retreat — a defeat must never show or grant them,
  // even if a boss earlier in this same run was genuinely killed.
  const crossedMilestones =
    phase === 'retreat' && finalRewards && finalRewards.stages > 0
      ? crossedMilestoneFloors(startFloor, finalRewards.stages, save.dungeonCheckpoints)
      : [];

  const renderMilestoneBanner = () => (
    <div className="milestone-banner">
      {crossedMilestones.map((floor) => {
        const reward = getMilestoneReward(floor);
        if (!reward) return null;
        const titleDef = reward.titleId ? getTitleDef(reward.titleId) : undefined;
        return (
          <div className="milestone-card" key={floor}>
            <div className="milestone-title">🏆 {t('dungeon.milestoneCleared', { n: floor })}</div>
            <div className="milestone-rewards">
              <span className="floor-drop">
                <span className="mat-icon">
                  <img src={Assets.icons.gold.url} alt="" />
                </span>
                <span>{t('ui.goldReward', { n: reward.gold })}</span>
              </span>
              {Object.entries(reward.gems).map(([gid, qty]) => {
                const gemDef = getGem(gid);
                return (
                  <span className="floor-drop" key={gid}>
                    <span className="mat-icon">{gemDef ? <GemIcon item={gemDef} /> : '💎'}</span>
                    <span>+{qty as number}</span>
                  </span>
                );
              })}
              {!!reward.oneTokenBalance && (
                <span className="floor-drop">
                  <span className="mat-icon">
                    <img src="/assets/icons/one_token.png" alt="" />
                  </span>
                  <span>ONE +{reward.oneTokenBalance}</span>
                </span>
              )}
            </div>
            {titleDef && <div className="milestone-title-unlocked">🎖️ {t(`titles.${titleDef.nameKey}`)}</div>}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="modal-backdrop battle-backdrop">
      <div className="battle">
        <div className="battle-controls">
          <div className="battle-left">
            <span className="stage-indicator">{t('dungeon.floorProgress', { n: stage, m: MAX_DUNGEON_FLOOR })}</span>
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
        <span className="battle-biome">{biomeText(currentBiome.nameKey)}</span>

        <div className="battle-loot-hud">
          <span className="loot-gold">
            <img className="inline-icon" src={Assets.icons.gold.url} alt="" /> {accumGold}
          </span>
          <span className="loot-potions">
            <img className="inline-icon" src="/assets/icons/potion_small_hp.png" alt="" /> {potionsLeft}
          </span>
          <span className="loot-drops">
            <img className="inline-icon" src="/assets/icons/nav_bag.png" alt="" /> {dungeonText('accumDrops').replace('{n}', String(accumCount))}
          </span>
          {isBuffActive(save, 'strength', Date.now()) && (
            <span className="loot-buff" title={t('consumables.strength_elixir')}>
              🔥 {formatBuffTime(buffRemainingMs(save, Date.now()))}
            </span>
          )}
        </div>

        <div className="battle-top">
          <div className="battle-hud hero">
            <span className="hp-label">
              <span className="hp-name-text">{dungeonText('heroLabel')}</span>
            </span>
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
              <span className="hp-name-text">{enemyText(currentDef.nameKey)}</span>
              {elite && <span className="miniboss-tag boss">⚔️ {t('dungeon.eliteTag')}</span>}
              {!elite && milestone === 'boss' && <span className="miniboss-tag boss">👑 {t('dungeon.mainBoss')}</span>}
              {!elite && milestone === 'checkpoint' && <span className="miniboss-tag">💀 {t('dungeon.miniBoss')}</span>}
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
              src={playerSpriteUrl()}
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
              src={enemySpriteUrl(currentEnemyKind)}
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
              <div className="wave-title">{dungeonText('floorCleared').replace('{n}', String(waveClear.stage))}</div>
              <div className="wave-loot">{renderLoot(waveClear.gold, waveClear.drops, waveClear.shards, waveClear.gems)}</div>
            </div>
          )}
        </div>

        {elite && (phase === 'retreat' || phase === 'defeat') && (
          <div className="battle-result">
            <div className="battle-result-panel">
              {eliteWon ? (
                <>
                  <h2 className="result-title win">{t('dungeon.eliteWin')}</h2>
                  <div className="result-rewards">{renderEliteLoot()}</div>
                  <button className="result-btn" onClick={() => onEliteWin?.()} data-ui>
                    {t('dungeon.collect')}
                  </button>
                </>
              ) : (
                <>
                  <h2 className="result-title lose">{t('dungeon.eliteLose')}</h2>
                  <button className="result-btn" onClick={() => (phase === 'retreat' ? onRetreat(finalRewards!) : onDefeat(finalRewards!))} data-ui>
                    {t('dungeon.return')}
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {!elite && (phase === 'retreat' || phase === 'defeat') && finalRewards && (
          <div className="battle-result">
            <div className="battle-result-panel">
              {phase === 'retreat' ? (
                <>
                  <h2 className="result-title win">{dungeonComplete ? t('dungeon.dungeonComplete') : t('dungeon.retreatTitle')}</h2>
                  {crossedMilestones.length > 0 && renderMilestoneBanner()}
                  <div className="result-rewards">{renderLoot(finalRewards.gold, finalRewards.drops, finalRewards.shards, finalRewards.gems)}</div>
                  <button className="result-btn" onClick={() => onRetreat(finalRewards)} data-ui>
                    {t('dungeon.collect')}
                  </button>
                </>
              ) : (
                <>
                  <h2 className="result-title lose">{t('dungeon.defeated')}</h2>
                  <div className="gold-penalty">{t('dungeon.goldPenalty')}</div>
                  <div className="result-rewards">{renderLoot(finalRewards.gold, finalRewards.drops, finalRewards.shards, finalRewards.gems)}</div>
                  <button className="result-btn" onClick={() => onDefeat(finalRewards)} data-ui>
                    {t('dungeon.return')}
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
