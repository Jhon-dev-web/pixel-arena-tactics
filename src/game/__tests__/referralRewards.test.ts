import { describe, expect, it } from 'vitest';
import { defaultSave, normalizeSave } from '../engine';
import { REFERRAL_COSMETICS, applyReferralCosmetics, referralCosmeticIds } from '../referralRewards';
import { getTitleDef } from '../titles';
import { getFrameDef, sanitizeActiveFrame } from '../seasonItems';
import { DEFAULT_REFERRAL_TIERS, inviteLink, parseReferralStatus, parseReferralTiers, tierProgress } from '../../lib/referral';
import pt from '../../locales/pt.json';
import en from '../../locales/en.json';

// The referral rewards in the save: the SERVER grants (migration 0016), the game maps the reward ids to its own title / portrait frame and puts them in the save, once, whatever the number of times it reads them.
const granted = (kind: 'title' | 'cosmetic' | 'pass', ref: string, metric: 'qualified' | 'paying' = 'qualified', min = 1) => ({ kind, ref, metric, min_count: min, granted_at: '2026-10-10T10:00:00Z', label_pt: ref, label_en: ref });
const status = (rewards: unknown[]) => parseReferralStatus({ code: 'K7M2QXA9RB', qualified: 3, paying: 1, pass_goal: 10, rewards });

describe('applying granted cosmetics to the save', () => {
  it('maps the three reward ids of the contract to the title "Recrutador", the portrait frame and the title "Lenda do Recrutamento"', () => {
    const out = applyReferralCosmetics(defaultSave(), status([granted('title', 'recruiter'), granted('cosmetic', 'portrait_frame_recruiter', 'qualified', 3), granted('title', 'recruitment_legend', 'qualified', 25)])!.rewards);
    expect(out.cosmetics).toEqual(expect.arrayContaining(['title_recruiter', 'frame_recruiter', 'title_recruitment_legend']));
    expect(pt.titles.title_recruiter).toBe('Recrutador');
    expect(pt.titles.title_recruitment_legend).toBe('Lenda do Recrutamento');
  });

  it('is idempotent: the second application returns the SAME save object, and a third reading changes nothing', () => {
    const rewards = status([granted('title', 'recruiter'), granted('cosmetic', 'portrait_frame_recruiter', 'qualified', 3)])!.rewards;
    const once = applyReferralCosmetics(defaultSave(), rewards);
    expect(once.cosmetics.filter((c) => c === 'title_recruiter')).toHaveLength(1);
    expect(applyReferralCosmetics(once, rewards)).toBe(once);
    expect(applyReferralCosmetics(applyReferralCosmetics(once, rewards), rewards)).toBe(once);
  });

  it('adds only what is missing, keeps every cosmetic the hero already had, and does not touch the other fields', () => {
    const base = { ...defaultSave(), cosmetics: ['title_pioneer', 'title_recruiter'], activeTitle: 'title_pioneer' };
    const out = applyReferralCosmetics(base, status([granted('title', 'recruiter'), granted('title', 'recruitment_legend', 'qualified', 25)])!.rewards);
    expect(out.cosmetics).toEqual(['title_pioneer', 'title_recruiter', 'title_recruitment_legend']);
    expect(out.activeTitle).toBe('title_pioneer');
    expect({ ...out, cosmetics: base.cosmetics }).toEqual(base);
  });

  it('never grants anything for the Pass (an entitlement, not a cosmetic), an unknown id or a kind that does not match', () => {
    const save = defaultSave();
    expect(applyReferralCosmetics(save, [{ kind: 'pass', ref: 'adventurer_pass' }])).toBe(save);
    expect(applyReferralCosmetics(save, [{ kind: 'title', ref: 'something_new' }])).toBe(save);
    expect(applyReferralCosmetics(save, [{ kind: 'cosmetic', ref: 'recruiter' }])).toBe(save); // 'recruiter' is a title
    expect(applyReferralCosmetics(save, [{ kind: 'title', ref: 'portrait_frame_recruiter' }])).toBe(save); // the frame is a cosmetic
    expect(applyReferralCosmetics(save, [{ kind: 'title', ref: 'constructor' }, { kind: 'title', ref: '__proto__' }])).toBe(save);
    expect(referralCosmeticIds([])).toEqual([]);
  });

  it('every mapped cosmetic exists as a title or a frame, has its text in both languages, and survives a save / load', () => {
    for (const [ref, { kind, cosmetic }] of Object.entries(REFERRAL_COSMETICS)) {
      if (kind === 'title') {
        const def = getTitleDef(cosmetic);
        expect(def, ref).toBeTruthy();
        for (const dict of [pt, en]) {
          expect((dict.titles as Record<string, string>)[def!.nameKey], `${ref} name`).toBeTruthy();
          expect((dict.titles as Record<string, string>)[def!.reqKey], `${ref} req`).toBeTruthy();
        }
      } else {
        const def = getFrameDef(cosmetic);
        expect(def, ref).toBeTruthy();
        for (const dict of [pt, en]) {
          expect((dict.titles as Record<string, string>)[def!.nameKey], `${ref} name`).toBeTruthy();
          expect((dict.titles as Record<string, string>)[def!.descKey], `${ref} desc`).toBeTruthy();
        }
      }
    }
    const withBoth = applyReferralCosmetics(defaultSave(), status([granted('title', 'recruiter'), granted('cosmetic', 'portrait_frame_recruiter', 'qualified', 3)])!.rewards);
    const loaded = normalizeSave(JSON.parse(JSON.stringify(withBoth)));
    expect(loaded.cosmetics).toEqual(expect.arrayContaining(['title_recruiter', 'frame_recruiter']));
    // the owned frame can be worn
    expect(sanitizeActiveFrame('frame_recruiter', loaded.cosmetics)).toBe('frame_recruiter');
    expect(sanitizeActiveFrame('frame_recruiter', [])).toBeNull();
  });
});

