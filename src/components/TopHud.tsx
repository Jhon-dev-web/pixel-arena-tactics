import { useState } from 'react';
import SpriteSheet from './SpriteSheet';
import { t } from '../locales';
import {
  SaveData,
  computeCP,
  formatNumber,
  playerLevel,
  xpForNextLevel,
  xpToReachLevel,
} from '../game/engine';

const pct = (cur: number, max: number) => (max <= 0 ? 0 : Math.max(0, Math.min(100, (cur / max) * 100)));

export default function TopHud({
  save,
  muted,
  spriteUrl,
  onToggleMute,
  onOpenAdmin,
  onOpenProfile,
  onOpenBag,
  onRename,
}: {
  save: SaveData;
  muted: boolean;
  spriteUrl: string;
  onToggleMute: () => void;
  onOpenAdmin: () => void;
  onOpenProfile: () => void;
  onOpenBag: () => void;
  onRename: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const level = playerLevel(save.xp);
  const isMax = level >= 100;
  const xpInLevel = save.xp - xpToReachLevel(level);
  const xpPct = isMax ? 100 : pct(xpInLevel, xpForNextLevel(level));

  const startEdit = () => {
    setDraft(save.heroName);
    setEditing(true);
  };
  const commit = () => {
    onRename((draft.trim() || save.heroName).slice(0, 16));
    setEditing(false);
  };

  return (
    <header className="topbar">
      <div className="profile">
        <button className="avatar" onClick={onOpenProfile} aria-label="Profile" data-ui>
          <SpriteSheet src={spriteUrl} size="28px" row={0} />
        </button>
        <div className="profile-info">
          <div className="profile-top">
            {editing ? (
              <input
                className="name-input"
                autoFocus
                value={draft}
                maxLength={16}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commit();
                }}
              />
            ) : (
              <button className="name-btn" onClick={startEdit} data-ui>
                {save.heroName} <span className="pencil">✏️</span>
              </button>
            )}
            <button className="level-btn" onClick={onOpenProfile} data-ui>
              {isMax ? 'Lv. MAX' : `Lv. ${level}`}
            </button>
          </div>
          <div className="xp-bar">
            <div className="xp-fill" style={{ width: `${xpPct}%` }} />
          </div>
        </div>
      </div>

      <div className="cp-center">{t('ui.cp', { n: formatNumber(computeCP(save)) })}</div>

      <div className="resources">
        <span className="res gold">🪙 {formatNumber(save.gold)}</span>
        <span className="res shards">🔷 {formatNumber(save.shards)}</span>
        <button className="icon-btn" onClick={onOpenBag} data-ui>
          🎒
        </button>
        <button className="icon-btn" onClick={onOpenAdmin} data-ui>
          ⚙️
        </button>
        <button className="icon-btn" onClick={onToggleMute} data-ui>
          {muted ? '🔇' : '🔊'}
        </button>
      </div>
    </header>
  );
}
