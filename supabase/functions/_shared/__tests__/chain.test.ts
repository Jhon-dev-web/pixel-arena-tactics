import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import { describe, expect, it } from 'vitest';
import { TRANSFER_TOPIC, RpcClient, createJsonRpc, encodeTransferCall, normalizeTxHash, verifyUsdtTransfer } from '../chain/bsc.ts';
import { BSC_MAINNET_CHAIN_ID, BSC_TESTNET_CHAIN_ID, BSC_USDT_CONTRACT_MAINNET, ChainConfig, cleanAddress, loadChainConfig } from '../chain/config.ts';
import { MARKET_MAX_PRICE_CENTS, MARKET_MIN_PRICE_CENTS, centsToUnits, formatUsdt, isPriceCents, parseUsdtAmount, splitPrice } from '../chain/money.ts';
import { linkMessage, personalMessageHash, recoverPersonalSigner, verifyPersonalSignature } from '../chain/wallet.ts';

// The BEP-20 USDT verification runs against RECORDED / hand-built JSON-RPC answers: no network, no node, no wallet. The shapes below are what a BSC node returns for
// eth_chainId, eth_getTransactionReceipt, eth_blockNumber and eth_getBlockByNumber.

const CFG: ChainConfig = { chainId: 56, usdtContract: BSC_USDT_CONTRACT_MAINNET, minConfirmations: 15, livemode: true };
const BUYER = '0x1111111111111111111111111111111111111111';
const SELLER = '0x2222222222222222222222222222222222222222';
const OTHER = '0x4444444444444444444444444444444444444444';
const FAKE_TOKEN = '0x5555555555555555555555555555555555555555';
const HASH = `0x${'ab'.repeat(32)}`;
const pad = (addr: string): string => `0x${addr.slice(2).padStart(64, '0')}`;
const word = (n: bigint): string => `0x${n.toString(16).padStart(64, '0')}`;
const usdt = (whole: number, cents = 0): bigint => centsToUnits(whole * 100 + cents);

const BLOCK = 40_000_000;
const BLOCK_TIME = Math.floor(Date.UTC(2026, 10, 2, 12, 0, 0) / 1000);

interface LogSpec {
  emitter?: string;
  from?: string;
  to?: string;
  value?: bigint;
  topics?: string[];
  data?: string;
  removed?: boolean;
}
const log = (s: LogSpec = {}, idx = 0) => ({
  address: s.emitter ?? CFG.usdtContract,
  topics: s.topics ?? [TRANSFER_TOPIC, pad(s.from ?? BUYER), pad(s.to ?? SELLER)],
  data: s.data ?? word(s.value ?? usdt(9, 40)),
  logIndex: `0x${idx.toString(16)}`,
  removed: s.removed ?? false,
  blockNumber: `0x${BLOCK.toString(16)}`,
});

interface ChainSpec {
  chainId?: number;
  receipt?: object | null;
  latest?: number;
  blockTime?: number | null;
  failOn?: string;
}
function fakeRpc(spec: ChainSpec = {}, calls: string[] = []): RpcClient {
  const receipt = spec.receipt === undefined ? { transactionHash: HASH, status: '0x1', blockNumber: `0x${BLOCK.toString(16)}`, logs: [log()] } : spec.receipt;
  return {
    async call(method) {
      calls.push(method);
      if (spec.failOn === method) throw new Error('boom');
      switch (method) {
        case 'eth_chainId':
          return `0x${(spec.chainId ?? 56).toString(16)}`;
        case 'eth_getTransactionReceipt':
          return receipt;
        case 'eth_blockNumber':
          return `0x${(spec.latest ?? BLOCK + 20).toString(16)}`;
        case 'eth_getBlockByNumber':
          return spec.blockTime === null ? null : { number: `0x${BLOCK.toString(16)}`, timestamp: `0x${(spec.blockTime ?? BLOCK_TIME).toString(16)}` };
        default:
          throw new Error(`unexpected ${method}`);
      }
    },
  };
}
const EXPECT = { txHash: HASH, from: BUYER, to: SELLER, minAmountUnits: usdt(9, 40), notBeforeMs: BLOCK_TIME * 1000 - 60_000 };
const receiptWith = (...logs: object[]) => ({ transactionHash: HASH, status: '0x1', blockNumber: `0x${BLOCK.toString(16)}`, logs });

