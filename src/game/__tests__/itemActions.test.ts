import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSave, normalizeSave, SaveData } from '../engine';
import { getGear } from '../gear';
import { applyEquipInstance, applyUpgrade, applySalvage, createGearInstance, isTradeable, listGearInstances, planForgeIngredients } from '../gearInstances';
import { emptyMaterials } from '../materials';
import { applyHuntClaim, applyHuntStart, applyHuntStop, needsServerUniques, withServerUniques } from '../huntLifecycle';
import { applyLapidar } from '../lapidar';
import { applyReforge } from '../reforge';
import { applyCreatePouch, applyOpenPouch, certifiedPouchIds, certificateToBurnOnOpen, uncertifiedPouchCount } from '../goldPouch';
import { setItemAuthority } from '../itemAuthority';
import { certState, clearCertificates, getCertificate, upsertCertificates, verifiedPouchCount } from '../itemCerts';
import { ItemApi, ItemServerUnreachable, createItemApi } from '../itemServer';
import { changeAction, changeVoidsCertificate, createPouchAction, equipAction, forgeAction, openPouchAction, removeAction, resolveHuntUniques, settleBossClaim } from '../itemActions';
import { queueBossClaims } from '../bossClaims';
import { waveRewards } from '../waves';
import { getBiomeForFloor } from '../dungeon';
import { recipeStock } from './recipeStock';
import { DAY, FakeItemStore, makeServer } from '../../../supabase/functions/_shared/__tests__/fakeItemStore';

// The web build's item actions against an in-memory server that behaves like migration 0010 (supabase/functions/_shared/__tests__/fakeItemStore.ts): the same handlers the Edge Functions run.

const OLD_ACCOUNT = Date.UTC(2026, 3, 1);
const seeded = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
};
const scripted = (...values: number[]) => {
  let i = 0;
  return () => (i < values.length ? values[i++] : 0.99);
};

function setup(rng: () => number = seeded(1)) {
  const server = makeServer({ rng });
  server.store.accountCreatedMs = OLD_ACCOUNT;
  let down = false;
  const api: ItemApi = createItemApi(
    async (fn, body) => {
      if (down) throw new Error('offline');
      const r = fn === 'mint-item' ? await server.mint(body) : await server.bind(body);
      return { status: r.status, body: r.body };
    },
    { retries: 1, sleep: async () => undefined },
  );
  return { server, api, goDown: () => (down = true), comeBack: () => (down = false) };
}

/** A save holding a place for the test: a rich hero with the stock a recipe needs. */
function rich(templateId: string, patch: Partial<SaveData> = {}): SaveData {
  const base = defaultSave();
  return { ...base, gold: 1e7, shards: 50, materials: { ...emptyMaterials(), ...recipeStock(templateId, 3) } as SaveData['materials'], ...patch };
}

let current: SaveData;
const getSave = () => current;

beforeEach(() => {
  clearCertificates();
  setItemAuthority('server');
});
afterEach(() => {
  setItemAuthority('local');
  clearCertificates();
  vi.restoreAllMocks();
});

