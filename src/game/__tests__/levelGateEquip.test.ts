import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { computeCP, defaultSave, normalizeSave, playerLevel, SaveData, xpToReachLevel } from '../engine';
import { GEAR, getGear, gearRequiredLevel, isInstancedSlot } from '../gear';
import { applyEquipInstance, applyUnequipSlot, createGearInstance, equipBlock, equipLevelBlock, wornAboveLevel } from '../gearInstances';
import { setItemAuthority } from '../itemAuthority';
import { clearCertificates } from '../itemCerts';
import { ItemApi, createItemApi } from '../itemServer';
import { equipAction } from '../itemActions';
import { usableAtLevel } from '../market/levelNote';
import en from '../../locales/en.json';
import pt from '../../locales/pt.json';
import { mt } from '../../locales/market';
import { DAY, USER_A, makeServer } from '../../../supabase/functions/_shared/__tests__/fakeItemStore';

// Wearing a piece needs the hero level its recipe needs (gear.ts gearRequiredLevel). Buying or finding one above the level is fine; putting it on is refused, in the reducer, in every button, in the
// web build's equip action and, for a certified piece, by the server (bind-item).

const heroAt = (level: number, extra: Partial<SaveData> = {}): SaveData => ({ ...defaultSave(), xp: xpToReachLevel(level), ...extra });
const withPiece = (s: SaveData, templateId: string, id = 'p1'): SaveData => ({
  ...s,
  gearInstances: { ...s.gearInstances, [id]: createGearInstance(templateId, { id, origin: 'craft', rarity: 'common', substats: [] }) },
});

describe('the level a piece needs', () => {
  it('is the recipe level; a piece made from another inherits its gate; starters, tier 1 and relics need none', () => {
    expect(gearRequiredLevel('iron_helm')).toBe(10);
    expect(gearRequiredLevel('steel_greatsword')).toBe(25);
    expect(gearRequiredLevel('voidsteel_blade')).toBe(70);
    expect(gearRequiredLevel('abyssal_greatblade')).toBe(90);
    expect(gearRequiredLevel('abyssal_ring')).toBe(100);
    expect(gearRequiredLevel('bronze_dagger')).toBe(0);
    expect(gearRequiredLevel('wooden_club')).toBe(0);
    expect(gearRequiredLevel('nothing_here')).toBe(0);
  });

  it('a unique takes the level of its twin tier', () => {
    const uniques = GEAR.filter((g) => g.unique);
    expect(uniques.length).toBeGreaterThan(10);
    for (const u of uniques) {
      expect(u.salvageLike, u.id).toBeTruthy();
      expect(gearRequiredLevel(u), u.id).toBe(gearRequiredLevel(u.salvageLike as string));
    }
    expect(gearRequiredLevel('demon_fang_dagger')).toBe(10); // twin: iron_short_sword
    expect(gearRequiredLevel('goblin_king_crown')).toBe(25); // twin: steel_helm
    expect(gearRequiredLevel('overlord_greataxe')).toBe(90); // twin: abyssal_reaver
  });

  it('relics (crafted, boss drops, the Season Relic) define no level: they can be worn by anyone, as before', () => {
    for (const g of GEAR.filter((x) => x.slot === 'relic')) {
      expect(gearRequiredLevel(g), g.id).toBe(0);
      expect(equipLevelBlock(heroAt(1), g.id), g.id).toBeNull();
    }
  });

  it('is monotone along every forge chain (a better piece never needs a lower level than the one it is made from)', () => {
    for (const g of GEAR) for (const input of Object.keys(g.recipe?.items ?? {})) expect(gearRequiredLevel(g), g.id).toBeGreaterThanOrEqual(gearRequiredLevel(input));
  });
});

