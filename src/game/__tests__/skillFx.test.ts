import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { FX_ATLAS, FxAtlas } from '../skillFx.atlas';
import { SKILL_FX, SkillFxId, fxDuration, fxScaleFor, spriteFrameStyle } from '../skillFx';
import { HERO_SKILLS } from '../heroSkills';
import en from '../../locales/en.json';
import pt from '../../locales/pt.json';

const VFX = path.resolve(__dirname, '../../../public/assets/vfx');
const NAMES = ['fx_crushing_blow', 'fx_fury', 'fx_bleed', 'fx_devastating', 'fx_block', 'fx_last_bastion', 'fx_double_strike'];
const pngSize = (name: string) => {
  const b = fs.readFileSync(path.join(VFX, `${name}.png`));
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), signature: b.subarray(1, 4).toString() };
};

describe('skill effect sheets', () => {
  it('the seven sheets and their atlases exist, and the generated table matches the JSON (run scripts/gen-skill-fx.mjs when it does not)', () => {
    expect(Object.keys(FX_ATLAS).sort()).toEqual([...NAMES].sort());
    for (const name of NAMES) {
      expect(fs.existsSync(path.join(VFX, `${name}.png`)), name).toBe(true);
      const json = JSON.parse(fs.readFileSync(path.join(VFX, `${name}.json`), 'utf8')) as { frames: { frame: { x: number; y: number; w: number; h: number }; pivot: { x: number; y: number }; duration: number }[] };
      const a = FX_ATLAS[name];
      expect(a.url).toBe(`/assets/vfx/${name}.png`);
      expect(a.frames).toHaveLength(json.frames.length);
      json.frames.forEach((f, i) => {
        expect(a.frames[i], `${name} #${i}`).toEqual({ x: f.frame.x, y: f.frame.y, w: f.frame.w, h: f.frame.h, px: Math.round(f.pivot.x * 1e4) / 1e4, py: Math.round(f.pivot.y * 1e4) / 1e4, ms: f.duration });
      });
    }
  });

  it('every frame rectangle lies inside its PNG, and the PNG size is the one the table records', () => {
    for (const name of NAMES) {
      const { w, h, signature } = pngSize(name);
      expect(signature, name).toBe('PNG');
      expect(FX_ATLAS[name].w).toBe(w);
      expect(FX_ATLAS[name].h).toBe(h);
      for (const f of FX_ATLAS[name].frames) {
        expect(f.x >= 0 && f.y >= 0 && f.x + f.w <= w && f.y + f.h <= h, `${name} ${JSON.stringify(f)}`).toBe(true);
        expect(f.px >= 0 && f.px <= 1 && f.py >= 0 && f.py <= 1).toBe(true);
        expect(f.ms).toBeGreaterThan(0);
      }
    }
    expect(FX_ATLAS.fx_crushing_blow.frames).toHaveLength(9);
    expect(FX_ATLAS.fx_devastating.frames).toHaveLength(10);
    expect(FX_ATLAS.fx_last_bastion.frames).toHaveLength(14);
  });

  it('the FX table covers every strike with a sprite (the counter keeps the CSS fallback), a callout text in both languages and a skill that exists', () => {
    const ids = Object.keys(SKILL_FX) as SkillFxId[];
    for (const id of ids) {
      const d = SKILL_FX[id];
      // An equipment ability (abilities.ts) belongs to no hero skill and has no sheet yet: it uses the CSS reserve, with a colour of its own.
      if (id.startsWith('ab_')) {
        expect(d.skill, id).toBeUndefined();
        expect(d.fx.kind, id).toBe('css');
        expect(d.color, id).toMatch(/^#[0-9a-f]{6}$/);
      } else {
        expect(HERO_SKILLS.some((s) => s.id === d.skill), id).toBe(true);
        if (id !== 'counter') expect(d.fx.kind, id).toBe('sprite');
      }
      expect(fxDuration(d.fx), id).toBeGreaterThan(0);
      for (const table of [en, pt]) expect(typeof (table as unknown as { heroSkills: { fx: Record<string, string> } }).heroSkills.fx[id], id).toBe('string');
    }
    expect(SKILL_FX.bastion.fx.anchor).toBe('heroFeet');
    expect(SKILL_FX.block.fx.anchor).toBe('hero');
    expect(SKILL_FX.crush.fx.anchor).toBe('target');
  });

  it('the sprite branch reads rectangles, pivots and durations from data (fixture sheet), at an integer scale, mirrored around the pivot', () => {
    const fixture: FxAtlas = {
      url: '/fixture.png',
      w: 40,
      h: 20,
      frames: [
        { x: 0, y: 0, w: 20, h: 20, px: 0.5, py: 1, ms: 50 },
        { x: 20, y: 0, w: 10, h: 10, px: 0.25, py: 0.5, ms: 80 },
      ],
    };
    const a = spriteFrameStyle(fixture, 0, 2);
    expect(a).toMatchObject({ width: 40, height: 40, marginLeft: -20, marginTop: -40, backgroundSize: '80px 40px', backgroundPosition: '0px 0px' });
    const b = spriteFrameStyle(fixture, 1, 2, true);
    expect(b).toMatchObject({ width: 20, height: 20, marginLeft: -5, marginTop: -10, backgroundPosition: '-40px 0px', transform: 'scaleX(-1)', transformOrigin: '25% 50%' });
    expect(spriteFrameStyle(fixture, 9, 1).width).toBe(10); // past the end = the last frame
    expect(fixture.frames.reduce((s, f) => s + f.ms, 0)).toBe(130);
    expect([fxScaleFor(390), fxScaleFor(599), fxScaleFor(768), fxScaleFor(1280)]).toEqual([1, 1, 2, 2]);
  });
});
