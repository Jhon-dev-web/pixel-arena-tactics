import { CSSProperties, ReactNode, useEffect, useRef, useState } from 'react';
import { t } from '../locales';
import T from '../game/tunables';
import { HeroSheet, heroSheetUrl } from '../game/sprites';
import { HuntLiveSnapshot } from '../game/huntCombat';
import { artGeometry, HERO_ART, huntingEnemyArt, huntingEnemySpriteUrl, huntingZoneBackgroundUrl, HuntingZoneDef } from '../game/huntingZones';
import { FramedSprite } from './HuntParts';
import { StrikeStats } from '../game/derivedStats';
import { FX_PATH_COLOR, SKILL_FX, SkillFxId } from '../game/skillFx';
import { FxLayer } from './SkillFx';
import { useFxScale, useFxStage } from '../hooks/useSkillFx';
import { reducedMotion, subscribeMotion } from '../lib/motionPref';
import { SCENE_FALL_MS, SCENE_POSE_MS, SceneEvent, sceneStep } from './huntSceneEvents';

// What the hero has learned that shows in the scene (CombatStats of the running session). The scene is decorative: it never drives the simulation, so these strikes play on its own
// beat at a believable cadence derived from the same parameters (every Nth decorative hit is an Esmagador, ...), never implying a specific result. Passive-only builds look as before.
export interface StrikeDecor {
  strikes?: StrikeStats;
  bleed?: number;
  block?: number;
}

// Sheet rows: idle, attack, hurt, death.
const ROW = { idle: 0, attack: 1, hurt: 2, death: 3 };
// How tall the hero looks in the scene, as a fraction of the sprite box (the monsters scale from this by their own `height`, see HuntingEnemyArt).
const HERO_HEIGHT = 0.9;

// The decorative loop, one beat per visual pulse (T.hunting.tickMs): the hero hits, the monster hits back, and now and then the monster falls and a new one walks in.
type Beat = 'hero' | 'monster' | 'kill' | 'arrive';
const BEATS: Beat[] = ['hero', 'monster', 'hero', 'monster', 'kill', 'arrive'];
const ACTION_MS = 700; // how long an attack / hurt pose lasts inside a beat

// Same helper BattleModal.tsx uses for its HP bars (not exported there, so mirrored here).
const hpPct = (cur: number, max: number): number => (max <= 0 ? 0 : Math.max(0, Math.min(100, (cur / max) * 100)));

function usePrefersReducedMotion(): boolean {
  // the system setting or the player's own switch (Settings > Jogo)
  const [reduced, setReduced] = useState(() => reducedMotion());
  useEffect(() => subscribeMotion(() => setReduced(reducedMotion())), []);
  return reduced;
}

/* The place the hero went to hunt: the zone's own map strip as the backdrop (not an arena), the hero on the left and the monster on the right, both standing on
   the ground band at the bottom, name plates + HP on top. Purely decorative: the actual gold/drops are always computed from elapsed time
   (computeHuntingStatus), so the animation never grants anything itself; it just visualizes the same rate. The HP numbers are the replay's own snapshot of
   the fight in progress. With prefers-reduced-motion the two stand still. */
