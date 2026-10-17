import { ACTIONS, CATEGORIES, SEVERITIES, isSeverity } from './types.ts';
import type { Category, Severity, SuggestedAction } from './types.ts';

// The structured output the model must produce. Two layers: (1) the API is asked for exactly this JSON schema (output_config.format), which constrains the decoding; (2) validateAuditorOutput below
// re-checks EVERYTHING on our side (types, enums, lengths, no extra keys), because a schema is a request and not a guarantee we may skip verifying (a truncated answer, a refusal, a model id that ignores it).
// An answer that fails validation is thrown away: the report then holds the deterministic findings only.

export const MAX_FINDINGS = 12;
export const MAX_EVIDENCE_PER_FINDING = 8;
export const MAX_SUMMARY_CHARS = 700;
export const MAX_FINDING_CHARS = 500;

/** The JSON schema sent to the API. Only constructs structured outputs support (no min/max length: those are checked in validateAuditorOutput). */
export const AUDITOR_JSON_SCHEMA = {
  type: 'object',
  properties: {
    severity: { type: 'string', enum: [...SEVERITIES] },
    summary_pt: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          category: { type: 'string', enum: [...CATEGORIES] },
          severity: { type: 'string', enum: [...SEVERITIES] },
          summary_pt: { type: 'string' },
          evidence_ids: { type: 'array', items: { type: 'string' } },
          suggested_action: { type: 'string', enum: [...ACTIONS] },
        },
        required: ['category', 'severity', 'summary_pt', 'evidence_ids', 'suggested_action'],
        additionalProperties: false,
      },
    },
  },
  required: ['severity', 'summary_pt', 'findings'],
  additionalProperties: false,
} as const;

export interface AuditorFinding {
  category: Category;
  severity: Severity;
  summary_pt: string;
  evidence_ids: string[];
  suggested_action: SuggestedAction;
}

export interface AuditorOutput {
  severity: Severity;
  summary_pt: string;
  findings: AuditorFinding[];
}

export type Validation<T> = { ok: true; value: T } | { ok: false; errors: string[] };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const inList = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === 'string' && (list as readonly string[]).includes(v);
// Control characters (except newline/tab) and bidi overrides do not belong in a report an admin reads.
// eslint-disable-next-line no-control-regex
const BAD_CHARS = new RegExp('[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\u007f\\u202a-\\u202e\\u2066-\\u2069]');

function checkKeys(o: Record<string, unknown>, allowed: readonly string[], where: string, errors: string[]): void {
  for (const k of Object.keys(o)) if (!allowed.includes(k)) errors.push(`${where}: unexpected key "${k}"`);
}

/** Parses the text of the model's answer. Anything that is not exactly one JSON object is invalid (no prose around it, no code fence). */
export function parseModelJson(text: string): Validation<unknown> {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return { ok: false, errors: ['answer is not a bare JSON object'] };
  try {
    return { ok: true, value: JSON.parse(trimmed) };
  } catch {
    return { ok: false, errors: ['answer is not valid JSON'] };
  }
}

export function validateAuditorOutput(raw: unknown): Validation<AuditorOutput> {
  const errors: string[] = [];
  if (!isObj(raw)) return { ok: false, errors: ['output is not an object'] };
  checkKeys(raw, ['severity', 'summary_pt', 'findings'], 'output', errors);
  if (!isSeverity(raw.severity)) errors.push('severity: not in the allowed list');
  if (typeof raw.summary_pt !== 'string' || raw.summary_pt.trim().length === 0) errors.push('summary_pt: missing');
  else if (raw.summary_pt.length > MAX_SUMMARY_CHARS) errors.push('summary_pt: too long');
  else if (BAD_CHARS.test(raw.summary_pt)) errors.push('summary_pt: control characters');
  if (!Array.isArray(raw.findings)) errors.push('findings: not an array');
  else if (raw.findings.length > MAX_FINDINGS) errors.push('findings: too many');

  const findings: AuditorFinding[] = [];
  if (Array.isArray(raw.findings) && raw.findings.length <= MAX_FINDINGS) {
    raw.findings.forEach((f: unknown, i: number) => {
      const where = `findings[${i}]`;
      if (!isObj(f)) {
        errors.push(`${where}: not an object`);
        return;
      }
      checkKeys(f, ['category', 'severity', 'summary_pt', 'evidence_ids', 'suggested_action'], where, errors);
      if (!inList(CATEGORIES, f.category)) errors.push(`${where}.category: not in the allowed list`);
      if (!isSeverity(f.severity)) errors.push(`${where}.severity: not in the allowed list`);
      if (typeof f.summary_pt !== 'string' || f.summary_pt.trim().length === 0 || f.summary_pt.length > MAX_FINDING_CHARS || BAD_CHARS.test(f.summary_pt)) errors.push(`${where}.summary_pt: missing, too long or with control characters`);
      if (!inList(ACTIONS, f.suggested_action)) errors.push(`${where}.suggested_action: "${typeof f.suggested_action === 'string' ? f.suggested_action.slice(0, 30) : typeof f.suggested_action}" is not in the allow-list`);
      if (!Array.isArray(f.evidence_ids) || f.evidence_ids.length > MAX_EVIDENCE_PER_FINDING || !f.evidence_ids.every((e: unknown) => typeof e === 'string' && e.length > 0 && e.length <= 120)) errors.push(`${where}.evidence_ids: not a short list of short strings`);
      if (errors.length === 0 || !errors.some((e) => e.startsWith(where))) {
        findings.push({
          category: f.category as Category,
          severity: f.severity as Severity,
          summary_pt: (f.summary_pt as string).trim(),
          evidence_ids: Array.from(new Set(f.evidence_ids as string[])),
          suggested_action: f.suggested_action as SuggestedAction,
        });
      }
    });
  }

  if (errors.length > 0) return { ok: false, errors: errors.slice(0, 12) };
  return { ok: true, value: { severity: raw.severity as Severity, summary_pt: (raw.summary_pt as string).trim(), findings } };
}