describe('equipping: refused below the level, allowed at it', () => {
  it('a level 10 piece: refused at 9 (the save is untouched), allowed at 10', () => {
    const low = withPiece(heroAt(9), 'iron_helm');
    expect(applyEquipInstance(low, 'p1')).toBeNull();
    expect(low.equipped.helmet).toBeNull();
    expect(equipBlock(low, 'p1')).toEqual({ reason: 'level', requiredLevel: 10, heroLevel: 9 });
    const ok = withPiece(heroAt(10), 'iron_helm');
    expect(equipBlock(ok, 'p1')).toBeNull();
    expect(applyEquipInstance(ok, 'p1')?.equipped.helmet).toBe('p1');
  });

  it('every forgeable and unique piece of the game: one level short is refused, the exact level is allowed', () => {
    for (const g of GEAR) {
      if (g.slot === 'relic' || !isInstancedSlot(g.slot) || !g.tier) continue;
      const need = gearRequiredLevel(g);
      if (need > 1) {
        const short = withPiece(heroAt(need - 1), g.id);
        expect(applyEquipInstance(short, 'p1'), `${g.id} at ${need - 1}`).toBeNull();
      }
      const exact = withPiece(heroAt(Math.max(1, need)), g.id);
      expect(applyEquipInstance(exact, 'p1'), `${g.id} at ${need}`).not.toBeNull();
    }
  });

  it('a unique is refused below its twin\'s level and worn at it', () => {
    expect(applyEquipInstance(withPiece(heroAt(24), 'goblin_king_crown'), 'p1')).toBeNull();
    expect(applyEquipInstance(withPiece(heroAt(25), 'goblin_king_crown'), 'p1')?.equipped.helmet).toBe('p1');
  });

  it('buying or finding a piece above the level is not blocked: it sits in the bag, and wearing waits for the level', () => {
    const s = withPiece(heroAt(30), 'voidsteel_blade');
    expect(s.gearInstances.p1).toBeDefined();
    expect(applyEquipInstance(s, 'p1')).toBeNull();
    const later = { ...s, xp: xpToReachLevel(70) };
    expect(playerLevel(later.xp)).toBe(70);
    expect(applyEquipInstance(later, 'p1')?.equipped.weapon).toBe('p1');
  });

  it('swapping a worn piece for one above the level is refused too: the worn one stays', () => {
    let s = withPiece(heroAt(12), 'iron_helm', 'a');
    s = applyEquipInstance(s, 'a') as SaveData;
    s = withPiece(s, 'steel_helm', 'b');
    expect(applyEquipInstance(s, 'b')).toBeNull();
    expect(s.equipped.helmet).toBe('a');
  });

  it('the simulation\'s what-if probe can skip the rule; a player action never does', () => {
    const s = withPiece(heroAt(1), 'abyssal_greatblade');
    expect(applyEquipInstance(s, 'p1')).toBeNull();
    expect(applyEquipInstance(s, 'p1', { skipLevelGate: true })?.equipped.weapon).toBe('p1');
  });
});

describe('old saves: a piece already worn above the hero level', () => {
  const oldSave = (): SaveData => {
    // a save written before the rule: a level 5 hero wearing a tier 6 sword and a level 10 helm
    let s = heroAt(5);
    s = withPiece(s, 'abyssal_greatblade', 'sword');
    s = withPiece(s, 'iron_helm', 'helm');
    s = { ...s, equipped: { ...s.equipped, weapon: 'sword', helmet: 'helm' } };
    return normalizeSave(JSON.parse(JSON.stringify(s)));
  };

  it('stays equipped after loading (nothing is stripped silently) and keeps counting in the stats', () => {
    const s = oldSave();
    expect(s.equipped.weapon).toBe('sword');
    expect(s.equipped.helmet).toBe('helm');
    const without = applyUnequipSlot(applyUnequipSlot(s, 'weapon'), 'helmet');
    expect(computeCP(s)).toBeGreaterThan(computeCP(without));
  });

  it('is flagged: the sheet and the bag list the pieces above the level and the level each needs', () => {
    const flagged = wornAboveLevel(oldSave());
    expect(flagged.map((f) => [f.slot, f.templateId, f.requiredLevel])).toEqual([
      ['weapon', 'abyssal_greatblade', 90],
      ['helmet', 'iron_helm', 10],
    ]);
  });

  it('the flag is gone as the hero reaches the level, and a clean save flags nothing', () => {
    const s = oldSave();
    expect(wornAboveLevel({ ...s, xp: xpToReachLevel(10) }).map((f) => f.templateId)).toEqual(['abyssal_greatblade']);
    expect(wornAboveLevel({ ...s, xp: xpToReachLevel(90) })).toEqual([]);
    expect(wornAboveLevel(defaultSave())).toEqual([]);
  });

  it('once taken off it cannot be put back until the level is there', () => {
    const off = applyUnequipSlot(oldSave(), 'weapon');
    expect(applyEquipInstance(off, 'sword')).toBeNull();
    expect(applyEquipInstance({ ...off, xp: xpToReachLevel(90) }, 'sword')?.equipped.weapon).toBe('sword');
  });
});

