import Text from '../locales/en.json';
import { SaveData, computeCP, playerLevel } from '../game/engine';

const fmt = (s: string, n: number) => s.replace('{n}', String(n));

type AttrKey = 'str' | 'vit' | 'agi' | 'res';

const ATTRS: { key: AttrKey; nameKey: string; descKey: string }[] = [
  { key: 'str', nameKey: 'str', descKey: 'strDesc' },
  { key: 'vit', nameKey: 'vit', descKey: 'vitDesc' },
  { key: 'agi', nameKey: 'agi', descKey: 'agiDesc' },
  { key: 'res', nameKey: 'res', descKey: 'resDesc' },
];

export default function AttributesModal({
  save,
  onAttrChange,
  onClose,
}: {
  save: SaveData;
  onAttrChange: (attr: AttrKey, delta: number) => void;
  onClose: () => void;
}) {
  const totalPoints = playerLevel(save.xp) * 3;
  const spent = save.str + save.vit + save.agi + save.res;
  const remaining = Math.max(0, totalPoints - spent);

  return (
    <div className="modal-backdrop">
      <div className="modal attrs-modal">
        <h2 className="modal-title">{Text.attributes.title}</h2>
        <p className="shop-gold">{fmt(Text.attributes.points, remaining)}</p>
        <p className="shop-gold cp">{fmt(Text.attributes.cp, computeCP(save))}</p>

        {ATTRS.map((a) => (
          <div className="attr-row" key={a.key}>
            <div className="attr-info">
              <span className="attr-name">{(Text.attributes as Record<string, string>)[a.nameKey]}</span>
              <span className="attr-desc">{(Text.attributes as Record<string, string>)[a.descKey]}</span>
            </div>
            <button
              className="attr-btn"
              onClick={() => onAttrChange(a.key, -1)}
              disabled={save[a.key] <= 0}
              data-ui
            >
              −
            </button>
            <span className="attr-val">{save[a.key]}</span>
            <button
              className="attr-btn"
              onClick={() => onAttrChange(a.key, 1)}
              disabled={remaining <= 0}
              data-ui
            >
              +
            </button>
          </div>
        ))}

        <button className="modal-close" onClick={onClose} data-ui>
          {Text.ui.close}
        </button>
      </div>
    </div>
  );
}
