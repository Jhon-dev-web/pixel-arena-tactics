# Payment providers

Each provider is one file here that implements `PaymentProvider` (`../types.ts`): `createCheckout` and `parseWebhook` (verify the signature on the raw body, then map the provider's event to `grant`, `reverse` or `ignore`).

- `stripe.ts` is implemented and tested.
- Mercado Pago (Pix) is not implemented. When it is added it is a new `mercadopago.ts` next to `stripe.ts`, a new `mercadopago-webhook/index.ts` route that calls `handleWebhook` with it, and `create-checkout` choosing the provider from a request field. The `entitlements.source` check already allows `'mercadopago'`; no other file changes.