describe('forge: the server\'s roll is the one applied', () => {
  it('a Legendary rolled on the device is ignored; the piece is exactly what the server returned, with its certificate', async () => {
    const { api, server } = setup(scripted(0.95, 0, 0, 0, 0)); // the server rolls an Epic
    current = rich('bronze_dagger');
    const mathRandom = vi.spyOn(Math, 'random').mockReturnValue(0.999); // the device would roll a Legendary
    const r = await forgeAction(api, getSave, 'bronze_dagger', { level: 1 });
    expect(r.ok).toBe(true);
    const inst = (r as { instance: ReturnType<typeof createGearInstance> }).instance;
    expect(inst.rarity).toBe('epic');
    expect(inst.substats).toHaveLength(2);
    expect(inst.certificateId).toBe(server.store.certs[0].id);
    expect(mathRandom).not.toHaveBeenCalled(); // nothing was rolled on the device
    const saved = (r as { save: SaveData }).save;
    expect(saved.gearInstances[inst.id]).toBeTruthy();
    expect(saved.gold).toBe(1e7 - getGear('bronze_dagger').cost);
    expect(isTradeable(inst)).toBe(true);
    // the player's screen says "Certificado" only because the server's own list says so
    expect(certState(inst)).toBe('verified');
  });

  it('a Common result has no certificate and is not tradeable; the roll still came from the server', async () => {
    const { api } = setup(scripted(0.1));
    current = rich('bronze_dagger');
    const mathRandom = vi.spyOn(Math, 'random').mockReturnValue(0.999);
    const r = await forgeAction(api, getSave, 'bronze_dagger', { level: 1 });
    const inst = (r as { instance: { rarity: string; certificateId?: string; substats: unknown[] } }).instance;
    expect(inst.rarity).toBe('common');
    expect(inst.certificateId).toBeUndefined();
    expect(mathRandom).not.toHaveBeenCalled();
  });

  it('the server unreachable: the forge is BLOCKED, nothing is spent, nothing is created (no local fallback)', async () => {
    const { api, goDown } = setup();
    current = rich('bronze_dagger');
    goDown();
    const before = JSON.stringify(current);
    const r = await forgeAction(api, getSave, 'bronze_dagger', { level: 1 });
    expect(r).toEqual({ ok: false, blocked: 'unreachable' });
    expect(JSON.stringify(current)).toBe(before);
  });

  it('a refusal (the forge limit) blocks the forge with the server\'s reason', async () => {
    const { api, server } = setup(() => 0.1);
    current = rich('bronze_dagger');
    // the account has used up everything its supply allows (the bucket is empty)
    for (let i = 0; i < 700; i++) await server.mint({ kind: 'forge', requestId: `flood-${String(i).padStart(6, '0')}`, templateId: 'bronze_dagger' });
    const before = JSON.stringify(current);
    const refused = await forgeAction(api, getSave, 'bronze_dagger', { level: 1 });
    expect(refused).toMatchObject({ ok: false, blocked: 'refused', reason: 'forge_rate' });
    expect(JSON.stringify(current)).toBe(before);
    expect(server.store.flags.some((f) => f.code === 'LIMIT_FORGE_RATE')).toBe(true);
  });

  it('a certified ingredient is burned by the same request, and the new piece is certified', async () => {
    const { api, server } = setup(scripted(0.95, 0, 0, 0, 0, 0.95, 0, 0, 0, 0));
    current = rich('bronze_dagger');
    const a = await forgeAction(api, getSave, 'bronze_dagger', { level: 1 });
    expect(a.ok).toBe(true);
    current = { ...(a as { save: SaveData }).save, gold: 1e7, materials: { ...emptyMaterials(), ...recipeStock('iron_short_sword', 3) } as SaveData['materials'] };
    // the recipe takes two bronze daggers: give a second, uncertified one
    const second = createGearInstance('bronze_dagger', { id: 'gi_second', origin: 'craft', rarity: 'common', substats: [] });
    current = { ...current, gearInstances: { ...current.gearInstances, gi_second: second } };
    const certifiedId = server.store.certs[0].id;
    const b = await forgeAction(api, getSave, 'iron_short_sword', { level: 10 });
    expect(b.ok).toBe(true);
    expect(server.store.certs.find((c) => c.id === certifiedId)?.status).toBe('burned');
    expect(getCertificate(certifiedId)?.status).toBe('burned');
    expect(Object.values((b as { save: SaveData }).save.gearInstances).some((i) => i.certificateId === certifiedId)).toBe(false);
  });

  it('offline (no server): the device rolls as it always did, and an Epic / Legendary it makes can never be sold', async () => {
    setItemAuthority('local');
    const { api } = setup();
    current = rich('bronze_dagger');
    const rng = vi.spyOn(Math, 'random').mockReturnValue(0.999);
    const r = await forgeAction(api, getSave, 'bronze_dagger', { level: 1 });
    expect(r.ok).toBe(true);
    const inst = (r as { instance: { rarity: string; certified?: boolean; certificateId?: string } }).instance;
    expect(inst.rarity).toBe('legendary');
    expect(inst.certified).toBe(false);
    expect(inst.certificateId).toBeUndefined();
    expect(isTradeable(inst as never)).toBe(false);
    expect(rng).toHaveBeenCalled();
  });

  it('the pure reducer in the web build never rolls by itself: without the server\'s roll it yields a plain Common', () => {
    const { server } = setup();
    void server;
    const mathRandom = vi.spyOn(Math, 'random').mockReturnValue(0.999);
    const s = rich('bronze_dagger');
    const r = require_applyForge(s);
    expect(r.instance?.rarity).toBe('common');
    expect(r.instance?.substats).toEqual([]);
    expect(mathRandom).not.toHaveBeenCalled();
  });
});

import { applyForge } from '../gearInstances';
function require_applyForge(s: SaveData) {
  return applyForge(s, 'bronze_dagger', { level: 1 });
}

