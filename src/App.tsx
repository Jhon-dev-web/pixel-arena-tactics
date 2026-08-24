import { CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import T, { setTunableListener } from './game/tunables';
import {
  CombatEvent,
  CombatEventKind,
  FighterState,
  PlayerAction,
  effectiveAttackStamina,
  loadSave,
  makeEnemy,
  makePlayer,
  persistSave,
  playerMaxHp,
  resolveTurn,
  SaveData,
  tickBurn,
  tickPoison,
} from './game/engine';
import { GEAR_SLOTS, GearItem, GearSlot, gearBySlot, getEquipped, getGear } from './game/gear';
import { EnemyKind, enemyKindForDuel, getEnemyDef } from './game/enemies';
import SpriteSheet from './components/SpriteSheet';
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

interface FloatState {
  id: number;
  target: 'player' | 'enemy';
  kind: CombatEventKind;
  value: number;
}
interface BurstState {
  id: number;
  target: 'player' | 'enemy';
}

function floatLabel(ev: FloatState): string {
  switch (ev.kind) {
    case 'crit':
      return `${Text.combat.critical} -${ev.value}`;
    case 'blocked':
      return Text.combat.blocked;
    case 'damage':
      return `-${ev.value}`;
    case 'heal':
      return `+${ev.value} ${Text.combat.hp}`;
    case 'stamina':
      return `+${ev.value} ${Text.combat.stamina}`;
    case 'reflect':
      return `${Text.combat.reflect} -${ev.value}`;
    case 'burn':
      return `${Text.combat.burn} -${ev.value}`;
    case 'poison':
      return `${Text.combat.poison} -${ev.value}`;
    case 'dodge':
      return Text.combat.dodge;
    case 'curse':
      return Text.combat.curse;
    case 'slam':
      return `${Text.combat.slam} -${ev.value}`;
  }
}

function Burst({ count }: { count: number }) {
  const dots = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
        const dist = 22 + Math.random() * 36;
        return {
          dx: Math.cos(angle) * dist,
          dy: Math.sin(angle) * dist,
          size: 3 + Math.random() * 4,
          delay: Math.random() * 50,
        };
      }),
    [count],
  );
  return (
    <span className="burst">
      {dots.map((d, i) => (
        <span
          key={i}
          className="burst-dot"
          style={
            {
              '--dx': `${d.dx}px`,
              '--dy': `${d.dy}px`,
              width: `${d.size}px`,
              height: `${d.size}px`,
              animationDelay: `${d.delay}ms`,
            } as CSSProperties
          }
        />
      ))}
    </span>
  );
}

const gearText = (key: string): string => (Text.gear as Record<string, string>)[key];
const enemyText = (key: string): string => (Text.enemies as Record<string, string>)[key];

