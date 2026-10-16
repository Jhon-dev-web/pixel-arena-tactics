import { describe, expect, it } from 'vitest';
import { associatedTokenAddress } from '../chain/ata.ts';
import { decodeBase58, encodeBase58, isSolAddress, isSolSignature } from '../chain/base58.ts';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  SOLANA_GENESIS_HASHES,
  SOLANA_USDC_MINT_MAINNET,
  SYSTEM_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  cleanSolAddress,
  fetchRecentBlockhash,
  loadPassPriceUnits,
  loadSolanaConfig,
  normalizeSolSignature,
  verifySolSale,
  verifyUsdcPayment,
} from '../chain/solana.ts';
import { LAMPORTS_PER_SOL, MARKET_MAX_PRICE_LAMPORTS, formatSol, formatUsdc, isPriceLamports, parseSolAmount, parseUsdcAmount, splitLamports } from '../chain/solMoney.ts';
import { DEVNET, FakeSolana, MAINNET, addr, sig } from './solanaFixtures.ts';

const NOW = Date.UTC(2026, 10, 2, 12, 0, 0);
const BUYER = addr(1);
const SELLER = addr(2);
const FEE = addr(3);
const RECEIVER = addr(4);
const chain = () => new FakeSolana(() => NOW);

// A sale of 1 SOL: 0.95 to the seller and 0.05 to the game, in ONE transaction.
const PRICE = splitLamports(1 * LAMPORTS_PER_SOL);
const payouts = [
  { to: SELLER, minLamports: BigInt(PRICE.sellerLamports) },
  { to: FEE, minLamports: BigInt(PRICE.feeLamports) },
];
const pays = [
  { to: SELLER, lamports: PRICE.sellerLamports },
  { to: FEE, lamports: PRICE.feeLamports },
];
const expectSale = (signature: string, over: Partial<Parameters<typeof verifySolSale>[2]> = {}) => ({ signature, buyer: BUYER, payouts, notBeforeMs: NOW - 1000, ...over });

describe('base58 and the Solana constants', () => {
  it('round trips bytes, keeps leading zeros and refuses characters outside the alphabet', () => {
    for (const n of [0, 1, 57, 58, 200, 255]) {
      const b = new Uint8Array(32).fill(n);
      expect(decodeBase58(encodeBase58(b))).toEqual(b);
    }
    expect(encodeBase58(new Uint8Array(32))).toBe(SYSTEM_PROGRAM_ID);
    expect(encodeBase58(Uint8Array.of(0, 0, 1))).toBe('112');
    expect(decodeBase58('0OIl')).toBeNull();
    expect(decodeBase58('')).toBeNull();
    expect(decodeBase58('abc def')).toBeNull();
  });

  it('every address constant is a well-formed 32 byte key and every genesis hash too (a typo would fail here)', () => {
    for (const a of [SOLANA_USDC_MINT_MAINNET, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, SYSTEM_PROGRAM_ID, ...Object.values(SOLANA_GENESIS_HASHES)]) expect(isSolAddress(a), a).toBe(true);
    expect(isSolSignature(sig(7))).toBe(true);
    expect(isSolSignature(addr(7))).toBe(false);
    expect(cleanSolAddress(` ${SELLER} `)).toBe(SELLER);
    expect(cleanSolAddress(SYSTEM_PROGRAM_ID)).toBeNull();
    expect(cleanSolAddress('0x' + 'a'.repeat(40))).toBeNull();
    expect(cleanSolAddress(undefined)).toBeNull();
  });

  it('signatures keep their case and are never lowercased', () => {
    const s = sig(200);
    expect(normalizeSolSignature(` ${s} `)).toBe(s);
    expect(s).not.toBe(s.toLowerCase());
    expect(normalizeSolSignature(s)).toBe(s); // returned as given, with its capitals
    expect(normalizeSolSignature(5)).toBeNull();
    expect(normalizeSolSignature('0x' + '1'.repeat(64))).toBeNull();
  });
});

