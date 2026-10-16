import { useState } from 'react';
import { mt } from '../../locales/market';
import type { ChainPublic } from '../../../supabase/functions/_shared/market/types';
import { Warnings } from './WalletPanel';

/** The standing notices of the market as ONE compact line under the tabs (test network, the game never asks for your key, you pay the seller directly), with "Learn more" for the full texts.
 *  The wallet-link and payment steps do not use this: they carry the full key warning (Warnings) always. */
export default function Notices({ chain }: { chain: ChainPublic | null }) {
  const [open, setOpen] = useState(false);
  const parts = [...(chain && !chain.livemode ? [mt('notices.test')] : []), mt('notices.noKey'), mt('notices.direct')];
  return (
    <div className="mk-notices">
      <p className="mk-notices-line">
        <span className={chain && !chain.livemode ? 'mk-notices-test' : undefined}>{parts.join(' · ')}</span>{' '}
        <button className="mk-link" onClick={() => setOpen(!open)} aria-expanded={open} data-ui>
          {open ? mt('notices.less') : mt('notices.more')}
        </button>
      </p>
      {open && (
        <div className="mk-notices-full">
          <Warnings chain={chain} />
          <p className="mk-note">{mt('rules.feeExplain', { pct: chain?.feePercent ?? 5 })}</p>
        </div>
      )}
    </div>
  );
}