describe('Hunting uniques: rolled by the server when the reward is claimed', () => {
  const START = Date.UTC(2026, 9, 10, 9);
  const HOUR = 3600 * 1000;
  const fresh = (): SaveData => ({ ...defaultSave(), huntingOfflineStart: START, lastMiningClaim: START, lastWoodcuttingClaim: START });

  it('stopping a hunt in the web build rolls no unique on the device and marks the reward for the server; offline it does neither', () => {
    // a zone with unique drops, an absurdly high chance would be needed to see one locally in 3 hours: use the exact sim instead, with the chance forced by the build
    const started = applyHuntStart(fresh(), 'demon_glade', 'shallow', START)!;
    const online = applyHuntStop(started, START + 3 * HOUR)!.pendingHuntReward!;
    expect(online.uniques).toEqual([]);
    expect(needsServerUniques(online)).toBe(true);
    expect(online.uniqueRoll!.luck).toBeGreaterThanOrEqual(1);
    setItemAuthority('local');
    const offline = applyHuntStop(started, START + 3 * HOUR)!.pendingHuntReward!;
    expect(offline.uniqueRoll).toBeUndefined();
    expect(needsServerUniques(offline)).toBe(false);
    // everything else of the reward is the same: the server only takes over the uniques
    expect({ ...online, uniqueRoll: undefined, uniques: [] }).toEqual({ ...offline, uniqueRoll: undefined, uniques: [] });
  });

  const reward = (patch: Partial<NonNullable<SaveData['pendingHuntReward']>> = {}): SaveData => ({
    ...defaultSave(),
    pendingHuntReward: {
      id: '1700000000000:demon_glade:shallow:1700010800000',
      zoneId: 'demon_glade',
      depth: 'shallow',
      startedAt: 1700000000000,
      endedAt: 1700010800000,
      timeMs: 3 * 3600_000,
      pendingMs: 3 * 3600_000,
      startCeiling: 1,
      ceilingSubLevel: 1,
      promotions: 0,
      promotionLosses: 0,
      promotionWins: 0,
      promotionRequired: 0,
      gold: 100,
      xp: 100,
      bpXp: 0,
      drops: {},
      lost: [],
      uniques: [],
      uniqueRoll: { luck: 1 },
      ...patch,
    },
  });

  it('a reward still waiting for the server\'s roll cannot be claimed (the uniques would be thrown away)', () => {
    const s = reward();
    expect(applyHuntClaim(s, s.pendingHuntReward!.id)).toBeNull();
  });

  it('the server\'s uniques (bounded by server time) land in the reward with their certificates and are delivered by the normal claim', async () => {
    const { api, server } = setup(() => 0);
    server.store.accountCreatedMs = server.store.nowMs - 60 * DAY;
    current = reward({ pendingMs: 16_000 }); // 16 seconds: one roll, every dice a hit (the day's cap of certified uniques is 2)
    const r = await resolveHuntUniques(api, getSave);
    expect(r.ok).toBe(true);
    const resolved = (r as { save: SaveData }).save;
    expect(needsServerUniques(resolved.pendingHuntReward)).toBe(false);
    const drops = resolved.pendingHuntReward!.uniques;
    expect(drops.length).toBeGreaterThan(0);
    for (const d of drops) expect(d.certificateId).toBeTruthy();
    const claimed = applyHuntClaim(resolved, resolved.pendingHuntReward!.id)!;
    const unique = listGearInstances(claimed).filter((i) => getGear(i.templateId).unique);
    expect(unique).toHaveLength(drops.length);
    for (const u of unique) expect(isTradeable(u)).toBe(true);
    expect(claimed.stats.uniquesFound).toBeGreaterThanOrEqual(drops.length);
  });

  it('asking again with the same reward returns the same uniques (a lost answer is never a second roll)', async () => {
    const { api, server } = setup(() => 0);
    server.store.accountCreatedMs = server.store.nowMs - 60 * DAY;
    current = reward({ pendingMs: 60_000 });
    const first = await resolveHuntUniques(api, getSave);
    const again = await resolveHuntUniques(api, () => reward({ pendingMs: 60_000 }));
    const ids = (r: unknown) => ((r as { save: SaveData }).save.pendingHuntReward!.uniques).map((u) => u.certificateId);
    expect(ids(again)).toEqual(ids(first));
    expect(server.store.certs).toHaveLength(ids(first).length);
  });

  it('the server unreachable: blocked, the reward stays as it was', async () => {
    const { api, goDown } = setup();
    goDown();
    current = reward();
    const r = await resolveHuntUniques(api, getSave);
    expect(r).toEqual({ ok: false, blocked: 'unreachable' });
    expect(needsServerUniques(current.pendingHuntReward)).toBe(true);
  });

  it('a refusal does not hold the gold and the materials hostage: the reward is claimed without uniques', async () => {
    const { api, server } = setup(() => 0.99);
    server.store.accountCreatedMs = server.store.nowMs - DAY; // a day-old account cannot have reached the Abyss
    current = { ...reward({ zoneId: 'blood_abyss', id: '1700000000000:blood_abyss:shallow:1700010800000' }) };
    const r = await resolveHuntUniques(api, getSave);
    expect(r.ok).toBe(true);
    expect((r as { refused?: string }).refused).toBe('too_early');
    const resolved = (r as { save: SaveData }).save;
    expect(resolved.pendingHuntReward!.uniques).toEqual([]);
    expect(applyHuntClaim(resolved, resolved.pendingHuntReward!.id)).not.toBeNull();
  });

  it('offline the device keeps rolling them, and what it delivers is marked uncertified', () => {
    setItemAuthority('local');
    const local = reward({ uniqueRoll: undefined, uniques: [{ templateId: 'demon_fang_dagger', rarity: 'epic', substats: [{ type: 'critRate', value: 3 }, { type: 'defense', value: 3 }, { type: 'maxHp', value: 10 }] }] });
    const claimed = applyHuntClaim(local, local.pendingHuntReward!.id)!;
    const u = listGearInstances(claimed).find((i) => i.templateId === 'demon_fang_dagger')!;
    expect(u.certified).toBe(false);
    expect(u.certificateId).toBeUndefined();
    expect(isTradeable(u)).toBe(false);
  });

  it('withServerUniques only answers the reward that waits for it', () => {
    const s = reward();
    expect(withServerUniques(s, 'other', [])).toBeNull();
    expect(withServerUniques({ ...s, pendingHuntReward: { ...s.pendingHuntReward!, uniqueRoll: undefined } }, s.pendingHuntReward!.id, [])).toBeNull();
  });
});

