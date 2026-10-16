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
    for (const name of ['SOLANA_RPC_URL', 'SOLANA_CLUSTER', 'SOLANA_USDC_MINT', 'MARKET_FEE_ADDRESS', 'PASS_RECEIVE_ADDRESS', 'PASS_PRICE_USDC', 'SOL_USD_PRICE_URL', 'APP_ORIGIN']) expect(EDGE_ENV_NAMES).toContain(name);
    for (const dormant of ['BSC_RPC_URL', 'BSC_CHAIN_ID', 'BSC_USDT_CONTRACT', 'PASS_PRICE_USDT']) expect(EDGE_ENV_NAMES, dormant).not.toContain(dormant); // the BNB Smart Chain code is dormant: no secret reaches it
    const offenders = walk('supabase/functions').filter((f) => f.endsWith('.ts') && !f.includes('__tests__') && read(f).includes('Deno.env'));
    expect(offenders).toEqual(['supabase/functions/_shared/env.ts']);
  });

  it('the crypto library is imported by two files only, each reached by ONE function, and the import maps pin the versions the tests run', () => {
    const code = (f: string): string => read(f).replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    const source = walk('supabase/functions').filter((f) => f.endsWith('.ts') && !f.includes('__tests__'));
    const importers = source.filter((f) => /from '@noble\//.test(code(f)));
    // chain/wallet.ts is the DORMANT BNB Smart Chain link (secp256k1): nothing reaches it
    expect(importers).toEqual(['supabase/functions/_shared/chain/ata.ts', 'supabase/functions/_shared/chain/solWallet.ts', 'supabase/functions/_shared/chain/wallet.ts']);
    expect(source.filter((f) => /chain\/wallet\.ts'/.test(read(f)))).toEqual([]);
    // solWallet.ts is reached ONLY from walletHandler.ts, which only market-wallet imports; ata.ts ONLY from passCrypto.ts, which only pass-crypto imports
    expect(source.filter((f) => /chain\/solWallet\.ts'/.test(read(f)))).toEqual(['supabase/functions/_shared/market/walletHandler.ts']);
    expect(source.filter((f) => /market\/walletHandler\.ts'/.test(read(f)))).toEqual(['supabase/functions/market-wallet/index.ts']);
    expect(source.filter((f) => /chain\/ata\.ts'/.test(read(f)))).toEqual(['supabase/functions/_shared/market/passCrypto.ts']);
    expect(source.filter((f) => /market\/passCrypto\.ts'/.test(read(f)))).toEqual(['supabase/functions/pass-crypto/index.ts']);
    for (const other of ['market-list', 'market-buy', 'market-my']) expect(existsSync(resolve(root, `supabase/functions/${other}/deno.json`))).toBe(false);
    const pkg = JSON.parse(read('package.json')) as { devDependencies: Record<string, string> };
    const curves = pkg.devDependencies['@noble/curves'];
    const hashes = pkg.devDependencies['@noble/hashes'];
    const wallet = (JSON.parse(read('supabase/functions/market-wallet/deno.json')) as { imports: Record<string, string> }).imports;
    expect(wallet).toEqual({ '@noble/curves/ed25519': `npm:@noble/curves@${curves}/ed25519` });
    const pass = (JSON.parse(read('supabase/functions/pass-crypto/deno.json')) as { imports: Record<string, string> }).imports;
    expect(pass).toEqual({ '@noble/curves/ed25519': `npm:@noble/curves@${curves}/ed25519`, '@noble/hashes/sha256': `npm:@noble/hashes@${hashes}/sha256` });
    expect(curves).toMatch(/^\d+\.\d+\.\d+$/); // exact, not a range
    expect(hashes).toMatch(/^\d+\.\d+\.\d+$/);
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
    const src = read('supabase/functions/_shared/chain/rpc.ts');
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