describe('the web build: equipAction and the server (bind-item)', () => {
  const REQ = 'req-00000001';
  function setup() {
    const rolls = [0.95, 0, 0, 0, 0]; // an Epic: certified
    let i = 0;
    const server = makeServer({ rng: () => (i < rolls.length ? rolls[i++] : 0.99) });
    server.store.accountCreatedMs = Date.UTC(2026, 3, 1);
    server.store.nowMs = Date.UTC(2026, 3, 1) + 200 * DAY;
    let calls = 0;
    const api: ItemApi = createItemApi(
      async (fn, body) => {
        calls++;
        const r = fn === 'mint-item' ? await server.mint(body) : await server.bind(body);
        return { status: r.status, body: r.body };
      },
      { retries: 0, sleep: async () => undefined },
    );
    return { server, api, calls: () => calls };
  }
  async function certified(server: ReturnType<typeof makeServer>, level: number, templateId = 'iron_helm') {
    const minted = await server.mint({ kind: 'forge', requestId: REQ, templateId });
    const certificateId = (minted.body.item as { certificate: { id: string } }).certificate.id;
    const base = heroAt(level);
    const inst = createGearInstance(templateId, { id: 'p1', origin: 'craft', rarity: 'epic', substats: [], certificateId });
    return { save: { ...base, gearInstances: { ...base.gearInstances, p1: inst } } as SaveData, certificateId };
  }

  beforeEach(() => {
    clearCertificates();
    setItemAuthority('server');
  });
  afterEach(() => {
    setItemAuthority('local');
    clearCertificates();
  });

  it('below the level the action is refused before the server is even asked, and nothing is bound', async () => {
    const { server, api, calls } = setup();
    const { save, certificateId } = await certified(server, 9);
    const r = await equipAction(api, () => save, 'p1');
    expect(r).toMatchObject({ ok: false, blocked: 'game', reason: 'level' });
    expect(calls()).toBe(0);
    expect(server.store.certs.find((c) => c.id === certificateId)?.bound).toBe(false);
  });

  it('at the level but with the server\'s snapshot behind: the SERVER refuses the bind (level_too_low), the piece stays unbound; once the snapshot catches up it works', async () => {
    const { server, api } = setup();
    const { save, certificateId } = await certified(server, 10);
    const refused = await equipAction(api, () => save, 'p1');
    expect(refused).toMatchObject({ ok: false, blocked: 'refused', reason: 'level_too_low' });
    expect(server.store.certs.find((c) => c.id === certificateId)?.bound).toBe(false);
    expect(save.equipped.helmet).toBeNull();
    server.store.acceptedLevels.set(USER_A, 10);
    const ok = await equipAction(api, () => save, 'p1');
    expect(ok.ok).toBe(true);
    expect((ok as { save: SaveData }).save.equipped.helmet).toBe('p1');
    expect(server.store.certs.find((c) => c.id === certificateId)?.bound).toBe(true);
  });
});

describe('the market detail and the disabled button say it in both languages', () => {
  const fill = (s: string, n: number): string => s.replace('{n}', String(n));
  const tr = (locale: typeof en, path: string): string => path.split('.').reduce<unknown>((node, k) => (node as Record<string, unknown>)[k], locale) as string;

  it('Requer nível N / Requires level N (the button), the warning for a piece worn above the level and the server refusal exist in pt and en', () => {
    expect(fill(tr(pt, 'inventory.requiresLevel'), 70)).toBe('Requer nível 70');
    expect(fill(tr(en, 'inventory.requiresLevel'), 70)).toBe('Requires level 70');
    for (const key of ['inventory.wornAboveLevel', 'items.refused.level_too_low']) {
      expect(tr(pt, key).length, `pt ${key}`).toBeGreaterThan(10);
      expect(tr(en, key).length, `en ${key}`).toBeGreaterThan(10);
    }
    expect(tr(pt, 'inventory.wornAboveLevel')).toContain('{n}');
    expect(tr(en, 'inventory.wornAboveLevel')).toContain('{n}');
  });

  it('the market detail warns "Você poderá usar no nível 70" / "You will be able to use it at level 70" only for a gear listing above the buyer\'s level', () => {
    expect(mt('browse.usableAtLevel', { n: 70 })).toMatch(/70/);
    expect(usableAtLevel({ kind: 'gear', template_id: 'voidsteel_blade' }, 50)).toBe(70);
    expect(usableAtLevel({ kind: 'unique', template_id: 'goblin_king_crown' }, 24)).toBe(25);
    expect(usableAtLevel({ kind: 'gear', template_id: 'voidsteel_blade' }, 70)).toBeNull();
    expect(usableAtLevel({ kind: 'gear', template_id: 'bronze_dagger' }, 1)).toBeNull();
    expect(usableAtLevel({ kind: 'gold_pouch', template_id: 'gold_pouch_s' }, 1)).toBeNull();
    expect(usableAtLevel({ kind: 'material', template_id: 'iron' }, 1)).toBeNull();
    expect(usableAtLevel({ kind: 'gear', template_id: 'voidsteel_blade' }, undefined)).toBeNull();
    expect(getGear('voidsteel_blade')).toBeTruthy();
  });
});
