import { t } from '../locales';
import { SaveData } from '../game/engine';
import InventoryPanel from './InventoryPanel';

// Quick-access modal for the sidebar's direct "Inventário" entry — the same InventoryPanel also
// renders embedded (no modal chrome) inside PersonagemView, sharing all state/handlers.
export default function InventoryModal({
  save,
  onEquip,
  onUnequip,
  onDiscard,
  onReforge,
  onSalvage,
  onUseConsumable,
  onClose,
}: {
  save: SaveData;
  onEquip: (id: string) => void;
  onUnequip: (id: string) => void;
  onDiscard: (kind: 'gear' | 'material' | 'consumable', id: string) => void;
  onReforge: (id: string) => void;
  onSalvage: (id: string) => void;
  onUseConsumable: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop">
      <div className="modal inventory-modal" data-tutorial-target="inventory-modal">
        <h2 className="modal-title">
          <img className="inline-icon" src="/assets/icons/nav_bag.png" alt="" /> {t('inventory.title')}
        </h2>
        <InventoryPanel
          save={save}
          onEquip={onEquip}
          onUnequip={onUnequip}
          onDiscard={onDiscard}
          onReforge={onReforge}
          onSalvage={onSalvage}
          onUseConsumable={onUseConsumable}
        />
        <button className="modal-x" onClick={onClose} aria-label="Close" data-ui>
          ✕
        </button>
      </div>
    </div>
  );
}
