import { useEffect, useRef, useState } from 'react';
import { promotionLine } from './promotionLine';
import ActiveBuffs from './ActiveBuffs';
import HuntBattleView from './HuntBattleView';
import MaterialIcon from './MaterialIcon';
import { MatIcon, Meter } from './HuntParts';
import UniqueDrops from './UniqueDrops';
import WholesaleLink from './WholesaleLink';
import { fmtNum, t } from '../locales';
import { buildCombatStats, computeHuntingStatus, huntPromotionRequiredWins, SaveData } from '../game/engine';
import T from '../game/tunables';
import { DEFAULT_HUNTING_DEPTH, getHuntingZone, huntingEnemyNameKey, recommendedCpForDepth } from '../game/huntingZones';
import { huntInventoryStatus, hoursUntilInventoryFull } from '../game/huntInventory';
import { estimateHuntYield } from '../game/huntEstimate';
import { getMaterial, MaterialId } from '../game/materials';
import { heroSheet } from '../game/sprites';
import { fmtSpan, matName, subLevelNotes } from '../game/huntView';
import SubLevelNeed from './SubLevelNeed';
import { useDisplayName } from '../game/usernameContext';
import { sessionStatsDiffer } from '../game/huntSession';
import { isServerItemAuthority } from '../game/itemAuthority';
import { Button, ItemFrame, ModalShell, Panel, StatList, StatRow } from './ui';
import type { CardRarity } from './ui';

// the frame colour of a drop: common = plain, refined = blue, noble = purple
const dropTier = (rarity: string | undefined): CardRarity => (rarity === 'rare' ? 'epic' : rarity === 'uncommon' ? 'rare' : 'common');
const MS_PER_HOUR = 3600 * 1000;
// The inventory-full extrapolation from a handful of seconds of hunting is noise; it uses the zone's estimate until the first minute is in.
const RATE_MIN_MS = 60 * 1000;

