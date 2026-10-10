import type { SaveData } from '../game/engine';
import GatheringModal from './GatheringModal';

// Woodcutting is the wood data set of GatheringModal (the screen Mining and Woodcutting share).
export default function WoodcuttingModal({ save, onStartWood, onClaim, onCancel, onClose }: { save: SaveData; onStartWood: (woodId: string) => void; onClaim: () => void; onCancel: () => void; onClose: () => void }) {
  return <GatheringModal kind="woodcutting" save={save} onStart={onStartWood} onClaim={onClaim} onCancel={onCancel} onClose={onClose} />;
}
