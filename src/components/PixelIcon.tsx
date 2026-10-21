import { UI_ICON, UiIconName } from './uiIcons';

// A decorative pixel-art icon (the label next to it, or the aria-label of the button, carries the name).
export default function PixelIcon({ name, className = '' }: { name: UiIconName; className?: string }) {
  return <img className={`pixel-icon${className ? ` ${className}` : ''}`} src={UI_ICON[name]} alt="" draggable={false} />;
}
