import { t } from '../locales';

export default function AdminModal({
  cheatMode,
  onGold,
  onShards,
  onUnlock,
  onToggleCheat,
  onReset,
  onClose,
}: {
  cheatMode: boolean;
  onGold: () => void;
  onShards: () => void;
  onUnlock: () => void;
  onToggleCheat: () => void;
  onReset: () => void;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop">
      <div className="modal admin-modal">
        <h2 className="modal-title">{t('admin.title')}</h2>
        <button className="admin-btn" onClick={onGold} data-ui>
          {t('admin.gold')}
        </button>
        <button className="admin-btn" onClick={onShards} data-ui>
          {t('admin.shards')}
        </button>
        <button className="admin-btn" onClick={onUnlock} data-ui>
          {t('admin.unlock')}
        </button>
        <button className={`admin-btn cheat${cheatMode ? ' active' : ''}`} onClick={onToggleCheat} data-ui>
          {t('admin.cheatMode')}: {cheatMode ? t('admin.on') : t('admin.off')}
        </button>
        <button className="admin-btn danger" onClick={onReset} data-ui>
          {t('admin.reset')}
        </button>
        <button className="modal-x" onClick={onClose} aria-label="Close" data-ui>
          ✕
        </button>
      </div>
    </div>
  );
}