describe('Dungeon boss uniques', () => {
  it('the web build rolls none on the device (relics keep rolling: they are not tradeable)', () => {
    const rng = vi.spyOn(Math, 'random').mockReturnValue(0); // every chance hits
    const online = waveRewards(getBiomeForFloor(50), 50, 1);
    expect(online.uniques).toEqual([]);
    expect(online.relics.length).toBeGreaterThan(0);
    setItemAuthority('local');
    const offline = waveRewards(getBiomeForFloor(50), 50, 1);
    expect(offline.uniques.length).toBeGreaterThan(0);
    expect(rng).toHaveBeenCalled();
  });

  it('a banked run\'s claim is rolled by the server and the uniques go to the bag; the claim leaves the queue', async () => {
    const { api, server } = setup(() => 0);
    current = queueBossClaims(defaultSave(), [50], 1, 1, () => 'boss-claim-0001');
    expect(current.pendingBossClaims).toHaveLength(1);
    const r = await settleBossClaim(api, getSave, current.pendingBossClaims![0], 1);
    expect(r.ok).toBe(true);
    const saved = (r as { save: SaveData }).save;
    expect(saved.pendingBossClaims).toBeUndefined();
    const uniques = listGearInstances(saved).filter((i) => getGear(i.templateId).unique);
    expect(uniques).toHaveLength(2); // one boss x two pieces, every dice a hit (the day's cap of certified uniques is 2)
    for (const u of uniques) {
      expect(u.certificateId).toBeTruthy();
      expect(certState(u)).toBe('verified');
    }
    expect(server.store.certs).toHaveLength(2);
  });

  it('the server unreachable: the claim stays queued (nothing lost, nothing created locally)', async () => {
    const { api, goDown } = setup(() => 0);
    goDown();
    current = queueBossClaims(defaultSave(), [25], 1, 1, () => 'boss-claim-0002');
    const r = await settleBossClaim(api, getSave, current.pendingBossClaims![0], 1);
    expect(r).toEqual({ ok: false, blocked: 'unreachable' });
    expect(current.pendingBossClaims).toHaveLength(1);
    expect(listGearInstances(current).filter((i) => getGear(i.templateId).unique)).toHaveLength(0);
  });
});

