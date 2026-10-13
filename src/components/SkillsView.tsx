import { useEffect, useMemo, useState } from 'react';
import { useConfirmKeys } from '../hooks/useConfirmKeys';
import { fmtNum, t } from '../locales';
import { skillText } from './skillText';
import { FxPreview } from './SkillFx';
import { SKILL_FX, SkillFxId } from '../game/skillFx';
import { fmtSkillNumber } from './skillText';
import { SaveData, playerLevel } from '../game/engine';
import {
  HERO_SKILLS,
  HeroSkillDef,
  HeroSkillId,
  SKILL_PATH_IDS,
  SkillPathId,
  SkillRanks,
  activeSkillRanks,
  addRank,
  addRankBlock,
  nextSkillPointLevel,
  pathIcon,
  pathPoints,
  pointsSpent,
  rankOf,
  respecCost,
  skillParams,
  skillPointsEarned,
  skillsOfPath,
  tierRequirement,
} from '../game/heroSkills';
import { ownsAdventurerPass } from '../game/entitlements';

// "Habilidades": the whole skill tree on one screen (heroSkills.ts). Three paths side by side (tabs on a phone), each skill a tile with rank pips, a detail panel that
// shows the real numbers of the current and the next rank, and a PENDING allocation: "+" only changes the draft held here, "Aplicar" commits it, "Desfazer" drops it,
// so a mis-click never costs a respec. Every number comes from heroSkills.ts (skillParams); the locale text holds placeholders only.

// The effect that previews a skill: the first entry of the FX table that belongs to it (strikes only).
const fxOf = (id: string): SkillFxId | null => (Object.keys(SKILL_FX) as SkillFxId[]).find((k) => SKILL_FX[k].skill === id && k !== 'counter') ?? null;
const STRIKE_TRIGGERS = new Set(['w_heavy_blow', 'w_fury', 'w_devastating_strike', 'g_block', 'h_light_step', 'w_bleed', 'g_last_bastion']);
// The trigger of a strike in words, every per-rank number from the data (heroSkills.ts skillParams).
const triggerText = (id: HeroSkillId): string | null => {
  if (!STRIKE_TRIGGERS.has(id)) return null;
  const p = Object.fromEntries(Object.entries(skillParams(id, 1)).map(([k, v]) => [k, fmtSkillNumber(v)]));
  return t(`heroSkills.skills.${id}.trigger`, p);
};

export interface SkillsViewProps {
  save: SaveData;
  // A Dungeon battle is running: respec and loadout switching are refused (the fight in progress keeps its stats).
  battleActive: boolean;
  onApply: (draft: SkillRanks) => void;
  onRespec: () => void;
  onSwitchLoadout: (index: 0 | 1) => void;
  onOpenPass: () => void;
}