describe('verifyUsdtTransfer: a payment that is good', () => {
  it('accepts a confirmed transfer from the official contract with the exact recipient, sender and amount', async () => {
    const r = await verifyUsdtTransfer(fakeRpc(), CFG, EXPECT);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.transfer.from).toBe(BUYER);
      expect(r.transfer.to).toBe(SELLER);
      expect(r.transfer.amountUnits).toBe(usdt(9, 40));
      expect(r.transfer.blockNumber).toBe(BLOCK);
      expect(r.transfer.blockTime).toBe(BLOCK_TIME);
      expect(r.transfer.confirmations).toBe(21);
    }
  });

  it('accepts an overpayment (the extra is the buyer\'s gift; never an error)', async () => {
    const rpc = fakeRpc({ receipt: receiptWith(log({ value: usdt(12) })) });
    const r = await verifyUsdtTransfer(rpc, CFG, EXPECT);
    expect(r.ok).toBe(true);
  });

  it('is case-insensitive for addresses and hashes, and finds the right log among several', async () => {
    const rpc = fakeRpc({ receipt: receiptWith(log({ to: OTHER }, 0), log({ emitter: FAKE_TOKEN }, 1), log({}, 2)) });
    const r = await verifyUsdtTransfer(rpc, CFG, { ...EXPECT, txHash: HASH.toUpperCase().replace('0X', '0x'), from: BUYER.toUpperCase().replace('0X', '0x'), to: SELLER.toUpperCase().replace('0X', '0x') });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.transfer.logIndex).toBe(2);
  });

  it('demands exactly the confirmations configured (14 is not enough, 15 is)', async () => {
    const short = await verifyUsdtTransfer(fakeRpc({ latest: BLOCK + 13 }), CFG, EXPECT);
    expect(short).toEqual({ ok: false, reason: 'unconfirmed', confirmations: 14 });
    const enough = await verifyUsdtTransfer(fakeRpc({ latest: BLOCK + 14 }), CFG, EXPECT);
    expect(enough.ok).toBe(true);
  });
});

