// The reference every payment carries: an SPL Memo instruction (the Memo program, v2) with a short readable text that names WHAT the payment is for. The server hands the text over (a reservation
// id for a market sale, a random per-player reference for the Adventurer Pass) and later recognises the payment by it, so a payment made from ANY wallet of the same player is credited to the right
// purchase. The text is not a secret and not an authority: it only SELECTS the purchase, and the purchase is bound to the player on the server (see docs/MARKET_SOLANA.md, "Pagamentos que deram errado").

/** The Memo program v2 (the one wallets and explorers show as "Memo"). */
export const MEMO_PROGRAM_ID = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';

export const SALE_MEMO_RE = /^pa1:sale:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
export const PASS_MEMO_RE = /^pa1:pass:([0-9a-f]{32})$/;

/** The memo of the payment of a market reservation. */
export const saleMemo = (reservationId: string): string => `pa1:sale:${reservationId.toLowerCase()}`;
/** The memo of a Pass payment: `ref` is the player's random reference (32 hex characters). */
export const passMemo = (ref: string): string => `pa1:pass:${ref.toLowerCase()}`;

/** The reference inside a Pass memo, or null when the text is not one. */
export const passRefOf = (memo: string): string | null => PASS_MEMO_RE.exec(memo)?.[1] ?? null;
/** Is this text one of OUR memos (a sale or a Pass)? */
export const isGameMemo = (memo: string): boolean => SALE_MEMO_RE.test(memo) || PASS_MEMO_RE.test(memo);

/** A memo the game builds into a transaction: printable ASCII, short (the Memo program takes up to 566 bytes; ours are under 64). */
export const isBuildableMemo = (memo: string): boolean => memo.length > 0 && memo.length <= 200 && /^[\x20-\x7e]+$/.test(memo);
