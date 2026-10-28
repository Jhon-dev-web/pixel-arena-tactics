import { CSSProperties, useEffect, useRef, useState } from 'react';
import T from '../game/tunables';
import { t } from '../locales';
import Assets from '../assets.json';
import { buffRemainingMs, buildCombatStats, combatModifiersFromSave, isBuffActive, SaveData } from '../game/engine';
import { activeTonicStats, BUFF_ITEM, BuffKind } from '../game/buffs';
import { getConsumable } from '../game/consumables';
import { ConsumableId } from '../game/consumables';
import { EnemyDef, getEnemyDef } from '../game/enemies';
import { BurnState, applyDamageModifiers, applyDamageReduction, StrikeTally, bastionHp, bleedSpec, bossDamage, echoDamage, furyHitDamage, igniteBurn, newStrikeState, reflectedDamage, regenAmount, registerBlock, resolveHeroHit, tally, tickBurn } from '../game/derivedStats';
import { SKILL_FX, fxColor, SkillFxId } from '../game/skillFx';
import { abilityDotAt, fireAbility, guardDamage, hastedMs, newAbilityRuntime, pickAbility, startAbilityFight, tickAbilityDot } from '../game/abilities';
import { FxLayer } from './SkillFx';
import { useFxScale, useFxStage } from '../hooks/useSkillFx';
import StrikeLines from './StrikeLines';
import { crossedMilestoneFloors, depthOfStage, dungeonEnemyKindForFloor, getBiomeForFloor, getMilestoneReward, isDepthStage, MAX_DUNGEON_FLOOR } from '../game/dungeon';
import { MaterialId, materialIconUrl } from '../game/materials';
import { dungeonEnemyVisualForFloor, playerSpriteUrl } from '../game/sprites';
import { playSfx } from '../game/audio';
import SpriteSheet from './SpriteSheet';
import { defeatGoldKept, isDungeonBoss, isDungeonCheckpoint, RunRewards, stageEnemyDmg, stageEnemyHp, waveRewards } from '../game/waves';
import { getGem, GemId } from '../game/gems';
import { UniqueDrop } from '../game/uniques';
import { isServerItemAuthority } from '../game/itemAuthority';
import { getTitleDef } from '../game/titles';
import GemIcon from './GemIcon';
import PixelIcon from './PixelIcon';
import UniqueDrops from './UniqueDrops';
import RelicDrops from './RelicDrops';
import { defeatSummary, DefeatSummary } from '../game/defeatSummary';
import { nextStepLine } from './nextStepText';
import { Button, Chip } from './ui';

const enemyText = (k: string): string => t(`enemies.${k}`);
const dungeonText = (k: string): string => t(`dungeon.${k}`);
const biomeText = (k: string): string => t(`dungeon.${k}`);
const materialName = (mid: string): string => t(`materials.mat_${mid}`);
const materialIcon = (mid: string): string => materialIconUrl(mid as MaterialId);
const enemyDefForFloor = (floor: number): EnemyDef => getEnemyDef(dungeonEnemyKindForFloor(floor));

// Every timed effect that matters in a Dungeon fight, with the item that starts it (the gatherer brew and the prospector tonic are Mining / Woodcutting tonics and the hunter lure a Hunting one: not shown here).
const BATTLE_BUFFS = (Object.entries(BUFF_ITEM) as [ConsumableId, BuffKind][])
  .filter(([, kind]) => kind !== 'gatherer' && kind !== 'prospect' && kind !== 'bait')
  .map(([itemId, kind]) => [kind, itemId] as [BuffKind, ConsumableId]);

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
  kind: 'damage' | 'crit' | 'heal' | 'burn' | 'reflect' | 'bleed' | 'strike' | 'block' | 'bastion' | 'skill';
  style?: CSSProperties; // a strike callout: its own column, offset and path colour (game/skillFx.ts)
}

type Phase = 'battle' | 'intermission' | 'retreat' | 'defeat';

const ANIM_ROW: Record<string, number> = { idle: 0, attack: 1, hurt: 2 };