describe('verifyUsdtTransfer: every way a payment is NOT good', () => {
  const reason = async (spec: ChainSpec, exp = EXPECT, cfg = CFG) => {
    const r = await verifyUsdtTransfer(fakeRpc(spec), cfg, exp);
    return r.ok ? 'ok' : r.reason;
  };

  it('wrong contract: a transfer of another token with the right numbers is refused', async () => {
    expect(await reason({ receipt: receiptWith(log({ emitter: FAKE_TOKEN })) })).toBe('wrong_contract');
  });

  it('no transfer at all in the receipt', async () => {
    expect(await reason({ receipt: receiptWith() })).toBe('no_transfer');
    expect(await reason({ receipt: receiptWith({ address: CFG.usdtContract, topics: ['0x' + '00'.repeat(32)], data: '0x' }) })).toBe('no_transfer');
  });

  it('a Transfer of an NFT-style event (4 topics) or malformed data is not a token amount', async () => {
    const nft = log({ topics: [TRANSFER_TOPIC, pad(BUYER), pad(SELLER), word(7n)], data: '0x' });
    expect(await reason({ receipt: receiptWith(nft) })).toBe('no_transfer');
    expect(await reason({ receipt: receiptWith(log({ data: '0x01' })) })).toBe('no_transfer');
  });

  it('a removed (reorged-out) log does not count', async () => {
    expect(await reason({ receipt: receiptWith(log({ removed: true })) })).toBe('no_transfer');
  });

  it('wrong recipient', async () => {
    expect(await reason({ receipt: receiptWith(log({ to: OTHER })) })).toBe('wrong_recipient');
  });

  it('short amount: one unit short is refused, and two small transfers are not added together', async () => {
    expect(await reason({ receipt: receiptWith(log({ value: usdt(9, 40) - 1n })) })).toBe('short_amount');
    expect(await reason({ receipt: receiptWith(log({ value: usdt(5) }, 0), log({ value: usdt(5) }, 1)) })).toBe('short_amount');
  });

  it('wrong sender: a payment made from an address that is not the buyer\'s linked one', async () => {
    expect(await reason({ receipt: receiptWith(log({ from: OTHER })) })).toBe('wrong_sender');
  });

  it('unconfirmed: fewer confirmations than required', async () => {
    expect(await reason({ latest: BLOCK })).toBe('unconfirmed');
  });

  it('before the reservation: a payment mined before the reservation started', async () => {
    expect(await reason({ blockTime: BLOCK_TIME - 1 }, { ...EXPECT, notBeforeMs: BLOCK_TIME * 1000 })).toBe('too_early');
    expect(await reason({ blockTime: BLOCK_TIME }, { ...EXPECT, notBeforeMs: BLOCK_TIME * 1000 })).toBe('ok');
  });

  it('a reverted transaction, an unknown hash, a malformed hash', async () => {
    expect(await reason({ receipt: { ...receiptWith(log()), status: '0x0' } })).toBe('tx_failed');
    expect(await reason({ receipt: null })).toBe('not_found');
    expect(await reason({}, { ...EXPECT, txHash: '0x1234' })).toBe('bad_hash');
    expect(await reason({}, { ...EXPECT, txHash: `0x${'zz'.repeat(32)}` })).toBe('bad_hash');
  });

  it('a node that answers the receipt of ANOTHER transaction is not trusted', async () => {
    expect(await reason({ receipt: { ...receiptWith(log()), transactionHash: `0x${'cd'.repeat(32)}` } })).toBe('rpc_error');
  });

  it('the node is on another network (a testnet node pointed at a mainnet config)', async () => {
    expect(await reason({ chainId: 97 })).toBe('wrong_network');
  });

  it('an unreachable node or a garbled block is "rpc_error" (retry later: nothing is consumed), never an acceptance', async () => {
    expect(await reason({ failOn: 'eth_getTransactionReceipt' })).toBe('rpc_error');
    expect(await reason({ failOn: 'eth_blockNumber' })).toBe('rpc_error');
    expect(await reason({ blockTime: null })).toBe('rpc_error');
  });

  it('asks the node the cheap questions first (a bad hash costs no call, an unconfirmed one never fetches the block)', async () => {
    const calls: string[] = [];
    await verifyUsdtTransfer(fakeRpc({}, calls), CFG, { ...EXPECT, txHash: 'nope' });
    expect(calls).toEqual([]);
    const calls2: string[] = [];
    await verifyUsdtTransfer(fakeRpc({ latest: BLOCK }, calls2), CFG, EXPECT);
    expect(calls2).not.toContain('eth_getBlockByNumber');
  });
});

describe('the JSON-RPC client', () => {
  it('posts a JSON-RPC 2.0 body, returns the result, and never puts the URL in an error', async () => {
    const seen: { url: string; body: unknown }[] = [];
    const fetchFn = (async (url: string, init: { body: string }) => {
      seen.push({ url, body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: '0x38' }), { status: 200 });
    }) as unknown as typeof fetch;
    const rpc = createJsonRpc('https://node.example/SECRET-KEY', { fetchFn });
    expect(await rpc.call('eth_chainId', [])).toBe('0x38');
    expect(seen[0].body).toMatchObject({ jsonrpc: '2.0', method: 'eth_chainId', params: [] });
    const failing = createJsonRpc('https://node.example/SECRET-KEY', { fetchFn: (async () => new Response('x', { status: 503 })) as unknown as typeof fetch });
    await expect(failing.call('eth_chainId', [])).rejects.toThrow('rpc_http_503');
    await expect(failing.call('eth_chainId', [])).rejects.not.toThrow(/SECRET/);
    const errored = createJsonRpc('https://node.example/x', { fetchFn: (async () => new Response(JSON.stringify({ error: { code: -32000, message: 'secret detail' } }), { status: 200 })) as unknown as typeof fetch });
    await expect(errored.call('eth_chainId', [])).rejects.toThrow('rpc_error');
  });
});

