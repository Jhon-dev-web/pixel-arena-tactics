// The only thing the auditor and the watchdog know about "the AI": a function from a prompt to text. The real one (anthropicModel.ts) calls the Anthropic Messages API; the tests pass a FAKE that returns canned
// text, so no test, and no build, ever contacts the API or needs a key.

export interface ModelRequest {
  kind: 'hourly' | 'daily' | 'incident';
  model: string;
  system: string;
  user: string;
  maxTokens: number;
  effort: 'low' | 'medium' | 'high';
  /** A JSON schema for structured output. Absent = free text (the incident paragraph). */
  schema?: Record<string, unknown>;
  /** Ask the API to retry on a substitute model if this one declines for a safety reason (daily review only). */
  fallbacks?: boolean;
}

export interface ModelResponse {
  text: string;
  /** end_turn | max_tokens | refusal | ... as the API says. Anything but end_turn makes the answer untrustworthy and it is discarded. */
  stopReason: string | null;
  usage: { inputTokens: number; outputTokens: number };
  /** The model that actually answered. */
  model: string;
}

export type ModelErrorKind = 'auth' | 'rate_limit' | 'bad_request' | 'server' | 'timeout' | 'network' | 'unknown';

/** A failure of the model call. Carries a kind and a status only: never the request, the key or the raw body. */
export class ModelError extends Error {
  constructor(
    public readonly kind: ModelErrorKind,
    public readonly status: number | null = null,
  ) {
    super(`model_${kind}${status ? `_${status}` : ''}`);
    this.name = 'ModelError';
  }
}

export interface ModelClient {
  complete(req: ModelRequest): Promise<ModelResponse>;
}
