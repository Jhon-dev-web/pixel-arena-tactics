import T from '../game/tunables';
import Text from '../locales/en.json';
import { SaveData } from '../game/engine';
import { GEAR_SLOTS, GearItem, GearSlot, gearBySlot, getGear } from '../game/gear';

const fmt = (s: string, n: number) => s.replace('{n}', String(n));
const gearText = (key: string): string => (Text.gear as Record<string, string>)[key];

function GearRow({
  item,
  owned,
  equipped,
  gold,
  onBuy,
  onEquip,
}: {
  item: GearItem;
  owned: boolean;
  equipped: boolean;
  gold: number;
  onBuy: (id: string) => void;
  onEquip: (id: string) => void;
}) {
  return (
    <div className="gear-row">
      <div className="gear-info">
        <span className="gear-name">
          {gearText(item.nameKey)}
          {item.materialKey && (
            <span className={`gear-material ${item.materialKey.replace('material_', '')}`}>
              {gearText(item.materialKey)}
            </span>
          )}
        </span>
        <span className="gear-desc">{gearText(item.descKey)}</span>
        {!owned && <span className="gear-cost">{fmt(Text.ui.cost, item.cost)}</span>}
      </div>
      {equipped ? (
        <button className="gear-action equipped" disabled data-ui>
          {Text.gear.equipped}
        </button>
      ) : owned ? (
        <button className="gear-action" onClick={() => onEquip(item.id)} data-ui>
          {Text.gear.equip}
        </button>
      ) : (
        <button className="gear-action buy" onClick={() => onBuy(item.id)} disabled={gold < item.cost} data-ui>
          {Text.gear.buy}
        </button>
      )}
    </div>
  );
}

export default function ShopModal({
  save,
  shopTab,
  onTabChange,
  onBuyWeapon,
  onBuyArmor,
  onBuyGear,
  onEquipGear,
  onClose,
}: {
  save: SaveData;
  shopTab: 'upgrades' | 'armory';
  onTabChange: (tab: 'upgrades' | 'armory') => void;
  onBuyWeapon: () => void;
  onBuyArmor: () => void;
  onBuyGear: (id: string) => void;
  onEquipGear: (id: string) => void;
  onClose: () => void;
}) {
  const weaponCost = save.weaponLevel * T.progression.weaponBaseCost;
  const armorCost = save.armorLevel * T.progression.armorBaseCost;

  const equippedName = (slot: GearSlot): string => {
    const id = save.equipped[slot];
    if (!id) return Text.gear.none;
    return gearText(getGear(id).nameKey);
  };

  return (
    <div className="modal-backdrop">
      <div className="modal shop-modal">
        <h2 className="modal-title">{Text.ui.shop}</h2>
        <p className="shop-gold">{fmt(Text.ui.owned, save.gold)}</p>

        <div className="shop-tabs">
          <button
            className={`tab${shopTab === 'upgrades' ? ' active' : ''}`}
            onClick={() => onTabChange('upgrades')}
            data-ui
          >
            {Text.gear.upgradesTab}
          </button>
          <button
            className={`tab${shopTab === 'armory' ? ' active' : ''}`}
            onClick={() => onTabChange('armory')}
            data-ui
          >
            {Text.gear.armoryTab}
          </button>
        </div>

        {shopTab === 'upgrades' ? (
          <div className="shop-body">
            <div className="shop-row">
              <div className="shop-info">
                <span className="shop-name">⚔️ {Text.ui.weapon}</span>
                <span className="shop-level">{fmt(Text.ui.level, save.weaponLevel)}</span>
              </div>
              <button className="shop-buy" onClick={onBuyWeapon} disabled={save.gold < weaponCost} data-ui>
                {fmt(Text.ui.cost, weaponCost)}
              </button>
            </div>

            <div className="shop-row">
              <div className="shop-info">
                <span className="shop-name">🛡️ {Text.ui.armor}</span>
                <span className="shop-level">{fmt(Text.ui.level, save.armorLevel)}</span>
              </div>
              <button className="shop-buy" onClick={onBuyArmor} disabled={save.gold < armorCost} data-ui>
                {fmt(Text.ui.cost, armorCost)}
              </button>
            </div>
          </div>
        ) : (
          <div className="armory">
            {GEAR_SLOTS.map((slot) => (
              <div className="gear-section" key={slot}>
                <div className="gear-section-title">
                  {gearText(slot)} · {equippedName(slot)}
                </div>
                {gearBySlot(slot).map((item) => (
                  <GearRow
                    key={item.id}
                    item={item}
                    owned={save.owned.includes(item.id)}
                    equipped={save.equipped[item.slot] === item.id}
                    gold={save.gold}
                    onBuy={onBuyGear}
                    onEquip={onEquipGear}
                  />
                ))}
              </div>
            ))}
          </div>
        )}

        <button className="modal-close" onClick={onClose} data-ui>
          {Text.ui.close}
        </button>
      </div>
    </div>
  );
}