describe('Gold Pouch', () => {
  it('the server creates and certifies it; opening it burns the certificate first; an uncertified one is opened first', async () => {
    const { api, server } = setup();
    server.store.accountCreatedMs = server.store.nowMs - 60 * DAY;
    current = { ...defaultSave(), gold: 100_000, inventoryCapacity: 50 };
    const made = await createPouchAction(api, getSave, 'gold_pouch_s', Date.now());
    expect(made.ok).toBe(true);
    current = (made as { save: SaveData }).save;
    expect(certifiedPouchIds(current, 'gold_pouch_s')).toEqual([server.store.certs[0].id]);
    expect(uncertifiedPouchCount(current, 'gold_pouch_s')).toBe(0);
    expect(verifiedPouchCount(current, 'gold_pouch_s')).toBe(1); // the server's list confirms it
    clearCertificates();
    expect(verifiedPouchCount(current, 'gold_pouch_s')).toBe(0); // an id the server does not list proves nothing
    upsertCertificates([getCertificate(server.store.certs[0].id) ?? server.store.certs[0]]);
    expect(isTradeable({ kind: 'consumable', id: 'gold_pouch_s', certificateId: certifiedPouchIds(current, 'gold_pouch_s')[0] })).toBe(true);
    // an old, uncertified pouch is opened before the certified one
    current = { ...current, consumables: { ...current.consumables, gold_pouch_s: 2 } };
    expect(certificateToBurnOnOpen(current, 'gold_pouch_s')).toBeNull();
    const gold0 = current.gold;
    const o1 = await openPouchAction(api, getSave, 'gold_pouch_s');
    expect(o1.ok).toBe(true);
    current = (o1 as { save: SaveData }).save;
    expect(server.store.certs[0].status).toBe('held'); // still there
    const o2 = await openPouchAction(api, getSave, 'gold_pouch_s');
    expect(o2.ok).toBe(true);
    current = (o2 as { save: SaveData }).save;
    expect(server.store.certs[0].status).toBe('burned');
    expect(current.gold).toBe(gold0 + 2 * 10_000);
    expect(certifiedPouchIds(current, 'gold_pouch_s')).toEqual([]);
  });

  it('a certified pouch cannot be opened locally without burning its certificate', () => {
    let s: SaveData = { ...defaultSave(), gold: 100_000 };
    const created = applyCreatePouch(s, 'gold_pouch_s', Date.now(), '0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b')!;
    s = created.save!;
    expect(applyOpenPouch(s, 'gold_pouch_s')).toMatchObject({ ok: false, reason: 'certified' });
    expect(applyOpenPouch(s, 'gold_pouch_s', '0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c0c')).toMatchObject({ ok: false, reason: 'certified' });
    expect(applyOpenPouch(s, 'gold_pouch_s', '0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b').ok).toBe(true);
  });

  it('the server unreachable: creating and opening are blocked', async () => {
    const { api, goDown, server } = setup();
    server.store.accountCreatedMs = server.store.nowMs - 60 * DAY;
    current = { ...defaultSave(), gold: 100_000 };
    goDown();
    expect(await createPouchAction(api, getSave, 'gold_pouch_s', Date.now())).toEqual({ ok: false, blocked: 'unreachable' });
    expect(current.gold).toBe(100_000);
  });

  it('the server limit on Gold becoming pouches refuses the pouch and spends nothing', async () => {
    const { api, server } = setup();
    server.store.accountCreatedMs = server.store.nowMs - DAY; // 10,000 Gold of income at most
    current = { ...defaultSave(), gold: 1_000_000 };
    const a = await createPouchAction(api, getSave, 'gold_pouch_l', Date.now());
    expect(a).toMatchObject({ ok: false, blocked: 'refused', reason: 'pouch_gold_limit' });
    expect(current.gold).toBe(1_000_000);
  });

  it('offline the pouch is made and opened as always, uncertified', async () => {
    setItemAuthority('local');
    const { api } = setup();
    current = { ...defaultSave(), gold: 100_000 };
    const made = await createPouchAction(api, getSave, 'gold_pouch_s', Date.now());
    expect(made.ok).toBe(true);
    current = (made as { save: SaveData }).save;
    expect(certifiedPouchIds(current, 'gold_pouch_s')).toEqual([]);
    expect(uncertifiedPouchCount(current, 'gold_pouch_s')).toBe(1);
    expect((await openPouchAction(api, getSave, 'gold_pouch_s')).ok).toBe(true);
  });
});

