import { useEffect, useMemo, useState } from 'react';
import { useConfirmKeys } from '../hooks/useConfirmKeys';
import { fmtNum, t } from '../locales';
import { skillText, skillsSummaryText } from './skillText';
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
import { Button, Chip, Dialog, ItemFrame, PageHeader, Panel, Screen, Tabs } from './ui';
import type { TabItem } from './ui';

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
      <Panel
        as="section"
        className={`sk-col sk-col-${path}${tab === path ? ' current' : ''}`}
        key={path}
        aria-label={t(`heroSkills.paths.${path}.name`)}
        title={t(`heroSkills.paths.${path}.name`)}
        icon={<img src={pathIcon(path)} alt="" />}
        actions={<Chip tone="gold">{t('heroSkills.ui.pathPoints', { n: pathPoints(draft, path) })}</Chip>}
      >
        <p className="sk-col-identity">{t(`heroSkills.paths.${path}.identity`)}</p>
        <div className="sk-tiers">
          {tiers.map((tier) => (
            <div className={`sk-row sk-tier-${tier}`} key={tier}>
              {skills.filter((s) => s.tier === tier).map(renderTile)}
            </div>
          ))}
        </div>
      </Panel>
    );
  };

  const shownRank = rankOf(draft, shown.id);
  const lockReason = blockText(shown);
  const canAddShown = addRankBlock(draft, shown.id, available) === null;
  const loadoutName = t(`heroSkills.ui.set${active + 1}`);
  const respecDisabled = battleActive || pointsSpent(committed) === 0;

  const nextLine =
    earned === 0 ? t('heroSkills.ui.firstPoint', { n: nextLevel ?? 5 }) : nextLevel === null ? t('heroSkills.ui.allPoints') : t('heroSkills.ui.nextPoint', { n: nextLevel });

  const pathTabs: TabItem<SkillPathId>[] = SKILL_PATH_IDS.map((path) => ({
    id: path,
    icon: <img src={pathIcon(path)} alt="" />,
    label: (
      <>
        {t(`heroSkills.paths.${path}.name`)} <b className="sk-tab-points">{pathPoints(draft, path)}</b>
      </>
    ),
  }));

  return (
    <Screen label={t('heroSkills.ui.title')} className="skills-view" data-highlight="skills-view">
      <PageHeader
        icon={<img className="pixel-icon" src="/assets/icons/skill_path_warrior.png" alt="" />}
        title={t('heroSkills.ui.title')}
        subtitle={nextLine}
        actions={
          <>
            <Chip tone={available > 0 ? 'gold' : 'plain'}>{t('heroSkills.ui.available', { n: available })}</Chip>
            <Chip>{t('heroSkills.ui.spent', { n: spentDraft, m: earned })}</Chip>
          </>
        }
      />

      <div className="sk-root">
        <Tabs<SkillPathId> className="sk-tabs" items={pathTabs} value={tab} onChange={setTab} label={t('heroSkills.ui.title')} />

        <div className="sk-cols">{SKILL_PATH_IDS.map(renderPath)}</div>

        <div className="sk-bottom">
          <Panel className="sk-detail" aria-live="polite">
            <ItemFrame size="lg" rarity={rankOf(draft, shown.id) >= shown.maxRank ? 'legendary' : 'common'}>
              <img className="sk-detail-icon" src={shown.icon} alt="" />
            </ItemFrame>
            {fxOf(shown.id) && <FxPreview fx={fxOf(shown.id)!} />}
            <div className="sk-detail-body">
              <div className="sk-detail-head">
                <h3 className="sk-detail-name">{t(`heroSkills.skills.${shown.id}.name`)}</h3>
                <Chip tone="gold">{t('heroSkills.ui.rank', { n: shownRank, m: shown.maxRank })}</Chip>
                <Chip>{shown.tier === 4 ? t('heroSkills.ui.capstone') : t('heroSkills.ui.tier', { n: shown.tier })}</Chip>
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
            <Button variant="primary" className="sk-detail-add" disabled={!canAddShown} onClick={() => add(shown.id)}>
              + {t('heroSkills.ui.add')}
            </Button>
          </Panel>

          <Panel className="sk-actions">
            <div className="sk-apply-row">
              <Button variant="primary" disabled={pending === 0} onClick={() => onApply(draft)}>
                {pending > 0 ? t('heroSkills.ui.applyN', { n: pending }) : t('heroSkills.ui.apply')}
              </Button>
              <Button disabled={pending === 0} onClick={() => setDraft(committed)}>
                {t('heroSkills.ui.undo')}
              </Button>
            </div>
            <div className="sk-loadouts" role="group" aria-label={t('heroSkills.ui.loadouts')}>
              <Button variant={active === 0 ? 'primary' : 'secondary'} aria-pressed={active === 0} disabled={battleActive && active !== 0} onClick={() => onSwitchLoadout(0)}>
                {t('heroSkills.ui.set1')}
              </Button>
              {owner ? (
                <Button variant={active === 1 ? 'primary' : 'secondary'} aria-pressed={active === 1} disabled={battleActive && active !== 1} onClick={() => onSwitchLoadout(1)}>
                  {t('heroSkills.ui.set2')}
                </Button>
              ) : (
                <Button className="sk-set-locked" onClick={onOpenPass} title={t('heroSkills.ui.passOnly')} icon={<img src="/assets/icons/nav_battlepass.png" alt="" />}>
                  {t('heroSkills.ui.set2')}
                  <Chip tone="gold">{t('heroSkills.ui.passBadge')}</Chip>
                </Button>
              )}
            </div>
            <Button variant="danger" block disabled={respecDisabled} onClick={() => setConfirmRespec(true)} title={battleActive ? t('heroSkills.ui.respecBattle') : undefined}>
              {t('heroSkills.ui.respec')} · {cost === 0 ? t('heroSkills.ui.free') : t('heroSkills.ui.gold', { n: fmtNum(cost) })}
            </Button>
            {battleActive && <p className="ui-alert bad">{t('heroSkills.ui.respecBattle')}</p>}
          </Panel>
        </div>
      </div>

      {confirmRespec && (
        <Dialog
          title={t('heroSkills.ui.respec')}
          footer={
            <>
              <Button
                variant="primary"
                block
                disabled={cost > save.gold || battleActive}
                onClick={() => {
                  setConfirmRespec(false);
                  onRespec();
                }}
              >
                {t('heroSkills.ui.confirm')}
              </Button>
              <Button block onClick={() => setConfirmRespec(false)}>
                {t('heroSkills.ui.cancel')}
              </Button>
            </>
          }
        >
          <p>{t('heroSkills.ui.respecBody', { n: pointsSpent(committed), set: loadoutName })}</p>
          <p className="sk-cost">{cost === 0 ? t('heroSkills.ui.respecFree') : t('heroSkills.ui.respecCost', { n: fmtNum(cost) })}</p>
          {cost > save.gold && <p className="ui-alert bad">{t('heroSkills.ui.respecNoGold')}</p>}
          <p className="ui-note">{t('heroSkills.ui.respecSessions')}</p>
        </Dialog>
      )}
    </Screen>
  );
}

// The small card on the Personagem screen: the points waiting and the way into the full screen.
export function SkillsSummary({ save, onOpen }: { save: SaveData; onOpen: () => void }) {
  const text = useMemo(() => skillsSummaryText(save), [save]);
  return (
    <div className="sk-summary">
      <p>{text}</p>
      <Button variant="primary" onClick={onOpen}>
        {t('heroSkills.ui.open')}
      </Button>
    </div>
  );
}
