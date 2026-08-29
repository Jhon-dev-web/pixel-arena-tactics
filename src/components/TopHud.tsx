import { useState } from 'react';
import SpriteSheet from './SpriteSheet';
import { t } from '../locales';
import { SaveData, computeCP, formatNumber, playerLevel } from '../game/engine';

export default function TopHud({
  save,
  muted,
  spriteUrl,
  onToggleMute,
  onOpenAdmin,
  onOpenProfile,
  onOpenBag,
  onOpenQuests,
  questsBadge,
  onRename,
}: {
  save: SaveData;
  muted: boolean;
  spriteUrl: string;
  onToggleMute: () => void;
  onOpenAdmin: () => void;
  onOpenProfile: () => void;
  onOpenBag: () => void;
  onOpenQuests: () => void;
  questsBadge: number;
  onRename: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const level = playerLevel(save.xp);

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
          <div className="profile-stats">
            <span className="level">{t('camp.level', { n: level })}</span>
            <span className="cp-inline">{t('ui.cp', { n: formatNumber(computeCP(save)) })}</span>
          </div>
        </div>
      </div>

      <div className="resources">
        <span className="res gold">🪙 {formatNumber(save.gold)}</span>
        <span className="res shards">🔷 {formatNumber(save.shards)}</span>
        <button className="icon-btn" onClick={onOpenBag} data-ui>
          🎒
        </button>
        <button className="icon-btn quests-btn" onClick={onOpenQuests} data-ui>
          📜
          {questsBadge > 0 && <span className="quests-badge">{questsBadge}</span>}
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