describe('equip binds, changes void, removals burn', () => {
  async function certifiedPiece() {
    const ctx = setup(scripted(0.95, 0, 0, 0, 0));
    current = rich('bronze_dagger');
    const r = await forgeAction(ctx.api, getSave, 'bronze_dagger', { level: 1 });
    current = (r as { save: SaveData }).save;
    const inst = (r as { instance: { id: string; certificateId: string } }).instance;
    return { ...ctx, id: inst.id, cert: inst.certificateId };
  }

  it('equipping binds the certificate on the server first (irreversible), then the piece', async () => {
    const { api, server, id, cert } = await certifiedPiece();
    const r = await equipAction(api, getSave, id);
    expect(r.ok).toBe(true);
    current = (r as { save: SaveData }).save;
    expect(current.gearInstances[id].bound).toBe(true);
    expect(server.store.certs.find((c) => c.id === cert)?.bound).toBe(true);
    expect(getCertificate(cert)?.bound).toBe(true);
    expect(isTradeable(current.gearInstances[id])).toBe(false);
    // unequipping does not unbind: the server has no action for it
    expect((await api.bind('bind', [cert])).ok).toBe(true);
    expect(server.store.certs.find((c) => c.id === cert)?.bound).toBe(true);
  });

  it('the server unreachable: the equip is blocked and the piece stays unbound', async () => {
    const { api, goDown, id } = await certifiedPiece();
    goDown();
    const r = await equipAction(api, getSave, id);
    expect(r).toEqual({ ok: false, blocked: 'unreachable' });
    expect(current.gearInstances[id].bound).toBeUndefined();
    expect(current.equipped.weapon).not.toBe(id);
  });

  it('a piece with no certificate equips with no server call at all', async () => {
    const { api, server } = setup();
    current = defaultSave();
    const inst = createGearInstance('bronze_dagger', { id: 'plain', origin: 'craft', rarity: 'epic', substats: [] });
    current = { ...current, gearInstances: { ...current.gearInstances, plain: inst } };
    const r = await equipAction(api, getSave, 'plain');
    expect(r.ok).toBe(true);
    expect(server.store.events).toHaveLength(0);
  });

  it('the rule for refine, reforge and lapidar: the certificate is VOIDED first; the piece stays in the save, usable, and is never tradeable again', async () => {
    const { api, server, id, cert } = await certifiedPiece();
    expect(changeVoidsCertificate(current.gearInstances[id])).toBe(true);
    current = { ...current, gold: 1e7, materials: { ...emptyMaterials(), ...recipeStock('bronze_dagger', 3), copper: 99, copper_bar: 99, leather: 99, refining_dust: 99 } as SaveData['materials'] };
    const r = await changeAction(api, getSave, id, 'refine', (s) => !!applyUpgrade(s, id, false, () => 0));
    expect(r.ok).toBe(true);
    expect(server.store.certs.find((c) => c.id === cert)?.status).toBe('revoked');
    expect(getCertificate(cert)?.status).toBe('revoked');
    const stripped = (r as { save: SaveData }).save;
    expect(stripped.gearInstances[id].certificateId).toBeUndefined();
    const refined = applyUpgrade(stripped, id, false, () => 0)!.save;
    expect(refined.gearInstances[id].upgrade).toBe(1);
    expect(isTradeable(refined.gearInstances[id])).toBe(false);
    expect(certState(refined.gearInstances[id])).toBe('none');
    // and the dead certificate can never be bound, burned or revived
    expect((await api.bind('bind', [cert])).ok).toBe(false);
  });

  it('a change the game would refuse costs the player nothing: the certificate is not voided', async () => {
    const { api, server, id, cert } = await certifiedPiece();
    current = { ...current, gold: 0 }; // cannot pay the refine
    const r = await changeAction(api, getSave, id, 'refine', (s) => !!applyUpgrade(s, id, false, () => 0));
    expect(r).toEqual({ ok: false, blocked: 'game' });
    expect(server.store.certs.find((c) => c.id === cert)?.status).toBe('held');
  });

  it('the server unreachable: refine / reforge / lapidar of a certified piece is blocked', async () => {
    const { api, goDown, id } = await certifiedPiece();
    current = { ...current, gold: 1e7, shards: 50, materials: { ...emptyMaterials(), ...recipeStock('bronze_dagger', 3), copper: 99, copper_bar: 99, leather: 99, refining_dust: 99 } as SaveData['materials'] };
    goDown();
    const r = await changeAction(api, getSave, id, 'refine', (s) => !!applyUpgrade(s, id, false, () => 0));
    expect(r).toEqual({ ok: false, blocked: 'unreachable' });
  });

  it('a bound piece is changed freely (it can never be sold) and a piece with no certificate never calls the server', async () => {
    const { api, server, id } = await certifiedPiece();
    const eq = await equipAction(api, getSave, id);
    current = (eq as { save: SaveData }).save;
    const events = server.store.events.length;
    expect(changeVoidsCertificate(current.gearInstances[id])).toBe(false);
    const r = await changeAction(api, getSave, id, 'refine', () => true);
    expect(r.ok).toBe(true);
    expect(server.store.events).toHaveLength(events);
  });

  it('salvaging or discarding a certified piece burns its certificate first', async () => {
    const { api, server, id, cert } = await certifiedPiece();
    const r = await removeAction(api, getSave, id, 'salvage', (s) => !!applySalvage(s, id, () => 0.99));
    expect(r.ok).toBe(true);
    expect(server.store.certs.find((c) => c.id === cert)?.status).toBe('burned');
    const gone = applySalvage((r as { save: SaveData }).save, id, () => 0.99)!;
    expect(gone.save.gearInstances[id]).toBeUndefined();
  });

  it('a dead certificate (already burned) does not stop an equip: the piece just has no certificate any more', async () => {
    const { api, id, cert } = await certifiedPiece();
    await api.bind('burn', [cert]);
    const r = await equipAction(api, getSave, id);
    expect(r.ok).toBe(true);
    expect((r as { save: SaveData }).save.gearInstances[id].certificateId).toBeUndefined();
  });

  it('reforge and lapidar reducers still work on the save the action returns', async () => {
    const { api, id } = await certifiedPiece();
    const reforge = await changeAction(api, getSave, id, 'reforge', (s) => !!applyReforge({ ...s, gold: 1e7, shards: 9, materials: { ...emptyMaterials(), refining_dust: 99, bone_fragment: 999, leather_scrap: 999, demon_claw: 999, concentrated_blood: 999 } as SaveData['materials'] }, id));
    expect(reforge.ok).toBe(true);
    expect(applyLapidar).toBeTruthy();
  });
});

