import { mt } from '../../locales/market';
import { Button } from '../ui';
import { shortAddress } from './format';

/**
 * "The linked wallet (...) is not the account open in Phantom (...): link this one?". Shown only when both are known and differ, so a payment is never silently made from the wrong account.
 * `onRelink` runs the link flow; without it (a reservation is open and the server refuses to change the wallet meanwhile) the text says how to get out instead.
 */
export function AccountMismatch({ linked, open, walletName, onRelink, busy = false, locked = false }: { linked: string | null; open: string | null; walletName: string; onRelink?: () => void; busy?: boolean; locked?: boolean }) {
  if (!linked || !open || linked === open) return null;
  return (
    <div className="ui-alert bad" role="alert" data-testid="account-mismatch">
      <p>{mt('wallet.mismatch', { linked: shortAddress(linked), open: shortAddress(open), wallet: walletName })}</p>
      {locked ? (
        <p className="ui-note">{mt('wallet.mismatchLocked')}</p>
      ) : (
        onRelink && (
          <Button size="sm" variant="primary" disabled={busy} onClick={onRelink}>
            {mt('wallet.relinkThis')}
          </Button>
        )
      )}
    </div>
  );
}
