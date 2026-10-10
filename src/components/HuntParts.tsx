import type { CSSProperties } from 'react';
import { t } from '../locales';
import { getGear } from '../game/gear';
import { DropRarity, getMaterial, MaterialId } from '../game/materials';
import { HuntingEnemyId, huntingEnemyArt, huntingEnemySpriteUrl } from '../game/huntingZones';
import GearIcon from './GearIcon';
import MaterialIcon from './MaterialIcon';
import SpriteSheet from './SpriteSheet';

// Small pieces shared by the Hunt screens (selection, running view, reward).

// One still frame of a monster sheet (idle row, first frame), cropped to the drawn art: the sheets pad their art very differently, so the
// raw frame would show a speck for the imps. `box` is the square's side in CSS units.
export function MonsterPortrait({ enemyId, box = '56px', fill = 0.9, className }: { enemyId: HuntingEnemyId; box?: string; fill?: number; className?: string }) {
  const art = huntingEnemyArt(enemyId);
  const k = fill / art.size;
  const style: CSSProperties & Record<'--box', string> = {
    '--box': box,
    backgroundImage: `url(${huntingEnemySpriteUrl(enemyId)})`,
    backgroundSize: `${400 * k}% ${400 * k}%`,
    backgroundPosition: `calc(var(--box) * ${0.5 - art.cx * k}) calc(var(--box) * ${0.5 - art.cy * k})`,
  };
  return <span className={`hunt-portrait${className ? ` ${className}` : ''}`} style={style} role="img" aria-hidden="true" />;
}

// An animated sheet row cropped and centred the same way, inside a square of side `box` (a CSS length, set as --fb). Flipping mirrors the whole
// square around its centre, so the art stays centred.
export function FramedSprite({
  src,
  art,
  box,
  row,
  flip = false,
}: {
  src: string;
  art: { cx: number; cy: number; size: number; fill: number };
  box: string;
  row: number;
  flip?: boolean;
}) {
  const k = art.fill / art.size;
  const style: CSSProperties & Record<'--fb' | '--ox' | '--oy', string> = {
    '--fb': box,
    '--ox': String(0.5 - art.cx * k),
    '--oy': String(0.5 - art.cy * k),
  };
  return (
    <span className={`hunt-frame${flip ? ' flip' : ''}`} style={style}>
      <SpriteSheet src={src} size={`calc(var(--fb) * ${k})`} row={row} className="hunt-frame-sheet" />
    </span>
  );
}

// Comum / Refino / Nobre, in the colour the rest of the screen uses for that rarity.
export function RarityChip({ rarity }: { rarity: DropRarity }) {
  return <span className={`hunt-rarity tier-${rarity}`}>{t(`hunting.tier_${rarity}`)}</span>;
}

export function MatIcon({ id }: { id: MaterialId }) {
  const def = getMaterial(id);
  return <span className="mat-icon">{def && <MaterialIcon item={def} />}</span>;
}

// A horizontal progress bar with an optional full / urgent tone.
export function Meter({ pct, tone, label }: { pct: number; tone?: 'full' | 'xp'; label?: string }) {
  const width = Math.max(0, Math.min(100, pct));
  return (
    <div className="hunt-meter" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(width)} aria-label={label}>
      <div className={`hunt-meter-fill${tone ? ` ${tone}` : ''}`} style={{ width: `${width}%` }} />
    </div>
  );
}

// The unique drops of a zone: icon, name and a "raro" chip (never a percentage).
export function ZoneUniques({ itemIds }: { itemIds: string[] }) {
  return (
    <div className="hunt-uniques">
      {itemIds.map((id) => {
        const item = getGear(id);
        if (!item) return null;
        return (
          <span className="hunt-unique" key={id}>
            <span className="hunt-unique-icon">
              <GearIcon item={item} />
            </span>
            <span className="hunt-unique-name">{t(`gear.${item.nameKey}`)}</span>
            <span className="hunt-rarity unique">{t('hunting.uniqueRare')}</span>
          </span>
        );
      })}
    </div>
  );
}
