import SpriteSheet from './SpriteSheet';
import { t } from '../locales';
import Assets from '../assets.json';
import { SaveData, computeCP, formatNumber, playerLevel } from '../game/engine';
import { getTitleDef } from '../game/titles';

export default function TopHud({
  save,
  spriteUrl,
  onOpenProfile,
}: {
  save: SaveData;
  spriteUrl: string;
  onOpenProfile: () => void;
}) {
  const level = playerLevel(save.xp);
  const titleDef = save.activeTitle ? getTitleDef(save.activeTitle) : undefined;
  const titleLabel = titleDef ? t(`titles.${titleDef.nameKey}`) : null;

  return (
    <header className="topbar">
      <div className="profile">
        <button className="avatar" onClick={onOpenProfile} aria-label="Profile" data-tutorial-target="hero" data-ui>
          <SpriteSheet src={spriteUrl} size="28px" row={0} />
        </button>
        <div className="profile-info">
          <div className="profile-top">
            <span className="hero-name-line">{save.heroName}</span>
            {titleLabel && <span className="hero-title-tag">• {titleLabel}</span>}
          </div>
          <div className="profile-stats">
            <span className="level">{t('camp.level', { n: level })}</span>
            <span className="cp-inline">
              ⚔️ CP <span className="num-abbr">{formatNumber(computeCP(save))}</span>
            </span>
          </div>
        </div>
      </div>

      <div className="resources">
        <span className="res gold">
          <img className="inline-icon" src={Assets.icons.gold.url} alt="" />
          <span className="num-abbr">{formatNumber(save.gold)}</span>
        </span>
        <span className="res shards">
          <img className="inline-icon" src="/assets/icons/shards.png" alt="" />
          <span className="num-abbr">{formatNumber(save.shards)}</span>
        </span>
      </div>
    </header>
  );
}
