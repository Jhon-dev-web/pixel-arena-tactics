import { describe, expect, it } from 'vitest';
import en from '../../locales/en.json';
import pt from '../../locales/pt.json';
import { defaultSave, normalizeSave, SaveData } from '../engine';
import { CODEX_ITEMS, CODEX_MATERIALS, CODEX_MONSTERS, codexPct, codexProgress, discoveredFromSave, emptyCodex, materialSources, monsterDrops, normalizeCodex, updateCodex } from '../codex';
import { MATERIALS } from '../materials';
import { GEAR } from '../gear';
import { createGearInstance } from '../gearInstances';
import { QUESTS_ACHIEVEMENTS, isComplete } from '../quests';
import { questContext } from '../questContext';
import { recordDungeonRun, trackSave } from '../statsTracking';
import { recordKills } from '../stats';
import { HUNTING_ZONES } from '../huntingZones';

const lookup = (tree: unknown, path: string): unknown => path.split('.').reduce<unknown>((n, k) => (n && typeof n === 'object' ? (n as Record<string, unknown>)[k] : undefined), tree);

describe('codex catalog', () => {
  it('lists real pieces only: no starters, no Pass-only emblem; every material has a source; every name exists in both languages', () => {
    const ids = new Set(CODEX_ITEMS.map((g) => g.id));
    for (const g of GEAR.filter((x) => x.tier === 0 && !x.recipe && !x.source)) expect(ids.has(g.id), g.id).toBe(false);
    expect(ids.has('season_emblem')).toBe(false);
    expect(ids.has('bronze_dagger')).toBe(true);
    expect(ids.has('demon_fang_dagger')).toBe(true); // a unique
    expect(ids.has('goblin_lucky_coin')).toBe(true); // a boss relic
    expect(CODEX_ITEMS.length).toBeGreaterThan(60);
    for (const m of CODEX_MATERIALS) expect(materialSources(m).length, m).toBeGreaterThan(0);
    // anything left out has truly no source
    for (const m of MATERIALS) if (!CODEX_MATERIALS.includes(m.id)) expect(materialSources(m.id)).toEqual([]);
    for (const g of CODEX_ITEMS) for (const tree of [pt, en]) expect(typeof lookup(tree, `gear.${g.nameKey}`), g.id).toBe('string');
    for (const m of CODEX_MONSTERS) for (const tree of [pt, en]) expect(typeof lookup(tree, `enemies.${m.nameKey}`), m.id).toBe('string');
    expect(GEAR.length).toBeGreaterThan(CODEX_ITEMS.length - 1);
  });

  it('has the four hunting monsters and the dungeon ones in floor order, with their floor ranges', () => {
    const hunt = CODEX_MONSTERS.filter((m) => m.kind === 'hunt');
    expect(hunt).toHaveLength(HUNTING_ZONES.length);
    const dungeon = CODEX_MONSTERS.filter((m) => m.kind === 'dungeon' && !m.depthPool);
    expect(dungeon.length).toBeGreaterThanOrEqual(4);
    expect(dungeon[0].floors?.[0]).toBe(1);
    expect(dungeon[dungeon.length - 1].floors?.[1]).toBe(100);
  });

  it('a monster drop table speaks in words, never numbers; uniques are "very rare"', () => {
    const glade = CODEX_MONSTERS.find((m) => m.zone?.id === 'demon_glade')!;
    const drops = monsterDrops(glade);
    expect(drops.some((d) => d.kind === 'material')).toBe(true);
    expect(drops.some((d) => d.kind === 'item' && d.wording === 'unique')).toBe(true);
    for (const d of drops) expect(['common', 'uncommon', 'rare', 'unique']).toContain(d.wording);
    const goblinKing = CODEX_MONSTERS.find((m) => m.kind === 'dungeon' && m.floors && m.floors[0] <= 25 && m.floors[1] >= 25)!;
    expect(monsterDrops(goblinKing).some((d) => d.id === 'goblin_king_crown')).toBe(true);
  });
});