describe('reading the status', () => {
  it('parses the answer of my_referral_status and ignores what it does not know', () => {
    const s = parseReferralStatus({ code: 'K7M2QXA9RB', qualified: 3, paying: 2, pass_goal: 10, rewards: [granted('title', 'recruiter'), { kind: 'weird', ref: 'x', metric: 'qualified' }, null, 5] });
    expect(s).toEqual({ code: 'K7M2QXA9RB', qualified: 3, paying: 2, passGoal: 10, rewards: [{ kind: 'title', ref: 'recruiter', metric: 'qualified', minCount: 1, grantedAt: '2026-10-10T10:00:00Z' }] });
    expect(parseReferralStatus(null)).toBeNull();
    expect(parseReferralStatus('x')).toBeNull();
    expect(parseReferralStatus([])).toBeNull();
    // an account that is not on the waitlist: no code, zero counters
    expect(parseReferralStatus({ code: null, qualified: 0, paying: 0, pass_goal: 10, rewards: [] })).toEqual({ code: null, qualified: 0, paying: 0, passGoal: 10, rewards: [] });
    // a code that is not shaped like an invite code is not shown
    expect(parseReferralStatus({ code: 'not a code', qualified: -4, paying: 'x' })).toEqual({ code: null, qualified: 0, paying: 0, passGoal: null, rewards: [] });
  });

  it('parses the tier list, and falls back to nothing (so the defaults are used) when it is not a usable list', () => {
    expect(parseReferralTiers(null)).toBeNull();
    expect(parseReferralTiers([])).toBeNull();
    expect(parseReferralTiers([{ metric: 'x' }])).toBeNull();
    const tiers = parseReferralTiers([{ metric: 'qualified', min_count: 5, kind: 'title', ref: 'recruitment_master', label_pt: 'Título: Mestre', label_en: 'Title: Master' }, { metric: 'qualified', min_count: 0, kind: 'title', ref: 'zero' }]);
    expect(tiers).toEqual([{ metric: 'qualified', minCount: 5, kind: 'title', ref: 'recruitment_master', labelPt: 'Título: Mestre', labelEn: 'Title: Master' }]);
  });

  it('marks the tiers the server granted as earned, never by the counters alone', () => {
    const s = status([granted('title', 'recruiter')])!;
    const p = tierProgress(DEFAULT_REFERRAL_TIERS, s);
    expect(p.map((t) => [t.ref, t.earned])).toEqual([
      ['recruiter', true],
      ['portrait_frame_recruiter', false], // 3 qualified in the counters, but the server has not granted it yet
      ['adventurer_pass', false],
      ['recruitment_legend', false],
    ]);
    expect(tierProgress(DEFAULT_REFERRAL_TIERS, null).every((t) => !t.earned)).toBe(true);
    // the owner moved a number after the reward was granted: still earned (same reward id)
    expect(tierProgress([{ ...DEFAULT_REFERRAL_TIERS[0], minCount: 2 }], s)[0].earned).toBe(true);
  });

  it('builds the invite link from the portal origin and the code, and only then', () => {
    expect(inviteLink('K7M2QXA9RB', 'https://arena.example/')).toBe('https://arena.example/?ref=K7M2QXA9RB');
    expect(inviteLink('K7M2QXA9RB', 'https://arena.example/some/page?x=1')).toBe('https://arena.example/?ref=K7M2QXA9RB');
    expect(inviteLink('K7M2QXA9RB', null)).toBeNull();
    expect(inviteLink(null, 'https://arena.example')).toBeNull();
    expect(inviteLink('bad', 'https://arena.example')).toBeNull();
    expect(inviteLink('K7M2QXA9RB', 'javascript:alert(1)')).toBeNull();
    expect(inviteLink('K7M2QXA9RB', 'not a url')).toBeNull();
  });
});
