import { CSSProperties, ReactNode, useEffect, useRef, useState } from 'react';
import { t } from '../locales';
import T from '../game/tunables';
import { HuntLiveSnapshot } from '../game/huntCombat';
import { HERO_ART, huntingEnemyArt, huntingEnemySpriteUrl, huntingZoneBackgroundUrl, HuntingZoneDef } from '../game/huntingZones';
import { FramedSprite } from './HuntParts';

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
  const [reduced, setReduced] = useState(() => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

/* The place the hero went to hunt: the zone's own map strip as the backdrop (not an arena), the hero on the left and the monster on the right, both standing on
   the ground band at the bottom, name plates + HP on top. Purely decorative: the actual gold/drops are always computed from elapsed time
   (computeHuntingStatus), so the animation never grants anything itself; it just visualizes the same rate. The HP numbers are the replay's own snapshot of
   the fight in progress. With prefers-reduced-motion the two stand still. */
export default function HuntBattleView({
  zone,
  playerSpriteUrl,
  heroName,
  monsterName,
  monsterLevel,
  snapshot,
  children,
}: {
  zone: HuntingZoneDef;
  playerSpriteUrl: string;
  heroName: string;
  monsterName: string;
  monsterLevel: number;
  snapshot: HuntLiveSnapshot | null;
  children?: ReactNode; // tonic badges under the plates
}) {
  const reduced = usePrefersReducedMotion();
  const [beat, setBeat] = useState<{ kind: Beat; n: number; active: boolean }>({ kind: 'arrive', n: 0, active: false });
  const stepRef = useRef(0);
  const resetRef = useRef<number | null>(null);

  useEffect(() => {
    if (reduced) return;
    const iv = window.setInterval(() => {
      const kind = BEATS[stepRef.current % BEATS.length];
      stepRef.current += 1;
      const n = stepRef.current;
      setBeat({ kind, n, active: true });
      // a kill holds the fallen pose until the next monster arrives
      if (kind !== 'kill') resetRef.current = window.setTimeout(() => setBeat((b) => (b.n === n ? { ...b, active: false } : b)), ACTION_MS);
    }, T.hunting.tickMs);
    return () => {
      window.clearInterval(iv);
      if (resetRef.current) window.clearTimeout(resetRef.current);
    };
  }, [reduced]);

  const { kind, active, n } = reduced ? { kind: 'arrive' as Beat, active: false, n: 0 } : beat;
  const heroRow = active && (kind === 'hero' || kind === 'kill') ? ROW.attack : active && kind === 'monster' ? ROW.hurt : ROW.idle;
  const monsterRow = kind === 'kill' ? ROW.death : active && kind === 'hero' ? ROW.hurt : active && kind === 'monster' ? ROW.attack : ROW.idle;
  const level = snapshot?.subLevel ?? monsterLevel;
  const enemyArt = huntingEnemyArt(zone.enemyId);
  const stageStyle: CSSProperties & Record<'--bg', string> = { '--bg': `url(${huntingZoneBackgroundUrl(zone.id)})` };

  return (
    <div className={`hunt-stage zone-${zone.id}`} style={stageStyle}>
      <div className="hunt-stage-top">
        <div className="battle-hud hero">
          <span className="hp-label">
            <span className="hp-name-text">{heroName}</span>
          </span>
          <div className="battle-hp-row">
            <div className="bar hp">
              <div className="bar-fill hp-fill" style={{ width: `${snapshot ? hpPct(snapshot.heroHp, snapshot.heroMax) : 100}%` }} />
            </div>
            {snapshot && (
              <span className="hp-num">
                {Math.round(snapshot.heroHp)} / {snapshot.heroMax}
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
              <div className="bar-fill enemy-hp-fill" style={{ width: `${snapshot ? hpPct(snapshot.enemyHp, snapshot.enemyMax) : 100}%` }} />
            </div>
            {snapshot && (
              <span className="hp-num">
                {Math.round(snapshot.enemyHp)} / {snapshot.enemyMax}
              </span>
            )}
          </div>
        </div>
      </div>

      {children && <div className="hunt-stage-buffs">{children}</div>}

      <div className="hunt-stage-arena">
        <div className={`hunt-side player${active && (kind === 'hero' || kind === 'kill') ? ' lunge' : ''}${active && kind === 'monster' ? ' flinch' : ''}`}>
          <FramedSprite src={playerSpriteUrl} art={HERO_ART} box="var(--hm)" height={HERO_HEIGHT} row={heroRow} restart={n * 2 + (active ? 1 : 0)} still={reduced} />
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
        </div>
      </div>
    </div>
  );
}
