import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EDGE_ENV_NAMES } from '../env.ts';

// The wiring of the market Edge Functions: which handler each one runs, which secrets exist (by NAME), that the signature library is only in the one function that needs it and pinned to the
// version the tests run, and that nothing logs a secret, the RPC url, a header or a body.

const root = resolve(__dirname, '../../../..');
const read = (p: string): string => readFileSync(resolve(root, p), 'utf8');
const walk = (dir: string): string[] =>
  readdirSync(resolve(root, dir)).flatMap((n) => {
    const rel = `${dir}/${n}`;
    return statSync(resolve(root, rel)).isDirectory() ? walk(rel) : [rel];
  });

const FUNCTIONS: Record<string, { handler: string; module: string }> = {
  'market-wallet': { handler: 'handleMarketWallet', module: 'walletHandler' },
  'market-list': { handler: 'handleMarketList', module: 'handler' },
  'market-buy': { handler: 'handleMarketBuy', module: 'handler' },
  'market-my': { handler: 'handleMarketMy', module: 'handler' },
};

describe('the market functions', () => {
  it.each(Object.entries(FUNCTIONS))('%s runs its own handler, with the JWT check left ON and the secrets read by name only', (name, { handler, module }) => {
    const src = read(`supabase/functions/${name}/index.ts`);
    expect(src).toContain(`import { ${handler} } from '../_shared/market/${module}.ts';`);
    expect(src).toContain('Deploy with JWT verification ON');
    expect(src).toContain('createMarketStore(');
    expect(src).toContain('loadMarketChain(env)');
    expect(src).not.toMatch(/Deno\.env/); // only _shared/env.ts reads the environment
    expect(src).not.toMatch(/https?:\/\/[a-z0-9.-]+\.[a-z]{2,}\//i); // no url, no key, in the entry point
  });

  it('pass-crypto is wired the same way', () => {
    const src = read('supabase/functions/pass-crypto/index.ts');
    expect(src).toContain('handlePassCrypto(req');
    expect(src).toContain('createPassCryptoStore(');
    expect(src).toContain('loadPassCrypto(env)');
    expect(src).toContain('Deploy with JWT verification ON');
    expect(src).not.toMatch(/Deno\.env/);
  });

  it('the secrets are read by NAME in one place, and the new names are all there', () => {
    for (const name of ['BSC_RPC_URL', 'BSC_CHAIN_ID', 'BSC_MIN_CONFIRMATIONS', 'BSC_USDT_CONTRACT', 'MARKET_FEE_ADDRESS', 'PASS_RECEIVE_ADDRESS', 'PASS_PRICE_USDT', 'APP_ORIGIN']) expect(EDGE_ENV_NAMES).toContain(name);
    const offenders = walk('supabase/functions').filter((f) => f.endsWith('.ts') && !f.includes('__tests__') && read(f).includes('Deno.env'));
    expect(offenders).toEqual(['supabase/functions/_shared/env.ts']);
  });

  it('only market-wallet imports the signature library, and its import map pins the versions the tests run', () => {
    const code = (f: string): string => read(f).replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    const importers = walk('supabase/functions').filter((f) => f.endsWith('.ts') && !f.includes('__tests__') && /from '@noble\//.test(code(f)));
    expect(importers).toEqual(['supabase/functions/_shared/chain/wallet.ts']);
    // wallet.ts is reached ONLY from walletHandler.ts, which only market-wallet imports
    const reachers = walk('supabase/functions').filter((f) => f.endsWith('.ts') && !f.includes('__tests__') && /chain\/wallet\.ts'/.test(read(f)));
    expect(reachers).toEqual(['supabase/functions/_shared/market/walletHandler.ts']);
    const users = walk('supabase/functions').filter((f) => f.endsWith('.ts') && !f.includes('__tests__') && /market\/walletHandler\.ts'/.test(read(f)));
    expect(users).toEqual(['supabase/functions/market-wallet/index.ts']);
    expect(existsSync(resolve(root, 'supabase/functions/market-wallet/deno.json'))).toBe(true);
    for (const other of ['market-list', 'market-buy', 'market-my', 'pass-crypto']) expect(existsSync(resolve(root, `supabase/functions/${other}/deno.json`))).toBe(false);
    const map = (JSON.parse(read('supabase/functions/market-wallet/deno.json')) as { imports: Record<string, string> }).imports;
    const pkg = JSON.parse(read('package.json')) as { devDependencies: Record<string, string> };
    expect(map['@noble/curves/secp256k1']).toBe(`npm:@noble/curves@${pkg.devDependencies['@noble/curves']}/secp256k1`);
    expect(map['@noble/hashes/sha3']).toBe(`npm:@noble/hashes@${pkg.devDependencies['@noble/hashes']}/sha3`);
    expect(pkg.devDependencies['@noble/curves']).toMatch(/^\d+\.\d+\.\d+$/); // exact, not a range
    expect(pkg.devDependencies['@noble/hashes']).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('the game bundle does not import the signature library (the wallet signs, the server checks)', () => {
    const offenders = walk('src').filter((f) => /\.(ts|tsx)$/.test(f) && !f.includes('__tests__') && /@noble\//.test(read(f)));
    expect(offenders).toEqual([]);
  });

  it('nothing in the market or chain code logs more than a short code or an error message (no url, key, header, body or secret)', () => {
    const files = [...walk('supabase/functions/_shared/market'), ...walk('supabase/functions/_shared/chain')].filter((f) => f.endsWith('.ts'));
    for (const f of files) {
      for (const m of read(f).matchAll(/console\.(log|warn|error|info|debug)\(([^;]*)\);/g)) {
        expect(m[1], `${f}: ${m[0]}`).toBe('error');
        expect(m[2], `${f}: ${m[0]}`).toMatch(/err instanceof Error \? err\.message : 'unknown'/);
        expect(m[2], f).not.toMatch(/rpcUrl|serviceRole|authorization|headers|body\b|env\./);
      }
    }
  });

  it('the RPC client never puts its url in an error', () => {
    const src = read('supabase/functions/_shared/chain/bsc.ts');
    expect(src).toContain("throw new Error(`rpc_http_${res.status}`)");
    expect(src).not.toMatch(/Error\([^)]*\burl\b/);
  });

  it('there is no private key, seed or signing capability anywhere on the server: only recovery and reading', () => {
    for (const f of [...walk('supabase/functions/_shared/market'), ...walk('supabase/functions/_shared/chain')].filter((x) => x.endsWith('.ts'))) {
      const code = read(f)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
        .replace(/'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`|"(?:[^"\\\n]|\\.)*"/g, '""');
      expect(code, f).not.toMatch(/privateKey|mnemonic|seedPhrase|\.sign\(|signTransaction|eth_sendRawTransaction|eth_sendTransaction|eth_sign\b|personal_sign/i);
    }
  });
});
