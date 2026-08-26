import { useEffect, useRef, useState } from 'react';
import T, { setTunableListener } from './game/tunables';
import {
  CombatEvent,
  FighterState,
  PlayerAction,
  effectiveAttackStamina,
  defaultSave,
  loadSave,
  makeEnemy,
  makePlayer,
  persistSave,
  playerLevel,
  playerMaxHp,
  resolveTurn,
  SaveData,
  tickBurn,
  tickPoison,
} from './game/engine';
import { GEAR, getEquipped, getGear } from './game/gear';
import { EnemyKind, enemyKindForDuel, getEnemyDef } from './game/enemies';
import { MATERIALS, MaterialId, hasMaterials } from './game/materials';
import { enemySpriteSize, enemySpriteUrl, spriteForArmorTier } from './game/sprites';
import SpriteSheet from './components/SpriteSheet';
import AdminModal from './components/AdminModal';
import ShopModal from './components/ShopModal';
import ForgeModal from './components/ForgeModal';
import AttributesModal from './components/AttributesModal';
import InventoryModal from './components/InventoryModal';
import { Burst, BurstState, FloatState, floatLabel } from './components/CombatFx';
import ResultPopup from './components/ResultPopup';
import TopHud from './components/TopHud';
import Campfire from './components/Campfire';
import { initAudio, loadMuted, playSfx, setMuted, unlockAudio } from './game/audio';
import Assets from './assets.json';
import Text from './locales/en.json';
import './App.css';

type AnimName = 'idle' | 'attack' | 'hurt' | 'death';
type Phase = 'player' | 'busy' | 'victory' | 'defeat';

const ANIM_ROW: Record<AnimName, number> = { idle: 0, attack: 1, hurt: 2, death: 3 };

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const fmt = (s: string, n: number) => s.replace('{n}', String(n));
const pct = (cur: number, max: number) => (max <= 0 ? 0 : Math.max(0, Math.min(100, (cur / max) * 100)));

const enemyText = (key: string): string => (Text.enemies as Record<string, string>)[key];
const gearText = (key: string): string => (Text.gear as Record<string, string>)[key];

