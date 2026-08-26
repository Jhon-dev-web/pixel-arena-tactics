import Text from '../locales/en.json';
import { SaveData } from '../game/engine';
import { MATERIALS, MaterialId } from '../game/materials';

const fmt = (s: string, n: number) => s.replace('{n}', String(n));
const shopText = (k: string): string => (Text.shop as Record<string, string>)[k];
const matText = (k: string): string => (Text.materials as Record<string, string>)[k];

const CONSUMABLES: { id: 'hp' | 'stamina' | 'elixir'; nameKey: string; descKey: string; cost: number; icon: string }[] = [
  { id: 'hp', nameKey: 'potionHp', descKey: 'potionHpDesc', cost: 30, icon: '🧪' },
  { id: 'stamina', nameKey: 'potionStamina', descKey: 'potionStaminaDesc', cost: 25, icon: '⚡' },
  { id: 'elixir', nameKey: 'elixir', descKey: 'elixirDesc', cost: 60, icon: '💪' },
];

export default function ShopModal({
  save,
  onBuyPotion,
  onBuyMaterial,
  onClose,
}: {
  save: SaveData;
  onBuyPotion: (id: 'hp' | 'stamina' | 'elixir') => void;
  onBuyMaterial: (id: MaterialId) => void;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop">
      <div className="modal shop-modal">
        <h2 className="modal-title">{Text.shop.title}</h2>
        <p className="shop-gold">{fmt(Text.ui.owned, save.gold)}</p>

        <div className="shop-body">
          <div className="shop-section-title">{Text.shop.consumables}</div>
          {CONSUMABLES.map((c) => (
            <div className="gear-row" key={c.id}>
              <div className="gear-info">
                <span className="gear-name">
                  {c.icon} {shopText(c.nameKey)}
                  <span className="gear-count">{fmt(Text.shop.youHave, save.potions[c.id])}</span>
                </span>
                <span className="gear-desc">{shopText(c.descKey)}</span>
                <span className="gear-cost">{fmt(Text.ui.cost, c.cost)}</span>
              </div>
              <button
                className="gear-action buy"
                onClick={() => onBuyPotion(c.id)}
                disabled={save.gold < c.cost}
                data-ui
              >
                {Text.gear.buy}
              </button>
            </div>
          ))}

          <div className="shop-section-title">{Text.shop.materials}</div>
          {MATERIALS.map((m) => (
            <div className="gear-row" key={m.id}>
              <div className="gear-info">
                <span className="gear-name">
                  {m.icon} {matText(m.nameKey)}
                  <span className="gear-count">{fmt(Text.shop.youHave, save.materials[m.id])}</span>
                </span>
                <span className="gear-desc">{fmt(Text.shop.buyPack, m.packSize)}</span>
                <span className="gear-cost">{fmt(Text.ui.cost, m.packCost)}</span>
              </div>
              <button
                className="gear-action buy"
                onClick={() => onBuyMaterial(m.id)}
                disabled={save.gold < m.packCost}
                data-ui
              >
                {Text.gear.buy}
              </button>
            </div>
          ))}
        </div>

        <button className="modal-x" onClick={onClose} aria-label="Close" data-ui>
          ✕
        </button>
      </div>
    </div>
  );
}
