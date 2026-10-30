import { t } from '../locales';
import { SaveData } from '../game/engine';
import InventoryPanel from './InventoryPanel';
import { ModalShell } from './ui';

// The sidebar's direct "Inventário" entry: a big work surface (the shared ModalShell) around the same InventoryPanel that also renders embedded inside PersonagemView, sharing all state/handlers.
export default function InventoryModal({
  save,
  onEquip,
  onUnequip,
  onDiscard,
  onReforge,
  onLapidar,
  onSalvage,
  onUseConsumable,
  onExpand,
  onClose,
}: {
  save: SaveData;
  onEquip: (id: string) => void;
  onUnequip: (id: string) => void;
  onDiscard: (kind: 'gear' | 'material' | 'consumable', id: string) => void;
  onReforge: (id: string) => void;
  onLapidar: (id: string, lockIndex: number) => void;
  onSalvage: (id: string) => void;
  onUseConsumable: (id: string) => void;
  onExpand: () => void;
  onClose: () => void;
}) {
  return (
    <ModalShell
      className="inv-modal"
      tutorialTarget="inventory-modal"
      icon={<img className="pixel-icon" src="/assets/icons/nav_bag.png" alt="" />}
      title={t('inventory.title')}
      closeLabel={t('ui.close')}
      onClose={onClose}
    >
      <InventoryPanel
        save={save}
        onEquip={onEquip}
        onUnequip={onUnequip}
        onDiscard={onDiscard}
        onReforge={onReforge}
        onLapidar={onLapidar}
        onSalvage={onSalvage}
        onUseConsumable={onUseConsumable}
        onExpand={onExpand}
        layout="wide"
      />
    </ModalShell>
  );
}