export default function SkillsView({ save, battleActive, onApply, onRespec, onSwitchLoadout, onOpenPass }: SkillsViewProps) {
  const level = playerLevel(save.xp);
  const earned = skillPointsEarned(level);
  const committed = activeSkillRanks(save);
  const committedKey = JSON.stringify(committed);
  const [draft, setDraft] = useState<SkillRanks>(committed);
  // The draft starts over whenever the committed allocation changes (applied, respec, loadout switch, a point earned does not reset it).
  useEffect(() => setDraft(JSON.parse(committedKey) as SkillRanks), [committedKey, save.skillTree.active]);

  const spentDraft = pointsSpent(draft);
  const pending = spentDraft - pointsSpent(committed);
  const available = Math.max(0, earned - spentDraft);

  const [tab, setTab] = useState<SkillPathId>('warrior');
  const [selected, setSelected] = useState<HeroSkillId>('w_heavy_blow');
  const [peek, setPeek] = useState<HeroSkillId | null>(null);
  const [confirmRespec, setConfirmRespec] = useState(false);
  const shownId = peek ?? selected;
  const shown = HERO_SKILLS.find((s) => s.id === shownId)!;

  useConfirmKeys(
    confirmRespec,
    () => {
      if (cost > save.gold || battleActive) return;
      setConfirmRespec(false);
      onRespec();
    },
    () => setConfirmRespec(false),
  );

  const owner = ownsAdventurerPass(save);
  const active = save.skillTree.active;
  const cost = respecCost(save, level);
  const nextLevel = nextSkillPointLevel(level);

  const add = (id: HeroSkillId) => {
    if (addRankBlock(draft, id, available) === null) setDraft(addRank(draft, id));
  };

  const blockText = (def: HeroSkillDef): string | null => {
    // The reason shown is the one the player can act on first: a maxed skill, then a tier that is not open yet, then the points.
    if (rankOf(draft, def.id) >= def.maxRank) return t('heroSkills.ui.maxed');
    if (pathPoints(draft, def.path) < tierRequirement(def.tier)) return t('heroSkills.ui.needsPath', { n: tierRequirement(def.tier) });
    if (available < 1) return t('heroSkills.ui.noPoints');
    return null;
  };

  const renderTile = (def: HeroSkillDef) => {
    const rank = rankOf(draft, def.id);
    const base = rankOf(committed, def.id);
    const block = addRankBlock(draft, def.id, available);
    // Locked = the path has not spent enough points for this tier yet (whatever the points left).
    const locked = rank === 0 && pathPoints(draft, def.path) < tierRequirement(def.tier);
    return (
      <div className="sk-tile-wrap" key={def.id}>
        <button
          type="button"
          className={`sk-tile${shownId === def.id ? ' selected' : ''}${locked ? ' locked' : ''}${rank >= def.maxRank ? ' maxed' : ''}${rank > base ? ' pending' : ''}`}
          onClick={() => setSelected(def.id)}
          onMouseEnter={() => setPeek(def.id)}
          onMouseLeave={() => setPeek(null)}
          onFocus={() => setPeek(def.id)}
          onBlur={() => setPeek(null)}
          aria-label={`${t(`heroSkills.skills.${def.id}.name`)} ${rank}/${def.maxRank}`}
          data-ui
        >
          <img className="sk-icon" src={def.icon} alt="" />
          <span className="sk-pips" aria-hidden="true">
            {Array.from({ length: def.maxRank }, (_, i) => (
              <span key={i} className={`sk-pip${i < base ? ' on' : i < rank ? ' pending' : ''}`} />
            ))}
          </span>
          {locked && <span className="sk-lock">{t('heroSkills.ui.reqShort', { n: tierRequirement(def.tier) })}</span>}
        </button>
        {block === null && (
          <button type="button" className="sk-plus" onClick={() => add(def.id)} aria-label={t('heroSkills.ui.add')} data-ui>
            +
          </button>
        )}
      </div>
    );
  };

  const renderPath = (path: SkillPathId) => {
    const skills = skillsOfPath(path);
    const tiers = [1, 2, 3, 4] as const;
    return (
      <section className={`sk-col sk-col-${path}${tab === path ? ' current' : ''}`} key={path} aria-label={t(`heroSkills.paths.${path}.name`)}>
        <header className="sk-col-head">
          <img className="sk-path-icon" src={pathIcon(path)} alt="" />
          <div className="sk-col-title">
            <div className="sk-col-line">
              <span className="sk-col-name">{t(`heroSkills.paths.${path}.name`)}</span>
              <span className="sk-col-points">{t('heroSkills.ui.pathPoints', { n: pathPoints(draft, path) })}</span>
            </div>
            <span className="sk-col-identity">{t(`heroSkills.paths.${path}.identity`)}</span>
          </div>
        </header>
        <div className="sk-tiers">
          {tiers.map((tier) => (
            <div className={`sk-row sk-tier-${tier}`} key={tier}>
              {skills.filter((s) => s.tier === tier).map(renderTile)}
            </div>
          ))}
        </div>
      </section>
    );
  };

  const shownRank = rankOf(draft, shown.id);
  const lockReason = blockText(shown);
  const canAddShown = addRankBlock(draft, shown.id, available) === null;
  const loadoutName = t(`heroSkills.ui.set${active + 1}`);
  const respecDisabled = battleActive || pointsSpent(committed) === 0;

  return (
    <div className="desktop-home skills-view">
      <header className="sk-head dh-card">
        <h2 className="sk-title">{t('heroSkills.ui.title')}</h2>
        <div className="sk-head-chips">
          <span className={`sk-chip points${available > 0 ? ' has' : ''}`}>{t('heroSkills.ui.available', { n: available })}</span>
          <span className="sk-chip">{t('heroSkills.ui.spent', { n: spentDraft, m: earned })}</span>
        </div>
        <p className="sk-next">
          {earned === 0 ? t('heroSkills.ui.firstPoint', { n: nextLevel ?? 5 }) : nextLevel === null ? t('heroSkills.ui.allPoints') : t('heroSkills.ui.nextPoint', { n: nextLevel })}
        </p>
      </header>

      <div className="sk-tabs" role="tablist">
        {SKILL_PATH_IDS.map((path) => (
          <button key={path} type="button" role="tab" aria-selected={tab === path} className={`sk-tab${tab === path ? ' active' : ''}`} onClick={() => setTab(path)} data-ui>
            <img src={pathIcon(path)} alt="" />
            <span>{t(`heroSkills.paths.${path}.name`)}</span>
            <b>{pathPoints(draft, path)}</b>
          </button>
        ))}
      </div>

      <div className="sk-cols">{SKILL_PATH_IDS.map(renderPath)}</div>

      <div className="sk-bottom">
        <section className="sk-detail dh-card" aria-live="polite">
          <img className="sk-detail-icon" src={shown.icon} alt="" />
          {fxOf(shown.id) && <FxPreview fx={fxOf(shown.id)!} />}
          <div className="sk-detail-body">
            <div className="sk-detail-head">
              <span className="sk-detail-name">{t(`heroSkills.skills.${shown.id}.name`)}</span>
              <span className="sk-detail-rank">{t('heroSkills.ui.rank', { n: shownRank, m: shown.maxRank })}</span>
              <span className="sk-detail-tier">{shown.tier === 4 ? t('heroSkills.ui.capstone') : t('heroSkills.ui.tier', { n: shown.tier })}</span>
            </div>
            {triggerText(shown.id) && (
              <p className="sk-trigger">
                {t('heroSkills.ui.trigger')} {triggerText(shown.id)}
              </p>
            )}
            <p className="sk-detail-line">
              <b>{t('heroSkills.ui.current')}</b> {shownRank > 0 ? skillText(shown.id, shownRank) : t('heroSkills.ui.none')}
            </p>
            {shownRank < shown.maxRank && (
              <p className="sk-detail-line next">
                <b>{t('heroSkills.ui.next')}</b> {skillText(shown.id, shownRank + 1)}
              </p>
            )}
            {lockReason && <p className="sk-detail-lock">{lockReason}</p>}
          </div>
          <button type="button" className="sk-detail-add" disabled={!canAddShown} onClick={() => add(shown.id)} data-ui>
            + {t('heroSkills.ui.add')}
          </button>
        </section>

        <section className="sk-actions dh-card">
          <div className="sk-apply-row">
            <button type="button" className="sk-btn primary" disabled={pending === 0} onClick={() => onApply(draft)} data-ui>
              {pending > 0 ? t('heroSkills.ui.applyN', { n: pending }) : t('heroSkills.ui.apply')}
            </button>
            <button type="button" className="sk-btn" disabled={pending === 0} onClick={() => setDraft(committed)} data-ui>
              {t('heroSkills.ui.undo')}
            </button>
          </div>
          <div className="sk-loadouts" role="group" aria-label={t('heroSkills.ui.loadouts')}>
            <button type="button" className={`sk-set${active === 0 ? ' on' : ''}`} disabled={battleActive && active !== 0} onClick={() => onSwitchLoadout(0)} data-ui>
              {t('heroSkills.ui.set1')}
            </button>
            {owner ? (
              <button type="button" className={`sk-set${active === 1 ? ' on' : ''}`} disabled={battleActive && active !== 1} onClick={() => onSwitchLoadout(1)} data-ui>
                {t('heroSkills.ui.set2')}
              </button>
            ) : (
              <button type="button" className="sk-set locked" onClick={onOpenPass} title={t('heroSkills.ui.passOnly')} data-ui>
                <img src="/assets/icons/nav_battlepass.png" alt="" />
                {t('heroSkills.ui.set2')}
                <i>{t('heroSkills.ui.passBadge')}</i>
              </button>
            )}
          </div>
          <button type="button" className="sk-btn respec" disabled={respecDisabled} onClick={() => setConfirmRespec(true)} title={battleActive ? t('heroSkills.ui.respecBattle') : undefined} data-ui>
            {t('heroSkills.ui.respec')} · {cost === 0 ? t('heroSkills.ui.free') : t('heroSkills.ui.gold', { n: fmtNum(cost) })}
          </button>
          {battleActive && <p className="sk-note">{t('heroSkills.ui.respecBattle')}</p>}
        </section>
      </div>

      {confirmRespec && (
        <div className="modal-backdrop sk-confirm-backdrop" onClick={() => setConfirmRespec(false)}>
          <div className="sk-confirm" role="dialog" aria-modal="true" aria-label={t('heroSkills.ui.respec')} onClick={(e) => e.stopPropagation()}>
            <h3>{t('heroSkills.ui.respec')}</h3>
            <p>{t('heroSkills.ui.respecBody', { n: pointsSpent(committed), set: loadoutName })}</p>
            <p className="cost">{cost === 0 ? t('heroSkills.ui.respecFree') : t('heroSkills.ui.respecCost', { n: fmtNum(cost) })}</p>
            {cost > save.gold && <p className="sk-detail-lock">{t('heroSkills.ui.respecNoGold')}</p>}
            <p className="note">{t('heroSkills.ui.respecSessions')}</p>
            <div className="sk-confirm-actions">
              <button type="button" className="sk-btn" onClick={() => setConfirmRespec(false)} data-ui>
                {t('heroSkills.ui.cancel')}
              </button>
              <button
                type="button"
                className="sk-btn primary"
                disabled={cost > save.gold || battleActive}
                onClick={() => {
                  setConfirmRespec(false);
                  onRespec();
                }}
                data-ui
              >
                {t('heroSkills.ui.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// The small card on the Personagem screen: the points waiting and the way into the full screen.
export function SkillsSummary({ save, onOpen }: { save: SaveData; onOpen: () => void }) {
  const level = playerLevel(save.xp);
  const spent = useMemo(() => pointsSpent(activeSkillRanks(save)), [save]);
  const free = Math.max(0, skillPointsEarned(level) - spent);
  const next = nextSkillPointLevel(level);
  return (
    <div className="sk-summary">
      <p>
        {free > 0 ? t('heroSkills.ui.summaryFree', { n: free }) : skillPointsEarned(level) === 0 ? t('heroSkills.ui.firstPoint', { n: next ?? 5 }) : t('heroSkills.ui.summarySpent', { n: spent })}
        {free === 0 && next !== null && skillPointsEarned(level) > 0 ? ` ${t('heroSkills.ui.nextPoint', { n: next })}` : ''}
      </p>
      <button type="button" className="sk-btn primary" onClick={onOpen} data-ui>
        {t('heroSkills.ui.open')}
      </button>
    </div>
  );
}