describe('the chain configuration (secrets by name)', () => {
  it('defaults to BSC mainnet, 15 confirmations and the official USDT address, livemode true', () => {
    const r = loadChainConfig({ BSC_RPC_URL: 'https://node.example/key' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.config).toEqual({ chainId: 56, usdtContract: BSC_USDT_CONTRACT_MAINNET, minConfirmations: 15, livemode: true });
      expect(r.rpcUrl).toBe('https://node.example/key');
    }
  });

  it('the USDT address lives in ONE constant: the official BSC-USD token, and the code points the owner at bscscan', async () => {
    expect(BSC_USDT_CONTRACT_MAINNET).toBe('0x55d398326f99059ff775485246999027b3197955');
    const { readFileSync } = await import('node:fs');
    const text = readFileSync(new URL('../chain/config.ts', import.meta.url), 'utf8');
    expect(text.match(/0x55d398326f99059/gi)).toHaveLength(1);
    expect(text).toMatch(/DOUBLE-CHECK THIS ADDRESS ON BSCSCAN/);
  });

  it('a testnet (chain 97) is livemode false and REQUIRES its own token address', () => {
    expect(loadChainConfig({ BSC_RPC_URL: 'https://t.example', BSC_CHAIN_ID: '97' })).toEqual({ ok: false, reason: 'contract_missing' });
    const r = loadChainConfig({ BSC_RPC_URL: 'https://t.example', BSC_CHAIN_ID: '97', BSC_USDT_CONTRACT: FAKE_TOKEN.toUpperCase().replace('0X', '0x') });
    expect(r.ok && r.config).toEqual({ chainId: BSC_TESTNET_CHAIN_ID, usdtContract: FAKE_TOKEN, minConfirmations: 15, livemode: false });
  });

  it('fails closed: no RPC, a plain-http RPC, an unknown chain, a bad token address', () => {
    expect(loadChainConfig({})).toEqual({ ok: false, reason: 'rpc_missing' });
    expect(loadChainConfig({ BSC_RPC_URL: 'http://insecure.example' })).toEqual({ ok: false, reason: 'rpc_missing' });
    expect(loadChainConfig({ BSC_RPC_URL: 'https://x.example', BSC_CHAIN_ID: '1' })).toEqual({ ok: false, reason: 'chain_unsupported' });
    expect(loadChainConfig({ BSC_RPC_URL: 'https://x.example', BSC_USDT_CONTRACT: '0x123' })).toEqual({ ok: false, reason: 'contract_invalid' });
  });

  it('the confirmations come from BSC_MIN_CONFIRMATIONS, and nonsense falls back to the default', () => {
    const c = (v: string) => {
      const r = loadChainConfig({ BSC_RPC_URL: 'https://x.example', BSC_MIN_CONFIRMATIONS: v });
      return r.ok ? r.config.minConfirmations : -1;
    };
    expect(c('30')).toBe(30);
    expect(c('0')).toBe(15);
    expect(c('abc')).toBe(15);
    expect(c('100000')).toBe(15);
    expect(BSC_MAINNET_CHAIN_ID).toBe(56);
  });

  it('cleanAddress accepts a 20 byte hex address, lowercases it and refuses the zero address', () => {
    expect(cleanAddress(' 0xAbCdEf0123456789aBcDeF0123456789AbCdEf01 ')).toBe('0xabcdef0123456789abcdef0123456789abcdef01');
    expect(cleanAddress('0x0000000000000000000000000000000000000000')).toBeNull();
    expect(cleanAddress('0x12')).toBeNull();
    expect(cleanAddress(undefined)).toBeNull();
  });
});