export default function HuntBattleView({
  zone,
  heroSheet,
  heroName,
  monsterName,
  monsterLevel,
  snapshot,
  decor,
  children,
}: {
  zone: HuntingZoneDef;
  heroSheet: HeroSheet;
  heroName: string;
  monsterName: string;
  monsterLevel: number;
  snapshot: HuntLiveSnapshot | null;
  decor?: StrikeDecor;
  children?: ReactNode; // tonic badges under the plates
}) {
  // Each sheet is drawn at the same pixel scale as the knight's, so the peasant keeps his natural (slightly shorter) proportions instead of being stretched.
  const heroHeight = (HERO_HEIGHT * artGeometry(HERO_ART[heroSheet]).h) / artGeometry(HERO_ART.knight_golden).h;
  const reduced = usePrefersReducedMotion();
  const fx = useFxStage();
  const fxScale = useFxScale();
  const playRef = useRef(fx.play);
  playRef.current = fx.play;
  const decorRef = useRef(decor);
  decorRef.current = decor;
  const dec = useRef({ hits: 0, crushes: 0, mon: 0, lastFury: Date.now() });
  const [calls, setCalls] = useState<{ id: number; fx: SkillFxId }[]>([]);
  const callRef = useRef(0);
  const strike = (id: SkillFxId) => {
    playRef.current(id);
    if (!SKILL_FX[id].callout) return;
    const key = callRef.current++;
    setCalls((c) => [...c.slice(-4), { id: key, fx: id }]);
    window.setTimeout(() => setCalls((c) => c.filter((x) => x.id !== key)), T.advanced.textFloatMs);
  };
  // One decorative beat of the hero (a hit) or of the monster (a hit on the hero): the learned strikes at their own cadence.
  const decorate = (kind: Beat) => {
    const d = decorRef.current;
    const s = dec.current;
    if (!d) return;
    if (kind === 'hero') {
      s.hits++;
      const st = d.strikes;
      if (st?.crushEvery && s.hits % st.crushEvery === 0) {
        s.crushes++;
        strike(st.devastating && s.crushes % T.heroSkills.devastatingEvery === 0 ? 'devastating' : 'crush');
      } else if (st?.doubleChance && s.hits % Math.max(2, Math.round(1 / st.doubleChance)) === 0) strike('double');
      else if (d.bleed && s.hits % 2 === 0) strike('bleed');
      if (st?.furyPct && Date.now() - s.lastFury >= T.heroSkills.furyEveryMs) {
        s.lastFury = Date.now();
        strike('fury');
      }
    } else if (kind === 'monster' && d.block) {
      s.mon++;
      if (s.mon % Math.max(2, Math.round(1 / (d.block * 3))) === 0) strike('block');
    }
  };
  const [beat, setBeat] = useState<{ kind: Beat; n: number; active: boolean }>({ kind: 'arrive', n: 0, active: false });
  const stepRef = useRef(0);
  const resetRef = useRef<number | null>(null);
  // With a snapshot the scene follows the HP: each change of the live numbers plays the matching blows (huntSceneEvents.ts). Without one, or with reduced motion, the old decorative loop runs.
  const driven = !!snapshot && !reduced;

  useEffect(() => {
    if (reduced || driven) return;
    const iv = window.setInterval(() => {
      const kind = BEATS[stepRef.current % BEATS.length];
      stepRef.current += 1;
      const n = stepRef.current;
      setBeat({ kind, n, active: true });
      decorate(kind);
      // a kill holds the fallen pose until the next monster arrives
      if (kind !== 'kill') resetRef.current = window.setTimeout(() => setBeat((b) => (b.n === n ? { ...b, active: false } : b)), ACTION_MS);
    }, T.hunting.tickMs);
    return () => {
      window.clearInterval(iv);
      if (resetRef.current) window.clearTimeout(resetRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced, driven]);

  const [shown, setShown] = useState<HuntLiveSnapshot | null>(snapshot);
  const shownRef = useRef<HuntLiveSnapshot | null>(snapshot);
  const lastBlow = useRef<SceneEvent | null>(null);
  const snapKey = snapshot ? `${snapshot.subLevel}|${snapshot.heroHp}|${snapshot.enemyHp}|${snapshot.enemyMax}` : '';
  useEffect(() => {
    if (!driven) {
      shownRef.current = snapshot;
      setShown(snapshot);
      return;
    }
    const step = sceneStep(shownRef.current, snapshot, lastBlow.current);
    shownRef.current = step.shown;
    setShown(step.shown);
    if (!step.event) return;
    lastBlow.current = step.event;
    const timers: number[] = [];
    const play = (kind: Beat, holdMs: number | null) => {
      const n = ++stepRef.current;
      setBeat({ kind, n, active: true });
      decorate(kind);
      if (holdMs !== null) timers.push(window.setTimeout(() => setBeat((b) => (b.n === n ? { ...b, active: false } : b)), holdMs));
    };
    if (step.event === 'new_fight') {
      play('kill', null);
      timers.push(window.setTimeout(() => play('arrive', null), SCENE_FALL_MS));
    } else {
      play(step.event === 'hero_strikes' ? 'hero' : 'monster', SCENE_POSE_MS);
    }
    return () => timers.forEach((id) => window.clearTimeout(id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapKey, driven]);

  const { kind, active, n } = reduced ? { kind: 'arrive' as Beat, active: false, n: 0 } : beat;
  const heroRow = active && (kind === 'hero' || kind === 'kill') ? ROW.attack : active && kind === 'monster' ? ROW.hurt : ROW.idle;
  const monsterRow = kind === 'kill' ? ROW.death : active && kind === 'hero' ? ROW.hurt : active && kind === 'monster' ? ROW.attack : ROW.idle;
  // the bars show the scene's own numbers while it plays the blows one at a time; without a driven scene they are the live ones
  const bars = driven ? shown ?? snapshot : snapshot;
  const level = bars?.subLevel ?? monsterLevel;
  const enemyArt = huntingEnemyArt(zone.enemyId);
  const stageStyle: CSSProperties & Record<'--bg', string> = { '--bg': `url(${huntingZoneBackgroundUrl(zone.id)})` };

  return (
    <div className={`hunt-stage zone-${zone.id}${fx.shaking ? ' shake' : ''}`} style={stageStyle}>
      <div className="hunt-stage-top">
        <div className="battle-hud hero">
          <span className="hp-label">
            <span className="hp-name-text">{heroName}</span>
          </span>
          <div className="battle-hp-row">
            <div className="bar hp">
              <div className="bar-fill hp-fill" style={{ width: `${bars ? hpPct(bars.heroHp, bars.heroMax) : 100}%` }} />
            </div>
            {bars && (
              <span className="hp-num">
                {Math.round(bars.heroHp)} / {bars.heroMax}
              </span>
            )}
          </div>
        </div>
        <div className="battle-hud enemy">
          <span className="hp-label">
            <span className="hp-name-text">{monsterName}</span>
            <span className="hunt-plate-level">{t('hunting.levelShort', { n: level })}</span>
          </span>
          <div className="battle-hp-row">
            <div className="bar hp enemy-hp">
              <div className="bar-fill enemy-hp-fill" style={{ width: `${bars ? hpPct(bars.enemyHp, bars.enemyMax) : 100}%` }} />
            </div>
            {bars && (
              <span className="hp-num">
                {Math.round(bars.enemyHp)} / {bars.enemyMax}
              </span>
            )}
          </div>
        </div>
      </div>

      {children && <div className="hunt-stage-buffs">{children}</div>}

      <div className="hunt-stage-arena">
        <div className={`hunt-side player${active && (kind === 'hero' || kind === 'kill') ? ' lunge' : ''}${active && kind === 'monster' ? ' flinch' : ''}`}>
          <FramedSprite src={heroSheetUrl(heroSheet)} art={HERO_ART[heroSheet]} box="var(--hm)" height={heroHeight} row={heroRow} restart={n * 2 + (active ? 1 : 0)} still={reduced} />
          <FxLayer side="p" items={fx.items} done={fx.done} scale={fxScale} />
          {calls.filter((c) => SKILL_FX[c.fx].side === 'p').map((c) => (
            <span key={c.id} className="float float-skill" style={{ left: `${SKILL_FX[c.fx].left}%`, top: SKILL_FX[c.fx].top, ['--fx-color' as string]: FX_PATH_COLOR[SKILL_FX[c.fx].path] } as CSSProperties}>
              {t(`heroSkills.fx.${c.fx}`)}
            </span>
          ))}
        </div>
        <div
          className={`hunt-side enemy${active && kind === 'monster' ? ' lunge' : ''}${active && kind === 'hero' ? ' flash' : ''}${kind === 'arrive' && !reduced ? ' arriving' : ''}`}
          key={kind === 'arrive' ? `arrive-${n}` : 'fight'}
        >
          <FramedSprite
            src={huntingEnemySpriteUrl(zone.enemyId)}
            art={enemyArt}
            box="var(--hm)"
            height={HERO_HEIGHT * enemyArt.height}
            row={monsterRow}
            restart={n * 2 + (active ? 1 : 0)}
            flip
            still={reduced}
            once={kind === 'kill'}
            fallen={kind === 'kill'}
          />
          <FxLayer side="e" items={fx.items} done={fx.done} scale={fxScale} />
          {calls.filter((c) => SKILL_FX[c.fx].side === 'e').map((c) => (
            <span key={c.id} className="float float-skill" style={{ left: `${SKILL_FX[c.fx].left}%`, top: SKILL_FX[c.fx].top, ['--fx-color' as string]: FX_PATH_COLOR[SKILL_FX[c.fx].path] } as CSSProperties}>
              {t(`heroSkills.fx.${c.fx}`)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