describe('the Solana configuration, from secrets by name', () => {
  const base = { SOLANA_RPC_URL: 'https://rpc.example/key' };

  it('defaults to mainnet-beta with the official USDC mint, livemode true', () => {
    const r = loadSolanaConfig(base);
    expect(r).toMatchObject({ ok: true, config: { cluster: 'mainnet-beta', chainId: 501, usdcMint: SOLANA_USDC_MINT_MAINNET, livemode: true } });
  });

  it('devnet needs its own USDC mint and is never livemode', () => {
    expect(loadSolanaConfig({ ...base, SOLANA_CLUSTER: 'devnet' })).toEqual({ ok: false, reason: 'mint_missing' });
    const ok = loadSolanaConfig({ ...base, SOLANA_CLUSTER: 'devnet', SOLANA_USDC_MINT: addr(77) });
    expect(ok).toMatchObject({ ok: true, config: { cluster: 'devnet', chainId: 502, usdcMint: addr(77), livemode: false } });
  });

  it('fails closed: no rpc, an http url, an unknown cluster, a malformed mint', () => {
    expect(loadSolanaConfig({})).toEqual({ ok: false, reason: 'rpc_missing' });
    expect(loadSolanaConfig({ SOLANA_RPC_URL: 'http://insecure.example' })).toEqual({ ok: false, reason: 'rpc_missing' });
    expect(loadSolanaConfig({ ...base, SOLANA_CLUSTER: 'testnet' })).toEqual({ ok: false, reason: 'cluster_unsupported' });
    expect(loadSolanaConfig({ ...base, SOLANA_USDC_MINT: 'not-a-mint' })).toEqual({ ok: false, reason: 'mint_invalid' });
  });

  it('the Pass price defaults to 10.00 USDC and a malformed price switches the Pass off instead of giving it away', () => {
    expect(loadPassPriceUnits(undefined)).toBe(10_000_000);
    expect(loadPassPriceUnits('')).toBe(10_000_000);
    expect(loadPassPriceUnits('12.5')).toBe(12_500_000);
    for (const bad of ['0', 'free', '-3', '1e3', '10.1234567']) expect(loadPassPriceUnits(bad), bad).toBeNull();
  });
});

describe('money in lamports and USDC units', () => {
  it('the fee is 5% ROUNDED UP to the lamport and the two parts add up to the price exactly', () => {
    for (const lamports of [1_000_000, 1_234_000, LAMPORTS_PER_SOL, 12_345_000, MARKET_MAX_PRICE_LAMPORTS, 7]) {
      const s = splitLamports(lamports);
      expect(s.feeLamports + s.sellerLamports).toBe(lamports);
      expect(s.feeLamports).toBeGreaterThanOrEqual(lamports * 0.05);
      expect(s.feeLamports).toBeLessThan(lamports * 0.05 + 1);
    }
    expect(splitLamports(1_000_000)).toEqual({ priceLamports: 1_000_000, feeLamports: 50_000, sellerLamports: 950_000 });
    expect(splitLamports(7).feeLamports).toBe(1); // rounded up
  });

  it('a listing price is 0.001 to the cap SOL in steps of 0.001', () => {
    expect(isPriceLamports(1_000_000)).toBe(true);
    expect(isPriceLamports(MARKET_MAX_PRICE_LAMPORTS)).toBe(true);
    for (const bad of [0, 999_999, 1_500_000 + 1, MARKET_MAX_PRICE_LAMPORTS + 1_000_000, -1_000_000, 1.5, '1000000', null]) expect(isPriceLamports(bad), String(bad)).toBe(false);
  });

  it('parses and prints amounts without floats', () => {
    expect(parseSolAmount('0.001')).toBe(1_000_000);
    expect(parseSolAmount('1')).toBe(LAMPORTS_PER_SOL);
    expect(parseSolAmount('12.345')).toBe(12_345_000_000);
    for (const bad of ['0.0001', '-1', '1e2', '', 'abc', '0', '0.000', '1,5']) expect(parseSolAmount(bad), bad).toBeNull();
    expect(formatSol(50_000)).toBe('0.00005');
    expect(formatSol(LAMPORTS_PER_SOL)).toBe('1.00');
    expect(formatSol(1_500_000_000)).toBe('1.50');
    expect(parseUsdcAmount('10.00')).toBe(10_000_000);
    expect(parseUsdcAmount('0.000001')).toBe(1);
    expect(formatUsdc(10_000_000)).toBe('10.00');
    expect(formatUsdc(12_345_600)).toBe('12.3456');
  });
});

