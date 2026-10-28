import { FX_ATLAS, FxAtlas } from './skillFx.atlas';
import type { HeroSkillId, SkillPathId } from './heroSkills';

// The visible side of the skill strikes. ONE table says what plays for each trigger: a sprite effect (a grid sheet + its atlas, frame rectangles / pivots / durations read from
// data, src/game/skillFx.atlas.ts generated from public/assets/vfx/*.json) or, for a skill with no sprite, a minimal CSS fallback. The director can swap an entry for a new
// sheet without touching any component. Effects play ONCE, anchored by their pivot, drawn facing right.

export type SkillFxId = 'crush' | 'fury' | 'bleed' | 'devastating' | 'block' | 'bastion' | 'double' | 'counter' | AbilityFxId;
// The equipment abilities (abilities.ts), one entry each.
export type AbilityFxId = 'ab_firm_strike' | 'ab_arrow_rain' | 'ab_opening_shot' | 'ab_arcane_burst' | 'ab_flames' | 'ab_blessing' | 'ab_iron_stance';
export type FxAnchor = 'target' | 'hero' | 'heroFeet'; // target = the centre of the enemy (the one hit), hero = the hero, heroFeet = the hero's feet (the pillar of the Bastiao)

export type SkillFxEntry =
  | { kind: 'sprite'; atlas: FxAtlas; anchor: FxAnchor }
  | { kind: 'css'; className: string; anchor: FxAnchor; ms: number };

export interface SkillFxDef {
  skill?: HeroSkillId; // the hero skill the effect belongs to; absent for an equipment ability (abilities.ts)
  path: SkillPathId; // decides the callout colour unless `color` is set
  color?: string; // a colour of its own (the abilities, which belong to no skill path)
  fx: SkillFxEntry;
  callout: boolean; // prints the name float (locale heroSkills.fx.<id>)
  side: 'e' | 'p'; // which combatant the float prints on
  left: number; // % of the side, so strikes use different columns and never overlap
  top: number; // px offset
  shake: boolean;
}

const sprite = (name: string, anchor: FxAnchor): SkillFxEntry => ({ kind: 'sprite', atlas: FX_ATLAS[name], anchor });
const css = (ms: number, anchor: FxAnchor): SkillFxEntry => ({ kind: 'css', className: 'skfx-css-counter', anchor, ms });

export const SKILL_FX: Record<SkillFxId, SkillFxDef> = {
  crush: { skill: 'w_heavy_blow', path: 'warrior', fx: sprite('fx_crushing_blow', 'target'), callout: true, side: 'e', left: 50, top: -34, shake: true },
  fury: { skill: 'w_fury', path: 'warrior', fx: sprite('fx_fury', 'target'), callout: true, side: 'e', left: 24, top: -18, shake: false },
  bleed: { skill: 'w_bleed', path: 'warrior', fx: sprite('fx_bleed', 'target'), callout: false, side: 'e', left: 40, top: 0, shake: false },
  devastating: { skill: 'w_devastating_strike', path: 'warrior', fx: sprite('fx_devastating', 'target'), callout: true, side: 'e', left: 50, top: -34, shake: true },
  block: { skill: 'g_block', path: 'guardian', fx: sprite('fx_block', 'hero'), callout: true, side: 'p', left: 50, top: -10, shake: false },
  bastion: { skill: 'g_last_bastion', path: 'guardian', fx: sprite('fx_last_bastion', 'heroFeet'), callout: true, side: 'p', left: 30, top: -34, shake: false },
  double: { skill: 'h_light_step', path: 'hunter', fx: sprite('fx_double_strike', 'target'), callout: true, side: 'e', left: 72, top: -22, shake: false },
  // No sprite sheet for the counter yet: the CSS fallback of the layer (a hard-edged flash on the target), plus its callout.
  counter: { skill: 'g_block', path: 'guardian', fx: { kind: 'css', className: 'skfx-css-counter', anchor: 'target', ms: 360 }, callout: true, side: 'e', left: 76, top: -4, shake: false },
  // REVIEW IN PHASE 5: the 7 abilities share the same CSS reserve, so they look like the same flash and only the floating name and the colour tell them apart. Distinct art needs src/App.css, which was out of scope in phase 4.
  // Equipment abilities (abilities.ts, classes reform phase 4). No sprite sheet exists for any of them yet, so all seven use the CSS reserve of the layer (the hard-edged flash the counter uses), anchored where the
  // ability acts; the callout (heroSkills.fx.<id>) is what tells them apart until the art arrives with the screen of phase 5. Each has its own column so two abilities in one frame never overlap.
  ab_firm_strike: { path: 'warrior', color: '#ff8a7a', fx: css(360, 'target'), callout: true, side: 'e', left: 50, top: -34, shake: true },
  ab_arrow_rain: { path: 'hunter', color: '#8be89a', fx: css(360, 'target'), callout: true, side: 'e', left: 28, top: -20, shake: false },
  ab_opening_shot: { path: 'hunter', color: '#8be89a', fx: css(300, 'target'), callout: true, side: 'e', left: 70, top: -4, shake: false },
  ab_arcane_burst: { path: 'guardian', color: '#c9a0ff', fx: css(420, 'target'), callout: true, side: 'e', left: 40, top: -30, shake: true },
  ab_flames: { path: 'warrior', color: '#ffb35a', fx: css(360, 'target'), callout: true, side: 'e', left: 62, top: -12, shake: false },
  ab_blessing: { path: 'guardian', color: '#ffe58a', fx: css(420, 'hero'), callout: true, side: 'p', left: 50, top: -26, shake: false },
  ab_iron_stance: { path: 'guardian', color: '#8ab4ff', fx: css(420, 'hero'), callout: true, side: 'p', left: 30, top: -10, shake: false },
};

export const FX_PATH_COLOR: Record<SkillPathId, string> = { warrior: '#ff8a7a', guardian: '#8ab4ff', hunter: '#8be89a' };
// The colour of an effect's name callout.
export const fxColor = (id: SkillFxId): string => SKILL_FX[id].color ?? FX_PATH_COLOR[SKILL_FX[id].path];

// The integer scale effects are drawn at: 2x on a desktop / tablet stage, 1x on a phone (crisp pixels either way).
export const fxScaleFor = (viewportWidth: number): 1 | 2 => (viewportWidth < 600 ? 1 : 2);

// Total play time of an entry in ms.
export const fxDuration = (e: SkillFxEntry): number => (e.kind === 'sprite' ? e.atlas.frames.reduce((a, f) => a + f.ms, 0) : e.ms);

// The CSS of frame `i` of a sprite effect at an integer scale: the frame rectangle of the grid sheet as the background window, the pivot as the anchor offset (the pivot of the
// cell lands on the anchor point of the combatant), mirrored around the pivot when the acting sprite faces left. Pure, so the sprite branch of the layer is testable.
export function spriteFrameStyle(atlas: FxAtlas, i: number, scale: number, flip = false) {
  const f = atlas.frames[Math.max(0, Math.min(i, atlas.frames.length - 1))];
  return {
    width: f.w * scale,
    height: f.h * scale,
    marginLeft: -f.px * f.w * scale,
    marginTop: -f.py * f.h * scale,
    backgroundImage: `url(${atlas.url})`,
    backgroundSize: `${atlas.w * scale}px ${atlas.h * scale}px`,
    backgroundPosition: `${-f.x * scale}px ${-f.y * scale}px`,
    transform: flip ? 'scaleX(-1)' : undefined,
    transformOrigin: `${f.px * 100}% ${f.py * 100}%`,
  };
}
