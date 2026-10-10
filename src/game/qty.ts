import { STACK_LIMIT } from './inventory';

// The quantity selector shared by every stack action (store, take, sell, discard): 1, 10, one full stack, or everything.
export type QtyMode = 1 | 10 | 'stack' | 'all';
export const QTY_MODES: QtyMode[] = [1, 10, 'stack', 'all'];

export const unitsFor = (have: number, mode: QtyMode): number => Math.max(0, mode === 'all' ? have : mode === 'stack' ? Math.min(STACK_LIMIT, have) : Math.min(mode, have));
