import { describe, expect, it } from 'vitest';
import pt from '../../locales/pt.json';
import en from '../../locales/en.json';
import { EVENT_BUFF_RULES, EVENT_XP_CAP, HUNT_EVENT_RULES } from '../leagueEvents';

// The card of a League event repeats numbers that live in leagueEvents.ts (the rules the hunt reads). The Target card promised "+8%" for a long time while the buffs stacked up to +15%: someone changed the code and the
// text kept the old promise. This test reads the numbers FROM THE RULES and requires them in the text of the card, in both languages, so changing a rule forces a change of the card in the same commit.
const findKey = (tree: unknown, key: string): string => {
  if (tree && typeof tree === 'object') {
    for (const [k, v] of Object.entries(tree as Record<string, unknown>)) {
      if (k === key && typeof v === 'string') return v;
      const r = findKey(v, key);
      if (r) return r;
    }
  }
  return '';
};
const card = (lang: 'pt' | 'en', id: string): string => findKey(lang === 'pt' ? pt : en, `desc_${id}`);
const num = (lang: 'pt' | 'en', x: number): string => (lang === 'pt' ? String(x).replace('.', ',') : String(x));
const pct = (x: number): number => Math.round(x * 100);
// "1h30" for 1.5 hours, "4 h" for 4
const hours = (h: number): string[] => (Number.isInteger(h) ? [`${h} h`, `${h}h`] : [`${Math.floor(h)}h${String(Math.round((h % 1) * 60)).padStart(2, '0')}`]);
const word = { pt: { 2: 'dobro' }, en: { 2: 'twice' } } as const;

describe('the League event cards say what the rules pay', () => {
  for (const lang of ['pt', 'en'] as const) {
    it(`${lang}: Cacada ao Alvo (target_hunt) — the fight count, the HP, the damage, the buff, its duration and the cap`, () => {
      const r = HUNT_EVENT_RULES.target_hunt!;
      const text = card(lang, 'target_hunt');
      expect(text, 'the card exists').not.toBe('');
      expect(text).toContain(String(r.targetEvery));
      expect(text).toContain(r.targetHp! in word[lang] ? word[lang][r.targetHp as 2] : num(lang, r.targetHp!));
      expect(text).toContain(num(lang, r.targetDmg!));
      expect(text).toContain(`+${pct(r.targetBuffPct!)}%`);
      expect(hours(r.targetBuffHours!).some((h) => text.includes(h)), `the duration ${r.targetBuffHours} h`).toBe(true);
      expect(text, 'the cap of all the event bonuses together').toContain(`+${pct(EVENT_XP_CAP)}%`);
    });

    it(`${lang}: Invasao (invasion) and Fenda Temporal (time_rift) — the streak step, its gain and cap, the escalation, the damage`, () => {
      const inv = HUNT_EVENT_RULES.invasion!;
      const t = card(lang, 'invasion');
      expect(t).toContain(`+${pct(inv.streakGain!)}%`);
      expect(t).toContain(String(inv.streakStep));
      expect(t).toContain(`+${pct(inv.streakCap!)}%`);
      expect(t).toContain(String(inv.escalateEvery));
      const rift = HUNT_EVENT_RULES.time_rift!;
      const r = card(lang, 'time_rift');
      expect(r).toContain(`${pct(rift.enemyDmgPct!)}%`);
      expect(r).toContain(`+${pct(rift.streakGain!)}%`);
      expect(r).toContain(String(rift.streakStep));
      expect(r).toContain(`+${pct(rift.streakCap!)}%`);
    });

    it(`${lang}: Corrida da Masmorra (dungeon_race) and Grande Entrega (grand_delivery) — the gold, the buff and its duration`, () => {
      const race = EVENT_BUFF_RULES.dungeon_race;
      const t = card(lang, 'dungeon_race');
      expect(t).toContain(String(race.goldPerBoss));
      expect(t).toContain(`+${pct(race.pct)}%`);
      expect(hours(race.hours).some((h) => t.includes(h)), `${race.hours} h`).toBe(true);
      const del = EVENT_BUFF_RULES.grand_delivery;
      const d = card(lang, 'grand_delivery');
      expect(d).toContain(`+${pct(del.pct)}%`);
      expect(hours(del.hours).some((h) => d.includes(h)), `${del.hours} h`).toBe(true);
    });
  }
});