describe('the money: whole cents, the 5% fee rounded up, the two parts always add up to the price', () => {
  it('splits every price in range exactly, with the fee never below 5%', () => {
    for (let cents = MARKET_MIN_PRICE_CENTS; cents <= MARKET_MAX_PRICE_CENTS; cents += cents < 2000 ? 1 : 37) {
      const s = splitPrice(cents);
      expect(s.feeCents + s.sellerCents).toBe(cents);
      expect(s.feeCents * 100).toBeGreaterThanOrEqual(cents * 5);
      expect(s.feeCents * 100).toBeLessThan(cents * 5 + 100);
      expect(s.sellerCents).toBeGreaterThan(0);
    }
  });

  it('known values', () => {
    expect(splitPrice(1000)).toEqual({ priceCents: 1000, feeCents: 50, sellerCents: 950 });
    expect(splitPrice(50)).toEqual({ priceCents: 50, feeCents: 3, sellerCents: 47 }); // 2.5 cents of fee rounds UP
    expect(splitPrice(199)).toEqual({ priceCents: 199, feeCents: 10, sellerCents: 189 });
  });

  it('18 decimals: one cent is 10^16 base units', () => {
    expect(centsToUnits(1)).toBe(10n ** 16n);
    expect(centsToUnits(1000)).toBe(10n * 10n ** 18n);
  });

  it('parses and prints amounts', () => {
    expect(parseUsdtAmount('10.00')).toBe(1000);
    expect(parseUsdtAmount('10')).toBe(1000);
    expect(parseUsdtAmount('0.5')).toBe(50);
    expect(parseUsdtAmount('10.005')).toBeNull();
    expect(parseUsdtAmount('-1')).toBeNull();
    expect(parseUsdtAmount('1e3')).toBeNull();
    expect(parseUsdtAmount(undefined)).toBeNull();
    expect(formatUsdt(1000)).toBe('10.00');
    expect(formatUsdt(5)).toBe('0.05');
  });

  it('the price bounds', () => {
    expect(isPriceCents(49)).toBe(false);
    expect(isPriceCents(50)).toBe(true);
    expect(isPriceCents(MARKET_MAX_PRICE_CENTS)).toBe(true);
    expect(isPriceCents(MARKET_MAX_PRICE_CENTS + 1)).toBe(false);
    expect(isPriceCents(10.5)).toBe(false);
    expect(isPriceCents('100')).toBe(false);
  });
});

describe('USDT.transfer calldata (what the wallet is asked to sign)', () => {
  it('selector a9059cbb, the recipient and the amount in 32 byte words', () => {
    const data = encodeTransferCall(SELLER, usdt(9, 40));
    expect(data.startsWith('0xa9059cbb')).toBe(true);
    expect(data).toHaveLength(2 + 8 + 64 + 64);
    expect(data.slice(10, 74)).toBe(SELLER.slice(2).padStart(64, '0'));
    expect(BigInt(`0x${data.slice(74)}`)).toBe(usdt(9, 40));
  });
  it('the selector really is keccak("transfer(address,uint256)")[0:4]', () => {
    const sel = Array.from(keccak_256(new TextEncoder().encode('transfer(address,uint256)')).slice(0, 4), (b) => b.toString(16).padStart(2, '0')).join('');
    expect(sel).toBe('a9059cbb');
    const topic = Array.from(keccak_256(new TextEncoder().encode('Transfer(address,address,uint256)')), (b) => b.toString(16).padStart(2, '0')).join('');
    expect(`0x${topic}`).toBe(TRANSFER_TOPIC);
  });
  it('refuses a malformed address', () => {
    expect(() => encodeTransferCall('0x12', 1n)).toThrow();
  });
  it('normalizeTxHash', () => {
    expect(normalizeTxHash(HASH.toUpperCase().replace('0X', '0x'))).toBe(HASH);
    expect(normalizeTxHash('0x12')).toBeNull();
    expect(normalizeTxHash(5)).toBeNull();
  });
});

// ---- wallet ownership ---------------------------------------------------------------------------------------------------------------------------------------------

// A throwaway key made in memory for each test run (never written anywhere, never a real wallet): it only exists to produce signatures to check.
function throwawayWallet() {
  const priv = secp256k1.utils.randomPrivateKey();
  const pub = secp256k1.getPublicKey(priv, false);
  const address = `0x${Array.from(keccak_256(pub.slice(1)).slice(12), (b) => b.toString(16).padStart(2, '0')).join('')}`;
  // an independent construction of the EIP-191 hash, so a mistake in personalMessageHash cannot cancel itself out
  const sign = (message: string): string => {
    const body = new TextEncoder().encode(message);
    const prefix = new TextEncoder().encode(`\u0019Ethereum Signed Message:\n${body.length}`);
    const joined = new Uint8Array(prefix.length + body.length);
    joined.set(prefix);
    joined.set(body, prefix.length);
    const sig = secp256k1.sign(keccak_256(joined), priv);
    return `0x${sig.toCompactHex()}${(27 + sig.recovery).toString(16)}`;
  };
  return { address, sign };
}