describe('verifying a SOL sale: ONE transaction with the seller transfer and the fee transfer', () => {
  it('good: both transfers from the buyer, finalized, after the reservation', async () => {
    const c = chain();
    const s = c.sale(BUYER, pays);
    const r = await verifySolSale(c, MAINNET, expectSale(s));
    expect(r).toMatchObject({ ok: true, payment: { signature: s, blockTime: Math.floor(NOW / 1000) } });
    if (r.ok) expect(r.payment.paid).toEqual([{ to: SELLER, amount: BigInt(PRICE.sellerLamports) }, { to: FEE, amount: BigInt(PRICE.feeLamports) }]);
    expect(c.methods).toContain('getTransaction');
  });

  it('asks for the transaction at commitment finalized, jsonParsed, versioned transactions allowed', async () => {
    const asked: unknown[][] = [];
    const c = chain();
    const s = c.sale(BUYER, pays);
    const real = c.call.bind(c);
    c.call = async (m, p) => {
      if (m === 'getTransaction') asked.push(p);
      return real(m, p);
    };
    await verifySolSale(c, MAINNET, expectSale(s));
    expect(asked[0]).toEqual([s, { encoding: 'jsonParsed', commitment: 'finalized', maxSupportedTransactionVersion: 0 }]);
  });

  it('pays more than needed: accepted (the excess is a gift)', async () => {
    const c = chain();
    const s = c.sale(BUYER, [{ to: SELLER, lamports: PRICE.sellerLamports + 1 }, { to: FEE, lamports: PRICE.feeLamports * 2 }]);
    expect((await verifySolSale(c, MAINNET, expectSale(s))).ok).toBe(true);
  });

  it('wrong recipient: the seller share goes to somebody else', async () => {
    const c = chain();
    const s = c.sale(BUYER, [{ to: addr(9), lamports: PRICE.sellerLamports }, { to: FEE, lamports: PRICE.feeLamports }]);
    expect(await verifySolSale(c, MAINNET, expectSale(s))).toEqual({ ok: false, reason: 'wrong_recipient' });
  });

  it('wrong recipient: only the seller is paid, the game fee is missing', async () => {
    const c = chain();
    const s = c.sale(BUYER, [{ to: SELLER, lamports: PRICE.sellerLamports }]);
    expect(await verifySolSale(c, MAINNET, expectSale(s))).toEqual({ ok: false, reason: 'wrong_recipient' });
  });

  it('short amount: one lamport less to the seller, or to the game, is refused', async () => {
    const c = chain();
    const a = c.sale(BUYER, [{ to: SELLER, lamports: PRICE.sellerLamports - 1 }, { to: FEE, lamports: PRICE.feeLamports }]);
    const b = c.sale(BUYER, [{ to: SELLER, lamports: PRICE.sellerLamports }, { to: FEE, lamports: PRICE.feeLamports - 1 }]);
    expect(await verifySolSale(c, MAINNET, expectSale(a))).toEqual({ ok: false, reason: 'short_amount' });
    expect(await verifySolSale(c, MAINNET, expectSale(b))).toEqual({ ok: false, reason: 'short_amount' });
  });

  it('two transfers to the seller from the same buyer are added up (still must reach the amount)', async () => {
    const c = chain();
    const half = Math.floor(PRICE.sellerLamports / 2);
    const ok = c.sale(BUYER, [{ to: SELLER, lamports: half }, { to: SELLER, lamports: PRICE.sellerLamports - half }, { to: FEE, lamports: PRICE.feeLamports }]);
    expect((await verifySolSale(c, MAINNET, expectSale(ok))).ok).toBe(true);
    const short = c.sale(BUYER, [{ to: SELLER, lamports: half }, { to: FEE, lamports: PRICE.feeLamports }]);
    expect(await verifySolSale(c, MAINNET, expectSale(short))).toEqual({ ok: false, reason: 'short_amount' });
  });

  it('failed transaction: meta.err set', async () => {
    const c = chain();
    const s = c.sale(BUYER, pays, { err: { InstructionError: [0, 'Custom'] } });
    expect(await verifySolSale(c, MAINNET, expectSale(s))).toEqual({ ok: false, reason: 'tx_failed' });
  });

  it('not finalized: a transaction the node only has at a lower commitment is "unconfirmed" (retry), an unknown one is "not_found"', async () => {
    const c = chain();
    const seen = sig(40);
    c.unfinalized.set(seen, { err: null });
    expect(await verifySolSale(c, MAINNET, expectSale(seen))).toEqual({ ok: false, reason: 'unconfirmed' });
    expect(await verifySolSale(c, MAINNET, expectSale(sig(41)))).toEqual({ ok: false, reason: 'not_found' });
    // seen at a lower commitment and already failed: final
    const bad = sig(42);
    c.unfinalized.set(bad, { err: { InstructionError: [0, 'x'] } });
    expect(await verifySolSale(c, MAINNET, expectSale(bad))).toEqual({ ok: false, reason: 'tx_failed' });
  });

  it('wrong sender: the right transfers made by another wallet', async () => {
    const c = chain();
    const s = c.sale(addr(8), pays);
    expect(await verifySolSale(c, MAINNET, expectSale(s))).toEqual({ ok: false, reason: 'wrong_sender' });
  });

  it('wrong sender: the buyer pays only one of the two legs, a stranger pays the other', async () => {
    const c = chain();
    const s = c.add({
      transfers: [
        { source: BUYER, destination: SELLER, lamports: PRICE.sellerLamports },
        { source: addr(8), destination: FEE, lamports: PRICE.feeLamports },
      ],
    });
    expect(await verifySolSale(c, MAINNET, expectSale(s))).toEqual({ ok: false, reason: 'wrong_sender' });
  });

  it('before the reservation: the block is older than the lock', async () => {
    const c = chain();
    const s = c.sale(BUYER, pays, { blockTime: Math.floor(NOW / 1000) - 600 });
    expect(await verifySolSale(c, MAINNET, expectSale(s, { notBeforeMs: NOW }))).toEqual({ ok: false, reason: 'too_early' });
    expect((await verifySolSale(c, MAINNET, expectSale(s, { notBeforeMs: NOW - 601_000 }))).ok).toBe(true);
  });

  it('inner instructions count: transfers made through a program (CPI) from the buyer are real transfers', async () => {
    const c = chain();
    const s = c.add({
      innerTransfers: [
        { source: BUYER, destination: SELLER, lamports: PRICE.sellerLamports },
        { source: BUYER, destination: FEE, lamports: PRICE.feeLamports },
      ],
    });
    expect((await verifySolSale(c, MAINNET, expectSale(s))).ok).toBe(true);
    // half top level, half inner
    const mixed = c.add({ transfers: [{ source: BUYER, destination: SELLER, lamports: PRICE.sellerLamports }], innerTransfers: [{ source: BUYER, destination: FEE, lamports: PRICE.feeLamports }] });
    expect((await verifySolSale(c, MAINNET, expectSale(mixed))).ok).toBe(true);
  });

  it('only SystemProgram transfers count: an instruction of another program that merely looks like one is ignored', async () => {
    const c = chain();
    const s = c.add({ decoyTransfers: pays.map((p) => ({ source: BUYER, destination: p.to, lamports: p.lamports })) });
    expect(await verifySolSale(c, MAINNET, expectSale(s))).toEqual({ ok: false, reason: 'no_transfer' });
  });

  it('a transaction without any transfer', async () => {
    const c = chain();
    expect(await verifySolSale(c, MAINNET, expectSale(c.add()))).toEqual({ ok: false, reason: 'no_transfer' });
  });

  it('when the seller and the fee address are the same wallet, one transfer for the whole price is enough and half of it is not', async () => {
    const c = chain();
    const both = [{ to: SELLER, minLamports: BigInt(PRICE.sellerLamports) }, { to: SELLER, minLamports: BigInt(PRICE.feeLamports) }];
    const ok = c.sale(BUYER, [{ to: SELLER, lamports: PRICE.priceLamports }]);
    const short = c.sale(BUYER, [{ to: SELLER, lamports: PRICE.sellerLamports }]);
    expect((await verifySolSale(c, MAINNET, expectSale(ok, { payouts: both }))).ok).toBe(true);
    expect(await verifySolSale(c, MAINNET, expectSale(short, { payouts: both }))).toEqual({ ok: false, reason: 'short_amount' });
  });

  it('the node must serve the configured cluster: a devnet node behind a mainnet configuration is refused', async () => {
    const c = chain();
    c.genesis = SOLANA_GENESIS_HASHES.devnet;
    const s = c.sale(BUYER, pays);
    expect(await verifySolSale(c, MAINNET, expectSale(s))).toEqual({ ok: false, reason: 'wrong_network' });
    expect((await verifySolSale(c, DEVNET, expectSale(s))).ok).toBe(true);
  });

  it('a node that is down or answers garbage is "rpc_error" (retry later), never a refusal of the payment', async () => {
    const c = chain();
    const s = c.sale(BUYER, pays);
    c.down = true;
    expect(await verifySolSale(c, MAINNET, expectSale(s))).toEqual({ ok: false, reason: 'rpc_error' });
    c.down = false;
    const noTime = c.sale(BUYER, pays, { blockTime: null });
    expect(await verifySolSale(c, MAINNET, expectSale(noTime))).toEqual({ ok: false, reason: 'rpc_error' });
  });

  it('a malformed signature never reaches the node', async () => {
    const c = chain();
    for (const bad of ['', '0x12', 'not base58 !', addr(1)]) expect(await verifySolSale(c, MAINNET, expectSale(bad))).toEqual({ ok: false, reason: 'bad_signature' });
    expect(c.calls).toBe(0);
  });
});

