import Text from '../locales/en.json';

export default function BottomNav({
  baseActive,
  onBase,
  onForge,
  onShop,
  onAttributes,
}: {
  baseActive: boolean;
  onBase: () => void;
  onForge: () => void;
  onShop: () => void;
  onAttributes: () => void;
}) {
  return (
    <nav className="bottom-nav">
      <button className={`nav-tab${baseActive ? ' active' : ''}`} onClick={onBase} data-ui>
        <span className="nav-icon">🏕️</span>
        <span className="nav-label">{Text.nav.base}</span>
      </button>
      <button className="nav-tab" onClick={onForge} data-ui>
        <span className="nav-icon">⚒️</span>
        <span className="nav-label">{Text.nav.forge}</span>
      </button>
      <button className="nav-tab" onClick={onShop} data-ui>
        <span className="nav-icon">🛒</span>
        <span className="nav-label">{Text.nav.shop}</span>
      </button>
      <button className="nav-tab" onClick={onAttributes} data-ui>
        <span className="nav-icon">👤</span>
        <span className="nav-label">{Text.nav.attributes}</span>
      </button>
    </nav>
  );
}