// The hunt in progress, small and calm: a top bar (time, Resumo, Resgatar), the scene (monster life, the two fighters, hero life) and only the warnings that need an action.
// Everything else (the numbers, the loot, the pieces found, the zone level) is behind Resumo. Every figure comes from computeHuntingStatus (the
// same replay that decides the reward when the hunt stops) — nothing here accrues anything.
export default function HuntRunning({ save, onStopHunt, onClose }: { save: SaveData; onStopHunt: () => void; onClose: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const iv = window.setInterval(() => setNow(Date.now()), 1000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') setNow(Date.now());
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(iv);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const [summary, setSummary] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);
  const toggleSummary = () => setSummary((v) => !v);
  // opening the summary brings it into view (it sits under the scene)
  useEffect(() => {
    if (summary) summaryRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [summary]);

  const heroName = useDisplayName(save.heroName);
  const zone = save.activeHuntingZone ? getHuntingZone(save.activeHuntingZone) : undefined;
  const status = computeHuntingStatus(save, now);
  if (!zone) return null;
  const depth = save.activeHuntingDepth ?? DEFAULT_HUNTING_DEPTH;

  const elapsedMs = Math.max(0, now - save.huntingOfflineStart);
  const hours = status.pendingMs / MS_PER_HOUR;
  const ratesReady = status.pendingMs >= RATE_MIN_MS;

  // What claiming would do to the inventory if the hunt stopped now: the very rule of the claim (planHuntClaim), so this line can never disagree with it.
  const inv = huntInventoryStatus(save, zone.id, status.drops, status.uniques);
  // "Full in ~": the drops so far extrapolated at their current rate (the zone's estimate until the first minute is in); an estimate, and labelled as one.
  const estimate = ratesReady ? null : estimateHuntYield(save, zone.id, depth);
  const perHour: Partial<Record<MaterialId, number>> = {};
  for (const d of zone.drops) perHour[d.material] = ratesReady ? (status.drops[d.material] ?? 0) / hours : (estimate?.materialsPerHour.find((m) => m.material === d.material)?.perHour ?? 0);
  const hoursLeft = Math.max(0, status.capMs - status.pendingMs) / MS_PER_HOUR;
  const fullIn = inv.fits && !status.full ? hoursUntilInventoryFull(save, zone.id, status.drops, perHour, hoursLeft, status.uniques) : null;
  // shown common -> rare like the zone lists them
  const slotItems = zone.drops.map((d) => ({ itemId: d.material, count: status.drops[d.material] ?? 0 }));
  const usedClass = inv.used >= inv.capacity ? ' full' : inv.used >= inv.capacity * 0.85 ? ' warn' : '';

  const required = huntPromotionRequiredWins(status.ceilingSubLevel);
  const maxed = status.ceilingSubLevel >= T.hunting.subLevels;
  const frozen = !!save.huntSession && sessionStatsDiffer(save.huntSession.stats, buildCombatStats(save));

  const stage = (
    <HuntBattleView
      zone={zone}
      heroSheet={heroSheet(save)}
      heroName={heroName}
      monsterName={t(`enemies.${huntingEnemyNameKey(zone.enemyId)}`)}
      monsterLevel={status.ceilingSubLevel}
      snapshot={status.liveSnapshot}
      decor={(() => {
        const st = save.huntSession?.stats ?? buildCombatStats(save);
        return { strikes: st.strikes, bleed: st.bleed, block: st.block };
      })()}
    >
      <ActiveBuffs save={save} skip={['gatherer']} />
    </HuntBattleView>
  );

  // What stays in sight without opening the summary: the inventory warning with the list of what would be left behind (it is the thing to act on before claiming),
  // the "claim to continue" notice, and a tap-through to the unique pieces found.
  const alerts = (
    <>
      {status.full && <p className="hs-banner-full">{t('hunting.capFull')}</p>}
      {!inv.fits && (
        <Panel tone="inset" className="hs-left hs-alert">
          <p className="hs-line bad">{t(inv.missingSlots === 1 ? 'hunting.invMissingOne' : 'hunting.invMissing', { n: inv.missingSlots })}</p>
          <div className="hs-lostlist">
            {inv.leftBehind.map((i) => (
              <span className="hs-lost" key={i.itemId}>
                <MatIcon id={i.itemId} />
                <span>{t('hunting.invLeftOf', { n: fmtNum(i.count), name: matName(i.itemId) })}</span>
              </span>
            ))}
          </div>
          <WholesaleLink hint />
        </Panel>
      )}
      {status.uniques.length > 0 && (
        <button type="button" className="hs-found" onClick={() => setSummary(true)} data-ui>
          {t('hunting.uniquesFound')}: {status.uniques.length}
        </button>
      )}
    </>
  );

  // The summary: the numbers of the session, the loot so far, the pieces found, the zone level and the notices. Opened by the button on the top bar.
  const summaryPanel = (
    <div className="hs-summary" id="hs-summary" ref={summaryRef}>
      <Panel tone={status.full ? 'gold' : 'plain'}>
        <Meter pct={status.capMs <= 0 ? 0 : (status.pendingMs / status.capMs) * 100} tone={status.full ? 'full' : undefined} label={t('hunting.capProgress', { cur: fmtSpan(status.pendingMs), cap: fmtSpan(status.capMs) })} />
        <p className="hs-meter-text">{t('hunting.capProgress', { cur: fmtSpan(status.pendingMs), cap: fmtSpan(status.capMs) })}</p>
        {!status.full && <p className="hs-meter-text">{t('hunting.capLeft', { t: fmtSpan(status.capMs - status.pendingMs) })}</p>}
        {status.full && <p className="hs-banner-full">{t('hunting.capFull')}</p>}
      </Panel>

      <Panel>
        <StatList>
          <StatRow label={t('hunting.kills')} value={fmtNum(status.kills)} />
          <StatRow label={t('hunting.xpEarned')} value={fmtNum(status.xpReady)} tone="good" />
          <StatRow label={t('hunting.winsLosses')} value={`${fmtNum(status.kills)} / ${fmtNum(status.defeats)}`} tone={status.defeats > 0 ? 'bad' : 'good'} />
          <StatRow label={t('hunting.goldEarned')} value={fmtNum(status.goldReady)} tone="gold" />
        </StatList>
      </Panel>

      <Panel title={t('hunting.collected')} actions={<span className={`hs-count${usedClass}`}>{t('hunting.invUsed', { n: inv.used, m: inv.capacity })}</span>}>
        <div className="hs-loot">
          {slotItems.map((item) => {
            const entry = zone.drops.find((d) => d.material === item.itemId);
            const def = getMaterial(item.itemId);
            return (
              <div className={`hs-loot-cell${item.count > 0 ? '' : ' empty'}`} key={item.itemId} title={matName(item.itemId)}>
                <ItemFrame rarity={dropTier(entry?.rarity)} qty={fmtNum(item.count)}>
                  {def && <MaterialIcon item={def} />}
                </ItemFrame>
                <span className="hs-loot-rate">{matName(item.itemId)}</span>
              </div>
            );
          })}
        </div>
        <p className="hs-hint">{t('hunting.collectedGoesTo')}</p>
        {inv.fits && <p className="hs-line ok">{t('hunting.invFits', { n: inv.used, m: inv.capacity })}</p>}
        {fullIn !== null && <p className="hs-line eta">{t('hunting.invFullIn', { t: fmtSpan(Math.max(fullIn, 1 / 60) * MS_PER_HOUR) })}</p>}
      </Panel>

      <Panel title={t('hunting.uniquesFound')}>
        {isServerItemAuthority() ? (
          <p className="hs-meter-text">{t('hunting.uniquesServerNote')}</p>
        ) : status.uniques.length > 0 ? (
          <UniqueDrops drops={status.uniques} />
        ) : (
          <p className="hs-meter-text">{t('hunting.noUniques')}</p>
        )}
      </Panel>

      <Panel title={t('hunting.subLevelBar', { n: status.ceilingSubLevel, m: T.hunting.subLevels })}>
        <Meter pct={maxed ? 100 : (Math.min(status.promotionWins, required) / required) * 100} tone="xp" label={t('hunting.subLevelBar', { n: status.ceilingSubLevel, m: T.hunting.subLevels })} />
        <p className="hs-meter-text">{maxed ? t('hunting.subLevelMax') : promotionLine(status.promotionWins, required, status.ceilingSubLevel)}</p>
        {status.ceilingSubLevel > status.startCeiling && <p className="hs-promoted">{t('hunting.promotedRange', { a: status.startCeiling, b: status.ceilingSubLevel })}</p>}
        <p className="hs-hint">{t('hunting.subLevelExplain')}</p>
        {subLevelNotes(zone, depth, status.ceilingSubLevel).xpPct > 0 && <p className="hs-hint">{t('hunting.subLevelXp', { n: subLevelNotes(zone, depth, status.ceilingSubLevel).xpPct })}</p>}
        {!maxed && status.nextSubLevelGear > 0 && <SubLevelNeed required={status.nextSubLevelGear} />}
      </Panel>

      {frozen && (
        <Panel tone="inset" className="hs-frozen">
          <p>{t('hunting.sessionFrozen')}</p>
        </Panel>
      )}
      <p className="hs-hint center">{t('hunting.stopHint')}</p>
    </div>
  );

  return (
    <ModalShell
      className="hs-modal running"
      tutorialTarget="hunt-modal"
      icon={<img className="pixel-icon" src="/assets/icons/demon_claw.png" alt="" />}
      title={t(`dungeon.${zone.nameKey}`)}
      subtitle={`${t(`hunting.depth_${depth}`)} · ${t('dungeon.cp', { n: fmtNum(recommendedCpForDepth(zone, depth)) })}`}
      closeLabel={t('ui.close')}
      onClose={onClose}
    >
      <div className="hs hs-run">
        <div className="hs-topbar">
          <span className="hs-time">{t('hunting.timeHunting', { t: fmtSpan(elapsedMs) })}</span>
          <Button className="hs-topbtn" onClick={toggleSummary} aria-expanded={summary} aria-controls="hs-summary">
            {t('hunting.summary')}
          </Button>
          <Button variant="primary" className="hs-topbtn hunt-claim" onClick={onStopHunt}>
            {t('hunting.stop')}
          </Button>
        </div>
        {stage}
        {alerts}
        {summary && summaryPanel}
      </div>
    </ModalShell>
  );
}
