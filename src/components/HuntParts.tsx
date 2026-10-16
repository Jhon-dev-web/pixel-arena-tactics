import type { CSSProperties } from 'react';
import { t } from '../locales';
import { getGear } from '../game/gear';
import { DropRarity, getMaterial, MaterialId } from '../game/materials';
import { artGeometry, HuntingEnemyId, huntingEnemyArt, huntingEnemySpriteUrl, SheetArt } from '../game/huntingZones';
import GearIcon from './GearIcon';
import MaterialIcon from './MaterialIcon';
import SpriteSheet from './SpriteSheet';

// Small pieces shared by the Hunt screens (selection, running view, reward).

// One still frame of a monster sheet (idle row, first frame), cropped to the drawn art: the sheets pad their art very differently, so the
// raw frame would show a speck for the imps. `box` is the square's side in CSS units.
export function MonsterPortrait({ enemyId, box = '56px', fill = 0.9, className }: { enemyId: HuntingEnemyId; box?: string; fill?: number; className?: string }) {
  const g = artGeometry(huntingEnemyArt(enemyId));
  const k = fill / g.size;
  const style: CSSProperties & Record<'--box', string> = {
    '--box': box,
    backgroundImage: `url(${huntingEnemySpriteUrl(enemyId)})`,
    backgroundSize: `${400 * k}% ${400 * k}%`,
    backgroundPosition: `calc(var(--box) * ${0.5 - g.cx * k}) calc(var(--box) * ${0.5 - g.cy * k})`,
  };
  return <span className={`hs-portrait${className ? ` ${className}` : ''}`} style={style} role="img" aria-hidden="true" />;
}

// An animated sheet row standing on the ground line of a square of side `box` (a CSS length, set as --fb): the creature's feet sit on the bottom edge,
// centred horizontally, and its visible height is `height` of the box. Flipping mirrors the whole square around its centre, so the feet stay put.
// `restart` changes the element's key, so a new animation row always starts at its first frame (death plays once and holds its last frame).
export function FramedSprite({
  src,
  art,
  box,
  height,
  row,
  restart,
  flip = false,
  still = false,
  fallen = false,
  once = false,
}: {
  src: string;
  art: SheetArt;
  box: string;
  height: number;
  row: number;
  restart?: number;
  flip?: boolean;
  still?: boolean; // reduced motion: the first frame of the row, no looping
  once?: boolean;
  fallen?: boolean; // the death pose: lowered to lie on the ground (see SheetArt.lie)
}) {
  const g = artGeometry(art);
  const f = height / g.h; // frame side in box units
  const style: CSSProperties & Record<'--fb' | '--ox' | '--oy' | '--dy', string> = {
    '--fb': box,
    '--dy': String(art.lie === undefined ? 0 : ((art.box[3] + 1 - (art.lie + 1)) / art.cell) * f),
    '--ox': String(0.5 - g.cx * f),
    '--oy': String(1 - g.foot * f),
  };
  return (
    <span className={`hunt-frame${flip ? ' flip' : ''}${fallen ? ' fallen' : ''}`} style={style}>
      <SpriteSheet key={restart} src={src} size={`calc(var(--fb) * ${f})`} row={row} frames={still ? 1 : 4} playOnce={once} className="hunt-frame-sheet" />
    </span>
  );
}

// Comum / Refino / Nobre, in the colour the rest of the screen uses for that rarity.
export function RarityChip({ rarity }: { rarity: DropRarity }) {
  return <span className={`ui-tag tier tier-${rarity}`}>{t(`hunting.tier_${rarity}`)}</span>;
}

export function MatIcon({ id }: { id: MaterialId }) {
  const def = getMaterial(id);
  return <span className="mat-icon">{def && <MaterialIcon item={def} />}</span>;
}

// A horizontal progress bar with an optional full / urgent tone.
export function Meter({ pct, tone, label }: { pct: number; tone?: 'full' | 'xp'; label?: string }) {
  const width = Math.max(0, Math.min(100, pct));
  return (
    <div className="ui-meter" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(width)} aria-label={label}>
      <div className={`ui-meter-fill${tone ? ` ${tone}` : ''}`} style={{ width: `${width}%` }} />
    </div>
  );
}

// The unique drops of a zone: icon, name and a "raro" chip (never a percentage).
export function ZoneUniques({ itemIds }: { itemIds: string[] }) {
  return (
    <div className="hs-uniques">
      {itemIds.map((id) => {
        const item = getGear(id);
        if (!item) return null;
        return (
          <span className="hs-unique" key={id}>
            <span className="hs-unique-icon">
              <GearIcon item={item} />
            </span>
            <span className="hs-unique-name">{t(`gear.${item.nameKey}`)}</span>
            <span className="ui-tag gold">{t('hunting.uniqueRare')}</span>
          </span>
        );
      })}
    </div>
  );
}
