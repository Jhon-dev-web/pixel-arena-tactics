import { BSC_MAINNET_CHAIN_ID, BSC_TESTNET_CHAIN_ID } from '../../../supabase/functions/_shared/chain/config';
import { encodeTransferCall } from '../../../supabase/functions/_shared/chain/bsc';

// The player's OWN wallet (MetaMask, Trust Wallet...) through the standard browser provider (window.ethereum, EIP-1193). The game only ASKS it to do two things: sign a short readable message
// (to prove he owns the address) and send an USDT transfer he approves on the wallet's own screen. The game NEVER asks for, receives or stores a private key or a seed phrase, and there is no
// field anywhere that could take one. No web3 library is used: five JSON-RPC methods and the transfer calldata.

export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
}

export type WalletErrorKind = 'no_provider' | 'rejected' | 'wrong_chain' | 'other';
export class WalletError extends Error {
  constructor(public readonly kind: WalletErrorKind) {
    super(`wallet_${kind}`);
    this.name = 'WalletError';
  }
}

export const getProvider = (): Eip1193Provider | null => {
  const eth = (globalThis as { ethereum?: Eip1193Provider }).ethereum;
  return eth && typeof eth.request === 'function' ? eth : null;
};

function classify(err: unknown): WalletError {
  if (err instanceof WalletError) return err;
  const code = (err as { code?: number } | null)?.code;
  return code === 4001 ? new WalletError('rejected') : new WalletError('other');
}

async function request<T>(p: Eip1193Provider, method: string, params?: unknown[]): Promise<T> {
  try {
    return (await p.request({ method, ...(params ? { params } : {}) })) as T;
  } catch (err) {
    throw classify(err);
  }
}

/** Asks the wallet to share an account (it shows its own approval). Resolves with the first address, lowercase. */
export async function connectWallet(p: Eip1193Provider | null = getProvider()): Promise<string> {
  if (!p) throw new WalletError('no_provider');
  const accounts = await request<string[]>(p, 'eth_requestAccounts');
  const first = Array.isArray(accounts) ? accounts[0] : undefined;
  if (typeof first !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(first)) throw new WalletError('other');
  return first.toLowerCase();
}

const CHAINS: Record<number, { chainName: string; rpcUrls: string[]; blockExplorerUrls: string[] }> = {
  [BSC_MAINNET_CHAIN_ID]: { chainName: 'BNB Smart Chain', rpcUrls: ['https://bsc-dataseed.binance.org/'], blockExplorerUrls: ['https://bscscan.com'] },
  [BSC_TESTNET_CHAIN_ID]: { chainName: 'BNB Smart Chain Testnet', rpcUrls: ['https://data-seed-prebsc-1-s1.bnbchain.org:8545/'], blockExplorerUrls: ['https://testnet.bscscan.com'] },
};

export const explorerTxUrl = (chainId: number, txHash: string): string => `${CHAINS[chainId]?.blockExplorerUrls[0] ?? 'https://bscscan.com'}/tx/${txHash}`;

/** Switches the wallet to the chain the server uses (adds it first when the wallet has never seen it). */
export async function ensureChain(chainId: number, p: Eip1193Provider | null = getProvider()): Promise<void> {
  if (!p) throw new WalletError('no_provider');
  const hex = `0x${chainId.toString(16)}`;
  try {
    await p.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hex }] });
  } catch (err) {
    const code = (err as { code?: number } | null)?.code;
    const meta = CHAINS[chainId];
    if (code === 4902 && meta) {
      try {
        await p.request({ method: 'wallet_addEthereumChain', params: [{ chainId: hex, chainName: meta.chainName, nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 }, rpcUrls: meta.rpcUrls, blockExplorerUrls: meta.blockExplorerUrls }] });
        return;
      } catch (err2) {
        throw classify(err2);
      }
    }
    throw code === 4001 ? new WalletError('rejected') : new WalletError('wrong_chain');
  }
}

const utf8Hex = (s: string): string => `0x${Array.from(new TextEncoder().encode(s), (b) => b.toString(16).padStart(2, '0')).join('')}`;

/** personal_sign (EIP-191) of the text the SERVER wrote. The wallet shows the text; the signature costs nothing and moves nothing. */
export async function signMessage(address: string, message: string, p: Eip1193Provider | null = getProvider()): Promise<string> {
  if (!p) throw new WalletError('no_provider');
  const sig = await request<string>(p, 'personal_sign', [utf8Hex(message), address]);
  if (typeof sig !== 'string' || !/^0x[0-9a-fA-F]{130}$/.test(sig)) throw new WalletError('other');
  return sig;
}

/** Asks the wallet to send USDT.transfer(to, units) from `from`. Resolves with the transaction hash the wallet returns once the player approved it. */
export async function sendUsdt(from: string, tokenContract: string, to: string, units: bigint, p: Eip1193Provider | null = getProvider()): Promise<string> {
  if (!p) throw new WalletError('no_provider');
  const hash = await request<string>(p, 'eth_sendTransaction', [{ from, to: tokenContract, data: encodeTransferCall(to, units), value: '0x0' }]);
  if (typeof hash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new WalletError('other');
  return hash.toLowerCase();
}