describe('verifying the Pass: USDC received by the receiving wallet', () => {
  const exp = (signature: string, over: Partial<Parameters<typeof verifyUsdcPayment>[2]> = {}) => ({ signature, buyer: BUYER, receiver: RECEIVER, minUnits: 10_000_000n, notBeforeMs: NOW - 1000, ...over });

  it('good: the buyer sends 10 USDC to the receiving wallet', async () => {
    const c = chain();
    const s = c.usdc(BUYER, RECEIVER, 10_000_000);
    const r = await verifyUsdcPayment(c, MAINNET, exp(s));
    expect(r).toMatchObject({ ok: true, payment: { signature: s, paid: [{ to: RECEIVER, amount: 10_000_000n }] } });
  });

  it('accepts more than the price', async () => {
    const c = chain();
    expect((await verifyUsdcPayment(c, MAINNET, exp(c.usdc(BUYER, RECEIVER, 12_000_000)))).ok).toBe(true);
  });

  it('short amount', async () => {
    const c = chain();
    expect(await verifyUsdcPayment(c, MAINNET, exp(c.usdc(BUYER, RECEIVER, 9_999_999)))).toEqual({ ok: false, reason: 'short_amount' });
  });

  it('wrong mint: another token is refused', async () => {
    const c = chain();
    expect(await verifyUsdcPayment(c, MAINNET, exp(c.usdc(BUYER, RECEIVER, 10_000_000, {}, addr(99))))).toEqual({ ok: false, reason: 'wrong_mint' });
  });

  it('wrong decimals on the right mint address is refused', async () => {
    const c = chain();
    const s = c.add({
      tokens: [
        { owner: BUYER, mint: SOLANA_USDC_MINT_MAINNET, pre: 20_000_000_000, post: 10_000_000_000, decimals: 9 },
        { owner: RECEIVER, mint: SOLANA_USDC_MINT_MAINNET, pre: 0, post: 10_000_000_000, decimals: 9 },
      ],
    });
    expect(await verifyUsdcPayment(c, MAINNET, exp(s))).toEqual({ ok: false, reason: 'wrong_mint' });
  });

  it('wrong recipient: the receiving wallet is not in the transaction at all', async () => {
    const c = chain();
    expect(await verifyUsdcPayment(c, MAINNET, exp(c.usdc(BUYER, addr(50), 10_000_000)))).toEqual({ ok: false, reason: 'wrong_recipient' });
  });

  it('wrong sender: another wallet paid', async () => {
    const c = chain();
    expect(await verifyUsdcPayment(c, MAINNET, exp(c.usdc(addr(60), RECEIVER, 10_000_000)))).toEqual({ ok: false, reason: 'wrong_sender' });
  });

  it('wrong sender: the buyer paid less than the price and somebody else made up the rest', async () => {
    const c = chain();
    const s = c.add({
      tokens: [
        { owner: BUYER, mint: SOLANA_USDC_MINT_MAINNET, pre: 8_000_000, post: 0 },
        { owner: addr(61), mint: SOLANA_USDC_MINT_MAINNET, pre: 5_000_000, post: 3_000_000 },
        { owner: RECEIVER, mint: SOLANA_USDC_MINT_MAINNET, pre: 0, post: 10_000_000 },
      ],
    });
    expect(await verifyUsdcPayment(c, MAINNET, exp(s))).toEqual({ ok: false, reason: 'wrong_sender' });
  });

  it('a receiving token account created in the same transaction (no "pre" entry) counts from zero', async () => {
    const c = chain();
    const s = c.add({
      tokens: [
        { owner: BUYER, mint: SOLANA_USDC_MINT_MAINNET, pre: 15_000_000, post: 5_000_000 },
        { owner: RECEIVER, mint: SOLANA_USDC_MINT_MAINNET, pre: 0, post: 10_000_000 },
      ],
    });
    const real = c.call.bind(c);
    c.call = async (m, p) => {
      const out = (await real(m, p)) as { meta?: { preTokenBalances: { owner: string }[] } } | null;
      if (m === 'getTransaction' && out?.meta) out.meta.preTokenBalances = out.meta.preTokenBalances.filter((e) => e.owner !== RECEIVER);
      return out;
    };
    expect((await verifyUsdcPayment(c, MAINNET, exp(s))).ok).toBe(true);
  });

  it('failed, not finalized, before the intent, wrong cluster, no token movement at all', async () => {
    const c = chain();
    expect(await verifyUsdcPayment(c, MAINNET, exp(c.usdc(BUYER, RECEIVER, 10_000_000, { err: { InstructionError: [0, 'x'] } })))).toEqual({ ok: false, reason: 'tx_failed' });
    const seen = sig(70);
    c.unfinalized.set(seen, { err: null });
    expect(await verifyUsdcPayment(c, MAINNET, exp(seen))).toEqual({ ok: false, reason: 'unconfirmed' });
    expect(await verifyUsdcPayment(c, MAINNET, exp(c.usdc(BUYER, RECEIVER, 10_000_000, { blockTime: 100 })))).toEqual({ ok: false, reason: 'too_early' });
    expect(await verifyUsdcPayment(c, MAINNET, exp(c.add()))).toEqual({ ok: false, reason: 'no_transfer' });
    const d = chain();
    d.genesis = SOLANA_GENESIS_HASHES.devnet;
    expect(await verifyUsdcPayment(d, MAINNET, exp(d.usdc(BUYER, RECEIVER, 10_000_000)))).toEqual({ ok: false, reason: 'wrong_network' });
  });

  it('devnet uses the mint of its own configuration', async () => {
    const c = chain();
    c.genesis = SOLANA_GENESIS_HASHES.devnet;
    const s = c.usdc(BUYER, RECEIVER, 10_000_000, {}, DEVNET.usdcMint);
    expect((await verifyUsdcPayment(c, DEVNET, exp(s))).ok).toBe(true);
    expect(await verifyUsdcPayment(c, DEVNET, exp(c.usdc(BUYER, RECEIVER, 10_000_000, {}, SOLANA_USDC_MINT_MAINNET)))).toEqual({ ok: false, reason: 'wrong_mint' });
  });
});

describe('a recent blockhash for the wallet', () => {
  it('is read from the node; garbage or a dead node is null', async () => {
    const c = chain();
    expect(await fetchRecentBlockhash(c)).toEqual({ blockhash: addr(5), lastValidBlockHeight: 400_000_000 });
    c.down = true;
    expect(await fetchRecentBlockhash(c)).toBeNull();
  });
});

describe('associated token accounts', () => {
  it('derives a 32 byte address, off the curve, stable and different for each owner and mint', () => {
    const a = associatedTokenAddress(BUYER, SOLANA_USDC_MINT_MAINNET);
    expect(isSolAddress(a)).toBe(true);
    expect(a).toBe(associatedTokenAddress(BUYER, SOLANA_USDC_MINT_MAINNET));
    expect(a).not.toBe(associatedTokenAddress(RECEIVER, SOLANA_USDC_MINT_MAINNET));
    expect(a).not.toBe(associatedTokenAddress(BUYER, addr(77)));
    expect(a).not.toBe(BUYER);
    expect(() => associatedTokenAddress('nope', SOLANA_USDC_MINT_MAINNET)).toThrow();
  });
});
