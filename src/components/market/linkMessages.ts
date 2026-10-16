import type { LinkFailure } from '../../game/market/linkFlow';

/** Which market text says each way linking a wallet can fail. */
export const LINK_MESSAGE_KEY: Record<LinkFailure, string> = {
  noProvider: 'wallet.noProvider',
  rejected: 'wallet.rejected',
  wrongAccount: 'wallet.wrongAccount',
  taken: 'wallet.taken',
  busy: 'wallet.busy',
  badSignature: 'wallet.badSignature',
  nonceInvalid: 'wallet.nonceInvalid',
  rateLimited: 'wallet.rateLimited',
  unreachable: 'unreachable',
  failed: 'wallet.failed',
};
