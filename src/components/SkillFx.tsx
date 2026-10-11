import { CSSProperties, useEffect, useRef, useState } from 'react';
import { FxItem, useReducedMotion } from '../hooks/useSkillFx';
import { SKILL_FX, SkillFxId, spriteFrameStyle } from '../game/skillFx';

// The skill effect layer shared by the Dungeon stage, the hunt scene and the skills screen preview (game/skillFx.ts is the table). A sprite effect is a GRID sheet: each frame
// is a rectangle of the sheet with its own duration and pivot, played once at an integer scale with hard pixels, anchored by its pivot on the combatant it belongs to.

interface SpriteProps {
  fx: SkillFxId;
  scale: 1 | 2;
  flip?: boolean; // the acting sprite faces left: the effect (drawn facing right) is mirrored around its pivot
  loop?: boolean;
  staticFrame?: number; // show this frame and never animate (the preview under reduced motion)
  onDone?: () => void;
}

export function SkillFxSprite({ fx, scale, flip, loop, staticFrame, onDone }: SpriteProps) {
  const entry = SKILL_FX[fx].fx;
  const [i, setI] = useState(staticFrame ?? 0);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    if (entry.kind === 'css') {
      const id = window.setTimeout(() => doneRef.current?.(), entry.ms);
      return () => window.clearTimeout(id);
    }
    if (staticFrame !== undefined) return;
    const frames = entry.atlas.frames;
    let idx = 0;
    let timer = 0;
    const step = () => {
      const next = idx + 1;
      if (next >= frames.length) {
        if (!loop) {
          doneRef.current?.();
          return;
        }
        idx = 0;
      } else idx = next;
      setI(idx);
      timer = window.setTimeout(step, frames[idx].ms);
    };
    timer = window.setTimeout(step, frames[0].ms);
    return () => window.clearTimeout(timer);
  }, [entry, loop, staticFrame]);

  const top = entry.anchor === 'heroFeet' ? '90%' : '50%';
  if (entry.kind === 'css') return <span className={`skfx skfx-css ${entry.className}`} style={{ left: '50%', top }} aria-hidden="true" />;
  const style: CSSProperties = { left: '50%', top, ...spriteFrameStyle(entry.atlas, i, scale, flip) };
  return <span className="skfx" style={style} aria-hidden="true" />;
}

// The layer inside ONE combatant: it draws the effects anchored there ('p' = the hero side for block / bastion, 'e' = the target).
export function FxLayer({ side, items, done, scale }: { side: 'p' | 'e'; items: FxItem[]; done: (key: number) => void; scale: 1 | 2 }) {
  return (
    <div className="skfx-layer" aria-hidden="true">
      {items
        .filter((x) => (SKILL_FX[x.id].fx.anchor === 'target' ? 'e' : 'p') === side)
        .map((x) => (
          <SkillFxSprite key={x.key} fx={x.id} scale={scale} onDone={() => done(x.key)} />
        ))}
    </div>
  );
}

// A looping preview of one effect on a tiny stage (the detail panel of the skills screen). Static under reduced motion.
export function FxPreview({ fx }: { fx: SkillFxId }) {
  const reduced = useReducedMotion();
  const entry = SKILL_FX[fx].fx;
  const still = entry.kind === 'sprite' ? Math.floor(entry.atlas.frames.length / 2) : undefined;
  return (
    <div className="skfx-preview" aria-hidden="true">
      <span className="skfx-preview-dummy" />
      <SkillFxSprite fx={fx} scale={1} loop staticFrame={reduced ? still ?? 0 : undefined} key={`${fx}-${reduced}`} />
    </div>
  );
}