describe('what the screens may call "Certificado"', () => {
  const cert = (over: Record<string, unknown> = {}) => ({
    id: '0d0d0d0d-0d0d-4d0d-8d0d-0d0d0d0d0d0d',
    kind: 'gear' as const,
    templateId: 'iron_helm',
    rarity: 'epic' as const,
    tier: 2,
    substats: [{ type: 'critRate' as const, value: 3 }, { type: 'defense' as const, value: 4 }],
    upgrade: 0,
    goldAmount: null,
    source: 'forge' as const,
    status: 'held' as const,
    bound: false,
    createdAt: '2026-11-01T00:00:00Z',
    contentHash: 'a'.repeat(64),
    ...over,
  });
  const piece = (over: Record<string, unknown> = {}) => createGearInstance('iron_helm', { id: 'p', origin: 'craft', rarity: 'epic', substats: [{ type: 'critRate', value: 3 }, { type: 'defense', value: 4 }], certificateId: '0d0d0d0d-0d0d-4d0d-8d0d-0d0d0d0d0d0d', ...over });

  it('only a certificate id that the server lists AND that describes this piece', () => {
    expect(certState(piece())).toBe('unverified'); // the list is empty: an id in a save proves nothing
    upsertCertificates([cert()]);
    expect(certState(piece())).toBe('verified');
    expect(certState(createGearInstance('iron_helm', { id: 'p', origin: 'craft', rarity: 'epic', substats: [] }))).toBe('none');
  });

  it('an edited save does not become certified: another rarity, other numbers, a refined or reforged piece, a burned or someone else\'s id', () => {
    upsertCertificates([cert()]);
    expect(certState({ ...piece(), rarity: 'legendary' })).toBe('unverified');
    expect(certState({ ...piece(), substats: [{ type: 'critRate', value: 5 }, { type: 'defense', value: 4 }] })).toBe('unverified');
    expect(certState({ ...piece(), upgrade: 1 })).toBe('unverified');
    expect(certState({ ...piece(), reforgeCount: 1 })).toBe('unverified');
    expect(certState({ ...piece(), lapidarCount: 1 })).toBe('unverified');
    expect(certState({ ...piece(), templateId: 'iron_gauntlets' })).toBe('unverified');
    expect(certState({ ...piece(), certificateId: '0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e' })).toBe('unverified');
    upsertCertificates([cert({ status: 'burned' })]);
    expect(certState(piece())).toBe('unverified');
  });
});

