import type { ItemStore } from '../items/store.ts';
import type { MaterialBalances } from './types.ts';

// What the material handlers need from the database. The real one (matDb.ts) calls the SQL functions of migration 0015 with the service role; the tests use an in-memory fake that follows the
// same state machine. Every method that changes state is ONE call = ONE locked transaction in the database.

/** A request the server already answered (claims) or applied (burns and acks): the same request id always gets the same answer. */
export type StoredMaterialRequest = { kind: 'claim'; tradeable: Record<string, number> } | { kind: 'burn' | 'ack'; applied: Record<string, number> };

export interface MaterialStore extends Pick<ItemStore, 'accountStartMs' | 'takeTokens' | 'flag'> {
  findRequest(userId: string, requestId: string): Promise<StoredMaterialRequest | null>;
  /** Credits the tradeable units a claim was granted (qty += n) and stores the answer; a request id already used is { status: 'replay' } and changes nothing. */
  credit(args: { userId: string; requestId: string; credits: Record<string, number> }): Promise<{ status: 'created' | 'replay' }>;
  /** Lowers the balance by what the game spent, never below zero; returns what was really taken. A request id already used is a replay (the stored answer). */
  burn(args: { userId: string; requestId: string; units: Record<string, number> }): Promise<{ applied: Record<string, number>; replay: boolean }>;
  /** The game put delivered units into its save: lowers `pending` (never below zero). Replay-safe. */
  ack(args: { userId: string; requestId: string; units: Record<string, number> }): Promise<{ applied: Record<string, number>; replay: boolean }>;
  balances(userId: string): Promise<MaterialBalances>;
}
