import { t } from '../locales';
import { Button, ModalShell } from './ui';

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
    <ModalShell className="admin-modal" icon={<span aria-hidden>🛠️</span>} title={t('admin.title')} closeLabel={t('ui.close')} onClose={onClose}>
      <div className="ui-cq admin-list">
        <Button block onClick={onGold}>
          {t('admin.gold')}
        </Button>
        <Button block onClick={onShards}>
          {t('admin.shards')}
        </Button>
        <Button block onClick={onUnlock}>
          {t('admin.unlock')}
        </Button>
        <Button block variant={cheatMode ? 'primary' : 'secondary'} aria-pressed={cheatMode} onClick={onToggleCheat}>
          {t('admin.cheatMode')}: {cheatMode ? t('admin.on') : t('admin.off')}
        </Button>
        <Button block variant="danger" onClick={onReset}>
          {t('admin.reset')}
        </Button>
      </div>
    </ModalShell>
  );
}
