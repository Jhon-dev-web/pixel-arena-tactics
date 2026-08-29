import SpriteSheet from './SpriteSheet';
import { t } from '../locales';
import { SaveData, computeCP, formatNumber, playerLevel } from '../game/engine';

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

  return (
    <header className="topbar">
      <div className="profile">
        <button className="avatar" onClick={onOpenProfile} aria-label="Profile" data-ui>
          <SpriteSheet src={spriteUrl} size="28px" row={0} />
        </button>
        <div className="profile-stats">
          <span className="level">{t('camp.level', { n: level })}</span>
          <span className="cp-inline">{t('ui.cp', { n: formatNumber(computeCP(save)) })}</span>
        </div>
      </div>

      <div className="resources">
        <span className="res gold">🪙 {formatNumber(save.gold)}</span>
        <span className="res shards">🔷 {formatNumber(save.shards)}</span>
      </div>
    </header>
  );
}