const USER = '9d0d1c6a-7a53-4d9e-9a3a-0a4f9d9d0001';

describe('wallet ownership (EIP-191 personal_sign, recovered on the server)', () => {
  const parts = (address: string, nonce = 'n-0001') => ({ userId: USER, address, nonce, issuedAtIso: '2026-11-02T12:00:00.000Z', chainId: 56 });

  it('a valid signature recovers the signer and verifies', () => {
    const w = throwawayWallet();
    const message = linkMessage(parts(w.address));
    const sig = w.sign(message);
    expect(recoverPersonalSigner(message, sig)).toBe(w.address);
    expect(verifyPersonalSignature(message, sig, w.address)).toBe(true);
    expect(verifyPersonalSignature(message, sig, w.address.toUpperCase().replace('0X', '0x'))).toBe(true);
  });

  it('accepts wallets that answer v as 0/1 instead of 27/28', () => {
    const w = throwawayWallet();
    const message = linkMessage(parts(w.address));
    const sig = w.sign(message);
    const v = parseInt(sig.slice(130), 16) - 27;
    expect(verifyPersonalSignature(message, `${sig.slice(0, 130)}${v.toString(16).padStart(2, '0')}`, w.address)).toBe(true);
  });

  it('a signature of the right message by ANOTHER wallet does not prove the claimed address', () => {
    const owner = throwawayWallet();
    const thief = throwawayWallet();
    const message = linkMessage(parts(owner.address));
    expect(verifyPersonalSignature(message, thief.sign(message), owner.address)).toBe(false);
  });

  it('a signature of a different message (another nonce, another account, another address) does not verify', () => {
    const w = throwawayWallet();
    const sig = w.sign(linkMessage(parts(w.address, 'n-0001')));
    expect(verifyPersonalSignature(linkMessage(parts(w.address, 'n-0002')), sig, w.address)).toBe(false); // a replayed signature against a new nonce
    expect(verifyPersonalSignature(linkMessage({ ...parts(w.address), userId: '9d0d1c6a-7a53-4d9e-9a3a-0a4f9d9d0002' }), sig, w.address)).toBe(false);
    expect(verifyPersonalSignature(linkMessage({ ...parts(w.address), chainId: 97 }), sig, w.address)).toBe(false);
  });

  it('refuses malformed signatures and addresses without throwing', () => {
    const w = throwawayWallet();
    const message = linkMessage(parts(w.address));
    expect(recoverPersonalSigner(message, '0x1234')).toBeNull();
    expect(recoverPersonalSigner(message, `0x${'00'.repeat(65)}`)).toBeNull();
    expect(recoverPersonalSigner(message, `0x${'11'.repeat(64)}05`)).toBeNull();
    expect(verifyPersonalSignature(message, w.sign(message), 'not-an-address')).toBe(false);
    expect(verifyPersonalSignature(message, w.sign(message), '0x0000000000000000000000000000000000000000')).toBe(false);
  });

  it('the message names the account, the address, the nonce and the chain, and says it costs nothing', () => {
    const m = linkMessage(parts('0x' + 'ab'.repeat(20), 'abc123'));
    expect(m).toContain(`Account: ${USER}`);
    expect(m).toContain(`Address: 0x${'ab'.repeat(20)}`);
    expect(m).toContain('Nonce: abc123');
    expect(m).toContain('Chain: 56');
    expect(m).toMatch(/sends no transaction/);
    expect(m).not.toMatch(/private key|seed|recovery phrase/i);
  });

  it('hashes with the EIP-191 prefix over the BYTE length (multi-byte text)', () => {
    const a = personalMessageHash('olá');
    const body = new TextEncoder().encode('olá');
    expect(body.length).toBe(4);
    const manual = keccak_256(new TextEncoder().encode(`\u0019Ethereum Signed Message:\n4olá`));
    expect(Array.from(a)).toEqual(Array.from(manual));
  });
});