function GearRow({
  item,
  owned,
  equipped,
  gold,
  onBuy,
  onEquip,
}: {
  item: GearItem;
  owned: boolean;
  equipped: boolean;
  gold: number;
  onBuy: (id: string) => void;
  onEquip: (id: string) => void;
}) {
  return (
    <div className="gear-row">
      <div className="gear-info">
        <span className="gear-name">{gearText(item.nameKey)}</span>
        <span className="gear-desc">{gearText(item.descKey)}</span>
        {!owned && <span className="gear-cost">{fmt(Text.ui.cost, item.cost)}</span>}
      </div>
      {equipped ? (
        <button className="gear-action equipped" disabled data-ui>
          {Text.gear.equipped}
        </button>
      ) : owned ? (
        <button className="gear-action" onClick={() => onEquip(item.id)} data-ui>
          {Text.gear.equip}
        </button>
      ) : (
        <button className="gear-action buy" onClick={() => onBuy(item.id)} disabled={gold < item.cost} data-ui>
          {Text.gear.buy}
        </button>
      )}
    </div>
  );
}

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
  const [shopTab, setShopTab] = useState<'upgrades' | 'armory'>('upgrades');
  const [loot, setLoot] = useState<{ gold: number; shards: number } | null>(null);
  const [version, setVersion] = useState(0);
  const [muted, setMutedState] = useState<boolean>(() => loadMuted());
  const [bossFlash, setBossFlash] = useState(false);

  const playerRef = useRef(player);
  const enemyRef = useRef(enemy);
  const saveRef = useRef(save);
  const enemyKindRef = useRef(enemyKind);
  const busyRef = useRef(false);
  const idRef = useRef(0);

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
    triggerShake();
    await sleep(200);
    const isBoss = enemyKindRef.current === 'boss';
    const gold = randInt(T.progression.goldMin, T.progression.goldMax) * (isBoss ? 3 : 1);
    const shards = isBoss ? 1 : 0;
    setLoot({ gold, shards });
    playSfx('victory');
    setSaveBoth({
      ...saveRef.current,
      gold: saveRef.current.gold + gold,
      victories: saveRef.current.victories + 1,
      shards: saveRef.current.shards + shards,
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
      setPhase('defeat');
    } else {
      setPhase('player');
    }

    busyRef.current = false;
  };

  const nextDuel = () => {
    setPlayerBoth(makePlayer(saveRef.current));
    spawnEnemy(saveRef.current.victories + 1);
    setPlayerAnim('idle');
    setEnemyAnim('idle');
    setFloats([]);
    setBursts([]);
    setLoot(null);
    setPhase('player');
  };

  const retryDuel = () => {
    setPlayerBoth(makePlayer(saveRef.current));
    spawnEnemy(saveRef.current.victories + 1);
    setPlayerAnim('idle');
    setEnemyAnim('idle');
    setFloats([]);
    setBursts([]);
    setLoot(null);
    setPhase('player');
  };

  const buyWeapon = () => {
    const cost = saveRef.current.weaponLevel * T.progression.weaponBaseCost;
    if (saveRef.current.gold < cost) return;
    playSfx('click');
    setSaveBoth({
      ...saveRef.current,
      gold: saveRef.current.gold - cost,
      weaponLevel: saveRef.current.weaponLevel + 1,
    });
  };

  const buyArmor = () => {
    const cost = saveRef.current.armorLevel * T.progression.armorBaseCost;
    if (saveRef.current.gold < cost) return;
    playSfx('click');
    const next: SaveData = {
      ...saveRef.current,
      gold: saveRef.current.gold - cost,
      armorLevel: saveRef.current.armorLevel + 1,
    };
    setSaveBoth(next);
    const newMax = playerMaxHp(next);
    const delta = newMax - playerRef.current.maxHp;
    setPlayerBoth({
      ...playerRef.current,
      maxHp: newMax,
      hp: Math.min(newMax, playerRef.current.hp + delta),
    });
  };

  const buyGear = (id: string) => {
    const item = getGear(id);
    if (saveRef.current.gold < item.cost || saveRef.current.owned.includes(id)) return;
    playSfx('click');
    setSaveBoth({
      ...saveRef.current,
      gold: saveRef.current.gold - item.cost,
      owned: [...saveRef.current.owned, id],
    });
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

  const weaponCost = save.weaponLevel * T.progression.weaponBaseCost;
  const armorCost = save.armorLevel * T.progression.armorBaseCost;
  const atkCost = effectiveAttackStamina(save);
  const build = getEquipped(save.equipped);
  const weaponTier = build.weapon?.tier ?? 1;
  const enemyDef = getEnemyDef(enemyKind);
  const enemyName = enemyDef.boss
    ? fmt(Text.enemies.bossName, enemyText(enemyDef.nameKey))
    : enemyText(enemyDef.nameKey);
  const enemySpriteUrl =
    enemyKind === 'goblin'
      ? Assets.spritesheets.goblin.url
      : enemyKind === 'orc'
        ? Assets.spritesheets.orc.url
        : enemyKind === 'warlock'
          ? Assets.spritesheets.warlock.url
          : Assets.spritesheets.boss.url;
  const enemySize = enemyKind === 'boss' ? 'calc(var(--sprite-size, 132px) * 1.3)' : 'var(--sprite-size, 132px)';
  const canAttack = phase === 'player' && player.stamina >= atkCost;
  const canShield = phase === 'player' && player.stamina >= T.combat.shieldStamina;
  const canFocus = phase === 'player';

  const equippedName = (slot: GearSlot): string => {
    const id = save.equipped[slot];
    if (!id) return Text.gear.none;
    return gearText(getGear(id).nameKey);
  };

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
        <div className="bg" style={{ backgroundImage: `url(${Assets.background.arena.url})` }} />
        <div className="vignette" />
        {bossFlash && <div className="boss-flash" />}

        <header className="topbar">
          <div className="stats">
            <span className="stat">{fmt(Text.ui.victories, save.victories)}</span>
            <span className="stat gold">{fmt(Text.ui.gold, save.gold)}</span>
            <span className="stat shards">{fmt(Text.ui.shards, save.shards)}</span>
          </div>
          <div className="topbar-right">
            <button className="mute-btn" onClick={toggleMute} aria-label="Toggle sound" data-ui>
              {muted ? '🔇' : '🔊'}
            </button>
            <button className="shop-btn" onClick={() => { playSfx('click'); setShopOpen(true); }} data-ui>
              {Text.ui.shop}
            </button>
          </div>
        </header>

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
              {weaponTier >= 3 && <span className="glow flame-glow" />}
              {weaponTier === 2 && <span className="glow steel-glow" />}
              {playerGuard && <span className="guard-badge">🛡️</span>}
              {playerFocus && <span className="focus-ring" />}
              <SpriteSheet
                src={Assets.spritesheets.knight.url}
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
                src={enemySpriteUrl}
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
        </footer>
      </div>

      {shopOpen && (
        <div className="modal-backdrop">
          <div className="modal shop-modal">
            <h2 className="modal-title">{Text.ui.shop}</h2>
            <p className="shop-gold">{fmt(Text.ui.owned, save.gold)}</p>

            <div className="shop-tabs">
              <button
                className={`tab${shopTab === 'upgrades' ? ' active' : ''}`}
                onClick={() => setShopTab('upgrades')}
                data-ui
              >
                {Text.gear.upgradesTab}
              </button>
              <button
                className={`tab${shopTab === 'armory' ? ' active' : ''}`}
                onClick={() => setShopTab('armory')}
                data-ui
              >
                {Text.gear.armoryTab}
              </button>
            </div>

            {shopTab === 'upgrades' ? (
              <div className="shop-body">
                <div className="shop-row">
                  <div className="shop-info">
                    <span className="shop-name">⚔️ {Text.ui.weapon}</span>
                    <span className="shop-level">{fmt(Text.ui.level, save.weaponLevel)}</span>
                  </div>
                  <button className="shop-buy" onClick={buyWeapon} disabled={save.gold < weaponCost} data-ui>
                    {fmt(Text.ui.cost, weaponCost)}
                  </button>
                </div>

                <div className="shop-row">
                  <div className="shop-info">
                    <span className="shop-name">🛡️ {Text.ui.armor}</span>
                    <span className="shop-level">{fmt(Text.ui.level, save.armorLevel)}</span>
                  </div>
                  <button className="shop-buy" onClick={buyArmor} disabled={save.gold < armorCost} data-ui>
                    {fmt(Text.ui.cost, armorCost)}
                  </button>
                </div>
              </div>
            ) : (
              <div className="armory">
                {GEAR_SLOTS.map((slot) => (
                  <div className="gear-section" key={slot}>
                    <div className="gear-section-title">
                      {gearText(slot)} · {equippedName(slot)}
                    </div>
                    {gearBySlot(slot).map((item) => (
                      <GearRow
                        key={item.id}
                        item={item}
                        owned={save.owned.includes(item.id)}
                        equipped={save.equipped[item.slot] === item.id}
                        gold={save.gold}
                        onBuy={buyGear}
                        onEquip={equipGear}
                      />
                    ))}
                  </div>
                ))}
              </div>
            )}

            <button className="modal-close" onClick={() => { playSfx('click'); setShopOpen(false); }} data-ui>
              {Text.ui.close}
            </button>
          </div>
        </div>
      )}

      {phase === 'victory' && loot !== null && (
        <div className="modal-backdrop">
          <div className="modal result-modal victory">
            <h2 className="modal-title win">{Text.combat.victoryTitle}</h2>
            <p className="loot-text">{fmt(Text.combat.loot, loot.gold)}</p>
            {loot.shards > 0 && <p className="loot-text shard">{fmt(Text.combat.shardLoot, loot.shards)}</p>}
            <button className="result-btn" onClick={nextDuel} data-ui>
              {Text.ui.nextDuel}
            </button>
          </div>
        </div>
      )}

      {phase === 'defeat' && (
        <div className="modal-backdrop">
          <div className="modal result-modal defeat">
            <h2 className="modal-title lose">{Text.combat.defeatTitle}</h2>
            <p className="loot-text">{Text.combat.defeatHint}</p>
            <button className="result-btn" onClick={retryDuel} data-ui>
              {Text.ui.retry}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
