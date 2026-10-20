import { MarketApi, MarketUnreachable, PassPlan } from './api';
import type { PayFailure } from './payFlow';
import { buildUsdcTransferTx } from './solTx';
import { WalletError, assertOpenAccount, connectSolWallet } from './wallet';

// Paying the Adventurer Pass in USDC from the player's wallet: the SERVER hands over a fresh blockhash, the transaction is built here from the plan's own amounts and token accounts, and the wallet signs
// and sends it after the player approves on its own screen. Before anything is built the account that is open in the wallet RIGHT NOW must be the linked one.

export type PassPayResult = { ok: true; signature: string } | { ok: false; failure: PayFailure; open?: string };

export async function payPassFromWallet(api: MarketApi, plan: PassPlan): Promise<PassPayResult> {
  try {
    const session = await connectSolWallet(undefined, plan.buyerAddress);
    const prepared = await api.passPrepare();
    if ('reason' in prepared) return { ok: false, failure: 'blockhash' };
    const tx = buildUsdcTransferTx({
      payer: plan.buyerAddress,
      blockhash: prepared.blockhash,
      sourceTokenAccount: plan.buyerTokenAccount,
      destinationTokenAccount: plan.receiverTokenAccount,
      mint: plan.chain.usdcMint,
      units: plan.priceUnits,
      decimals: plan.decimals,
    });
    // the player may have switched account in the wallet since connecting: never send from an account that is not the linked one
    assertOpenAccount(session, plan.buyerAddress);
    const signature = await session.signAndSend(tx, plan.chain.cluster);
    return { ok: true, signature };
  } catch (err) {
    if (err instanceof MarketUnreachable) return { ok: false, failure: 'unreachable' };
    if (err instanceof WalletError) {
      const failure = err.kind === 'no_provider' ? 'noProvider' : err.kind === 'rejected' ? 'rejected' : err.kind === 'wrong_account' ? 'wrongAccount' : err.kind === 'unsupported' ? 'unsupported' : 'failed';
      return { ok: false, failure, ...(err.open ? { open: err.open } : {}) };
    }
    return { ok: false, failure: 'failed' };
  }
}
