import { json } from './http.ts';
import { PaymentProvider, ProviderEvent, Store, WebhookRejected } from './types.ts';

const MAX_BODY_CHARS = 512 * 1024;

export interface WebhookDeps {
  provider: PaymentProvider;
  store: Store;
  nowMs: () => number;
}

/**
 * A payment provider's webhook route. Order matters: (1) read the RAW body, (2) verify the signature and freshness, (3) record the event id
 * (a replay stops here), (4) apply it with the service role, (5) mark the event done. A store failure answers 500 so the provider retries; the
 * retry finds the event recorded but unprocessed and applies it again, which is safe because every write is idempotent.
 * Nothing here logs a secret, a header or a payload: only the event id, the event type and the result.
 */
export async function handleWebhook(req: Request, deps: WebhookDeps): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const raw = await req.text();
  if (raw.length === 0 || raw.length > MAX_BODY_CHARS) return json({ error: 'bad_payload' }, 400);

  let event: ProviderEvent;
  try {
    event = await deps.provider.parseWebhook(raw, req.headers, deps.nowMs());
  } catch (err) {
    if (err instanceof WebhookRejected) {
      console.warn(`[${deps.provider.name}-webhook] rejected: ${err.reason}`);
      return json({ error: err.reason }, 400);
    }
    console.error(`[${deps.provider.name}-webhook] verification failed`);
    return json({ error: 'verification_failed' }, 400);
  }

  const provider = deps.provider.name;
  try {
    const recorded = await deps.store.recordPaymentEvent(provider, event.eventId, event.summary);
    if (!recorded.isNew && recorded.processed) return json({ ok: true, duplicate: true });

    let result: string;
    const action = event.action;
    if (action.type === 'grant') {
      const r = await deps.store.insertEntitlement({ userId: action.userId, kind: action.kind, source: provider, providerRef: action.providerRef, livemode: action.livemode });
      if (action.sessionId) await deps.store.completeCheckoutSession(action.sessionId); // never offer a paid session again
      if (r === 'inserted') result = 'granted';
      else if (r === 'duplicate_ref') result = 'already_active';
      else {
        // A SECOND, different payment by a user who already owns the Pass: refund it in full, automatically. The idempotency key is this event id, so Stripe's retries of the
        // webhook (or ours) can never refund twice. A refund that fails answers 500 (below), Stripe delivers again and the same key makes it safe to try again.
        await deps.provider.refundPayment(action.providerRef, event.eventId);
        result = 'duplicate_refunded';
      }
    } else if (action.type === 'reverse') {
      const changed = await deps.store.markReversed(provider, action.providerRef, action.reason);
      result = changed > 0 ? (action.reason === 'dispute' ? 'revoked' : 'reversed') : 'unmatched';
    } else if (action.type === 'restore') {
      const r = await deps.store.restoreRevoked(provider, action.providerRef);
      result = r === 'restored' ? 'restored' : r === 'blocked' ? 'restore_blocked_already_active' : 'unmatched';
    } else {
      result = `ignored:${action.reason}`;
    }

    await deps.store.finishPaymentEvent(provider, event.eventId, result);
    console.log(`[${provider}-webhook] ${event.eventId} ${String(event.summary.type ?? '')} -> ${result}`);
    return json({ ok: true, result });
  } catch (err) {
    console.error(`[${provider}-webhook] processing failed for ${event.eventId}`, err instanceof Error ? err.message : 'unknown');
    return json({ error: 'processing_failed' }, 500);
  }
}
