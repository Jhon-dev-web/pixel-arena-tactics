import SpriteSheet from './SpriteSheet';
import { t } from '../locales';
import Assets from '../assets.json';
import { SaveData, computeCP, formatNumber, playerLevel } from '../game/engine';
import { getTitleDef } from '../game/titles';

// Desktop-only top bar (>=1024px). Same data as TopHud (mobile's topbar), just laid out wider —
// no new resources, no new fields, nothing invented.
export default function DesktopTopbar({
  save,
  spriteUrl,
  onOpenProfile,
  onOpenSettings,
}: {
  save: SaveData;
  spriteUrl: string;
  onOpenProfile: () => void;
  onOpenSettings: () => void;
}) {
  const level = playerLevel(save.xp);
  const titleDef = save.activeTitle ? getTitleDef(save.activeTitle) : undefined;
  const titleLabel = titleDef ? t(`titles.${titleDef.nameKey}`) : null;

  return (
    <header className="desktop-topbar">
      <button className="desktop-topbar-profile" onClick={onOpenProfile} data-ui>
        <SpriteSheet src={spriteUrl} size="40px" row={0} />
        <div className="desktop-topbar-profile-info">
          <div className="desktop-topbar-name-row">
            <span className="desktop-topbar-name">{save.heroName}</span>
            {titleLabel && <span className="desktop-topbar-title">• {titleLabel}</span>}
          </div>
          <div className="desktop-topbar-stats-row">
            <span>{t('camp.level', { n: level })}</span>
            <span className="desktop-topbar-cp">⚔️ CP {formatNumber(computeCP(save))}</span>
          </div>
        </div>
      </button>

      <div className="desktop-topbar-resources">
        <span className="desktop-topbar-res gold">
          <img className="inline-icon" src={Assets.icons.gold.url} alt="" />
          {formatNumber(save.gold)}
        </span>
        <span className="desktop-topbar-res shards">
          <img className="inline-icon" src="/assets/icons/shards.png" alt="" />
          {formatNumber(save.shards)}
        </span>
        <button className="desktop-topbar-settings" onClick={onOpenSettings} aria-label={t('settings.title')} data-ui>
          ⚙️
        </button>
      </div>
    </header>
  );
}
