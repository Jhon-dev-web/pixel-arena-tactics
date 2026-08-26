import { GearItem } from '../game/gear';

export default function GearIcon({ item }: { item: GearItem }) {
  if (item.iconUrl) {
    return <img className="gear-icon-img" src={item.iconUrl} alt="" draggable={false} />;
  }
  const emoji = item.slot === 'weapon' ? '⚔️' : item.slot === 'armor' ? '🛡️' : '💍';
  return <span className="gear-icon-emoji">{emoji}</span>;
}
