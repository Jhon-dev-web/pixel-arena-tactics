import SpriteSheet from './SpriteSheet';
import { t } from '../locales';
import Assets from '../assets.json';
import { SaveData, formatNumber, playerLevel } from '../game/engine';
import { getTitleDef } from '../game/titles';

// Top bar shared by desktop (fixed sidebar alongside it) and mobile (hamburger + drawer instead) —
// same data as the old mobile-only TopHud, just laid out wider on desktop. CP is deliberately left
// out here: it already has a prominent spot on the Hero/Personagem card, so showing it twice at once
// is pure redundancy (see the Home polish pass).
export default function DesktopTopbar({
  save,
  spriteUrl,
  onOpenProfile,
  onOpenSettings,
  onOpenMenu,
  showMenuButton,
  muted,
  onToggleMute,
}: {
  save: SaveData;
  spriteUrl: string;
  onOpenProfile: () => void;
  onOpenSettings: () => void;
  onOpenMenu: () => void;
  showMenuButton: boolean;
  muted: boolean;
  onToggleMute: () => void;
}) {
  const level = playerLevel(save.xp);
  const titleDef = save.activeTitle ? getTitleDef(save.activeTitle) : undefined;
  const titleLabel = titleDef ? t(`titles.${titleDef.nameKey}`) : null;

  return (
    <header className="desktop-topbar">
      {showMenuButton && (
        <button className="desktop-topbar-menu" onClick={onOpenMenu} aria-label={t('nav.openMenu')} data-ui>
          ☰
        </button>
      )}
      <button className="desktop-topbar-profile" onClick={onOpenProfile} data-tutorial-target="hero" data-ui>
        <SpriteSheet src={spriteUrl} size="40px" row={0} />
        <div className="desktop-topbar-profile-info">
          <div className="desktop-topbar-name-row">
            <span className="desktop-topbar-name">{save.heroName}</span>
            {titleLabel && <span className="desktop-topbar-title">• {titleLabel}</span>}
          </div>
          <div className="desktop-topbar-stats-row">
            <span>{t('camp.level', { n: level })}</span>
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
        <button className="desktop-topbar-settings" onClick={onToggleMute} aria-label={t('tooltips.mute')} data-ui>
          {muted ? '🔇' : '🔊'}
        </button>
        <button className="desktop-topbar-settings" onClick={onOpenSettings} aria-label={t('settings.title')} data-ui>
          ⚙️
        </button>
      </div>
    </header>
  );
}
