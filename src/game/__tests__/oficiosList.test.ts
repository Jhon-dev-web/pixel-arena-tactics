import { describe, expect, it } from 'vitest';
import { oficioBlockKind, oficioLocked, orderOficios, pickOficioId } from '../oficiosList';

const e = (id: string, requiredLevel: number, craftable: boolean) => ({ id, requiredLevel, craftable });

describe('orderOficios', () => {
  const list = [e('a', 0, false), e('b', 0, true), e('c', 20, false), e('d', 10, false), e('f', 5, true), e('g', 10, false)];

  it('puts craftable recipes first, keeps the station order inside each group', () => {
    const { available } = orderOficios(list, 5);
    expect(available.map((x) => x.id)).toEqual(['b', 'f', 'a']);
  });

  it('moves level-locked recipes to the end, nearest level first, stable on ties', () => {
    const { locked } = orderOficios(list, 5);
    expect(locked.map((x) => x.id)).toEqual(['d', 'g', 'c']);
  });

  it('unlocks at exactly the required level', () => {
    expect(oficioLocked(10, 9)).toBe(true);
    expect(oficioLocked(10, 10)).toBe(false);
    expect(orderOficios(list, 10).locked.map((x) => x.id)).toEqual(['c']);
  });

  it('never loses or duplicates a recipe and does not mutate the input', () => {
    const copy = [...list];
    const { available, locked } = orderOficios(list, 12);
    expect([...available, ...locked].map((x) => x.id).sort()).toEqual(['a', 'b', 'c', 'd', 'f', 'g']);
    expect(list).toEqual(copy);
  });
});

describe('pickOficioId', () => {
  const list = [e('a', 0, false), e('b', 0, true), e('c', 20, false)];
  it('honours a deep link to a recipe of the station, even a locked one', () => {
    expect(pickOficioId(list, 1, 'c')).toBe('c');
  });
  it('ignores a deep link to another station', () => {
    expect(pickOficioId(list, 1, 'zzz')).toBe('b');
  });
  it('falls back to the first open recipe, then the nearest locked one, then null', () => {
    expect(pickOficioId([e('a', 0, false), e('b', 0, false)], 1)).toBe('a');
    expect(pickOficioId([e('x', 30, false), e('y', 20, false)], 1)).toBe('y');
    expect(pickOficioId([], 1)).toBeNull();
  });
});

describe('oficioBlockKind', () => {
  it('maps the batch failures to the messages the sheet shows', () => {
    expect(oficioBlockKind(null)).toBeNull();
    expect(oficioBlockKind('busy')).toBe('busy');
    expect(oficioBlockKind('level')).toBe('level');
    expect(oficioBlockKind('materials')).toBe('materials');
    expect(oficioBlockKind('gold')).toBe('gold');
    expect(oficioBlockKind('bag')).toBe('bag');
    expect(oficioBlockKind('tier')).toBe('other');
  });
});
