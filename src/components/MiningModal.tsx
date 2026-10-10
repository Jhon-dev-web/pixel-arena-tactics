import type { SaveData } from '../game/engine';
import GatheringModal from './GatheringModal';

// Mining is the ore data set of GatheringModal (the screen Mining and Woodcutting share).
export default function MiningModal({ save, onStartOre, onClaim, onCancel, onClose }: { save: SaveData; onStartOre: (oreId: string) => void; onClaim: () => void; onCancel: () => void; onClose: () => void }) {
  return <GatheringModal kind="mining" save={save} onStart={onStartOre} onClaim={onClaim} onCancel={onCancel} onClose={onClose} />;
}
