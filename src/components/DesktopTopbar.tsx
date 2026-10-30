import { ReactNode, useEffect, useRef, useState } from 'react';
import PixelIcon from './PixelIcon';
import SpriteSheet from './SpriteSheet';
import { t } from '../locales';
import { levelLabel } from './levelLabel';
import Assets from '../assets.json';
import { SaveData, computeCP, formatNumber } from '../game/engine';
import { getTitleDef } from '../game/titles';
import { useDisplayName } from '../game/usernameContext';
import { portraitFrameClass } from '../game/seasonItems';
import ActivityChip from './ActivityChip';

// Top bar shared by desktop (fixed sidebar alongside it) and mobile (hamburger + drawer instead) —
// same data as the old mobile top bar (since deleted), just laid out wider on desktop. CP is deliberately left
// out here: it already has a prominent spot on the Hero/Personagem card, so showing it twice at once
// is pure redundancy (see the Home polish pass).
// One row of the gear's menu (Configurações, Códice, Calendário, Convites).
export interface GearItem {
  key: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
}

export default function DesktopTopbar({
  save,
  spriteUrl,
  onOpenProfile,
  onOpenQuests,
  questsBadge = false,
  gearItems,
  onOpenMenu,
  showMenuButton,
  muted,
  onToggleMute,
  syncStatus,
  menuBadge = false,
}: {
  save: SaveData;
  spriteUrl: string;
  onOpenProfile: () => void;
  // Missões: the one screen opened by a notice, so it lives on the bar with its dot instead of in the menu.
  onOpenQuests: () => void;
  questsBadge?: boolean;
  // The gear opens this small menu: settings first, then the screens that left the side menu.
  gearItems: GearItem[];
  onOpenMenu: () => void;
  showMenuButton: boolean;
  muted: boolean;
  onToggleMute: () => void;
  // Phase 1 backend migration: server-save sync state, purely informational (§20/§23) — never gates
  // gameplay, just tells the player whether their last change made it to the server.
  syncStatus?: 'idle' | 'dirty' | 'saving' | 'saved' | 'error' | 'offline';
  // Phone: some entry of the closed menu has something waiting (a claim, a point to spend); a dot on the button says so.
  menuBadge?: boolean;
}) {
  const [gearOpen, setGearOpen] = useState(false);
  const gearRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!gearOpen) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (gearRef.current && !gearRef.current.contains(e.target as Node)) setGearOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setGearOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [gearOpen]);
  const displayName = useDisplayName(save.heroName);
  const titleDef = save.activeTitle ? getTitleDef(save.activeTitle) : undefined;
  const titleLabel = titleDef ? t(`titles.${titleDef.nameKey}`) : null;
  const syncLabel =
    syncStatus === 'saving'
      ? t('sync.saving')
      : syncStatus === 'error'
        ? t('sync.error')
        : syncStatus === 'offline'
          ? t('sync.offline')
          : syncStatus === 'saved'
            ? t('sync.saved')
            : null;

  return (
    <header className="desktop-topbar">
      {showMenuButton && (
        <button className="desktop-topbar-menu" onClick={onOpenMenu} aria-label={t('nav.openMenu')} data-ui>
          ☰
          {menuBadge && <span className="desktop-topbar-menu-dot" aria-hidden="true" />}
        </button>
      )}
      <button className="desktop-topbar-profile" onClick={onOpenProfile} data-tutorial-target="hero" data-ui>
        <span className={`desktop-topbar-avatar${portraitFrameClass(save)}`}>
          <SpriteSheet src={spriteUrl} size="40px" row={0} />
        </span>
        <div className="desktop-topbar-profile-info">
          <div className="desktop-topbar-name-row">
            <span className="desktop-topbar-name">{displayName}</span>
            {titleLabel && <span className="desktop-topbar-title">• {titleLabel}</span>}
          </div>
          <div className="desktop-topbar-stats-row">
            {levelLabel(save, true)
              .split(' · ')
              .map((part) => (
                <span key={part}>{part}</span>
              ))}
            <span className="desktop-topbar-cp">{t('camp.cp', { n: formatNumber(computeCP(save)) })}</span>
          </div>
        </div>
      </button>

      <ActivityChip save={save} />

      <div className="desktop-topbar-resources">
        {syncLabel && <span className={`sync-status ${syncStatus}`}>{syncLabel}</span>}
        <span className="desktop-topbar-res gold" title={t('ui.gold', { n: formatNumber(save.gold) })}>
          <img className="inline-icon" src={Assets.icons.gold.url} alt="" />
          {formatNumber(save.gold)}
        </span>
        <span className="desktop-topbar-res shards" title={t('ui.shards', { n: formatNumber(save.shards) })}>
          <img className="inline-icon" src="/assets/icons/shards.png" alt="" />
          {formatNumber(save.shards)}
        </span>
        <button className="desktop-topbar-settings" onClick={onToggleMute} aria-label={t('tooltips.mute')} data-ui>
          <span className={`topbar-sound${muted ? ' off' : ''}`} aria-hidden>
            ♪
          </span>
        </button>
        <button className="desktop-topbar-settings desktop-topbar-quests" onClick={onOpenQuests} aria-label={t('nav.quests')} data-ui>
          <PixelIcon name="quests" />
          {questsBadge && <span className="desktop-topbar-menu-dot" role="img" aria-label={t('nav.attention')} />}
        </button>
        <div className="desktop-topbar-gear" ref={gearRef}>
          <button className="desktop-topbar-settings" onClick={() => setGearOpen((o) => !o)} aria-label={t('settings.title')} aria-haspopup="menu" aria-expanded={gearOpen} data-ui>
            <PixelIcon name="settings" />
          </button>
          {gearOpen && (
            <div className="desktop-topbar-gear-menu" role="menu">
              {gearItems.map((item) => (
                <button
                  key={item.key}
                  role="menuitem"
                  className="desktop-topbar-gear-item"
                  onClick={() => {
                    setGearOpen(false);
                    item.onClick();
                  }}
                  data-ui
                >
                  <span className="desktop-nav-icon">{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
