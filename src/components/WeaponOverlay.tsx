export default function WeaponOverlay({ url, mode }: { url: string; mode: 'idle' | 'swing' | 'train' }) {
  return (
    <span className={`weapon weapon-${mode}`}>
      <img src={url} alt="" draggable={false} />
    </span>
  );
}
