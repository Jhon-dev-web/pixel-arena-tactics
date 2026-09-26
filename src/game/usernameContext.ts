import { createContext, useContext } from 'react';

// The account's permanent username (profiles.username), provided by GameShell. null in local-only mode
// (no backend), where the legacy heroName is shown instead.
export const UsernameContext = createContext<string | null>(null);

export function useDisplayName(fallback: string): string {
  return useContext(UsernameContext) ?? fallback;
}