function App() {
  const [save, setSave] = useState<SaveData>(() => loadSave());
  const [player, setPlayerState] = useState<FighterState>(() => makePlayer(loadSave()));
  const [enemy, setEnemyState] = useState<FighterState>(() => {
    const s = loadSave();
    return makeEnemy(enemyKindForDuel(s.victories + 1), s.victories + 1);
  });
  const [enemyKind, setEnemyKindState] = useState<EnemyKind>(() => enemyKindForDuel(loadSave().victories + 1));

  const [phase, setPhase] = useState<Phase>('player');
  const [playerAnim, setPlayerAnim] = useState<AnimName>('idle');
  const [enemyAnim, setEnemyAnim] = useState<AnimName>('idle');
  const [playerGuard, setPlayerGuard] = useState(false);
  const [enemyGuard, setEnemyGuard] = useState(false);
  const [playerFocus, setPlayerFocus] = useState(false);
  const [enemyFocus, setEnemyFocus] = useState(false);
  const [shaking, setShaking] = useState(false);
  const [floats, setFloats] = useState<FloatState[]>([]);
  const [bursts, setBursts] = useState<BurstState[]>([]);
  const [shopOpen, setShopOpen] = useState(false);
  const [forgeOpen, setForgeOpen] = useState(false);
  const [attrsOpen, setAttrsOpen] = useState(false);
  const [bagOpen, setBagOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [loot, setLoot] = useState<{ gold: number; shards: number } | null>(null);
  const [version, setVersion] = useState(0);
  const [muted, setMutedState] = useState<boolean>(() => loadMuted());
  const [bossFlash, setBossFlash] = useState(false);
  const [scene, setScene] = useState<'camp' | 'arena'>('camp');
  const [cheatMode, setCheatMode] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [elixirActive, setElixirActive] = useState(false);

  const playerRef = useRef(player);
  const enemyRef = useRef(enemy);
  const saveRef = useRef(save);
  const enemyKindRef = useRef(enemyKind);
  const busyRef = useRef(false);
  const idRef = useRef(0);
  const cheatModeRef = useRef(false);
  const elixirRef = useRef(false);

  const setPlayerBoth = (p: FighterState) => {
    playerRef.current = p;
    setPlayerState(p);
  };
  const setEnemyBoth = (e: FighterState) => {
    enemyRef.current = e;
    setEnemyState(e);
  };
  const setSaveBoth = (s: SaveData) => {
    saveRef.current = s;
    setSave(s);
  };
  const setEnemyKindBoth = (k: EnemyKind) => {
    enemyKindRef.current = k;
    setEnemyKindState(k);
  };
  const setElixirBoth = (v: boolean) => {
    elixirRef.current = v;
    setElixirActive(v);
  };

  const toastTimeout = useRef<number | null>(null);
  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimeout.current) window.clearTimeout(toastTimeout.current);
    toastTimeout.current = window.setTimeout(() => setToast(null), 1600);
  };

  useEffect(() => {
    persistSave(save);
  }, [save]);

  useEffect(() => {
    setTunableListener(() => setVersion((v) => v + 1));
    return () => setTunableListener(null);
  }, []);

  useEffect(() => {
    void initAudio();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        setAdminOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
    if (!next) playSfx('click');
  };

  const addFloat = (ev: CombatEvent) => {
    const id = idRef.current++;
    setFloats((f) => [...f, { id, target: ev.target, kind: ev.kind, value: ev.value }]);
    window.setTimeout(() => {
      setFloats((f) => f.filter((x) => x.id !== id));
    }, T.advanced.textFloatMs);
  };

  const addBurst = (target: 'player' | 'enemy') => {
    const id = idRef.current++;
    setBursts((b) => [...b, { id, target }]);
    window.setTimeout(() => {
      setBursts((b) => b.filter((x) => x.id !== id));
    }, 650);
  };

  const triggerShake = () => {
    setShaking(true);
    window.setTimeout(() => setShaking(false), T.advanced.shakeMs);
  };

  const spawnEnemy = (duel: number) => {
    const kind = enemyKindForDuel(duel);
    setEnemyKindBoth(kind);
    setEnemyBoth(makeEnemy(kind, duel));
    if (kind === 'boss') {
      playSfx('boss_intro');
      triggerShake();
      setBossFlash(true);
      window.setTimeout(() => setBossFlash(false), 700);
    }
  };

  const startDuel = () => {
    setPlayerBoth(makePlayer(saveRef.current));
    spawnEnemy(saveRef.current.victories + 1);
    setPlayerAnim('idle');
    setEnemyAnim('idle');
    setFloats([]);
    setBursts([]);
    setLoot(null);
    setPhase('player');
  };

  const enterArena = () => {
    playSfx('click');
    startDuel();
    setScene('arena');
  };

  const returnToCamp = () => {
    playSfx('click');
    setElixirBoth(false);
    startDuel();
    setScene('camp');
  };

  const buyPotion = (id: 'hp' | 'stamina' | 'elixir') => {
    const cost = id === 'hp' ? 30 : id === 'stamina' ? 25 : 60;
    if (saveRef.current.gold < cost) return;
    playSfx('click');
    setSaveBoth({
      ...saveRef.current,
      gold: saveRef.current.gold - cost,
      potions: { ...saveRef.current.potions, [id]: saveRef.current.potions[id] + 1 },
    });
  };

  const buyMaterial = (id: MaterialId) => {
    const def = MATERIALS.find((m) => m.id === id);
    if (!def || saveRef.current.gold < def.packCost) return;
    playSfx('click');
    setSaveBoth({
      ...saveRef.current,
      gold: saveRef.current.gold - def.packCost,
      materials: { ...saveRef.current.materials, [id]: (saveRef.current.materials[id] ?? 0) + def.packSize },
    });
  };

  const forgeItem = (id: string) => {
    const item = getGear(id);
    if (!item) return;
    const s = saveRef.current;
    const recipe = item.recipe ?? {};
    if (s.gold < item.cost) return;
    if (!hasMaterials(s.materials, recipe.materials)) return;
    for (const [itemId, need] of Object.entries(recipe.items ?? {})) {
      if ((s.inventory[itemId] ?? 0) < (need as number)) return;
    }
    if ((recipe.shards ?? 0) > 0 && s.shards < (recipe.shards ?? 0)) return;

    const mats = { ...s.materials };
    for (const [mid, count] of Object.entries(recipe.materials ?? {})) {
      mats[mid as MaterialId] = (mats[mid as MaterialId] ?? 0) - (count as number);
    }
    const inv = { ...s.inventory };
    for (const [itemId, need] of Object.entries(recipe.items ?? {})) {
      inv[itemId] = (inv[itemId] ?? 0) - (need as number);
    }
    setSaveBoth({
      ...s,
      gold: s.gold - item.cost,
      materials: mats,
      inventory: { ...inv, [id]: (inv[id] ?? 0) + 1 },
      shards: s.shards - (recipe.shards ?? 0),
    });
    playSfx('victory');
    showToast(`✓ Forged ${gearText(item.nameKey)}`);
  };

  const attrChange = (attr: 'str' | 'vit' | 'agi' | 'res', delta: number) => {
    const cur = saveRef.current[attr];
    const next = cur + delta;
    if (next < 0) return;
    const totalPoints = playerLevel(saveRef.current.xp) * 3;
    const spent = saveRef.current.str + saveRef.current.vit + saveRef.current.agi + saveRef.current.res;
    if (delta > 0 && spent + 1 > totalPoints) return;
    playSfx('click');
    setSaveBoth({ ...saveRef.current, [attr]: next });
  };

  const useElixir = () => {
    if (saveRef.current.potions.elixir <= 0 || elixirActive) return;
    playSfx('click');
    setSaveBoth({
      ...saveRef.current,
      potions: { ...saveRef.current.potions, elixir: saveRef.current.potions.elixir - 1 },
    });
    setElixirBoth(true);
  };

  const renameHero = (name: string) => {
    setSaveBoth({ ...saveRef.current, heroName: name });
  };

  const useHpPotion = () => {
    if (saveRef.current.potions.hp <= 0 || playerRef.current.hp >= playerRef.current.maxHp) return;
    playSfx('focus');
    const heal = 40;
    setSaveBoth({ ...saveRef.current, potions: { ...saveRef.current.potions, hp: saveRef.current.potions.hp - 1 } });
    setPlayerBoth({ ...playerRef.current, hp: Math.min(playerRef.current.maxHp, playerRef.current.hp + heal) });
    addFloat({ target: 'player', kind: 'heal', value: heal });
  };

  const useStaminaPotion = () => {
    if (saveRef.current.potions.stamina <= 0) return;
    playSfx('focus');
    const gain = 30;
    setSaveBoth({
      ...saveRef.current,
      potions: { ...saveRef.current.potions, stamina: saveRef.current.potions.stamina - 1 },
    });
    setPlayerBoth({
      ...playerRef.current,
      stamina: Math.min(playerRef.current.maxStamina, playerRef.current.stamina + gain),
    });
    addFloat({ target: 'player', kind: 'stamina', value: gain });
  };

  const adminAddGold = () => {
    playSfx('click');
    setSaveBoth({ ...saveRef.current, gold: saveRef.current.gold + 10000 });
  };

  const adminAddShards = () => {
    playSfx('click');
    setSaveBoth({ ...saveRef.current, shards: saveRef.current.shards + 50 });
  };

  const adminUnlockAll = () => {
    playSfx('click');
    const all = GEAR.filter((g) => g.slot !== 'relic').map((g) => g.id);
    const inv = { ...saveRef.current.inventory };
    for (const id of all) inv[id] = Math.max(inv[id] ?? 0, 1);
    setSaveBoth({ ...saveRef.current, inventory: inv });
  };

  const adminToggleCheat = () => {
    setCheatMode((c) => {
      cheatModeRef.current = !c;
      return !c;
    });
  };

  const adminReset = () => {
    playSfx('click');
    const fresh = defaultSave();
    setSaveBoth(fresh);
    setPlayerBoth(makePlayer(fresh));
    setEnemyBoth(makeEnemy(enemyKindForDuel(1), 1));
    setEnemyKindBoth(enemyKindForDuel(1));
    cheatModeRef.current = false;
    setCheatMode(false);
    setElixirBoth(false);
    setPhase('player');
    setScene('camp');
    setFloats([]);
    setBursts([]);
    setLoot(null);
    setAdminOpen(false);
    setShopOpen(false);
  };

  const applyEvents = (events: CombatEvent[]) => {
    const blockedTargets = new Set(events.filter((e) => e.kind === 'blocked').map((e) => e.target));
    for (const ev of events) {
      addFloat(ev);
      if (ev.kind === 'blocked') {
        playSfx('block', 0.05);
      } else if (ev.kind === 'crit') {
        addBurst(ev.target);
        triggerShake();
        playSfx('crit', 0.05);
      } else if (ev.kind === 'damage') {
        addBurst(ev.target);
        triggerShake();
        if (!blockedTargets.has(ev.target)) playSfx('hit', 0.05);
      } else if (ev.kind === 'reflect') {
        addBurst(ev.target);
        triggerShake();
        playSfx('hit', 0.05);
      } else if (ev.kind === 'burn') {
        playSfx('hit', 0.05);
      } else if (ev.kind === 'slam') {
        addBurst(ev.target);
        triggerShake();
        playSfx('slam', 0.05);
      } else if (ev.kind === 'dodge') {
        playSfx('dodge');
      } else if (ev.kind === 'curse') {
        playSfx('curse');
      }
    }
  };

  const finishVictory = async () => {
    setElixirBoth(false);
    triggerShake();
    await sleep(200);
    const isBoss = enemyKindRef.current === 'boss';
    const gold = randInt(T.progression.goldMin, T.progression.goldMax) * (isBoss ? 3 : 1);
    const shards = isBoss ? 1 : 0;
    const xp = playerLevel(saveRef.current.xp) >= 100 ? 0 : T.advanced.victoryXp;
    setLoot({ gold, shards });
    playSfx('victory');
    setSaveBoth({
      ...saveRef.current,
      gold: saveRef.current.gold + gold,
      victories: saveRef.current.victories + 1,
      shards: saveRef.current.shards + shards,
      xp: saveRef.current.xp + xp,
    });
    setPhase('victory');
  };

  const doTurn = async (action: PlayerAction) => {
    if (busyRef.current || phase !== 'player') return;
    busyRef.current = true;
    setPhase('busy');
    unlockAudio();

    // Burn tick (enemy takes damage over time)
    const burn = tickBurn(enemyRef.current);
    if (burn.damage > 0) {
      setEnemyBoth(burn.enemy);
      addFloat({ target: 'enemy', kind: 'burn', value: burn.damage });
      playSfx('hit', 0.05);
    }
    if (burn.enemy.hp <= 0) {
      setEnemyAnim('death');
      await sleep(820);
      await finishVictory();
      busyRef.current = false;
      return;
    }

    // Poison tick (player takes damage over time)
    const pois = tickPoison(playerRef.current);
    if (pois.damage > 0) {
      setPlayerBoth(pois.player);
      addFloat({ target: 'player', kind: 'poison', value: pois.damage });
      playSfx('curse', 0.05);
    }
    if (pois.player.hp <= 0) {
      setPlayerAnim('death');
      await sleep(820);
      setElixirBoth(false);
      setPhase('defeat');
      busyRef.current = false;
      return;
    }

    const result = resolveTurn(
      action,
      playerRef.current,
      enemyRef.current,
      saveRef.current,
      getEnemyDef(enemyKindRef.current),
      { godMode: cheatModeRef.current, oneHitKill: cheatModeRef.current, elixir: elixirRef.current },
    );
    const enemyKilled = result.enemyMid.hp <= 0;

    // Player acts
    if (action === 'attack') {
      playSfx('slash', 0.05);
      setPlayerAnim('attack');
      await sleep(420);
      applyEvents(result.playerEvents);
      setEnemyBoth(result.enemyMid);
      setPlayerBoth(result.playerMid);
      setEnemyAnim(enemyKilled ? 'death' : 'hurt');
      await sleep(enemyKilled ? 620 : 280);
      if (!enemyKilled) setEnemyAnim('idle');
    } else if (action === 'shield') {
      setPlayerGuard(true);
      setPlayerBoth(result.playerMid);
      await sleep(450);
    } else {
      playSfx('focus');
      setPlayerFocus(true);
      setPlayerBoth(result.playerMid);
      applyEvents(result.playerEvents);
      await sleep(540);
      setPlayerFocus(false);
    }

    // Enemy acts (only if it survived the player's action)
    if (!enemyKilled) {
      if (result.enemyAction === 'attack') {
        setEnemyAnim('attack');
        await sleep(420);
        applyEvents(result.enemyEvents);
        setPlayerBoth(result.playerEnd);
        setEnemyBoth(result.enemyEnd);
        setPlayerAnim(result.playerEnd.hp <= 0 ? 'death' : 'hurt');
        await sleep(result.playerEnd.hp <= 0 ? 620 : 280);
        if (result.playerEnd.hp > 0) setPlayerAnim('idle');
      } else if (result.enemyAction === 'slam') {
        setEnemyAnim('attack');
        await sleep(520);
        applyEvents(result.enemyEvents);
        setPlayerBoth(result.playerEnd);
        setEnemyBoth(result.enemyEnd);
        setPlayerAnim(result.playerEnd.hp <= 0 ? 'death' : 'hurt');
        await sleep(result.playerEnd.hp <= 0 ? 620 : 300);
        if (result.playerEnd.hp > 0) setPlayerAnim('idle');
      } else if (result.enemyAction === 'charge') {
        playSfx('charge');
        setEnemyBoth(result.enemyEnd);
        await sleep(600);
      } else if (result.enemyAction === 'shield') {
        setEnemyGuard(true);
        setEnemyBoth(result.enemyEnd);
        await sleep(450);
      } else {
        setEnemyFocus(true);
        setEnemyBoth(result.enemyEnd);
        applyEvents(result.enemyEvents);
        await sleep(540);
      }
    }
    setPlayerGuard(false);
    setEnemyGuard(false);
    setEnemyFocus(false);
    setPlayerFocus(false);

    // End check
    const enemyDeadNow = result.enemyEnd.hp <= 0;
    if (enemyKilled) {
      await finishVictory();
    } else if (enemyDeadNow) {
      setEnemyAnim('death');
      await sleep(620);
      await finishVictory();
    } else if (result.playerEnd.hp <= 0) {
      triggerShake();
      await sleep(820);
      setElixirBoth(false);
      setPhase('defeat');
    } else {
      setPhase('player');
    }

    busyRef.current = false;
  };

  const nextDuel = () => {
    setElixirBoth(false);
    startDuel();
  };

  const retryDuel = () => {
    setElixirBoth(false);
    startDuel();
  };

  const equipGear = (id: string) => {
    const item = getGear(id);
    if (saveRef.current.equipped[item.slot] === id) return;
    playSfx('click');
    const next: SaveData = {
      ...saveRef.current,
      equipped: { ...saveRef.current.equipped, [item.slot]: id },
    };
    setSaveBoth(next);
    if (item.slot === 'armor') {
      const newMax = playerMaxHp(next);
      const delta = newMax - playerRef.current.maxHp;
      setPlayerBoth({
        ...playerRef.current,
        maxHp: newMax,
        hp: Math.max(1, Math.min(newMax, playerRef.current.hp + delta)),
      });
    }
  };

  const unequipGear = (id: string) => {
    const item = getGear(id);
    if (!item) return;
    playSfx('click');
    const fallback = item.slot === 'relic' ? null : item.slot === 'weapon' ? 'wooden_club' : 'ragged_clothes';
    const next: SaveData = {
      ...saveRef.current,
      equipped: { ...saveRef.current.equipped, [item.slot]: fallback },
    };
    setSaveBoth(next);
    if (item.slot === 'armor') {
      const newMax = playerMaxHp(next);
      const delta = newMax - playerRef.current.maxHp;
      setPlayerBoth({
        ...playerRef.current,
        maxHp: newMax,
        hp: Math.max(1, Math.min(newMax, playerRef.current.hp + delta)),
      });
    }
  };

  const atkCost = effectiveAttackStamina(save);
  const build = getEquipped(save.equipped);
  const weaponTier = build.weapon?.tier ?? 0;
  const armorTier = build.armor?.tier ?? 0;
  const playerSpriteUrl = spriteForArmorTier(armorTier);
  const enemyDef = getEnemyDef(enemyKind);
  const enemyName = enemyDef.boss
    ? fmt(Text.enemies.bossName, enemyText(enemyDef.nameKey))
    : enemyText(enemyDef.nameKey);
  const enemySprite = enemySpriteUrl(enemyKind);
  const enemySize = enemySpriteSize(enemyKind);
  const canAttack = phase === 'player' && player.stamina >= atkCost;
  const canShield = phase === 'player' && player.stamina >= T.combat.shieldStamina;
  const canFocus = phase === 'player';

  const renderFloats = (target: 'player' | 'enemy') =>
    floats
      .filter((f) => f.target === target)
      .map((f) => (
        <span key={f.id} className={`float float-${f.kind}`}>
          {floatLabel(f)}
        </span>
      ));

  const renderBursts = (target: 'player' | 'enemy') =>
    bursts
      .filter((b) => b.target === target)
      .map((b) => <Burst key={b.id} count={T.advanced.particleCount} />);

  return (
    <div className="game-root">
      <div className={`stage${shaking ? ' shaking' : ''}`} data-tv={version}>
        <div
          className="bg"
          style={{ backgroundImage: `url(${scene === 'camp' ? Assets.background.camp.url : Assets.background.arena.url})` }}
        />
        <div className="vignette" />
        {bossFlash && <div className="boss-flash" />}

        <TopHud
          save={save}
          muted={muted}
          spriteUrl={playerSpriteUrl}
          onToggleMute={toggleMute}
          onOpenAdmin={() => setAdminOpen(true)}
          onOpenAttributes={() => setAttrsOpen(true)}
          onOpenBag={() => setBagOpen(true)}
          onRename={renameHero}
        />

        {scene === 'camp' ? (
          <>
            <Campfire />
            <div className="camp-actions">
              <button className="camp-side-btn" onClick={() => { playSfx('click'); setForgeOpen(true); }} data-ui>
                {Text.ui.forge}
              </button>
              <button className="camp-main-btn" onClick={enterArena} data-ui>
                {Text.camp.enterArena}
              </button>
              <button className="camp-side-btn" onClick={() => { playSfx('click'); setShopOpen(true); }} data-ui>
                {Text.ui.shop}
              </button>
            </div>
          </>
        ) : (
          <>
            <button className="return-camp" onClick={returnToCamp} data-ui>
              {Text.camp.returnCamp}
            </button>
            <div className="arena">
          <div className="fighter player">
            <div className="bars">
              <div className="bar hp">
                <div className="bar-fill hp-fill" style={{ width: `${pct(player.hp, player.maxHp)}%` }} />
                <span className="bar-label">{`${player.hp}/${player.maxHp}`}</span>
              </div>
              <div className="bar stamina">
                <div className="bar-fill stamina-fill" style={{ width: `${pct(player.stamina, player.maxStamina)}%` }} />
              </div>
            </div>
            <div className="sprite-wrap">
              {weaponTier >= 4 && <span className="glow flame-glow" />}
              {playerGuard && <span className="guard-badge">🛡️</span>}
              {playerFocus && <span className="focus-ring" />}
              <SpriteSheet
                src={playerSpriteUrl}
                size="var(--sprite-size, 132px)"
                row={ANIM_ROW[playerAnim]}
                flip={false}
                playOnce={playerAnim !== 'idle'}
                onDone={() => {
                  if (playerAnim !== 'death') setPlayerAnim('idle');
                }}
              />
              {renderBursts('player')}
              {renderFloats('player')}
            </div>
          </div>

          <div className={`fighter enemy${enemyDef.boss ? ' boss' : ''}`}>
            <div className="bars">
              {enemyDef.boss && <span className="boss-tag">{Text.combat.bossTag}</span>}
              <span className="enemy-name">{enemyName}</span>
              <div className="bar hp enemy-hp">
                <div className="bar-fill enemy-hp-fill" style={{ width: `${pct(enemy.hp, enemy.maxHp)}%` }} />
                <span className="bar-label">{`${enemy.hp}/${enemy.maxHp}`}</span>
              </div>
            </div>
            <div className="sprite-wrap">
              {enemyDef.boss && <span className="glow boss-aura" />}
              {enemy.charging && <span className="charge-flash" />}
              {enemy.charging && <span className="charge-warning">!</span>}
              {enemy.burnTurns > 0 && <span className="glow burn-glow" />}
              {enemyGuard && <span className="guard-badge">🛡️</span>}
              {enemyFocus && <span className="focus-ring" />}
              <SpriteSheet
                src={enemySprite}
                size={enemySize}
                row={ANIM_ROW[enemyAnim]}
                flip
                playOnce={enemyAnim !== 'idle'}
                onDone={() => {
                  if (enemyAnim !== 'death') setEnemyAnim('idle');
                }}
              />
              {renderBursts('enemy')}
              {renderFloats('enemy')}
            </div>
          </div>
        </div>

        <footer className="controls">
          <div className="potion-bar">
            <button className="potion-btn" onClick={useHpPotion} disabled={phase !== 'player' || save.potions.hp <= 0} data-ui>
              🧪 ×{save.potions.hp}
            </button>
            <button className="potion-btn" onClick={useStaminaPotion} disabled={phase !== 'player' || save.potions.stamina <= 0} data-ui>
              ⚡ ×{save.potions.stamina}
            </button>
          </div>
          <div className="action-row">
            <button className="action attack" onClick={() => doTurn('attack')} disabled={!canAttack} data-ui>
              <span className="action-label">{Text.ui.attack}</span>
              <span className="action-cost">{`-${atkCost} ${Text.combat.stamina}`}</span>
            </button>
            <button className="action shield" onClick={() => doTurn('shield')} disabled={!canShield} data-ui>
              <span className="action-label">{Text.ui.shield}</span>
              <span className="action-cost">{`-${T.combat.shieldStamina} ${Text.combat.stamina}`}</span>
            </button>
            <button className="action focus" onClick={() => doTurn('focus')} disabled={!canFocus} data-ui>
              <span className="action-label">{Text.ui.focus}</span>
              <span className="action-cost">{Text.ui.free}</span>
            </button>
          </div>
        </footer>
          </>
        )}
      </div>

      {shopOpen && (
        <ShopModal
          save={save}
          elixirActive={elixirActive}
          onBuyPotion={buyPotion}
          onBuyMaterial={buyMaterial}
          onUseElixir={useElixir}
          onClose={() => {
            playSfx('click');
            setShopOpen(false);
          }}
        />
      )}

      {forgeOpen && (
        <ForgeModal
          save={save}
          onForge={forgeItem}
          onEquip={equipGear}
          onClose={() => {
            playSfx('click');
            setForgeOpen(false);
          }}
        />
      )}

      {attrsOpen && (
        <AttributesModal
          save={save}
          onAttrChange={attrChange}
          onClose={() => {
            playSfx('click');
            setAttrsOpen(false);
          }}
        />
      )}

      {bagOpen && (
        <InventoryModal
          save={save}
          onEquip={equipGear}
          onUnequip={unequipGear}
          onClose={() => {
            playSfx('click');
            setBagOpen(false);
          }}
        />
      )}

      {toast && <div className="toast">{toast}</div>}

      {phase === 'victory' || phase === 'defeat' ? (
        <ResultPopup phase={phase} loot={loot} onNext={nextDuel} onRetry={retryDuel} />
      ) : null}

      {adminOpen && (
        <AdminModal
          cheatMode={cheatMode}
          onGold={adminAddGold}
          onShards={adminAddShards}
          onUnlock={adminUnlockAll}
          onToggleCheat={adminToggleCheat}
          onReset={adminReset}
          onClose={() => setAdminOpen(false)}
        />
      )}
    </div>
  );
}

export default App;
