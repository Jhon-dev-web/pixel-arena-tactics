import { StdWallet } from '../market/wallet';
import { throwawayWallet } from '../../../supabase/functions/_shared/__tests__/marketHarness';
import { decodeBase58 } from '../../../supabase/functions/_shared/chain/base58';

// A fake Phantom for the tests: Wallet Standard features backed by in-memory keys, behaving the way the real one does (it keeps the authorisation of the account approved first until the page disconnects).

export type Throwaway = ReturnType<typeof throwawayWallet>;
const bytes = (b58: string): Uint8Array => decodeBase58(b58) as Uint8Array;
const account = (w: Throwaway) => ({ address: w.address, publicKey: bytes(w.address), chains: ['solana:mainnet', 'solana:devnet'] as readonly string[] });

/** A wallet like Phantom: several accounts, one SELECTED. `connect()` answers with the account authorised earlier until `disconnect()` (that is the behaviour that kept the old address). */
export function fakePhantom(accounts: Throwaway[]) {
  const state = {
    selected: accounts[0],
    authorized: null as Throwaway | null,
    signed: [] as string[],
    sent: [] as Uint8Array[],
    connects: 0,
    disconnects: 0,
    listeners: [] as ((p: { accounts?: readonly ReturnType<typeof account>[] }) => void)[],
  };
  const live = () => (state.authorized ? [account(state.authorized)] : []);
  const wallet = {
    name: 'Phantom',
    chains: ['solana:mainnet', 'solana:devnet'],
    get accounts() {
      return live();
    },
    features: {
      'standard:connect': {
        connect: async () => {
          state.connects++;
          state.authorized ??= state.selected;
          return { accounts: live() };
        },
      },
      'standard:disconnect': {
        disconnect: async () => {
          state.disconnects++;
          state.authorized = null;
        },
      },
      'standard:events': {
        on: (_event: string, listener: (p: { accounts?: readonly ReturnType<typeof account>[] }) => void) => {
          state.listeners.push(listener);
          return () => {
            state.listeners = state.listeners.filter((l) => l !== listener);
          };
        },
      },
      'solana:signMessage': {
        signMessage: async (input: { account: { address: string }; message: Uint8Array }) => {
          const text = new TextDecoder().decode(input.message);
          state.signed.push(text);
          const signer = accounts.find((a) => a.address === input.account.address) as Throwaway;
          return [{ signedMessage: input.message, signature: bytes(signer.sign(text)) }];
        },
      },
      'solana:signAndSendTransaction': {
        signAndSendTransaction: async (input: { transaction: Uint8Array }) => {
          state.sent.push(input.transaction);
          return [{ signature: new Uint8Array(64).fill(7) }];
        },
      },
    },
  } as unknown as StdWallet;
  const win = new EventTarget();
  win.addEventListener('wallet-standard:app-ready', (event) => (event as CustomEvent<{ register: (...w: StdWallet[]) => void }>).detail.register(wallet));
  return {
    state,
    wallet,
    win: win as unknown as Window,
    /** the player picks another account in the extension. Phantom does not tell a page it has not been re-approved for, unless `announce` (a trusted page gets the event) */
    pick(w: Throwaway, announce = false) {
      state.selected = w;
      if (announce) {
        state.authorized = w;
        for (const l of state.listeners) l({ accounts: live() });
      }
    },
  };
}
