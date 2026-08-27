import { useEffect, useRef, useState } from 'react';
import T from '../game/tunables';
import Text from '../locales/en.json';
import Assets from '../assets.json';
import { SaveData, enemyHpForRound, playerMaxHp } from '../game/engine';
import { getEnemyDef } from '../game/enemies';
import { effectiveCrit, effectiveDamage, effectiveResistance, getEquipped, refineLevel } from '../game/gear';
import { BattleRewards, FloorDef } from '../game/dungeon';
import { MaterialId, materialIconUrl } from '../game/materials';
import { enemySpriteUrl, spriteForArmorTier } from '../game/sprites';
import SpriteSheet from './SpriteSheet';

const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const enemyText = (k: string): string => (Text.enemies as Record<string, string>)[k];
const materialName = (mid: string): string => (Text.materials as Record<string, string>)[`mat_${mid}`];
const materialIcon = (mid: string): string => materialIconUrl(mid as MaterialId);

interface FloatItem {
  id: number;
  side: 'p' | 'e';
  text: string;
  kind: 'damage' | 'crit';
}

const ANIM_ROW: Record<string, number> = { idle: 0, attack: 1, hurt: 2 };

export default function BattleModal({
  save,
  floor,
  onCollect,
  onReturn,
}: {
  save: SaveData;
  floor: FloorDef;
  onCollect: (rewards: BattleRewards) => void;
  onReturn: () => void;
}) {
  const def = getEnemyDef(floor.enemyKind);
  const build = getEquipped(save.equipped);
  const weapon = build.weapon;
  const armor = build.armor;
  const wLvl = refineLevel(save.upgrades, save.equipped.weapon);
  const aLvl = refineLevel(save.upgrades, save.equipped.armor);
  const armorTier = armor?.tier ?? 0;
  const critMult = T.combat.critMult + (build.relic?.critMultBonus ?? 0);

  const playerMax = playerMaxHp(save);
  const enemyMax = enemyHpForRound(def, floor.floor);

  const [playerHp, setPlayerHp] = useState(playerMax);
  const [enemyHp, setEnemyHp] = useState(enemyMax);
  const [phase, setPhase] = useState<'battle' | 'victory' | 'defeat'>('battle');
  const [floats, setFloats] = useState<FloatItem[]>([]);
  const [playerAnim, setPlayerAnim] = useState<'idle' | 'attack' | 'hurt'>('idle');
  const [enemyAnim, setEnemyAnim] = useState<'idle' | 'attack' | 'hurt'>('idle');
  const [rewards, setRewards] = useState<BattleRewards | null>(null);

  const hp = useRef({ p: playerMax, e: enemyMax });
  const idRef = useRef(0);

  const addFloat = (side: 'p' | 'e', text: string, kind: 'damage' | 'crit') => {
    const id = idRef.current++;
    setFloats((f) => [...f, { id, side, text, kind }]);
    window.setTimeout(() => setFloats((f) => f.filter((x) => x.id !== id)), 900);
  };

  useEffect(() => {
    let timer: number;
    const runTurn = () => {
      const baseDmg = (T.combat.attackMin + T.combat.attackMax) / 2;
      const total = baseDmg + effectiveDamage(weapon, wLvl) + save.str * T.advanced.strDmgPerPoint;
      const crit = Math.random() < effectiveCrit(weapon, wLvl);
      const dmg = Math.max(1, Math.round(total * (crit ? critMult : 1)));
      hp.current.e = Math.max(0, hp.current.e - dmg);
      setEnemyHp(hp.current.e);
      setPlayerAnim('attack');
      addFloat('e', crit ? `CRIT! -${dmg}` : `-${dmg}`, crit ? 'crit' : 'damage');
      window.setTimeout(() => setPlayerAnim('idle'), 320);

      if (hp.current.e <= 0) {
        setRewards({ gold: randInt(floor.goldMin, floor.goldMax), drops: floor.drops, shards: floor.shards ?? 0 });
        setPhase('victory');
        return;
      }

      const eDmg = randInt(
        Math.round(T.combat.enemyAtkMin * def.atkMult),
        Math.round(T.combat.enemyAtkMax * def.atkMult),
      );
      const reduction = effectiveResistance(armor, aLvl) + save.res * T.advanced.resResistPerPoint;
      const eFinal = Math.max(1, Math.round(eDmg * (1 - reduction)));
      hp.current.p = Math.max(0, hp.current.p - eFinal);
      setPlayerHp(hp.current.p);
      setEnemyAnim('attack');
      addFloat('p', `-${eFinal}`, 'damage');
      window.setTimeout(() => setEnemyAnim('idle'), 320);

      if (hp.current.p <= 0) {
        setPhase('defeat');
        return;
      }

      timer = window.setTimeout(runTurn, 1200);
    };
    timer = window.setTimeout(runTurn, 800);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pct = (cur: number, max: number) => (max <= 0 ? 0 : Math.max(0, Math.min(100, (cur / max) * 100)));

  return (
    <div className="modal-backdrop battle-backdrop">
      <div className="battle">
        <div className="battle-top">
          <div className="battle-hp">
            <span className="hp-label">Hero</span>
            <div className="bar hp">
              <div className="bar-fill hp-fill" style={{ width: `${pct(playerHp, playerMax)}%` }} />
            </div>
            <span className="hp-num">
              {playerHp} / {playerMax}
            </span>
          </div>
          <div className="battle-hp">
            <span className="hp-label">{enemyText(def.nameKey)}</span>
            <div className="bar hp enemy-hp">
              <div className="bar-fill enemy-hp-fill" style={{ width: `${pct(enemyHp, enemyMax)}%` }} />
            </div>
            <span className="hp-num">
              {enemyHp} / {enemyMax}
            </span>
          </div>
        </div>

        <div className="battle-arena">
          <div className="battle-side player">
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
          <div className="battle-side enemy">
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
        </div>

        {phase !== 'battle' && (
          <div className="battle-result">
            {phase === 'victory' ? (
              <>
                <h2 className="result-title win">{Text.dungeon.victory}</h2>
                <div className="result-rewards">
                  <span className="floor-drop">
                    <span className="mat-icon">
                      <img src={Assets.icons.gold.url} alt="" />
                    </span>
                    <span>+{rewards?.gold} Gold</span>
                  </span>
                  {Object.entries(rewards?.drops ?? {}).map(([mid, qty]) => (
                    <span className="floor-drop" key={mid}>
                      <span className="mat-icon">
                        <img src={materialIcon(mid)} alt="" />
                      </span>
                      <span>
                        +{qty}× {materialName(mid)}
                      </span>
                    </span>
                  ))}
                  {(rewards?.shards ?? 0) > 0 && (
                    <span className="floor-drop">
                      <span className="mat-icon shard">🔷</span>
                      <span>+{rewards?.shards} Shards</span>
                    </span>
                  )}
                </div>
                <button className="result-btn" onClick={() => onCollect(rewards!)} data-ui>
                  {Text.dungeon.collect}
                </button>
              </>
            ) : (
              <>
                <h2 className="result-title lose">{Text.dungeon.defeated}</h2>
                <button className="result-btn" onClick={onReturn} data-ui>
                  {Text.dungeon.return}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
