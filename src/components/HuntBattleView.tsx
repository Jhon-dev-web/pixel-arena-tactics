import { ReactNode, useEffect, useRef, useState } from 'react';
import { t } from '../locales';
import T from '../game/tunables';
import { HuntLiveSnapshot } from '../game/huntCombat';
import { huntingEnemyArt, huntingEnemySpriteUrl, HuntingZoneDef } from '../game/huntingZones';
import { FramedSprite } from './HuntParts';

const ANIM_ROW: Record<'idle' | 'attack' | 'hurt', number> = { idle: 0, attack: 1, hurt: 2 };

// Where the knight sits inside a frame of its sheet (see huntingEnemyArt): centre and larger side as fractions of the frame.
const HERO_ART = { cx: 0.54, cy: 0.514, size: 0.93, fill: 0.86 };

// Same helper BattleModal.tsx uses for its HP bars (not exported there, so mirrored here).
const hpPct = (cur: number, max: number): number => (max <= 0 ? 0 : Math.max(0, Math.min(100, (cur / max) * 100)));

/* The arena of a running hunt, laid out like the Dungeon battle (name plates + HP on top, the two fighters below, on a background that is tinted
   per zone). Purely decorative: the actual gold/drops are always computed from elapsed time (computeHuntingStatus), so the attack pulse never grants
   anything itself; it just visualizes the same rate. The HP numbers are the replay's own snapshot of the fight in progress. */
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
  children?: ReactNode; // overlay along the bottom edge (active tonics)
}) {
  const [playerAnim, setPlayerAnim] = useState<'idle' | 'attack' | 'hurt'>('idle');
  const [enemyAnim, setEnemyAnim] = useState<'idle' | 'attack' | 'hurt'>('idle');
  const [playerLunge, setPlayerLunge] = useState(false);
  const [enemyFlash, setEnemyFlash] = useState(false);

  const resetRef = useRef<number | null>(null);

  useEffect(() => {
    const iv = window.setInterval(() => {
      setPlayerAnim('attack');
      setPlayerLunge(true);
      setEnemyAnim('hurt');
      setEnemyFlash(true);
      resetRef.current = window.setTimeout(() => {
        setPlayerLunge(false);
        setPlayerAnim('idle');
        setEnemyFlash(false);
        setEnemyAnim('idle');
      }, 300);
    }, T.hunting.tickMs);
    return () => {
      window.clearInterval(iv);
      if (resetRef.current) window.clearTimeout(resetRef.current);
    };
  }, []);

  const level = snapshot?.subLevel ?? monsterLevel;

  return (
    <div className={`hunt-stage zone-${zone.id}`}>
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

      <div className="hunt-stage-arena">
        <div className={`hunt-side player${playerLunge ? ' lunge' : ''}`}>
          <FramedSprite src={playerSpriteUrl} art={HERO_ART} box="var(--hm)" row={ANIM_ROW[playerAnim]} />
        </div>
        <span className="hunt-vs">VS</span>
        <div className={`hunt-side enemy${enemyFlash ? ' flash' : ''}`}>
          <FramedSprite src={huntingEnemySpriteUrl(zone.enemyId)} art={huntingEnemyArt(zone.enemyId)} box="var(--hm)" row={ANIM_ROW[enemyAnim]} flip />
        </div>
      </div>

      {children && <div className="hunt-stage-buffs">{children}</div>}
    </div>
  );
}