export default function BattleModal({
  save,
  startFloor,
  guidedStopFloor,
  onRetreat,
  onDefeat,
  onUsePotion,
}: {
  save: SaveData;
  startFloor: number;
  // The guided first descent (the tutorial's Masmorra step): the climb stops at this floor and the hero is asked to retreat with the loot.
  guidedStopFloor?: number;
  onRetreat: (rewards: RunRewards) => void;
  onDefeat: (rewards: RunRewards) => void;
  onUsePotion: (id: ConsumableId) => void;
}) {
  // Layer 2 stats come from the shared derivation (engine.ts buildCombatStats — the same one Hunting and
  // computeCP use), computed once per mount like before. Temporary damage modifiers (blessed / Strength
  // Elixir) are applied per hit in heroAttack below, with Date.now(): the Dungeon's existing behavior,
  // intentionally different from Hunting's claim-time evaluation and NOT changed here.
  const combat = buildCombatStats(save);

  const playerMax = combat.maxHp;
  const enemyHpForStage = (st: number) => stageEnemyHp(enemyDefForFloor(st), st);
  const enemyDmgForStage = (st: number) => stageEnemyDmg(enemyDefForFloor(st), st);

  const [stage, setStage] = useState(startFloor);
  const [milestone, setMilestone] = useState<'checkpoint' | 'boss' | null>(
    isDungeonBoss(startFloor) ? 'boss' : isDungeonCheckpoint(startFloor) ? 'checkpoint' : null,
  );
  const [enemyMax, setEnemyMax] = useState(() => enemyHpForStage(startFloor));
  const [playerHp, setPlayerHp] = useState(playerMax);
  const [enemyHp, setEnemyHp] = useState(() => enemyHpForStage(startFloor));
  const [phase, setPhase] = useState<Phase>('battle');
  const [floats, setFloats] = useState<FloatItem[]>([]);
  const [playerAnim, setPlayerAnim] = useState<'idle' | 'attack' | 'hurt'>('idle');
  const [enemyAnim, setEnemyAnim] = useState<'idle' | 'attack' | 'hurt'>('idle');
  const [playerLunge, setPlayerLunge] = useState(false);
  const [enemyLunge, setEnemyLunge] = useState(false);
  const [playerFlash, setPlayerFlash] = useState(false);
  const [enemyFlash, setEnemyFlash] = useState(false);
  const [enemyBurning, setEnemyBurning] = useState(false);
  const [speed, setSpeed] = useState<1 | 2>(1);
  const [heroProgress, setHeroProgress] = useState(0);
  const [enemyProgress, setEnemyProgress] = useState(0);
  const totalPotions = (c: SaveData['consumables']) => (c?.greater_elixir ?? 0) + (c?.large_hp ?? 0) + (c?.small_hp ?? 0);
  const [potionsLeft, setPotionsLeft] = useState(totalPotions(save.consumables));
  const [accumGold, setAccumGold] = useState(0);
  const [accumCount, setAccumCount] = useState(0);
  const [finalRewards, setFinalRewards] = useState<RunRewards | null>(null);
  const [defeatInfo, setDefeatInfo] = useState<DefeatSummary | null>(null);
  const [waveClear, setWaveClear] = useState<{
    stage: number;
    gold: number;
    drops: Partial<Record<MaterialId, number>>;
    shards: number;
    gems: Partial<Record<GemId, number>>;
    uniques: UniqueDrop[];
    relics: string[];
  } | null>(null);
  const [dungeonComplete, setDungeonComplete] = useState(false);
  // Milestone floors pause the auto-continue instead of silently rolling into the next wave — the
  // player must explicitly choose to bank the run now or risk it, rather than the choice being an
  // implicit "well I could've hit Recuar" the whole time.
  const [tensionFloor, setTensionFloor] = useState<number | null>(null);

  const hp = useRef({ p: playerMax, e: enemyHpForStage(startFloor) });
  const phaseRef = useRef<Phase>('battle');
  const speedRef = useRef<1 | 2>(1);
  const stageRef = useRef(startFloor);
  const clearedRef = useRef(0);
  // The "Recuar" confirmation: while it is open the fight is paused (the loop skips its frames and, on resume, shifts the attack timers by the time spent paused),
  // so thinking about it can never cost the hero his life. `retreatAsk` is a snapshot taken when it opened, so the text cannot change under the player's eyes.
  const pausedRef = useRef(false);
  const pausedAtRef = useRef(0);
  const [retreatAsk, setRetreatAsk] = useState<{ stage: number; fighting: boolean; cleared: number; gold: number; items: number } | null>(null);
  const bossStagesRef = useRef<number[]>([]);
  const accumRef = useRef<{ gold: number; drops: Partial<Record<MaterialId, number>>; shards: number; gems: Partial<Record<GemId, number>>; uniques: UniqueDrop[]; relics: string[]; count: number }>({
    gold: 0,
    drops: {},
    shards: 0,
    gems: {},
    uniques: [],
    relics: [],
    count: 0,
  });
  // Combat clock (ms, advances with the speed toggle) that burn and regeneration tick on, plus the current burn and the next regeneration tick.
  const clockRef = useRef(0);
  const lastFrameRef = useRef(0);
  const burnRef = useRef<BurnState | null>(null);
  // Hero skills (heroSkills.ts): Sangria is a second effect beside burn; the hit counter of Golpe Devastador and the once-per-run Ultimo Bastiao live for the whole run.
  const bleedRef = useRef<BurnState | null>(null);
  const strikeRef = useRef(newStrikeState());
  const tallyRef = useRef<StrikeTally>({});
  const totalDmgRef = useRef(0);
  const furyNextRef = useRef(0);
  // Equipment abilities (game/abilities.ts, the same functions the hunting simulation and the driver call): cooldowns, guard / haste windows, the burn and the carry bucket live for the whole run, on the combat clock.
  const abilityRef = useRef(newAbilityRuntime());
  const enemyActedRef = useRef(false); // the enemy has attacked in this fight (an opener is only ready before it does)
  const [skillLines, setSkillLines] = useState<{ tally: StrikeTally; total: number } | null>(null);
  const [hud, setHud] = useState({ crush: 0, fury: 0, bastion: false });
  const fxStage = useFxStage();
  const fxScale = useFxScale();
  const playFxRef = useRef(fxStage.play);
  playFxRef.current = fxStage.play;
  const bastionUsedRef = useRef(false);
  const regenNextRef = useRef(0);
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
  const startNextWaveRef = useRef<() => void>(() => {});

  const addFloat = (side: 'p' | 'e', text: string, kind: FloatItem['kind'], style?: CSSProperties) => {
    const id = idRef.current++;
    setFloats((f) => [...f, { id, side, text, kind, style }]);
    window.setTimeout(() => setFloats((f) => f.filter((x) => x.id !== id)), T.advanced.textFloatMs);
  };

  // A strike triggered by the REAL combat loop: its sprite effect on the stage and its name callout in its own column (game/skillFx.ts).
  const playStrike = (id: SkillFxId) => {
    const def = SKILL_FX[id];
    playFxRef.current(id);
    if (def.callout) addFloat(def.side, t(`heroSkills.fx.${id}`), 'skill', { left: `${def.left}%`, top: def.top, ['--fx-color' as string]: fxColor(id) } as CSSProperties);
  };

  const endCombat = (outcome: 'retreat' | 'defeat') => {
    if (phaseRef.current !== 'battle' && phaseRef.current !== 'intermission') return;
    setSkillLines({ tally: { ...tallyRef.current }, total: totalDmgRef.current });
    phaseRef.current = outcome;
    setPhase(outcome);
    setHeroProgress(0);
    setEnemyProgress(0);
    setDungeonComplete(dungeonCompleteRef.current);
    const acc = accumRef.current;
    const gold = outcome === 'retreat' ? acc.gold : Math.floor(acc.gold * defeatGoldKept(startFloor));
    setFinalRewards({ gold, drops: acc.drops, shards: acc.shards, gems: acc.gems, uniques: acc.uniques, relics: acc.relics, stages: clearedRef.current, ...(bossStagesRef.current.length > 0 ? { bossStages: [...bossStagesRef.current] } : {}) });
    if (outcome === 'defeat') setDefeatInfo(defeatSummary(save, stageRef.current, clearedRef.current, acc.gold, gold));
  };

  const askRetreat = () => {
    if (phaseRef.current !== 'battle' && phaseRef.current !== 'intermission') return;
    pausedRef.current = true;
    setRetreatAsk({ stage: stageRef.current, fighting: phaseRef.current === 'battle', cleared: clearedRef.current, gold: accumRef.current.gold, items: accumRef.current.count });
  };
  const stayInFight = () => {
    pausedRef.current = false;
    setRetreatAsk(null);
  };
  const confirmRetreat = () => {
    pausedRef.current = false;
    setRetreatAsk(null);
    endCombat('retreat');
  };

  const handleTensionRetreat = () => {
    setTensionFloor(null);
    endCombat('retreat');
  };

  const handleTensionAdvance = () => {
    setTensionFloor(null);
    startNextWaveRef.current();
  };

  useEffect(() => {
    let raf = 0;
    const now0 = performance.now();
    heroNextAtkRef.current = now0;
    enemyNextAtkRef.current = now0;
    potionCooldownUntilRef.current = 0;
    lastFrameRef.current = now0;
    regenNextRef.current = T.battle.effectTickMs;
    furyNextRef.current = T.heroSkills.furyEveryMs;

    const applyLoot = (gold: number, drops: Partial<Record<MaterialId, number>>, shards: number, gemDrops: Partial<Record<GemId, number>>, uniqueDrops: UniqueDrop[], relicDrops: string[]) => {
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
      accumRef.current = { gold: acc.gold + gold, drops: merged, shards: acc.shards + shards, gems: mergedGems, uniques: [...acc.uniques, ...uniqueDrops], relics: [...acc.relics, ...relicDrops], count };
      setAccumGold(accumRef.current.gold);
      setAccumCount(count);
    };

    const startNextWave = () => {
      if (phaseRef.current !== 'intermission') return;
      if (pausedRef.current) {
        window.setTimeout(startNextWave, 150); // the retreat question is open: the next wave waits for the answer
        return;
      }
      const next = stageRef.current + 1;
      // The floors end at 100 (that run is complete); a Profundezas run (it started past floor 100) has no end: only death or the retreat button stop it.
      if (next > MAX_DUNGEON_FLOOR && !isDepthStage(startFloor)) {
        dungeonCompleteRef.current = true;
        endCombat('retreat');
        return;
      }
      stageRef.current = next;
      setStage(next);
      const nmax = enemyHpForStage(next);
      // A carry from the last fight (abilities.ts) comes in as damage the new enemy has already taken.
      const carriedIn = startAbilityFight(abilityRef.current, nmax);
      hp.current.e = nmax - carriedIn;
      totalDmgRef.current += carriedIn;
      enemyActedRef.current = false;
      setEnemyMax(nmax);
      setEnemyHp(nmax - carriedIn);
      setMilestone(isDungeonBoss(next) ? 'boss' : isDungeonCheckpoint(next) ? 'checkpoint' : null);
      setWaveClear(null);
      setHeroProgress(0);
      setEnemyProgress(0);
      const now = performance.now();
      heroNextAtkRef.current = now;
      enemyNextAtkRef.current = now;
      // A new enemy: no burn or bleed carried over, regeneration restarts its tick.
      burnRef.current = null;
      bleedRef.current = null;
      setEnemyBurning(false);
      lastFrameRef.current = now;
      regenNextRef.current = clockRef.current + T.battle.effectTickMs;
      phaseRef.current = 'battle'; // the Furia timer keeps running across waves (the combat clock only advances in battle)
      setPhase('battle');
    };
    startNextWaveRef.current = startNextWave;

    const clearWave = () => {
      const st = stageRef.current;
      const r = waveRewards(getBiomeForFloor(st), st, combat.bossLootMult ?? 1);
      applyLoot(r.gold, r.drops, r.shards, r.gems, r.uniques, r.relics);
      clearedRef.current += 1;
      // Web build: the server rolls the boss uniques when the run is banked, so only the boss stages are remembered here.
      if (isServerItemAuthority() && isDungeonBoss(st)) bossStagesRef.current.push(st);
      burnRef.current = null;
      bleedRef.current = null;
      setEnemyBurning(false);
      const healed = Math.min(playerMax, Math.round(hp.current.p + playerMax * T.battle.waveHeal));
      hp.current.p = healed;
      setPlayerHp(healed);
      setWaveClear({ stage: st, gold: r.gold, drops: r.drops, shards: r.shards, gems: r.gems, uniques: r.uniques, relics: r.relics });
      phaseRef.current = 'intermission';
      setPhase('intermission');
      setHeroProgress(0);
      setEnemyProgress(0);
      const guidedStop = guidedStopFloor !== undefined && startFloor < guidedStopFloor && st === guidedStopFloor;
      if (isDungeonBoss(st) || guidedStop) {
        // Milestone floor: hold here for an explicit Recuar-and-bank vs Avançar-and-risk-it decision
        // instead of auto-continuing — see tensionFloor state.
        setTensionFloor(st);
      } else {
        window.setTimeout(startNextWave, T.battle.intermissionMs);
      }
    };

    const heroAttack = () => {
      const total = applyDamageModifiers(combat.dmgBase, combatModifiersFromSave(save, Date.now()));
      const crit = Math.random() < activeTonicStats(combat, save, Date.now()).critChance;
      // The hero strikes (heroSkills.ts): the same resolution the Dungeon driver and the hunting simulation use (derivedStats.ts resolveHeroHit).
      const res = resolveHeroHit(strikeRef.current, combat.strikes, Math.random);
      const plain = Math.max(1, Math.round(total * (crit ? combat.critMult : 1)));
      const afterCrush = Math.round(plain * res.crushMult);
      const base = Math.max(1, Math.round(plain * res.mult));
      if (res.crush) tally(tallyRef.current, res.devastating ? 'w_devastating_strike' : 'w_heavy_blow', afterCrush - plain);
      if (res.counter) tally(tallyRef.current, 'g_block', base - afterCrush);
      // Equipment abilities: the first ability of the rotation that is ready takes the place of the basic swing (abilities.ts); a hero without a rotation never enters this branch.
      const picked = combat.rotation ? pickAbility(abilityRef.current, combat.rotation, clockRef.current, enemyActedRef.current) : null;
      const fired = picked ? fireAbility(abilityRef.current, picked, clockRef.current, base, total, playerMax) : null;
      const swung = fired ? fired.dmg : base;
      let dmg = swung;
      if (res.double) {
        const echo = echoDamage(swung);
        dmg += echo;
        tally(tallyRef.current, 'h_light_step', echo);
      }
      totalDmgRef.current += dmg;
      hp.current.e = Math.max(0, hp.current.e - dmg);
      setEnemyHp(hp.current.e);
      if (combat.burn) {
        // Every hit sets / refreshes the burn (never stacks) from the pre-crit damage, see derivedStats.ts igniteBurn.
        burnRef.current = igniteBurn(burnRef.current, clockRef.current, total);
        setEnemyBurning(true);
      }
      if (combat.bleed) bleedRef.current = igniteBurn(bleedRef.current, clockRef.current, total, bleedSpec(combat.bleed));
      setPlayerAnim('attack');
      setPlayerLunge(true);
      setEnemyFlash(true);
      addFloat('e', crit ? `CRIT! -${dmg}` : `-${dmg}`, crit ? 'crit' : 'damage');
      if (res.devastating) playStrike('devastating');
      else if (res.crush) playStrike('crush');
      if (res.counter) playStrike('counter');
      if (res.double) playStrike('double');
      if (fired) {
        playStrike(fired.def.fx);
        if (fired.heal > 0) {
          hp.current.p = Math.min(playerMax, hp.current.p + fired.heal);
          setPlayerHp(hp.current.p);
          addFloat('p', `+${fired.heal}`, 'heal');
        }
        // The enemy attack timer is real time, which the speed toggle shortens, so the delay is too.
        enemyNextAtkRef.current += fired.enemyDelayMs / speedRef.current;
      }
      if (combat.lifesteal > 0) {
        const heal = Math.max(1, Math.round(dmg * (combat.lifesteal / 100)));
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
      // Layer 2 (Damage Reduction) — asymptotic, see derivedStats.ts.
      const reduced = applyDamageReduction(enemyDmgForStage(st), activeTonicStats(combat, save, Date.now()).reduction);
      // Postura Firme only counts on boss and checkpoint floors; Bloqueio negates the whole hit (the loop's normal RNG).
      const reducedBoss = isDungeonBoss(st) || isDungeonCheckpoint(st) ? bossDamage(reduced, combat.bossReduction) : reduced;
      const blocked = !!combat.block && Math.random() < combat.block;
      if (blocked) registerBlock(strikeRef.current, combat.strikes);
      enemyActedRef.current = true;
      const eFinal = guardDamage(abilityRef.current, clockRef.current, blocked ? 0 : reducedBoss);
      hp.current.p = Math.max(0, hp.current.p - eFinal);
      setEnemyAnim('attack');
      setEnemyLunge(true);
      setPlayerFlash(true);
      if (blocked) playStrike('block');
      else addFloat('p', `-${eFinal}`, 'damage');
      // Ultimo Bastiao: the first lethal hit of the run leaves the hero at 1 HP plus a heal.
      if (hp.current.p <= 0 && combat.bastion && !bastionUsedRef.current) {
        bastionUsedRef.current = true;
        hp.current.p = bastionHp(playerMax);
        playStrike('bastion');
        setHud((h) => ({ ...h, bastion: true }));
      }
      setPlayerHp(hp.current.p);
      const back = hp.current.p > 0 ? reflectedDamage(eFinal, combat.reflect) : 0;
      if (back > 0) {
        hp.current.e = Math.max(0, hp.current.e - back);
        totalDmgRef.current += back;
        setEnemyHp(hp.current.e);
        addFloat('e', `-${back}`, 'reflect');
      }
      window.setTimeout(() => {
        setEnemyLunge(false);
        setEnemyAnim('idle');
      }, T.battle.lungeMs);
      window.setTimeout(() => setPlayerFlash(false), T.battle.flashMs);

      if (hp.current.p <= 0) {
        endCombat('defeat');
      } else if (hp.current.e <= 0) {
        clearWave();
      }
    };

    // Burn ticks and regeneration on the combat clock (derivedStats.ts). Returns false when a burn tick killed the enemy.
    const runEffects = (): boolean => {
      const clock = clockRef.current;
      const regen = regenAmount(playerMax, combat.hpRegenPct);
      while (regen > 0 && clock >= regenNextRef.current) {
        regenNextRef.current += T.battle.effectTickMs;
        if (hp.current.p < playerMax) {
          const healed = Math.min(playerMax, hp.current.p + regen);
          addFloat('p', `+${Math.round(healed - hp.current.p)}`, 'heal');
          hp.current.p = healed;
          setPlayerHp(healed);
        }
      }
      while (burnRef.current && burnRef.current.nextTickAt <= clock) {
        const tick = tickBurn(burnRef.current);
        burnRef.current = tick.burn;
        hp.current.e = Math.max(0, hp.current.e - tick.damage);
        totalDmgRef.current += tick.damage;
        setEnemyHp(hp.current.e);
        addFloat('e', `-${tick.damage}`, 'burn');
        if (hp.current.e <= 0) {
          burnRef.current = null;
          setEnemyBurning(false);
          clearWave();
          return false;
        }
      }
      // Golpe de Furia: a flurry every furyEveryMs of this fight (the combat clock, so the speed toggle scales it).
      while (combat.strikes?.furyPct && clock >= furyNextRef.current) {
        furyNextRef.current += T.heroSkills.furyEveryMs;
        const total = applyDamageModifiers(combat.dmgBase, combatModifiersFromSave(save, Date.now()));
        const per = furyHitDamage(total, combat.strikes);
        let sum = 0;
        for (let i = 0; i < T.heroSkills.furyHits; i++) {
          sum += per;
          if (combat.burn) burnRef.current = igniteBurn(burnRef.current, clock, per);
          if (combat.bleed) bleedRef.current = igniteBurn(bleedRef.current, clock, per, bleedSpec(combat.bleed));
        }
        hp.current.e = Math.max(0, hp.current.e - sum);
        totalDmgRef.current += sum;
        tally(tallyRef.current, 'w_fury', sum);
        setEnemyHp(hp.current.e);
        setPlayerAnim('attack');
        window.setTimeout(() => setPlayerAnim('idle'), T.battle.lungeMs);
        playStrike('fury');
        addFloat('e', `-${sum}`, 'damage', { left: '62%', top: -6 });
        if (hp.current.e <= 0) {
          burnRef.current = null;
          bleedRef.current = null;
          setEnemyBurning(false);
          clearWave();
          return false;
        }
      }
      while (bleedRef.current && bleedRef.current.nextTickAt <= clock) {
        const tick = tickBurn(bleedRef.current);
        bleedRef.current = tick.burn;
        hp.current.e = Math.max(0, hp.current.e - tick.damage);
        totalDmgRef.current += tick.damage;
        tally(tallyRef.current, 'w_bleed', tick.damage);
        setEnemyHp(hp.current.e);
        playStrike('bleed');
        addFloat('e', `-${tick.damage}`, 'bleed');
        if (hp.current.e <= 0) {
          burnRef.current = null;
          bleedRef.current = null;
          setEnemyBurning(false);
          clearWave();
          return false;
        }
      }
      while (abilityDotAt(abilityRef.current) <= clock) {
        const dot = tickAbilityDot(abilityRef.current);
        hp.current.e = Math.max(0, hp.current.e - dot);
        totalDmgRef.current += dot;
        setEnemyHp(hp.current.e);
        addFloat('e', `-${dot}`, 'burn');
        if (hp.current.e <= 0) {
          burnRef.current = null;
          bleedRef.current = null;
          setEnemyBurning(false);
          clearWave();
          return false;
        }
      }
      if (!burnRef.current) setEnemyBurning(false);
      return true;
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
      if (pausedRef.current) {
        if (!pausedAtRef.current) pausedAtRef.current = now;
        lastFrameRef.current = now;
        return;
      }
      if (pausedAtRef.current) {
        const gap = now - pausedAtRef.current;
        pausedAtRef.current = 0;
        heroNextAtkRef.current += gap;
        enemyNextAtkRef.current += gap;
        potionCooldownUntilRef.current += gap;
      }
      const spd = speedRef.current;
      // dt is capped so a backgrounded tab does not dump seconds of burn and regeneration into one frame.
      clockRef.current += Math.min(250, Math.max(0, now - lastFrameRef.current)) * spd;
      lastFrameRef.current = now;

      tryAutoPotion(now);
      if (!runEffects()) return;
      if (combat.strikes) {
        const st = combat.strikes;
        const crush = st.crushEvery ? strikeRef.current.hits % st.crushEvery : 0;
        const fury = st.furyPct ? Math.max(0, Math.min(1, 1 - (furyNextRef.current - clockRef.current) / T.heroSkills.furyEveryMs)) : 0;
        setHud((h) => (h.crush === crush && Math.abs(h.fury - fury) < 0.02 ? h : { ...h, crush, fury }));
      }

      const heroMs = hastedMs(abilityRef.current, clockRef.current, activeTonicStats(combat, save, Date.now()).heroMs);
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

  const currentVisual = dungeonEnemyVisualForFloor(stage);
  const currentBiome = getBiomeForFloor(stage);

  const renderLoot = (
    gold: number,
    drops: Partial<Record<MaterialId, number>>,
    shards: number,
    gemsReward?: Partial<Record<GemId, number>>,
    uniques?: UniqueDrop[],
    relics?: string[],
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
      <UniqueDrops drops={uniques ?? []} />
      <RelicDrops ids={relics ?? []} />
    </>
  );

  // What the descent paid, in plain numbers: floors cleared and the gold kept (the hero gets no XP from the Dungeon, only from Hunting). Nothing about a loss here: that line only
  // shows up when something was actually lost.
  const renderRunSummary = (stages: number, goldKept: number) => {
    return (
      <ul className="run-summary" data-testid="run-summary">
        <li>{t('dungeon.runFloors', { n: stages })}</li>
        <li>{t('dungeon.runGold', { n: goldKept })}</li>
      </ul>
    );
  };

  // The first-loss screen in plain words: what was kept, how the hero's CP compares with where the run ended, and one thing to do next.
  const renderDefeatNotes = (d: DefeatSummary) => {
    const where = isDepthStage(d.stage) ? t('dungeon.depthLabel', { n: depthOfStage(d.stage) }) : t('dungeon.floorLabel', { n: d.stage });
    const tip =
      d.tip.kind === 'step' ? t('dungeon.defeatTipStep', { text: nextStepLine(d.tip.step) }) : d.tip.kind === 'hunt' ? t('dungeon.defeatTipHunt') : t('dungeon.defeatTipRetry');
    return (
      <div className="defeat-notes">
        {renderRunSummary(d.stagesCleared, d.goldKept)}
        {d.goldLost > 0 && (
          <div className="gold-penalty">{t('dungeon.goldPenalty', { lost: d.goldLost, kept: d.goldKept, n: Math.round((1 - T.battle.defeatGoldKept) * 100) })}</div>
        )}
        <p className="defeat-kept">{d.stagesCleared > 0 ? t('dungeon.defeatKept') : t('dungeon.defeatKeptNone')}</p>
        <p className={`defeat-cp${d.below ? ' low' : ''}`}>
          {t('dungeon.defeatCp', { cp: d.cp, where, rec: d.recommended })} {d.below ? t('dungeon.defeatCpLow') : t('dungeon.defeatCpOk')}
        </p>
        <p className="defeat-tip">{tip}</p>
      </div>
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
            <div className="milestone-title">{t('dungeon.milestoneCleared', { n: floor })}</div>
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
                    <span className="mat-icon">{gemDef ? <GemIcon item={gemDef} /> : <PixelIcon name="gem" />}</span>
                    <span>+{qty as number}</span>
                  </span>
                );
              })}
            </div>
            {titleDef && <div className="milestone-title-unlocked"><PixelIcon name="title" /> {t(`titles.${titleDef.nameKey}`)}</div>}
          </div>
        );
      })}
    </div>
  );

  // Preview for the tension window: the milestone's one-time gold/gems only apply if this save hasn't
  // already banked that floor before (matches the exact gate crossedMilestoneFloors/onRetreat use).
  const tensionMilestoneReward =
    tensionFloor !== null && !save.dungeonCheckpoints.includes(tensionFloor) ? getMilestoneReward(tensionFloor) : null;
  const tensionGoldPreview = accumGold + (tensionMilestoneReward?.gold ?? 0);
  // Entries to the Masmorra still free today (this descent already used one): the same count the entry screen shows, so the question can say what descending again costs.
  const entriesLeft = Math.max(0, T.dungeon.freeSessionsPerDay - (save.dungeonSessionsDay === new Date().toDateString() ? save.dungeonSessionsUsed : 0));
  const guidedTension = tensionFloor !== null && guidedStopFloor !== undefined && tensionFloor === guidedStopFloor && !isDungeonBoss(tensionFloor);

  return (
    <div className="modal-backdrop battle-backdrop">
      <div className="battle">
        <div className="battle-controls">
          <div className="battle-left">
            <span className="stage-indicator">
              <Chip tone="gold">{isDepthStage(stage) ? t('dungeon.depthLabel', { n: depthOfStage(stage) }) : t('dungeon.floorProgress', { n: stage, m: MAX_DUNGEON_FLOOR })}</Chip>
            </span>
            <Button size="sm" className="battle-speed" onClick={toggleSpeed}>
              {dungeonText('speed').replace('{n}', String(speed))}
            </Button>
          </div>
          <Button size="sm" variant="danger" className="battle-run" onClick={askRetreat} disabled={phase === 'retreat' || phase === 'defeat'}>
            {t('dungeon.retreat')}
          </Button>
        </div>
        <span className="battle-biome">{isDepthStage(stage) ? dungeonText('depthBiome') : biomeText(currentBiome.nameKey)}</span>

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
          {BATTLE_BUFFS.map(([kind, itemId]) =>
            isBuffActive(save, kind, Date.now()) ? (
              <span className="loot-buff" key={kind} title={t(`consumables.${itemId}`)}>
                <img className="inline-icon" src={getConsumable(itemId)?.iconUrl} alt="" /> {formatBuffTime(buffRemainingMs(save, Date.now(), kind))}
              </span>
            ) : null,
          )}
        </div>

        {combat.strikes || combat.bleed || combat.bastion ? (
          <div className="sk-hud" aria-label={t('heroSkills.ui.title')}>
            {combat.strikes?.crushEvery && (
              <span className="sk-hud-item" title={t('heroSkills.skills.w_heavy_blow.name')}>
                <img src="/assets/icons/skill_w_heavy_blow.png" alt="" />
                <span className="sk-hud-pips">
                  {Array.from({ length: combat.strikes.crushEvery }, (_, i) => (
                    <i key={i} className={`sk-hud-pip${i < hud.crush ? ' on' : ''}`} />
                  ))}
                </span>
              </span>
            )}
            {combat.strikes?.furyPct && (
              <span className="sk-hud-item" title={t('heroSkills.skills.w_fury.name')}>
                <img src="/assets/icons/skill_w_fury.png" alt="" />
                <span className="sk-hud-bar">
                  <i style={{ width: `${hud.fury * 100}%` }} />
                </span>
              </span>
            )}
            {combat.strikes?.devastating && (
              <span className="sk-hud-item" title={t('heroSkills.skills.w_devastating_strike.name')}>
                <img src="/assets/icons/skill_w_devastating_strike.png" alt="" />
              </span>
            )}
            {combat.bleed && (
              <span className="sk-hud-item" title={t('heroSkills.skills.w_bleed.name')}>
                <img src="/assets/icons/skill_w_bleed.png" alt="" />
              </span>
            )}
            {combat.block && (
              <span className="sk-hud-item" title={t('heroSkills.skills.g_block.name')}>
                <img src="/assets/icons/skill_g_block.png" alt="" />
              </span>
            )}
            {combat.strikes?.doubleChance && (
              <span className="sk-hud-item" title={t('heroSkills.skills.h_light_step.name')}>
                <img src="/assets/icons/skill_h_light_step.png" alt="" />
              </span>
            )}
            {combat.bastion && (
              <span className="sk-hud-item" title={t('heroSkills.skills.g_last_bastion.name')} style={{ opacity: hud.bastion ? 0.35 : 1 }}>
                <img src="/assets/icons/skill_g_last_bastion.png" alt="" />
              </span>
            )}
          </div>
        ) : null}
        <div className={`battle-stage${fxStage.shaking ? ' shake' : ''}`}>
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
              <span className="hp-name-text">{enemyText(currentVisual.nameKey)}</span>
              {milestone === 'boss' && <span className="miniboss-tag boss">{t('dungeon.mainBoss')}</span>}
              {milestone === 'checkpoint' && <span className="miniboss-tag">{t('dungeon.miniBoss')}</span>}
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
              src={playerSpriteUrl(save)}
              size="calc(var(--sprite-size, 132px) * 1.1)"
              row={ANIM_ROW[playerAnim]}
            />
            <FxLayer side="p" items={fxStage.items} done={fxStage.done} scale={fxScale} />
            {floats.filter((f) => f.side === 'p').map((f) => (
              <span key={f.id} className={`float float-${f.kind}`} style={f.style}>
                {f.text}
              </span>
            ))}
          </div>
          <div className="battle-vs">VS</div>
          <div className={`battle-side enemy${enemyLunge ? ' lunge' : ''}${enemyFlash ? ' flash' : ''}`}>
            <SpriteSheet
              src={currentVisual.spriteUrl}
              size={currentVisual.size}
              row={ANIM_ROW[enemyAnim]}
              flip
              className={currentVisual.tintClass}
            />
            {enemyBurning && (
              <span className="burn-flame" title={t('profile.burnTitle')} aria-hidden="true">
                <PixelIcon name="dungeon" />
              </span>
            )}
            <FxLayer side="e" items={fxStage.items} done={fxStage.done} scale={fxScale} />
            {floats.filter((f) => f.side === 'e').map((f) => (
              <span key={f.id} className={`float float-${f.kind}`} style={f.style}>
                {f.text}
              </span>
            ))}
          </div>

          {waveClear && phase === 'intermission' && tensionFloor === null && (
            <div className="wave-banner">
              <div className="wave-title">{isDepthStage(waveClear.stage) ? dungeonText('depthCleared').replace('{n}', String(depthOfStage(waveClear.stage))) : dungeonText('floorCleared').replace('{n}', String(waveClear.stage))}</div>
              <div className="wave-loot">{renderLoot(waveClear.gold, waveClear.drops, waveClear.shards, waveClear.gems, waveClear.uniques, waveClear.relics)}</div>
            </div>
          )}
        </div>
        </div>

        {retreatAsk && tensionFloor === null && (phase === 'battle' || phase === 'intermission') && (
          <div className="battle-result retreat-ask" role="alertdialog" aria-modal="true" aria-label={t('dungeon.retreatAskTitle')}>
            <div className="battle-result-panel tension-panel">
              <h2 className="result-title win">{t('dungeon.retreatAskTitle')}</h2>
              <p className="tension-subtitle">
                {retreatAsk.cleared > 0
                  ? t('dungeon.retreatAskKept', { gold: retreatAsk.gold, items: retreatAsk.items, floors: retreatAsk.cleared })
                  : t('dungeon.retreatAskKeptNone')}
              </p>
              <div className="tension-warning retreat-ask-lost">
                <p>
                  {retreatAsk.fighting
                    ? t('dungeon.retreatAskLostFight', { where: isDepthStage(retreatAsk.stage) ? t('dungeon.depthLabel', { n: depthOfStage(retreatAsk.stage) }) : t('dungeon.floorLabel', { n: retreatAsk.stage }) })
                    : t('dungeon.retreatAskLostRun')}
                </p>
                <p>{entriesLeft > 0 ? t('dungeon.retreatAskEntryFree', { n: entriesLeft }) : t('dungeon.retreatAskEntryPaid', { n: T.dungeon.extraSessionShardCost })}</p>
              </div>
              <div className="tension-actions">
                <Button variant="primary" block onClick={stayInFight}>
                  {t('dungeon.retreatAskStay')}
                </Button>
                <Button variant="danger" block onClick={confirmRetreat}>
                  {t('dungeon.retreatAskGo')}
                </Button>
              </div>
            </div>
          </div>
        )}

        {tensionFloor !== null && (
          <div className="battle-result tension-window">
            <div className="battle-result-panel tension-panel">
              <h2 className="result-title win">{guidedTension ? t('dungeon.guidedTitle', { n: tensionFloor }) : isDepthStage(tensionFloor) ? t('dungeon.depthTensionTitle', { n: depthOfStage(tensionFloor) }) : t('dungeon.tensionTitle', { n: tensionFloor })}</h2>
              <div className="tension-subtitle">{guidedTension ? t('dungeon.guidedSubtitle') : t('dungeon.tensionSubtitle')}</div>
              <div className="result-rewards">
                {tensionMilestoneReward ? (
                  <>
                    {renderLoot(tensionGoldPreview, {}, 0, tensionMilestoneReward.gems)}
                    {tensionMilestoneReward.titleId && (
                      <div className="milestone-title-unlocked">
                        <PixelIcon name="title" /> {t(`titles.${getTitleDef(tensionMilestoneReward.titleId)?.nameKey ?? ''}`)}
                      </div>
                    )}
                  </>
                ) : (
                  renderLoot(tensionGoldPreview, {}, 0, {})
                )}
              </div>
              {!guidedTension && <div className="tension-warning">{t('dungeon.tensionWarning')}</div>}
              <div className="tension-actions">
                <Button variant="primary" block className="tension-retreat-btn" onClick={handleTensionRetreat} data-tutorial-target="guided-retreat">
                  {t('dungeon.tensionRetreat')}
                </Button>
                {!guidedTension && (
                  <Button variant="danger" block className="tension-advance-btn" onClick={handleTensionAdvance}>
                    {t('dungeon.tensionAdvance')}
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {(phase === 'retreat' || phase === 'defeat') && finalRewards && (
          <div className="battle-result">
            <div className="battle-result-panel">
              {phase === 'retreat' ? (
                <>
                  <h2 className="result-title win">{dungeonComplete ? t('dungeon.dungeonComplete') : t('dungeon.retreatTitle')}</h2>
                  {crossedMilestones.length > 0 && renderMilestoneBanner()}
                  {renderRunSummary(finalRewards.stages, finalRewards.gold)}
                  <div className="result-rewards">{renderLoot(finalRewards.gold, finalRewards.drops, finalRewards.shards, finalRewards.gems, finalRewards.uniques, finalRewards.relics)}</div>
                  {skillLines && <StrikeLines tally={skillLines.tally} total={skillLines.total} />}
                  <Button variant="primary" block onClick={() => onRetreat(finalRewards)}>
                    {t('dungeon.collect')}
                  </Button>
                </>
              ) : (
                <>
                  <h2 className="result-title lose">{t('dungeon.defeated')}</h2>
                  {defeatInfo && renderDefeatNotes(defeatInfo)}
                  <div className="result-rewards">{renderLoot(finalRewards.gold, finalRewards.drops, finalRewards.shards, finalRewards.gems, finalRewards.uniques, finalRewards.relics)}</div>
                  {skillLines && <StrikeLines tally={skillLines.tally} total={skillLines.total} />}
                  <Button variant="primary" block onClick={() => onDefeat(finalRewards)}>
                    {t('dungeon.return')}
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
