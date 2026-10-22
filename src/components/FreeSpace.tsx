import { t } from '../locales';

// The quiet line that ends a storage grid: how many slots are still free (the real count, capacity minus the slots in use). It replaces dozens of empty boxes: the grid shows only what is there, and
// this line, with the single "used / capacity" on the tab, says how much room is left.
export default function FreeSpace({ free }: { free: number }) {
  return <p className="inv-free">{free > 0 ? t('inventory.freeSlots', { n: free }) : t('inventory.noFreeSlots')}</p>;
}
