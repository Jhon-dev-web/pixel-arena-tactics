import { useState } from 'react';
import SpriteSheet from './SpriteSheet';
import T from '../game/tunables';
import { SaveData, computeCP, playerLevel } from '../game/engine';

const pct = (cur: number, max: number) => (max <= 0 ? 0 : Math.max(0, Math.min(100, (cur / max) * 100)));

export default function TopHud({
  save,
  muted,
  spriteUrl,
  onToggleMute,
  onOpenAdmin,
  onRename,
}: {
  save: SaveData;
  muted: boolean;
  spriteUrl: string;
  onToggleMute: () => void;
  onOpenAdmin: () => void;
  onRename: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const level = playerLevel(save.xp);
  const xpInLevel = save.xp % T.progression.xpPerLevel;

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
        <div className="avatar">
          <SpriteSheet src={spriteUrl} size="36px" row={0} />
        </div>
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
            <span className="level">Lv. {level}</span>
            <span className="cp">⚡ {computeCP(save)}</span>
          </div>
          <div className="xp-bar">
            <div className="xp-fill" style={{ width: `${pct(xpInLevel, T.progression.xpPerLevel)}%` }} />
          </div>
        </div>
      </div>
      <div className="resources">
        <span className="res gold">🪙 {save.gold}</span>
        <span className="res shards">◆ {save.shards}</span>
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
