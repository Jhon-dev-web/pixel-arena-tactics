import { AuthConfig, getAuthenticatedUserId } from '../auth.ts';
import { PACE_REJECT_FACTOR, daysAtFloor, daysAtLevel } from '../progress/bounds.ts';
import { UUID_RE, json } from '../http.ts';
import { certificateContentHash } from './hash.ts';
import { ITEM_BOUNDS } from './bounds.ts';
import { Rng, RolledPiece, bossStageFloor, clampLuck, isBossStage, maxBossLuck, maxHuntLuck, rollBossUniques, rollHuntUniques, rollRarity, rollSubstats, sealRarity } from './roll.ts';
import type { DayCap, ItemStore, NewCertificate, TokenTake } from './store.ts';
import { FORGE_TEMPLATES, HUNT_ZONES, POUCH_TABLE, UNIQUE_TEMPLATES } from './tables.ts';
import type { BindAction, BindBody, BindResult, CertificateView, MintBody, MintResult, MintedItem, RefusalReason, StoredItem, StoredTemplate } from './types.ts';

// mint-item and bind-item. The user id comes ONLY from the verified JWT. The server rolls every random outcome of a tradeable thing (the forge rarity and substats, the unique drops, the
// Gold Pouch), refuses anything past the plausibility limits (bounds.ts) and issues a certificate for what is tradeable. Nothing in a request body is trusted except as the thing being
// asked for: a template id, a zone, a duration, a list of boss stages, the luck the hero claims (clamped to what the skill allows).

export const MAX_BODY_BYTES = 16 * 1024;
const DAY_MS = 86_400_000;
const REQUEST_ID_RE = /^[A-Za-z0-9_.:-]{8,64}$/;

export interface ItemDeps {
  auth: AuthConfig;
  allowedOrigins: string[];
  store: ItemStore;
  nowMs: () => number;
  /** The dice. Production passes secureRng; a test passes a scripted stream. */
  rng: Rng;
}

