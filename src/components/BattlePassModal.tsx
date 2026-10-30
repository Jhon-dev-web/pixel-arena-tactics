import { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { fmtNum, t } from '../locales';
import Assets from '../assets.json';
import { battlePassXpForLevel, MAX_BATTLE_PASS_LEVEL, SaveData } from '../game/engine';
import { BATTLE_PASS_TRACK, BattlePassReward } from '../game/battlepass';
import { ADVENTURER_PASS_TESTABLE, expiredPassSeason, isServerPassSource, ownsAdventurerPass } from '../game/entitlements';
import { usePassEntitlementVersion } from '../game/usePassEntitlement';
import { useOpsState } from '../lib/opsStatus';
import { seasonNumber, seasonRemainingMs } from '../game/seasons';
import { useLeagueResetAt } from '../game/leagueReset';
import type { HeroSheet } from '../game/sprites';
import HeroThumb from './HeroThumb';
import { FRAMES, getSkinDef, getFrameDef, STASH_BONUS_CAP, STASH_DEED_SLOTS } from '../game/seasonItems';
import { MATERIALS } from '../game/materials';
import { getConsumable } from '../game/consumables';
import { getGem } from '../game/gems';
import { getGear } from '../game/gear';
import { getTitleDef } from '../game/titles';
import { FORGE_SEAL_MIN_RARITY, RARITIES } from '../game/rarity';
import { passPerkLines } from '../game/passPerks';
import T from '../game/tunables';
import { gearStatLines } from './gearStats';
import SeasonRankingPanel from './SeasonRankingPanel';
import { seasonRankingEnabled } from '../game/seasonRanking';
import { DEFAULT_REFERRAL_TIERS } from '../lib/referralTiers';
import { Button, Chip, Dialog, ItemFrame, Meter, PageHeader, Panel, Screen, Tabs } from './ui';
import type { TabItem } from './ui';

// The paying-friends goal of the free Pass (the owner may move it on the server; the hint falls back to the default tier).
const FREE_PASS_INVITES = DEFAULT_REFERRAL_TIERS.find((tier) => tier.kind === 'pass')?.minCount ?? 10;

// The Adventurer Pass screen: season key art, perks, a horizontal track (free reward above, premium below, one column per level; it scrolls sideways on a phone too),
// the season's exclusives generated from the track data, and the footer (stuck to the foot of the page) with "claim all" and (for non-owners) the purchase button.

// Where the web purchase stands: idle -> after a payment: confirming (polling the server) -> confirmed, or pending ("still processing, come back in a moment").
export type PassFlow = 'idle' | 'confirming' | 'confirmed' | 'pending';

// Levels whose rewards are the season's headline items: bigger cards, art at 64 px.
const FEATURED_LEVELS = new Set([8, 10, 15, 18, 20, 27, 30]);

const COLUMN_STEP = 140; // px one arrow key press moves the horizontal track

interface RewardView {
  name: string;
  amountText: string; // "x3" / "+500" / ""
  src?: string; // pixel art
  frame?: boolean; // the gold portrait frame has no art: it is drawn
  skin?: HeroSheet; // a hero skin is shown as the idle frame of its sheet
  fallback: ReactNode;
}

function rewardView(reward: BattlePassReward): RewardView {
  switch (reward.kind) {
    case 'gold':
      return { name: t('battlePass.rewardGold'), amountText: `+${fmtNum(reward.amount)}`, src: Assets.icons.gold.url, fallback: '' };
    case 'shards':
      return { name: t('battlePass.rewardShards'), amountText: `+${fmtNum(reward.amount)}`, src: '/assets/icons/shards.png', fallback: '' };
    case 'material': {
      const def = MATERIALS.find((m) => m.id === reward.id);
      return { name: def ? t(`materials.${def.nameKey}`) : String(reward.id), amountText: `x${reward.amount}`, src: def?.iconUrl, fallback: def?.icon ?? '' };
    }
    case 'consumable': {
      const def = getConsumable(reward.id ?? '');
      return { name: def ? t(`consumables.${def.nameKey}`) : String(reward.id), amountText: `x${reward.amount}`, src: def?.iconUrl, fallback: def?.icon ?? '' };
    }
    case 'gem': {
      const def = getGem(reward.id ?? '');
      return { name: def ? t(`gems.${def.nameKey}`) : String(reward.id), amountText: `x${reward.amount}`, src: def?.iconUrl, fallback: def?.icon ?? '' };
    }
    case 'relic': {
      const def = getGear(reward.id ?? '');
      return { name: def ? t(`gear.${def.nameKey}`) : String(reward.id), amountText: '', src: def?.icon, fallback: '' };
    }
    case 'cosmetic': {
      const title = reward.id ? getTitleDef(reward.id) : undefined;
      const frame = reward.id ? getFrameDef(reward.id) : undefined;
      const skin = reward.id ? getSkinDef(reward.id) : undefined;
      if (skin) return { name: t(`titles.${skin.nameKey}`), amountText: '', skin: 'knight_golden', fallback: '' };
      if (frame) return { name: t(`titles.${frame.nameKey}`), amountText: '', frame: true, fallback: '' };
      return { name: title ? t(`titles.${title.nameKey}`) : t('battlePass.cosmeticReward'), amountText: '', src: title?.iconUrl, fallback: '' };
    }
  }
}

function RewardArt({ view, big, size }: { view: RewardView; big?: boolean; size?: number }) {
  if (view.skin) return <HeroThumb sheet={view.skin} size={size ?? (big ? 64 : 32)} />;
  if (view.frame) return <span className={`pa-frame-preview portrait-frame frame-season-gold${big ? ' big' : ''}`} aria-hidden />;
  if (view.src) return <img className={`pa-art${big ? ' big' : ''}`} src={view.src} alt="" draggable={false} />;
  return <span className="pa-art-fallback">{view.fallback}</span>;
}

// "42 d 6 h" / "5 h" / "< 1 h": what is left of the season.
function remainingText(ms: number): string {
  const hours = Math.max(0, Math.floor(ms / 3600000));
  if (hours >= 24) return t('battlePass.remainingDays', { d: Math.floor(hours / 24), h: hours % 24 });
  if (hours >= 1) return t('battlePass.remainingHours', { h: hours });
  return t('battlePass.remainingLess');
}

type CardState = 'claimed' | 'claimable' | 'premiumLocked' | 'future';

function RewardCard({
  reward,
  state,
  featured,
  supreme,
  track,
  onClaim,
}: {
  reward: BattlePassReward;
  state: CardState;
  featured: boolean;
  supreme?: boolean; // the level-30 premium card: three rewards, the biggest card of the track
  track: 'free' | 'premium';
  onClaim: () => void;
}) {
  const view = rewardView(reward);
  const extras = (reward.also ?? []).map(rewardView);
  const claimable = state === 'claimable';
  const title = [view.name, ...extras.map((e) => e.name)].join(' + ');
  return (
    <button
      className={`pa-card ${track} ${state}${featured ? ' featured' : ''}${supreme ? ' supreme' : ''}`}
      onClick={claimable ? onClaim : undefined}
      aria-disabled={!claimable}
      tabIndex={claimable ? 0 : -1}
      title={title}
      data-ui
    >
      <span className="pa-card-art">
        <RewardArt view={view} big={featured} size={supreme ? 52 : undefined} />
        {supreme && extras.filter((e) => e.skin).map((e) => <RewardArt key={e.name} view={e} big size={80} />)}
      </span>
      <span className="pa-card-text">
        <span className="pa-card-name">{view.name}</span>
        {view.amountText && <span className="pa-card-amount">{view.amountText}</span>}
        {extras.map((e) => (
          <span className="pa-card-extra" key={e.name}>
            + {e.name}
          </span>
        ))}
      </span>
      {state === 'claimed' && <span className="pa-card-tag ok">{t('battlePass.claimed')}</span>}
      {state === 'premiumLocked' && (
        <span className="pa-card-tag lock" aria-label={t('battlePass.premiumLocked')}>
          <img src="/assets/icons/garden_plot_locked.png" alt="" draggable={false} />
        </span>
      )}
      {claimable && <span className="pa-card-tag go">{t('battlePass.claim')}</span>}
    </button>
  );
}

// What each exclusive of the premium track is, generated from the track and the item data (never typed twice).
interface Highlight {
  id: string;
  name: string;
  levels: number[];
  line: string;
  view: RewardView;
}

function seasonHighlights(): Highlight[] {
  const found = new Map<string, Highlight>();
  const add = (reward: BattlePassReward, level: number) => {
    const key = `${reward.kind}:${reward.id}`;
    const existing = found.get(key);
    if (existing) {
      existing.levels.push(level);
      return;
    }
    const view = rewardView(reward);
    let line = '';
    if (reward.kind === 'relic') {
      const g = getGear(reward.id ?? '');
      line = t('battlePass.hlRelic', { stats: g ? gearStatLines(g).map((s) => s.text).join(' · ') : '' });
    } else if (reward.kind === 'consumable' && reward.id === 'forge_seal') {
      const floor = RARITIES.findIndex((r) => r.id === FORGE_SEAL_MIN_RARITY);
      const pool = RARITIES.slice(floor);
      const total = pool.reduce((a, r) => a + r.chance, 0);
      const top = pool[pool.length - 1];
      line = t('battlePass.hlSeal', { rarity: t(`rarity.${RARITIES[floor].nameKey}`), pct: Math.round((top.chance / total) * 100), top: t(`rarity.${top.nameKey}`) });
    } else if (reward.kind === 'consumable' && reward.id === 'stash_deed') {
      line = t('battlePass.hlDeed', { n: STASH_DEED_SLOTS, cap: STASH_BONUS_CAP });
    } else if (reward.kind === 'cosmetic' && getSkinDef(reward.id ?? '')) {
      line = t('battlePass.hlSkin');
    } else if (reward.kind === 'cosmetic' && getFrameDef(reward.id ?? '')) {
      line = t('battlePass.hlFrame');
    } else if (reward.kind === 'cosmetic') {
      line = t('battlePass.hlTitle');
    }
    found.set(key, { id: key, name: view.name, levels: [level], line, view });
  };
  for (const lvl of BATTLE_PASS_TRACK) {
    const r = lvl.premium;
    const exclusive = r.kind === 'relic' || (r.kind === 'consumable' && (r.id === 'forge_seal' || r.id === 'stash_deed')) || (r.kind === 'cosmetic' && FRAMES.some((f) => f.id === r.id));
    if (!exclusive) continue;
    add(r, lvl.level);
    for (const extra of r.also ?? []) add(extra, lvl.level);
  }
  return [...found.values()];
}

// ---- the screen ------------------------------------------------------------------------------------------------------------------

export default function BattlePassView({
  save,
  onActivate,
  highlightBuy = false,
  passFlow,
  onRecheck,
  buyExtra,
  onClaim,
  onClaimAll,
  onOpenInvites,
}: {
  save: SaveData;
  onActivate: () => void;
  /** Set by the website link (?comprar=passe): draws attention to the buy button without clicking it. */
  highlightBuy?: boolean;
  passFlow: PassFlow;
  onRecheck: () => void;
  /** The way to pay on the web build (App hands it in): rendered under the main buy button, and when present it is the only buy control. Nothing in the desktop build. */
  buyExtra?: ReactNode;
  onClaim: (level: number, track: 'free' | 'premium') => void;
  onClaimAll: () => { claimed: number; blocked: number };
  /** Online only: opens the "Convidar amigos" page. Shown as a one-line hint to someone who does not own the Pass yet. */
  onOpenInvites?: () => void;
}) {
  usePassEntitlementVersion(); // the server's answer (owned, season) can arrive after the first paint
  const owner = ownsAdventurerPass(save);
  // Until the League opens the game is in the pre-season (an open test): the hero shows that, not a season countdown that has no meaning yet.
  const leagueResetAt = useLeagueResetAt();
  // Web build (server mode): the Pass is paid through buyExtra; without it the main button only says "Em breve". Offline/desktop: as before.
  const server = isServerPassSource();
  const preseason = leagueResetAt === null || (leagueResetAt === undefined && !server);
  const ops = useOpsState();
  const salesPaused = server && ops.passSalesPaused; // the owner / watchdog paused Pass sales: the player is told why
  const canBuy = !server && ADVENTURER_PASS_TESTABLE;
  // The Pass belongs to a season: a Pass that has ended says so (perks off; what it already gave stays).
  const expired = server ? expiredPassSeason() : null;
  const buyLabel = server ? t('battlePass.comingSoonWeb') : t(ADVENTURER_PASS_TESTABLE ? 'battlePass.activateTest' : 'battlePass.comingSoon');
  // The Pass is sold through that one option only: on the web build with it present it is the only buy control (no main button).
  const showMainBuy = !server || !buyExtra;
  const now = Date.now();
  // The season shown is never behind the one the save settled (a clock set back keeps the stored one).
  const season = Math.max(save.passSeason, seasonNumber(now));
  const level = save.battlePassLevel;
  const maxed = level >= MAX_BATTLE_PASS_LEVEL;
  const need = battlePassXpForLevel(level);
  const pct = maxed ? 100 : Math.min(100, (save.battlePassXp / need) * 100);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; left: number; moved: boolean; id: number } | null>(null);
  const suppressClick = useRef(false);
  const [note, setNote] = useState<string | null>(null);
  // The season ranking tab exists only when the owner switched it on (VITE_SEASON_RANKING_ENABLED); otherwise this screen is exactly what it always was.
  const [tab, setTab] = useState<'track' | 'season'>('track');
  const showSeason = seasonRankingEnabled && tab === 'season';

  const claimableCount = BATTLE_PASS_TRACK.reduce(
    (n, l) => n + (l.level <= level ? (save.claimedPassRewards.free.includes(l.level) ? 0 : 1) + (owner && !save.claimedPassRewards.premium.includes(l.level) ? 1 : 0) : 0),
    0,
  );

  // The track opens centred on the player's current level (a horizontal scroller, on a phone too).
  const goToMyLevel = useCallback((smooth: boolean) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const col = scroller.querySelector<HTMLElement>(`[data-level="${level}"]`);
    if (!col) return;
    if (scroller.scrollWidth <= scroller.clientWidth + 1) return;
    const left = col.offsetLeft - (scroller.clientWidth - col.clientWidth) / 2;
    scroller.scrollTo({ left: Math.max(0, left), behavior: smooth ? 'smooth' : 'auto' });
  }, [level]);

  useEffect(() => {
    goToMyLevel(false);
    // only when the screen opens: the player's own scrolling must not be undone by every claim
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mouse wheel: a vertical wheel over the track scrolls it sideways, until it hits an end (then the page scrolls as usual).
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 0) return;
      if ((e.deltaY > 0 && el.scrollLeft >= max - 1) || (e.deltaY < 0 && el.scrollLeft <= 0)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Drag with the mouse (touch keeps its native panning).
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    const el = scrollerRef.current;
    if (!el) return;
    drag.current = { x: e.clientX, left: el.scrollLeft, moved: false, id: e.pointerId };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const el = scrollerRef.current;
    if (!d || !el) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) > 5) {
      d.moved = true;
      el.setPointerCapture(d.id);
      el.classList.add('dragging');
    }
    if (d.moved) el.scrollLeft = d.left - dx;
  };
  const endDrag = () => {
    const d = drag.current;
    drag.current = null;
    const el = scrollerRef.current;
    if (!d || !el) return;
    el.classList.remove('dragging');
    if (d.moved) {
      suppressClick.current = true;
      window.setTimeout(() => (suppressClick.current = false), 0);
    }
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const el = scrollerRef.current;
    if (!el) return;
    if (e.key === 'ArrowRight') el.scrollBy({ left: COLUMN_STEP, behavior: 'smooth' });
    else if (e.key === 'ArrowLeft') el.scrollBy({ left: -COLUMN_STEP, behavior: 'smooth' });
    else if (e.key === 'Home') el.scrollTo({ left: 0, behavior: 'smooth' });
    else if (e.key === 'End') el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' });
    else return;
    e.preventDefault();
  };

  const claimAll = () => {
    const r = onClaimAll();
    if (r.blocked > 0) setNote(t('battlePass.claimAllBlocked', { n: r.blocked, c: r.claimed }));
    else if (r.claimed > 0) setNote(t('battlePass.claimAllDone', { n: r.claimed }));
    else setNote(t('battlePass.claimNothing'));
  };

  const cardState = (lvl: number, track: 'free' | 'premium'): CardState => {
    if (save.claimedPassRewards[track].includes(lvl)) return 'claimed';
    if (lvl > level) return 'future';
    if (track === 'premium' && !owner) return 'premiumLocked';
    return 'claimable';
  };

  const perks = passPerkLines().map((p) => ({ key: p.key, icon: p.icon, label: t(p.label.key, p.label.params), sub: t(p.sub.key, p.sub.params) }));

  const highlights = seasonHighlights();

  // The perks list: before the track for someone shopping for the Pass (benefits first), after the track for an owner (the track is what they come back to check).
  const perksSection = (
  <section className={`pa-perks${owner ? ' on' : ' off'}`} aria-label={t('battlePass.perksTitle')}>
    <div className="pa-perks-head">
      <span className="pa-perks-title">{t('battlePass.perksTitle')}</span>
      <Chip tone={owner ? 'good' : 'plain'}>{owner ? t('battlePass.perkOn') : t('battlePass.perkOff')}</Chip>
    </div>
    <ul className="pa-perk-list">
      {perks.map((p) => (
        <li className="pa-perk" key={p.key}>
          <img className="pa-perk-icon" src={p.icon} alt="" draggable={false} />
          <span className="pa-perk-text">
            <span className="pa-perk-label">{p.label}</span>
            <span className="pa-perk-sub">{p.sub}</span>
          </span>
        </li>
      ))}
    </ul>
  </section>
  );

  const tabs: TabItem<'track' | 'season'>[] = [
    { id: 'track', label: t('seasonRanking.tabTrack') },
    { id: 'season', label: t('seasonRanking.tab') },
  ];

  // The bar under the scrolling body: "claim all" on the left, the purchase (when the Pass is not owned) on the right.
  const footer = (
    <Panel className="pa-foot ui-bar">
      <div className="pa-foot-main">
        <Button variant="primary" className="pa-claimall" onClick={claimAll} disabled={claimableCount === 0}>
          {t('battlePass.claimAll')}
          {claimableCount > 0 && <span className="pa-claimall-count">{claimableCount}</span>}
        </Button>
        {note && (
          <span className="pa-note" role="status">
            {note}
          </span>
        )}
      </div>
      {owner ? (
        <span className="pa-owned">{passFlow === 'confirmed' ? t('battlePass.paymentConfirmed') : t('battlePass.ownedNote')}</span>
      ) : (
        <div className="pa-buy">
          {server && passFlow === 'pending' ? (
            <Button variant="primary" className="pa-buy-btn" onClick={onRecheck}>
              {t('battlePass.recheck')}
            </Button>
          ) : showMainBuy ? (
            <Button
              variant="primary"
              className={`pa-buy-btn${highlightBuy ? ' pa-buy-highlight' : ''}`}
              data-highlight={highlightBuy ? 'true' : undefined}
              onClick={onActivate}
              disabled={!canBuy || passFlow === 'confirming'}
            >
              {buyLabel}
            </Button>
          ) : null}
          {salesPaused && (
            <span className="pa-note" role="status" data-testid="ops-pass-paused">
              {t('ops.passSalesPaused')}
            </span>
          )}
          {server && (passFlow === 'confirming' || passFlow === 'pending') && (
            <span className="pa-note" role="status">
              {t(passFlow === 'confirming' ? 'battlePass.confirming' : 'battlePass.stillProcessing')}
            </span>
          )}
          {buyExtra}
        </div>
      )}
      {!owner && expired && (
        <p className="pa-note" role="status" data-testid="pass-expired">
          {t('battlePass.expired', { ended: expired.ended, n: expired.buy })}
        </p>
      )}
    </Panel>
  );

  return (
    <Screen label={t('battlePass.title')} className="pa-page">
      <PageHeader icon={<img className="pixel-icon" src="/assets/icons/nav_battlepass.png" alt="" />} title={t('battlePass.title')} />
        <header className={`pa-hero${owner ? ' compact' : ''}`}>
          <img className="pa-hero-art" src="/assets/backgrounds/battlepass_season.png" alt="" draggable={false} />
          <div className="pa-hero-shade" aria-hidden />
          <div className="pa-hero-content">
            <div className="pa-hero-meta">
              <Chip tone="gold">{preseason ? t('battlePass.preseason') : t('battlePass.season', { n: season })}</Chip>
              {!preseason && <span className="pa-hero-time">{remainingText(seasonRemainingMs(season, now))}</span>}
              <Chip tone={owner ? 'good' : 'plain'}>{owner ? t('battlePass.statusActive') : t('battlePass.statusFree')}</Chip>
            </div>
            <div className="pa-level">
              <span className="pa-level-text">{maxed ? t('battlePass.levelDone', { n: level }) : t('battlePass.levelBar', { n: level, cur: fmtNum(save.battlePassXp), need: fmtNum(need) })}</span>
              <Meter pct={pct} label={t('battlePass.levelBar', { n: level, cur: fmtNum(save.battlePassXp), need: fmtNum(need) })} />
            </div>
          </div>
        </header>

        {seasonRankingEnabled && <Tabs<'track' | 'season'> items={tabs} value={tab} onChange={setTab} label={t('battlePass.title')} />}

        {showSeason ? (
          <SeasonRankingPanel online={server} ownsPass={owner} />
        ) : (
          <>
            {!owner && perksSection}

            {!owner && onOpenInvites && (
              <p className="pa-invite-hint rf-invite-hint" data-testid="pass-invite-hint">
                <span>{t('invites.passHint', { n: FREE_PASS_INVITES })}</span>{' '}
                <Button size="sm" onClick={onOpenInvites}>
                  {t('invites.passHintButton')}
                </Button>
              </p>
            )}

            <Panel
              className="pa-track-panel"
              title={t('battlePass.trackTitle')}
              actions={
                <>
                  <span className="pa-track-legend">
                    <Chip>{t('battlePass.colFree')}</Chip>
                    <Chip tone="gold">{t('battlePass.colPremium')}</Chip>
                  </span>
                  <Button size="sm" onClick={() => goToMyLevel(true)}>
                    {t('battlePass.goMyLevel')}
                  </Button>
                </>
              }
            >
              <div
                className="pa-track"
                ref={scrollerRef}
                tabIndex={0}
                role="region"
                aria-label={t('battlePass.trackTitle')}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onClickCapture={(e) => {
                  if (suppressClick.current) {
                    e.stopPropagation();
                    e.preventDefault();
                  }
                }}
                onKeyDown={onKeyDown}
              >
                <div className="pa-rowlabels" aria-hidden>
                  <span className="pa-rowlabel-spacer" />
                  <span className="pa-rowlabel free">{t('battlePass.colFree')}</span>
                  <span className="pa-rowlabel premium">{t('battlePass.colPremium')}</span>
                </div>
                {BATTLE_PASS_TRACK.map((lvl) => {
                  const featured = FEATURED_LEVELS.has(lvl.level);
                  const reached = lvl.level <= level;
                  return (
                    <div
                      className={`pa-col${reached ? ' reached' : ''}${lvl.level === level ? ' current' : ''}${featured ? ' featured' : ''}${lvl.level === MAX_BATTLE_PASS_LEVEL ? ' supreme' : ''}`}
                      data-level={lvl.level}
                      key={lvl.level}
                      style={{ '--pa-i': lvl.level } as CSSProperties}
                    >
                      <div className="pa-lvl">
                        <span className="pa-lvl-num">{lvl.level}</span>
                      </div>
                      <RewardCard reward={lvl.free} state={cardState(lvl.level, 'free')} featured={featured} track="free" onClaim={() => onClaim(lvl.level, 'free')} />
                      <RewardCard reward={lvl.premium} state={cardState(lvl.level, 'premium')} featured={featured} supreme={lvl.level === MAX_BATTLE_PASS_LEVEL} track="premium" onClaim={() => onClaim(lvl.level, 'premium')} />
                    </div>
                  );
                })}
              </div>
            </Panel>

            {owner && perksSection}

            <Panel title={t('battlePass.highlightsTitle')}>
              <ul className="pa-hl-list">
                {highlights.map((h) => (
                  <li className="pa-hl" key={h.id}>
                    <ItemFrame size="lg" rarity="legendary">
                      <RewardArt view={h.view} big />
                    </ItemFrame>
                    <span className="pa-hl-text">
                      <span className="pa-hl-name">
                        {h.name}
                        <span className="pa-hl-levels">{h.levels.length > 1 ? t('battlePass.atLevels', { l: h.levels.join(', ') }) : t('battlePass.atLevel', { l: h.levels[0] })}</span>
                      </span>
                      <span className="pa-hl-line">{h.line}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>

            <p className="pa-howxp">
              <strong>{t('battlePass.howXp')}</strong> {t('battlePass.xpFloor', { n: T.battlePass.xpPerFloor })} · {t('battlePass.xpHunt')} · {t('battlePass.xpGather')}
            </p>

            {/* what the purchase gives: it sits in the page, just above the stuck bar, so the bar itself stays one row tall */}
            {!owner && <p className="pa-buy-blurbs">{t('battlePass.buyBlurb', { h: T.battlePass.capHours })}</p>}
          </>
        )}
      {footer}
    </Screen>
  );
}

// The one-time card the player sees after a season ended: what was delivered for them. Shown by App whenever the save holds one.
export function SeasonSummaryModal({ save, onDismiss }: { save: SaveData; onDismiss: () => void }) {
  const summary = save.pendingSeasonSummary;
  if (!summary) return null;
  return (
    <Dialog
      className="pa-summary"
      icon={<img className="pixel-icon" src="/assets/icons/nav_battlepass.png" alt="" />}
      title={t('battlePass.seasonDelivered', { n: summary.season })}
      subtitle={t('battlePass.seasonDeliveredHint')}
      footer={
        <Button variant="primary" block onClick={onDismiss}>
          {t('battlePass.seasonOk')}
        </Button>
      }
    >
      <ul className="pa-summary-list">
        {summary.rewards.map((r) => {
          const view = rewardView({ kind: r.kind, id: r.id, amount: r.amount });
          return (
            <li className="pa-summary-row" key={`${r.kind}:${r.id ?? ''}`}>
              <span className="pa-summary-art">
                <RewardArt view={view} />
              </span>
              <span className="pa-summary-name">{view.name}</span>
              <span className="pa-summary-amount">{view.amountText || '+1'}</span>
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}
