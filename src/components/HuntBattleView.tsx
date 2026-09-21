import { useEffect, useRef, useState } from 'react';
import T from '../game/tunables';
import { huntingEnemySpriteUrl, HuntingEnemyId } from '../game/huntingZones';
import SpriteSheet from './SpriteSheet';

const ANIM_ROW: Record<'idle' | 'attack' | 'hurt', number> = { idle: 0, attack: 1, hurt: 2 };

/* Purely decorative — shown only while the player is watching the Hunt tab.
   The actual gold/drops are always computed from elapsed time (computeHuntingStatus),
   so this loop never grants anything itself; it just visualizes the same rate. */
export default function HuntBattleView({ enemyId, playerSpriteUrl }: { enemyId: HuntingEnemyId; playerSpriteUrl: string }) {
  const [playerAnim, setPlayerAnim] = useState<'idle' | 'attack' | 'hurt'>('idle');
  const [enemyAnim, setEnemyAnim] = useState<'idle' | 'attack' | 'hurt'>('idle');
  const [playerLunge, setPlayerLunge] = useState(false);
  const [enemyFlash, setEnemyFlash] = useState(false);
  const [enemySpriteBroken, setEnemySpriteBroken] = useState(false);

  const resetRef = useRef<number | null>(null);
  const enemySpriteSrc = huntingEnemySpriteUrl(enemyId);

  useEffect(() => {
    setEnemySpriteBroken(false);
  }, [enemySpriteSrc]);

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

  return (
    <div className="hunt-battle-view">
      <div className={`hunt-side player${playerLunge ? ' lunge' : ''}`}>
        <SpriteSheet src={playerSpriteUrl} size={72} row={ANIM_ROW[playerAnim]} />
      </div>
      <span className="hunt-vs">VS</span>
      <div className={`hunt-side enemy${enemyFlash ? ' flash' : ''}`}>
        {enemySpriteBroken ? (
          <span className="hunt-sprite-fallback" aria-hidden="true">
            👹
          </span>
        ) : (
          <>
            {/* The 4x4 monster sheet has generous transparent frame padding; scale the frame, not the sheet. */}
            <SpriteSheet src={enemySpriteSrc} size="clamp(128px, 32vw, 220px)" row={ANIM_ROW[enemyAnim]} flip />
            <img src={enemySpriteSrc} alt="" style={{ display: 'none' }} onError={() => setEnemySpriteBroken(true)} />
          </>
        )}
      </div>
    </div>
  );
}