function corsHeaders(origin: string | null, allowed: string[]): Record<string, string> {
  if (!origin || !allowed.includes(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
    'access-control-allow-methods': 'POST, OPTIONS',
    vary: 'Origin',
  };
}

type Prelude = { ok: true; userId: string; body: unknown; cors: Record<string, string> } | { ok: false; response: Response };

async function prelude(req: Request, auth: AuthConfig, allowedOrigins: string[]): Promise<Prelude> {
  const origin = req.headers.get('origin');
  const cors = corsHeaders(origin, allowedOrigins);
  if (req.method === 'OPTIONS') return { ok: false, response: new Response(null, { status: 204, headers: cors }) };
  if (req.method !== 'POST') return { ok: false, response: json({ error: 'method_not_allowed' }, 405, cors) };
  if (allowedOrigins.length === 0) return { ok: false, response: json({ error: 'unavailable' }, 503, cors) };
  if (origin && !allowedOrigins.includes(origin)) return { ok: false, response: json({ error: 'origin_not_allowed' }, 403) };
  const userId = await getAuthenticatedUserId(req, auth);
  if (!userId) return { ok: false, response: json({ error: 'unauthenticated' }, 401, cors) };
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return { ok: false, response: json({ error: 'too_large' }, 413, cors) };
  let text: string;
  try {
    text = await req.text();
  } catch {
    return { ok: false, response: json({ error: 'bad_request' }, 400, cors) };
  }
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return { ok: false, response: json({ error: 'too_large' }, 413, cors) };
  try {
    return { ok: true, userId, body: JSON.parse(text), cors };
  } catch {
    return { ok: false, response: json({ error: 'bad_request' }, 400, cors) };
  }
}

// ---- parsing ----------------------------------------------------------------------------------------------------------------------------------------------------------------

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export function parseMintBody(raw: unknown): MintBody | null {
  if (!isObj(raw) || typeof raw.requestId !== 'string' || !REQUEST_ID_RE.test(raw.requestId)) return null;
  const requestId = raw.requestId;
  switch (raw.kind) {
    case 'forge': {
      if (typeof raw.templateId !== 'string' || raw.templateId.length > 64) return null;
      let burn: string[] | undefined;
      if (raw.burnCertificateIds !== undefined) {
        if (!Array.isArray(raw.burnCertificateIds) || raw.burnCertificateIds.length > 8 || !raw.burnCertificateIds.every((id) => typeof id === 'string' && UUID_RE.test(id))) return null;
        burn = (raw.burnCertificateIds as string[]).map((id) => id.toLowerCase());
        if (new Set(burn).size !== burn.length) return null;
      }
      return { kind: 'forge', requestId, templateId: raw.templateId, seal: raw.seal === true, ...(burn ? { burnCertificateIds: burn } : {}) };
    }
    case 'hunt_drop': {
      if (typeof raw.zoneId !== 'string' || typeof raw.durationMs !== 'number' || !Number.isFinite(raw.durationMs) || raw.durationMs < 0) return null;
      return { kind: 'hunt_drop', requestId, zoneId: raw.zoneId, durationMs: raw.durationMs, luck: typeof raw.luck === 'number' ? raw.luck : undefined };
    }
    case 'boss_drop': {
      if (!Array.isArray(raw.stages) || raw.stages.length === 0 || raw.stages.length > ITEM_BOUNDS.bossStagesPerClaim || !raw.stages.every((s) => typeof s === 'number' && Number.isInteger(s))) return null;
      return { kind: 'boss_drop', requestId, stages: raw.stages as number[], luck: typeof raw.luck === 'number' ? raw.luck : undefined };
    }
    case 'pouch': {
      if (typeof raw.pouchId !== 'string') return null;
      return { kind: 'pouch', requestId, pouchId: raw.pouchId };
    }
    default:
      return null;
  }
}

export function parseBindBody(raw: unknown): BindBody | null {
  if (!isObj(raw) || (raw.action !== 'bind' && raw.action !== 'void' && raw.action !== 'burn')) return null;
  const ids = raw.certificateIds;
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 16 || !ids.every((id) => typeof id === 'string' && UUID_RE.test(id))) return null;
  const lower = (ids as string[]).map((id) => id.toLowerCase());
  if (new Set(lower).size !== lower.length) return null;
  return { action: raw.action, certificateIds: lower, reason: typeof raw.reason === 'string' ? raw.reason.slice(0, 64) : undefined };
}

// ---- answers ----------------------------------------------------------------------------------------------------------------------------------------------------------------

function certificateView(c: NewCertificate, id: string, createdAt: string): CertificateView {
  return {
    id,
    kind: c.kind,
    templateId: c.templateId,
    rarity: c.rarity,
    tier: c.tier,
    substats: c.substats,
    upgrade: 0,
    goldAmount: c.goldAmount,
    source: c.source,
    status: 'held',
    bound: false,
    createdAt,
    contentHash: c.contentHash,
  };
}

/** The stored template plus the certificate bodies, as the answer. */
export function assembleResult(template: StoredTemplate, certificates: CertificateView[]): MintResult {
  const fill = (s: StoredItem): MintedItem => ({ templateId: s.templateId, rarity: s.rarity, substats: s.substats, bound: s.bound, certificate: s.certIndex === null ? null : certificates[s.certIndex] ?? null });
  if (template.kind === 'forge') return { ok: true, kind: 'forge', item: fill(template.item) };
  if (template.kind === 'pouch') return { ok: true, kind: 'pouch', pouchId: template.pouchId, goldAmount: template.goldAmount, certificate: certificates[0] };
  return { ok: true, kind: template.kind, items: template.items.map(fill), rolls: template.rolls };
}

async function newCertificate(kind: 'gear' | 'unique', piece: RolledPiece, tier: number, source: NewCertificate['source']): Promise<NewCertificate> {
  const base = { kind, templateId: piece.templateId, rarity: piece.rarity, tier, substats: piece.substats, goldAmount: null, source };
  return { ...base, contentHash: await certificateContentHash({ ...base, upgrade: 0 }) };
}

const refusalStatus = (reason: RefusalReason): number => (reason === 'bad_request' || reason === 'unknown_template' ? 400 : reason === 'seal_pass_required' ? 403 : 429);