describe('codex discovery', () => {
  it('a new save has found nothing but what it is holding (the starters are not listed)', () => {
    const s = defaultSave();
    expect(s.codex).toEqual(emptyCodex());
    expect(codexPct(s.codex)).toBe(0);
  });

  it('an old save without a codex is backfilled from its bag, gear, kills and floors', () => {
    const s = defaultSave();
    const inst = createGearInstance('bronze_dagger', { id: 'g1', origin: 'craft', rarity: 'common', substats: [] });
    const old = JSON.parse(JSON.stringify({ ...s, gearInstances: { ...s.gearInstances, g1: inst }, materials: { ...s.materials, leather: 3 }, inventory: { goblin_lucky_coin: 1 }, stats: { ...s.stats, killsByZone: { demon_glade: 12 } } })) as Record<string, unknown>;
    delete old.codex;
    (old.quests as { counters: { maxFloorCleared: number } }).counters.maxFloorCleared = 30;
    const loaded = normalizeSave(old);
    expect(loaded.codex.items).toEqual(expect.arrayContaining(['bronze_dagger', 'goblin_lucky_coin']));
    expect(loaded.codex.materials).toContain('leather');
    expect(loaded.codex.monsters).toContain('demon');
    expect(loaded.codex.monsters).toContain('goblinRogue');
    expect(loaded.codex.monsters).toContain('orcBerserker');
    expect(loaded.codex.monsters).not.toContain('soulLich');
  });

  it('corrupt stored ids are dropped; discovery is never lost', () => {
    const s = defaultSave();
    const c = normalizeCodex({ items: ['bronze_dagger', 'nope', 7], materials: 'x', monsters: ['demon'] }, s);
    expect(c.items).toEqual(['bronze_dagger']);
    expect(c.materials).toEqual([]);
    expect(c.monsters).toEqual(['demon']);
  });

  it('trackSave learns new things as the save changes, and keeps them after the item is gone', () => {
    const a = defaultSave();
    const b: SaveData = { ...a, materials: { ...a.materials, demon_core: 2 } };
    const learned = trackSave(a, b);
    expect(learned.codex.materials).toContain('demon_core');
    const gone = trackSave(learned, { ...learned, materials: { ...learned.materials, demon_core: 0 } });
    expect(gone.codex.materials).toContain('demon_core');
    // nothing changed -> the very same object back
    expect(updateCodex(gone, gone)).toBe(gone);
    // a hunt win discovers its monster; a dungeon run discovers the floors' monsters
    const hunted = trackSave(gone, recordKills(gone, 'demon_glade', 5));
    expect(hunted.codex.monsters).toContain('demon');
    const ran = trackSave(hunted, recordDungeonRun(hunted, 23, 3));
    expect(ran.codex.monsters).toEqual(expect.arrayContaining(['goblinRogue', 'forestWolf']));
    expect(ran.stats.dungeonKills.goblinRogue).toBeGreaterThan(0);
    expect(discoveredFromSave(ran).monsters).toEqual(expect.arrayContaining(['demon', 'goblinRogue']));
  });

  it('completion: per tab and overall, 100 only when everything is found; the codex achievements hang on it', () => {
    const full = { items: CODEX_ITEMS.map((g) => g.id), materials: [...CODEX_MATERIALS], monsters: CODEX_MONSTERS.map((m) => m.id) };
    expect(codexProgress(full).overall.pct).toBe(100);
    expect(codexProgress({ ...full, monsters: full.monsters.slice(1) }).overall.pct).toBe(99);
    const half = { items: full.items.slice(0, Math.ceil(full.items.length / 2)), materials: full.materials.slice(0, Math.ceil(full.materials.length / 2)), monsters: full.monsters.slice(0, Math.ceil(full.monsters.length / 2)) };
    const s = { ...defaultSave(), codex: half };
    const by = (id: string) => QUESTS_ACHIEVEMENTS.find((q) => q.id === id)!;
    const ctx = questContext(s);
    expect(isComplete(by('ACH_CODEX_25'), s.quests, ctx)).toBe(true);
    expect(isComplete(by('ACH_CODEX_50'), s.quests, ctx)).toBe(true);
    expect(isComplete(by('ACH_CODEX_75'), s.quests, ctx)).toBe(false);
    expect(isComplete(by('ACH_CODEX_100'), s.quests, ctx)).toBe(false);
    expect(isComplete(by('ACH_CODEX_100'), s.quests, questContext({ ...s, codex: full }))).toBe(true);
  });
});
