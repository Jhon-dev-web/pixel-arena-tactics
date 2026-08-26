import Text from '../locales/en.json';

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
        <h2 className="modal-title">{Text.admin.title}</h2>
        <button className="admin-btn" onClick={onGold} data-ui>
          {Text.admin.gold}
        </button>
        <button className="admin-btn" onClick={onShards} data-ui>
          {Text.admin.shards}
        </button>
        <button className="admin-btn" onClick={onUnlock} data-ui>
          {Text.admin.unlock}
        </button>
        <button className={`admin-btn cheat${cheatMode ? ' active' : ''}`} onClick={onToggleCheat} data-ui>
          {Text.admin.cheatMode}: {cheatMode ? Text.admin.on : Text.admin.off}
        </button>
        <button className="admin-btn danger" onClick={onReset} data-ui>
          {Text.admin.reset}
        </button>
        <button className="modal-close" onClick={onClose} data-ui>
          {Text.admin.close}
        </button>
      </div>
    </div>
  );
}
