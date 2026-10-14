import { useSyncExternalStore } from 'react';
import { passEntitlementVersion, subscribePassEntitlement } from './entitlements';

/** Re-renders the caller whenever the Pass source or the server's answer changes, so every ownsAdventurerPass(save) in the tree reads the new value. */
export function usePassEntitlementVersion(): number {
  return useSyncExternalStore(subscribePassEntitlement, passEntitlementVersion, passEntitlementVersion);
}
