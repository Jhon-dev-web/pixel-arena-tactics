import { MarketApi, MarketUnreachable } from './api';
import * as walletLib from './wallet';

// Linking a wallet to the account: the player's own wallet (Phantom, Solflare) signs a message the SERVER wrote (market-wallet) with its signMessage. Nothing secret is asked or sent: the wallet shows
// the text, he approves, a signature comes back. One address per account; changing it is the same flow with a new signature.

export type LinkFailure = 'noProvider' | 'rejected' | 'wrongAccount' | 'taken' | 'busy' | 'badSignature' | 'nonceInvalid' | 'rateLimited' | 'unreachable' | 'failed';
export type LinkResult = { ok: true; address: string } | { ok: false; failure: LinkFailure };

export interface WalletPort {
  /** asks the wallet (by name, when the player picked one) for the account */
  connect: (preferred?: string) => Promise<{ address: string; signMessage: (message: string) => Promise<string> }>;
}

export const browserWallet: WalletPort = {
  connect: (preferred) => walletLib.connectSolWallet(preferred),
};

const REASON: Record<string, LinkFailure> = { address_taken: 'taken', busy: 'busy', bad_signature: 'badSignature', nonce_invalid: 'nonceInvalid', rate_limited: 'rateLimited' };

export async function runLinkFlow(api: MarketApi, preferred?: string, port: WalletPort = browserWallet, onStep?: (step: 'connecting' | 'signing') => void): Promise<LinkResult> {
  try {
    onStep?.('connecting');
    const session = await port.connect(preferred);
    const nonce = await api.walletNonce(session.address);
    if ('reason' in nonce) return { ok: false, failure: REASON[nonce.reason] ?? 'failed' };
    onStep?.('signing');
    const signature = await session.signMessage(nonce.message);
    const linked = await api.walletLink(session.address, nonce.nonce, signature);
    if ('reason' in linked) return { ok: false, failure: REASON[linked.reason] ?? 'failed' };
    return { ok: true, address: linked.wallet.address };
  } catch (err) {
    if (err instanceof MarketUnreachable) return { ok: false, failure: 'unreachable' };
    if (err instanceof walletLib.WalletError) return { ok: false, failure: err.kind === 'no_provider' ? 'noProvider' : err.kind === 'rejected' ? 'rejected' : err.kind === 'wrong_account' ? 'wrongAccount' : 'failed' };
    return { ok: false, failure: 'failed' };
  }
}