// ---- mint-item --------------------------------------------------------------------------------------------------------------------------------------------------------------

export async function handleMintItem(req: Request, deps: ItemDeps): Promise<Response> {
  const pre = await prelude(req, deps.auth, deps.allowedOrigins);
  if (!pre.ok) return pre.response;
  const { userId, cors } = pre;
  const body = parseMintBody(pre.body);
  if (!body) return json({ ok: false, reason: 'bad_request' satisfies RefusalReason }, 400, cors);

  const refuse = async (reason: RefusalReason, flagCode: string | null, detail: Record<string, unknown> = {}): Promise<Response> => {
    if (flagCode) await deps.store.flag(userId, flagCode, { kind: body.kind, reason, ...detail }).catch(() => undefined);
    return json({ ok: false, reason } satisfies MintResult, refusalStatus(reason), cors);
  };

  try {
    // A request id that was already answered gets the same answer: a lost response is never a second roll.
    const replay = await deps.store.findRequest(userId, body.requestId);
    if (replay) return json(assembleResult(replay.template, replay.certificates), 200, cors);

    const now = deps.nowMs();
    const startMs = await deps.store.accountStartMs(userId);
    if (startMs === null) return json({ error: 'unavailable' }, 503, cors);
    const ageDays = Math.max(0, (now - startMs) / DAY_MS);
    // A piece / zone / boss that the fastest simulated hero reaches on day D cannot exist before D / PACE_REJECT_FACTOR (progress/bounds.ts, the same pace the ranking judges with).
    const tooEarly = (minDays: number): boolean => ageDays < minDays / PACE_REJECT_FACTOR;

    // The uniques of a Hunting / boss claim: every one is certified (a unique is tradeable by nature).
    const uniqueAnswer = async (source: 'hunt_drop' | 'boss_drop', drops: RolledPiece[], rolls: number) => {
      const certificates = await Promise.all(drops.map((d) => newCertificate('unique', d, UNIQUE_TEMPLATES[d.templateId]?.tier ?? 0, source)));
      const items: StoredItem[] = drops.map((d, i) => ({ templateId: d.templateId, rarity: d.rarity, substats: d.substats, bound: false, certIndex: i }));
      return { template: { kind: source, items, rolls } as StoredTemplate, certificates, caps: certificates.length > 0 ? [{ kind: 'unique' as const, tier: null, max: ITEM_BOUNDS.uniqueDayCap }] : [], burnIds: [], source };
    };

    let answered: { template: StoredTemplate; certificates: NewCertificate[]; caps: DayCap[]; burnIds: string[]; source: NewCertificate['source'] };

    if (body.kind === 'forge') {
      const tpl = FORGE_TEMPLATES[body.templateId];
      if (!tpl) return refuse('unknown_template', null);
      if (tooEarly(daysAtLevel(tpl.levelGate))) return refuse('too_early', 'FORGE_TOO_EARLY', { templateId: body.templateId, ageDays: Math.floor(ageDays) });
      if (body.seal && !(await deps.store.hasActivePass(userId))) return refuse('seal_pass_required', 'SEAL_WITHOUT_PASS', { templateId: body.templateId });

      const takes: TokenTake[] = [{ bucket: `forge_t${tpl.tier}`, cost: 1, ratePerHour: ITEM_BOUNDS.forgeRatePerHour(tpl.tier), capacity: ITEM_BOUNDS.forgeCapacity(tpl.tier) }];
      if (body.seal) takes.push({ bucket: 'forge_seal', cost: 1, ratePerHour: ITEM_BOUNDS.sealRatePerHour, capacity: ITEM_BOUNDS.sealCapacity });
      if ((await deps.store.issuedLastDay(userId, 'gear', tpl.tier)) >= ITEM_BOUNDS.certDayCap(tpl.tier)) return refuse('cert_day_limit', 'LIMIT_CERT_DAY', { tier: tpl.tier });
      const took = await deps.store.takeTokens(userId, startMs, takes);
      if (!took.ok) return refuse(took.failed === 'forge_seal' ? 'seal_limit' : 'forge_rate', took.failed === 'forge_seal' ? 'LIMIT_SEAL' : 'LIMIT_FORGE_RATE', { tier: tpl.tier });

      // THE ROLL. The client never sees it before this point and never supplies a number for it.
      const rarity = body.seal ? sealRarity(deps.rng) : rollRarity(deps.rng);
      const substats = rollSubstats(rarity, tpl.tier, 0, deps.rng);
      // Only an unbound Epic / Legendary is tradeable (gearInstances.isTradeable); a Seal piece is born bound, so it gets no certificate.
      const certify = !body.seal && (rarity === 'epic' || rarity === 'legendary');
      const certificates = certify ? [await newCertificate('gear', { templateId: body.templateId, rarity, substats }, tpl.tier, 'forge')] : [];
      answered = {
        template: { kind: 'forge', item: { templateId: body.templateId, rarity, substats, bound: !!body.seal, certIndex: certify ? 0 : null } },
        certificates,
        caps: certify ? [{ kind: 'gear', tier: tpl.tier, max: ITEM_BOUNDS.certDayCap(tpl.tier) }] : [],
        burnIds: body.burnCertificateIds ?? [],
        source: 'forge',
      };
    } else if (body.kind === 'hunt_drop') {
      const zone = HUNT_ZONES.find((z) => z.id === body.zoneId);
      if (!zone) return refuse('unknown_template', null);
      if (tooEarly(daysAtFloor(zone.unlockFloor))) return refuse('too_early', 'HUNT_ZONE_TOO_EARLY', { zoneId: zone.id, ageDays: Math.floor(ageDays) });
      const requestedSeconds = Math.min(ITEM_BOUNDS.huntCapacitySeconds, Math.floor(body.durationMs / 1000));
      let hours = 0;
      if (requestedSeconds > 0) {
        const took = await deps.store.takeTokens(userId, startMs, [{ bucket: 'hunt_seconds', cost: requestedSeconds, ratePerHour: ITEM_BOUNDS.huntSecondsPerHour, capacity: ITEM_BOUNDS.huntCapacitySeconds, partial: true }]);
        if (!took.ok) return refuse('hunt_time', 'LIMIT_HUNT_TIME', { zoneId: zone.id });
        const granted = took.granted[0] ?? 0;
        if (requestedSeconds - granted > ITEM_BOUNDS.huntFlagExcessSeconds) await deps.store.flag(userId, 'HUNT_TIME_EXCESS', { zoneId: zone.id, requestedSeconds, grantedSeconds: Math.floor(granted) }).catch(() => undefined);
        hours = granted / 3600;
      }
      if ((await deps.store.issuedLastDay(userId, 'unique', null)) >= ITEM_BOUNDS.uniqueDayCap) return refuse('cert_day_limit', 'LIMIT_UNIQUE_DAY');
      const luck = clampLuck(body.luck, maxHuntLuck());
      const rolled = rollHuntUniques(zone.id, hours, luck, (id) => UNIQUE_TEMPLATES[id]?.tier ?? 0, deps.rng);
      if (!rolled) return refuse('unknown_template', null);
      answered = await uniqueAnswer('hunt_drop', rolled.drops, rolled.rolls);
    } else if (body.kind === 'boss_drop') {
      if (!body.stages.every(isBossStage)) return refuse('bad_request', null);
      if (tooEarly(daysAtFloor(Math.max(...body.stages.map(bossStageFloor))))) return refuse('too_early', 'BOSS_TOO_EARLY', { ageDays: Math.floor(ageDays) });
      const took = await deps.store.takeTokens(userId, startMs, [{ bucket: 'boss_kills', cost: body.stages.length, ratePerHour: ITEM_BOUNDS.bossRatePerHour, capacity: ITEM_BOUNDS.bossCapacity, partial: true }]);
      if (!took.ok) return refuse('boss_rate', 'LIMIT_BOSS_RATE');
      const allowed = Math.floor(took.granted[0] ?? 0);
      if (allowed < body.stages.length) await deps.store.flag(userId, 'BOSS_KILLS_EXCESS', { claimed: body.stages.length, allowed }).catch(() => undefined);
      if ((await deps.store.issuedLastDay(userId, 'unique', null)) >= ITEM_BOUNDS.uniqueDayCap) return refuse('cert_day_limit', 'LIMIT_UNIQUE_DAY');
      const luck = clampLuck(body.luck, maxBossLuck());
      const drops = rollBossUniques(body.stages.slice(0, allowed), luck, (id) => UNIQUE_TEMPLATES[id]?.tier ?? 0, deps.rng);
      answered = await uniqueAnswer('boss_drop', drops, allowed);
    } else {
      const face = (POUCH_TABLE.faces as Record<string, number>)[body.pouchId];
      if (face === undefined) return refuse('unknown_template', null);
      const takes: TokenTake[] = [
        { bucket: 'pouch_count', cost: 1, ratePerHour: ITEM_BOUNDS.pouchCountPerHour, capacity: ITEM_BOUNDS.pouchCountCapacity },
        { bucket: 'pouch_gold', cost: face, ratePerHour: ITEM_BOUNDS.pouchGoldPerDay / 24, capacity: ITEM_BOUNDS.pouchGoldCapacity() },
      ];
      const took = await deps.store.takeTokens(userId, startMs, takes);
      if (!took.ok) return refuse(took.failed === 'pouch_gold' ? 'pouch_gold_limit' : 'pouch_count_limit', took.failed === 'pouch_gold' ? 'LIMIT_POUCH_GOLD' : 'LIMIT_POUCH_COUNT', { pouchId: body.pouchId });
      const base = { kind: 'gold_pouch' as const, templateId: body.pouchId, rarity: null, tier: null, substats: [], goldAmount: face, source: 'pouch' as const };
      answered = {
        template: { kind: 'pouch', pouchId: body.pouchId, goldAmount: face },
        certificates: [{ ...base, contentHash: await certificateContentHash({ ...base, upgrade: 0 }) }],
        caps: [],
        burnIds: [],
        source: 'pouch',
      };
    }

    const outcome = await deps.store.commit({ userId, requestId: body.requestId, kind: answered.source, template: answered.template, certificates: answered.certificates, burnIds: answered.burnIds, caps: answered.caps });
    if (outcome.status === 'created') {
      const views = answered.certificates.map((c, i) => certificateView(c, outcome.certificates[i].id, outcome.certificates[i].createdAt));
      return json(assembleResult(answered.template, views), 200, cors);
    }
    if (outcome.status === 'replay') {
      const again = await deps.store.findRequest(userId, body.requestId);
      if (again) return json(assembleResult(again.template, again.certificates), 200, cors);
      return json({ error: 'busy', retryAfterSeconds: 2 }, 429, { ...cors, 'retry-after': '2' });
    }
    if (outcome.status === 'cap') return refuse('cert_day_limit', 'LIMIT_CERT_DAY');
    return refuse('burn_not_held', 'BURN_NOT_HELD');

  } catch (err) {
    console.error('[mint-item] failed', err instanceof Error ? err.message : 'unknown'); // message only: never a key, a token or a request body
    return json({ error: 'mint_failed' }, 502, cors);
  }
}

// ---- bind-item --------------------------------------------------------------------------------------------------------------------------------------------------------------

const bindStatus = (reason: Extract<BindResult, { ok: false }>['reason']): number => (reason === 'bad_request' ? 400 : reason === 'not_found' ? 404 : 409);

export async function handleBindItem(req: Request, deps: Pick<ItemDeps, 'auth' | 'allowedOrigins' | 'store'>): Promise<Response> {
  const pre = await prelude(req, deps.auth, deps.allowedOrigins);
  if (!pre.ok) return pre.response;
  const { userId, cors } = pre;
  const body = parseBindBody(pre.body);
  if (!body) return json({ ok: false, reason: 'bad_request' } satisfies BindResult, 400, cors);
  try {
    const result = await deps.store.transition({ userId, ids: body.certificateIds, action: body.action as BindAction, reason: body.reason ?? '' });
    return json(result, result.ok ? 200 : bindStatus(result.reason), cors);
  } catch (err) {
    console.error('[bind-item] failed', err instanceof Error ? err.message : 'unknown');
    return json({ error: 'bind_failed' }, 502, cors);
  }
}
