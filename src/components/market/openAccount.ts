import { useEffect, useState } from 'react';
import { watchOpenAccount } from '../../game/market/wallet';
import { mt } from '../../locales/market';
import { shortAddress } from './format';

/** The account that is open in the player's wallet (null: none shared with this page yet) and the wallet's name. It follows the wallet's own account-change event and never asks for approval. */
export function useOpenAccount(enabled: boolean): { open: string | null; walletName: string } {
  const [state, setState] = useState<{ open: string | null; walletName: string }>({ open: null, walletName: 'Phantom' });
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    let stop: () => void = () => undefined;
    void watchOpenAccount((address, name) => {
      if (alive) setState({ open: address, walletName: name ?? 'Phantom' });
    })
      .then((off) => {
        if (alive) stop = off;
        else off();
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      stop();
    };
  }, [enabled]);
  return state;
}

/** The text for a payment refused because the open account is not the linked one. */
export function mismatchText(linked: string, open: string | undefined, walletName = 'Phantom'): string {
  return open ? mt('wallet.mismatch', { linked: shortAddress(linked), open: shortAddress(open), wallet: walletName }) : mt('pay.wrongAccount');
}