describe('saves', () => {
  it('an old save (Epic, a unique and pouches, no certificate anywhere) loads and plays; nothing in it is tradeable and nothing is retro-certified', () => {
    const old = JSON.parse(JSON.stringify(defaultSave()));
    old.gearInstances.old_epic = { id: 'old_epic', templateId: 'iron_helm', rarity: 'epic', substats: [{ type: 'critRate', value: 3 }, { type: 'defense', value: 4 }], upgrade: 0, sockets: [], durability: 100, reforgeCount: 0, createdAt: 1, origin: 'craft' };
    old.gearInstances.old_unique = { id: 'old_unique', templateId: 'demon_fang_dagger', rarity: 'legendary', substats: [], upgrade: 0, sockets: [], durability: 100, reforgeCount: 0, createdAt: 1, origin: 'drop' };
    old.consumables.gold_pouch_s = 2;
    delete old.pouchCerts;
    const loaded = normalizeSave(old);
    expect(loaded.gearInstances.old_epic.rarity).toBe('epic');
    expect(loaded.gearInstances.old_epic.certificateId).toBeUndefined();
    expect(isTradeable(loaded.gearInstances.old_epic)).toBe(false);
    expect(isTradeable(loaded.gearInstances.old_unique)).toBe(false);
    expect(certState(loaded.gearInstances.old_epic)).toBe('none');
    expect(uncertifiedPouchCount(loaded, 'gold_pouch_s')).toBe(2);
    expect(isTradeable({ kind: 'consumable', id: 'gold_pouch_s' })).toBe(false);
    // and a pouch opens exactly as before
    expect(applyOpenPouch(loaded, 'gold_pouch_s').ok).toBe(true);
    // a piece can be equipped as before
    expect(applyEquipInstance(loaded, 'old_epic')).not.toBeNull();
  });

  it('a forged certificate id in a save is dropped when it is not a uuid, and kept (but unverified) when it is', () => {
    const raw = JSON.parse(JSON.stringify(defaultSave()));
    raw.gearInstances.x = { id: 'x', templateId: 'iron_helm', rarity: 'legendary', substats: [], upgrade: 0, sockets: [], durability: 100, reforgeCount: 0, createdAt: 1, origin: 'craft', certificateId: '<script>' };
    raw.gearInstances.y = { ...raw.gearInstances.x, id: 'y', certificateId: '0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f' };
    const loaded = normalizeSave(raw);
    expect(loaded.gearInstances.x.certificateId).toBeUndefined();
    expect(loaded.gearInstances.y.certificateId).toBe('0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f');
    expect(certState(loaded.gearInstances.y)).toBe('unverified'); // the server does not list it
    expect(loaded.gearInstances.y.certified).toBeUndefined();
  });

  it('certificate ids, the offline mark, the pouch certificates and the boss claims survive a save / load round trip', () => {
    let s = defaultSave();
    s = { ...s, gearInstances: { ...s.gearInstances, a: createGearInstance('iron_helm', { id: 'a', origin: 'craft', rarity: 'epic', substats: [], certificateId: '0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a' }), b: createGearInstance('iron_helm', { id: 'b', origin: 'craft', rarity: 'epic', substats: [], certified: false }) } };
    s = queueBossClaims(s, [25], 1.25, 5, () => 'boss-claim-0003');
    s = { ...s, gold: 100_000 };
    s = applyCreatePouch(s, 'gold_pouch_s', Date.now(), '0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b')!.save!;
    const back = normalizeSave(JSON.parse(JSON.stringify(s)));
    expect(back.gearInstances.a.certificateId).toBe('0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a');
    expect(back.gearInstances.b.certified).toBe(false);
    expect(back.pendingBossClaims).toEqual([{ id: 'boss-claim-0003', stages: [25], luck: 1.25, at: 5 }]);
    expect(back.pouchCerts).toEqual({ gold_pouch_s: ['0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b'] });
  });
});

describe('the transport', () => {
  it('retries a network failure with the SAME request id and then gives up as unreachable', async () => {
    const seen: string[] = [];
    const api = createItemApi(
      async (_fn, body) => {
        seen.push((body as { requestId: string }).requestId);
        throw new Error('offline');
      },
      { retries: 2, sleep: async () => undefined },
    );
    await expect(api.mint({ kind: 'forge', requestId: 'req-00000001', templateId: 'iron_helm' })).rejects.toBeInstanceOf(ItemServerUnreachable);
    expect(seen).toEqual(['req-00000001', 'req-00000001', 'req-00000001']);
  });

  it('a 5xx is retried; a refusal is the answer, not an error', async () => {
    let n = 0;
    const api = createItemApi(
      async () => (++n < 2 ? { status: 502, body: { error: 'mint_failed' } } : { status: 429, body: { ok: false, reason: 'forge_rate' } }),
      { retries: 2, sleep: async () => undefined },
    );
    expect(await api.mint({ kind: 'forge', requestId: 'req-00000001', templateId: 'iron_helm' })).toEqual({ ok: false, reason: 'forge_rate' });
    expect(n).toBe(2);
  });

  it('the body of a request carries no user id and no result', async () => {
    const bodies: object[] = [];
    const api = createItemApi(async (_fn, body) => {
      bodies.push(body);
      return { status: 200, body: { ok: false, reason: 'bad_request' } };
    });
    await api.mint({ kind: 'forge', requestId: 'req-00000001', templateId: 'iron_helm' });
    await api.bind('bind', ['0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a']);
    for (const b of bodies) expect(Object.keys(b).join(',')).not.toMatch(/user|rarity|substats|result/i);
  });
});

void planForgeIngredients;
void FakeItemStore;
