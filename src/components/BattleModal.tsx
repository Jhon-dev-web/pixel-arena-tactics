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
import { SKILL_FX, FX_PATH_COLOR, SkillFxId } from '../game/skillFx';
import { FxLayer } from './SkillFx';
import { useFxScale, useFxStage } from '../hooks/useSkillFx';
import StrikeLines from './StrikeLines';
import { crossedMilestoneFloors, dungeonEnemyKindForFloor, getBiomeForFloor, getMilestoneReward, MAX_DUNGEON_FLOOR } from '../game/dungeon';
import { MaterialId, materialIconUrl } from '../game/materials';
import { dungeonEnemyVisualForFloor, playerSpriteUrl } from '../game/sprites';
import { playSfx } from '../game/audio';
import SpriteSheet from './SpriteSheet';
import { isDungeonBoss, isDungeonCheckpoint, RunRewards, stageEnemyDmg, stageEnemyHp, waveRewards } from '../game/waves';
import { getGem, GemId } from '../game/gems';
import { UniqueDrop } from '../game/uniques';
import { getTitleDef } from '../game/titles';
import GemIcon from './GemIcon';
import UniqueDrops from './UniqueDrops';
import RelicDrops from './RelicDrops';

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
  onRetreat,
  onDefeat,
  onUsePotion,
}: {
  save: SaveData;
  startFloor: number;
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
    if (def.callout) addFloat(def.side, t(`heroSkills.fx.${id}`), 'skill', { left: `${def.left}%`, top: def.top, ['--fx-color' as string]: FX_PATH_COLOR[def.path] } as CSSProperties);
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
    const gold = outcome === 'retreat' ? acc.gold : Math.floor(acc.gold * T.battle.defeatGoldKept);
    setFinalRewards({ gold, drops: acc.drops, shards: acc.shards, gems: acc.gems, uniques: acc.uniques, relics: acc.relics, stages: clearedRef.current });
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
      if (isDungeonBoss(st)) {
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
      let dmg = base;
      if (res.double) {
        const echo = echoDamage(base);
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
      addFloat('e', crit ? `💥 CRIT! -${dmg}` : `-${dmg}`, crit ? 'crit' : 'damage');
      if (res.devastating) playStrike('devastating');
      else if (res.crush) playStrike('crush');
      if (res.counter) playStrike('counter');
      if (res.double) playStrike('double');
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
      const eFinal = blocked ? 0 : reducedBoss;
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
        addFloat('e', `↩ -${back}`, 'reflect');
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
        addFloat('e', `🔥 -${tick.damage}`, 'burn');
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

      const heroMs = activeTonicStats(combat, save, Date.now()).heroMs;
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
            </div>
            {titleDef && <div className="milestone-title-unlocked">🎖️ {t(`titles.${titleDef.nameKey}`)}</div>}
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
              {milestone === 'boss' && <span className="miniboss-tag boss">👑 {t('dungeon.mainBoss')}</span>}
              {milestone === 'checkpoint' && <span className="miniboss-tag">💀 {t('dungeon.miniBoss')}</span>}
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
            />
            {enemyBurning && (
              <span className="burn-flame" title={t('profile.burnTitle')} aria-hidden="true">
                🔥
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
              <div className="wave-title">{dungeonText('floorCleared').replace('{n}', String(waveClear.stage))}</div>
              <div className="wave-loot">{renderLoot(waveClear.gold, waveClear.drops, waveClear.shards, waveClear.gems, waveClear.uniques, waveClear.relics)}</div>
            </div>
          )}
        </div>
        </div>

        {tensionFloor !== null && (
          <div className="battle-result tension-window">
            <div className="battle-result-panel tension-panel">
              <h2 className="result-title win">{t('dungeon.tensionTitle', { n: tensionFloor })}</h2>
              <div className="tension-subtitle">{t('dungeon.tensionSubtitle')}</div>
              <div className="result-rewards">
                {tensionMilestoneReward ? (
                  <>
                    {renderLoot(tensionGoldPreview, {}, 0, tensionMilestoneReward.gems)}
                    {tensionMilestoneReward.titleId && (
                      <div className="milestone-title-unlocked">
                        🎖️ {t(`titles.${getTitleDef(tensionMilestoneReward.titleId)?.nameKey ?? ''}`)}
                      </div>
                    )}
                  </>
                ) : (
                  renderLoot(tensionGoldPreview, {}, 0, {})
                )}
              </div>
              <div className="tension-warning">{t('dungeon.tensionWarning')}</div>
              <div className="tension-actions">
                <button className="result-btn tension-retreat-btn" onClick={handleTensionRetreat} data-ui>
                  {t('dungeon.tensionRetreat')}
                </button>
                <button className="result-btn tension-advance-btn" onClick={handleTensionAdvance} data-ui>
                  {t('dungeon.tensionAdvance')}
                </button>
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
                  <div className="result-rewards">{renderLoot(finalRewards.gold, finalRewards.drops, finalRewards.shards, finalRewards.gems, finalRewards.uniques, finalRewards.relics)}</div>
                  {skillLines && <StrikeLines tally={skillLines.tally} total={skillLines.total} />}
                  <button className="result-btn" onClick={() => onRetreat(finalRewards)} data-ui>
                    {t('dungeon.collect')}
                  </button>
                </>
              ) : (
                <>
                  <h2 className="result-title lose">{t('dungeon.defeated')}</h2>
                  <div className="gold-penalty">{t('dungeon.goldPenalty', { n: Math.round((1 - T.battle.defeatGoldKept) * 100) })}</div>
                  <div className="result-rewards">{renderLoot(finalRewards.gold, finalRewards.drops, finalRewards.shards, finalRewards.gems, finalRewards.uniques, finalRewards.relics)}</div>
                  {skillLines && <StrikeLines tally={skillLines.tally} total={skillLines.total} />}
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
