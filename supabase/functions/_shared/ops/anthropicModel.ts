import Anthropic from '@anthropic-ai/sdk';
import { ModelError } from './model.ts';
import type { ModelClient, ModelRequest, ModelResponse } from './model.ts';

// The real model client: the official Anthropic SDK (`@anthropic-ai/sdk`, pinned in the function folders' deno.json import maps and in the repo's devDependencies for types and tests).
//   * Structured output: output_config.format = { type: 'json_schema', schema } for the auditor; free text for the incident paragraph.
//   * Thinking: left at the model's default (adaptive; on Claude Opus 5.5 it cannot be switched off). `effort` is set explicitly because Opus 5.5 and Haiku 5.5 default to "medium": the hourly check
//     runs at "low" (a classification of a few signals), the daily review at "medium".
//   * max_tokens is a hard cap and ALSO covers the thinking tokens; the caller treats stop_reason "max_tokens" as an unusable answer.
//   * Prompt caching is deliberately not used: the system prompt is ~700 tokens, under the minimum cacheable prefix of these models, and calls are an hour apart (the 5-minute cache would never hit).
//   * Refusals: stop_reason "refusal" comes back as a normal answer; the caller then stores the deterministic report. The daily call also opts into the server-side fallback ("default") so a false
//     positive of the safety classifier still gets an answer; if the API rejects that parameter (400) the call is retried once without it.
// The key is passed in by the caller (a secret NAME read in index.ts) and goes nowhere else.

export interface AnthropicClientOptions {
  apiKey: string;
  /** For tests: a fake fetch, so the real SDK builds the request but no network is touched. */
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

interface Block {
  type: string;
  text?: string;
}

function classify(err: unknown): ModelError {
  if (err instanceof ModelError) return err;
  if (err instanceof Anthropic.APIConnectionTimeoutError) return new ModelError('timeout');
  if (err instanceof Anthropic.APIConnectionError) return new ModelError('network');
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) return new ModelError('auth', err.status ?? null);
  if (err instanceof Anthropic.RateLimitError) return new ModelError('rate_limit', 429);
  if (err instanceof Anthropic.BadRequestError) return new ModelError('bad_request', 400);
  if (err instanceof Anthropic.APIError) return new ModelError(err.status !== undefined && err.status >= 500 ? 'server' : 'unknown', err.status ?? null);
  return new ModelError('unknown');
}

export function createAnthropicModelClient(opts: AnthropicClientOptions): ModelClient {
  const client = new Anthropic({ apiKey: opts.apiKey, maxRetries: 1, timeout: opts.timeoutMs ?? 90_000, ...(opts.fetchFn ? { fetch: opts.fetchFn } : {}) });

  const buildParams = (req: ModelRequest) => ({
    model: req.model,
    max_tokens: req.maxTokens,
    system: req.system,
    messages: [{ role: 'user' as const, content: req.user }],
    output_config: { effort: req.effort, ...(req.schema ? { format: { type: 'json_schema' as const, schema: req.schema } } : {}) },
  });

  const shape = (msg: { content: readonly Block[]; stop_reason: string | null; usage: { input_tokens: number; output_tokens: number }; model: string }): ModelResponse => ({
    text: msg.content.filter((b) => b.type === 'text').map((b) => b.text ?? '').join(''),
    stopReason: msg.stop_reason,
    usage: { inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens },
    model: msg.model,
  });

  return {
    async complete(req) {
      try {
        if (req.fallbacks) {
          try {
            return shape(await client.beta.messages.create({ ...buildParams(req), betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }));
          } catch (err) {
            if (!(err instanceof Anthropic.BadRequestError)) throw err; // only a rejected parameter is retried without it
          }
        }
        return shape(await client.messages.create(buildParams(req)));
      } catch (err) {
        throw classify(err);
      }
    },
  };
}
