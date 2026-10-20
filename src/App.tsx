import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import T, { setTunableListener } from './game/tunables';
import {
  addBattlePassXp,
  computeCP,
  computeGardenStatuses,
  isBuffActive,
  computeMiningStatus,
  computeWoodcuttingStatus,
  defaultSave,
  effectiveRepairCost,
  playerLevel,
  ContextualTutorialId,
  InitialTutorialStep,
  SaveData,
} from './game/engine';
import { SaveConflictError, SaveRepository, SaveTooLargeError } from './game/saveRepository';
import { seasonRankingEnabled } from './game/seasonRanking';
import { useSeasonSubmit } from './game/useSeasonSubmit';
import { setSyncedSave } from './game/syncedSave';
import { startPolling } from './lib/poller';
import { SaveScheduler, UploadOutcome, flushCloudSave, setActiveSaveScheduler } from './game/saveScheduler';
import { isImportantChange } from './game/saveImportance';
import { snapshotPrefs, subscribePrefs } from './lib/deviceStore';
import { useAuth } from './auth/AuthContext';
import { applyHuntClaim, applyHuntStop, huntClaimBlocked, needsServerUniques, planHuntClaim, requestHuntStart } from './game/huntLifecycle';
import { isServerItemAuthority } from './game/itemAuthority';
import { fetchMyCertificates, itemApi, newRequestId } from './game/itemServer';
import { ActionFail, changeAction, changeVoidsCertificate, createPouchAction, discardPouchAction, equipAction, forgeAction, openPouchAction, removeAction, resolveHuntUniques, settleBossClaim } from './game/itemActions';
import { clearCertificates, setCertificates } from './game/itemCerts';
import { queueBossClaims } from './game/bossClaims';
import ConfirmVoidModal from './components/ConfirmVoidModal';
import TradeableUseModal from './components/TradeableUseModal';
import { getMaterial, type MaterialId } from './game/materials';
import { TradeableMap, gateTradeableUse, materialPrefs, reconcileTradeable, stackQty, stripTradeable, withMaterialPrefs } from './game/tradeableMaterials';
import { isTradeableReachable } from './game/tradeableStatus';
import { useTradeableSync } from './game/useTradeableSync';
import { addRelics, addUniqueInstance } from './game/uniques';
import { applyFertilizer, applyHarvest, applyPlant, applyUproot, readySlots } from './game/gardenActions';
import { getPotionRecipe } from './game/potions';
import { applyElixir, applyRepairKit, applyWhetstoneOil, ElixirId, isBuffItem, RepairKitId } from './game/elixirs';
import { goldMultiplier } from './game/buffs';
import { applyBattlePassClaim, settleSeason } from './game/battlepass';
import { applySelectSkin, applySelectFrame, applyUseStashDeed, STASH_BONUS_CAP, STASH_DEED_SLOTS } from './game/seasonItems';
import { getServerPassOwned, grantDailyPassKit, isServerPassSource, ownsAdventurerPass, purchaseAdventurerPass, setServerPassOwned } from './game/entitlements';
import { applyServerPass, buyIntentAction, clearBuyIntent, fetchServerPassOwned, hasBuyIntent, pollPassOwned, recheckServerPass, startCheckout, takeCheckoutReturn, passPurchaseEnabled } from './game/passServer';
import { usePassEntitlementVersion } from './game/usePassEntitlement';
import { fetchReferralStatus } from './lib/referral';
import { InvitesPage } from './components/InvitesPanel';
import { applyReferralCosmetics } from './game/referralRewards';
import { getServerResetAt, needsLeagueReset, needsPioneerCheck, PIONEER_TITLE_ID, readLeagueResetAt, settleLeague } from './game/leagueReset';
import LeagueResetModal from './components/LeagueResetModal';
import { applyBuyConsumable, CraftFailure } from './game/craftActions';
import { cancelCraftJob, craftUnitsDue, prepaidForgeSave, resolveCraftJob, settleForgeUnit, startCraftJob } from './game/craftJob';
import type { CraftJobKind } from './game/craftJobTypes';
import { HeroActivity } from './game/activity';
import BusyNotice from './components/BusyNotice';
import { DURABILITY_LOSS_PER_STAGE, GEAR, getGear, isInstancedSlot } from './game/gear';
import { SkillRanks, applyLoadoutSwitch, applyRespec, applySkillAllocation, saveSkillEffects, skillPointsAvailable } from './game/heroSkills';
import { applyReforge } from './game/reforge';
import { applyLapidar } from './game/lapidar';
import {
  InstancedSlot,
  applyDurabilityLoss,
  applyEquipInstance,
  equipBlock,
  equipLevelBlock,
  applyRepair,
  applySalvage,
  salvageBlockReason,
  applySocketGem,
  applyUnequipSlot,
  applyUnsocketGem,
  applyUpgrade,
  createGearInstance,
  equippedSubstatTotals,
  resolveGearInstance,
} from './game/gearInstances';
import { getRefiningRecipe } from './game/refining';
import { rarityDef } from './game/rarity';
import { ConsumableId, EXPEDITION_TICKET_SKIP_MS } from './game/consumables';
import { addForced, canAddInstances, expandInventory, inventoryCapacity } from './game/inventory';
import { StackKind, applyStashMove, applyStashUpgrade, applyStoreAll, bagCount, stashCount } from './game/stash';
import { applyMerchantSell, SellKind } from './game/merchant';
import { applyWholesaleBatch, WholesaleLine } from './game/wholesale';
import { PouchId, isPouchId } from './game/goldPouch';
import { applyDiscard } from './game/bagActions';
import { ItemUse } from './game/itemUses';
import { RefiningStation, getRefiningRecipe as refiningRecipeById } from './game/refining';
import { BagContext } from './components/bagContext';
import { GEMS, GemId } from './game/gems';
import { getTitleDef } from './game/titles';
import { playerSpriteUrl, withLookMoment } from './game/sprites';
import AdminModal from './components/AdminModal';
import { recordError, setErrorContext } from './lib/errorLog';
import ShopModal from './components/ShopModal';
import ForgeView, { ForgeReveal, ForgeTab } from './components/ForgeModal';
import OficiosView from './components/OficiosView';
import InventoryModal from './components/InventoryModal';
import PersonagemView from './components/PersonagemView';
import SkillsView from './components/SkillsView';
import DungeonMapModal from './components/DungeonMapModal';
import HuntModal from './components/HuntModal';
import HuntNavMini from './components/HuntNavMini';
import BattleModal from './components/BattleModal';
import DeliveryModal from './components/DeliveryModal';
import MiningModal from './components/MiningModal';
import WoodcuttingModal from './components/WoodcuttingModal';
import GardenModal from './components/GardenModal';
import { applyClaimGathering, applyStartGathering } from './game/gathering';
import ClaimModal from './components/ClaimModal';
import HuntRewardModal from './components/HuntRewardModal';
import QuestsModal from './components/QuestsModal';
import CodexModal from './components/CodexModal';
import BattlePassView, { SeasonSummaryModal } from './components/BattlePassModal';
import type { PassFlow } from './components/BattlePassModal';
import ClaimAllModal from './components/ClaimAllModal';
import { applyClaimAll, ClaimAllLine, readyActivities } from './game/claimAll';
import WelcomeBackModal from './components/WelcomeBackModal';
import { WelcomeBackAction } from './components/welcomeBackText';
import { awayLongEnough, buildWelcomeBack, readLastSeen, WelcomeBackSummary, writeLastSeen } from './game/welcomeBack';
import { attributePointsAvailable, NextStepTarget } from './game/nextStep';
import { suggestedSpend } from './game/attributes';
import { GUIDED_DESCENT_FLOOR, nextTutorialStep, tutorialStepDone } from './game/tutorialSteps';
import { extendLevelUp, LevelUpSummary } from './game/levelUp';
import LevelUpBanner from './components/LevelUpBanner';
import { highlightTarget } from './components/highlight';
import { crossedMilestoneFloors, getMilestoneReward, MAX_DUNGEON_FLOOR } from './game/dungeon';
import { RunRewards } from './game/waves';
import { depthsUnlocked, nextDepthStage } from './game/depths';
import { DEFAULT_HUNTING_DEPTH, getHuntingZone, HuntingDepth, isDepthUnlocked, isZoneOpen, unlockedZoneIds } from './game/huntingZones';
import { ExpeditionRewards, expeditionRewards, getExpedition } from './game/expedition';
import { isDeliveryReady } from './game/deliveries';
import { applyDeliveryAccept, applyDeliveryClaim, applyDeliveryReroll, applyDeliveryTicket, ensureDeliveryOffers } from './game/deliveries';
import { claimableCount, isClaimed, isComplete, QUESTS_ACHIEVEMENTS, QUESTS_DAILY } from './game/quests';
import { applyDungeonRace, applyFinalRaceClaim, applyProfessionPick, ProfessionId } from './game/leagueEvents';
import { loadNotifyPref, notificationsActive, planNotifications, readyEvents, showNotification } from './game/notify';
import { claimStreak, claimWeeklyBonus, claimWeeklyGoal, periodClaimable, rollSaveWeekly, utcDay, WeeklyGoalId } from './game/weekly';
import { questContext } from './game/questContext';
import { recordDungeonRun, trackSave } from './game/statsTracking';
import TutorialOverlay from './components/TutorialOverlay';
import SettingsModal from './components/SettingsModal';
import DesktopSidebar, { DesktopNavGroup } from './components/DesktopSidebar';
import DesktopTopbar from './components/DesktopTopbar';
import DesktopHome from './components/DesktopHome';
import MobileDrawer from './components/MobileDrawer';
import useIsDesktop from './hooks/useIsDesktop';
import { AudioPrefs, getAudioPrefs, initAudio, playSfx, setMuted, setMusicMuted, setMusicVolume, setSfxMuted, setSfxVolume } from './game/audio';
import { buildSaveExport, resetSave, writeBackup } from './game/saveTransfer';
import { fmtNum, Locale, setLocale, setLocaleListener, t } from './locales';
import { marketEnabled } from './game/marketFlag';
import type { MarketHost } from './components/market/marketDeps';
import { mt } from './locales/market';
import './ui/tokens.css'; // the design tokens first: App.css and everything after it reads them
import './App.css';
import './round11.css';
import './ui/base.css'; // after App.css: the body face and the typography override its `body` rule
import './ui/ui.css';
import './ui/shell.css';
import './ui/screens.css';
import './ui/hunt.css';
import './ui/dungeon.css';
import './ui/professions.css';
import './ui/season.css';
import './ui/quests.css';
import './ui/codex.css';
import './ui/orders.css';
import './ui/shop.css';
import './ui/pass.css';
import './ui/skills.css';
import './ui/dialogs.css';
import './ui/settings.css';
import './ui/materials.css'; // the tradeable-material stack and its question

// The player market (docs/MARKET_SOLANA.md) is WEB ONLY: Valve forbids crypto trading in a Steam game. marketEnabled is a build constant (VITE_MARKET_ENABLED, forced off in the desktop build),
// so in the desktop bundle these three lines, the screen, its text and its styles are not there at all (npm run check:desktop pins it).
// (The first constant is read right here on purpose: the bundler folds it where it stands, which is what lets it drop the dynamic imports below from the desktop bundle. A constant imported from
// another module would not be folded.)
const MARKET_BUILD = import.meta.env.VITE_MARKET_ENABLED === 'true';
const marketOn = MARKET_BUILD && marketEnabled;
const MarketScreen = MARKET_BUILD ? lazy(() => import('./components/MarketScreen')) : null;
const MarketSync = MARKET_BUILD ? lazy(() => import('./components/market/MarketSync')) : null;
const PassUsdc = MARKET_BUILD ? lazy(() => import('./components/PassUsdc')) : null;
const SettingsWallet = MARKET_BUILD ? lazy(() => import('./components/market/SettingsWallet')) : null;

const gearText = (key: string): string => t(`gear.${key}`);

// First-view tooltips for the Camp side-rail icons — order matches the rail top-to-bottom. Admin (dev
// only) is deliberately excluded: it doesn't exist in a production build, so there's nothing to
// introduce to a real player. See FirstViewTooltip.tsx / SaveData.seenTooltips.
const TOOLTIP_IDS = ['mining', 'woodcutting', 'garden', 'hunt', 'battlepass', 'bag', 'quests', 'mute', 'settings'] as const;

const REFERRAL_POLL_MS = 30 * 60 * 1000;

export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error' | 'offline';

interface AppProps {
  repository: SaveRepository;
  initialSave: SaveData;
  initialRevision: number;
}

function App({ repository, initialSave, initialRevision }: AppProps) {
  const { user, signOut, configured } = useAuth();
  // A season that ended while the game was closed is settled before the first frame (battlepass.ts settleSeason).
  // (Tradeable materials exist only where a server records them: the offline / desktop build turns any that an imported save carries into normal units, tradeableMaterials.ts.)
  const [save, setSave] = useState<SaveData>(() => settleSeason(isServerItemAuthority() ? initialSave : stripTradeable(initialSave), Date.now()));
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const revisionRef = useRef(initialRevision);
  // Set by setSaveBoth when a change must reach the server at once (saveImportance.ts); the autosave effect reads and clears it.
  const importantRef = useRef(false);
  const schedulerRef = useRef<SaveScheduler | null>(null);

  const [shopOpen, setShopOpen] = useState(false);
  const [shopTab, setShopTab] = useState<'buy' | 'sell' | 'wholesale' | 'pouch'>('buy');
  const [bagOpen, setBagOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // "Personagem" and "Ofícios" are main-content areas now (sidebar swaps them in, like Home),
  // not modals — see PersonagemView.tsx / OficiosView.tsx.
  const [activeView, setActiveView] = useState<'home' | 'personagem' | 'oficios' | 'skills' | 'mercado' | 'passe' | 'convites' | 'forja'>('home');
  // A tradeable material the player asked to sell from the inventory: the market opens on its Sell tab with it picked (once).
  const [marketPick, setMarketPick] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  useEffect(() => setErrorContext(activeView), [activeView]); // the error report says which screen was open
  const [dungeonOpen, setDungeonOpen] = useState(false);
  const [huntOpen, setHuntOpen] = useState(false);
  const [battleFloor, setBattleFloor] = useState<number | null>(null);
  const [expeditionOpen, setExpeditionOpen] = useState(false);
  const [mineOpen, setMineOpen] = useState(false);
  const [woodOpen, setWoodOpen] = useState(false);
  const [gardenOpen, setGardenOpen] = useState(false);
  const [claimResult, setClaimResult] = useState<{ title: string; name: string; rewards: ExpeditionRewards } | null>(null);
  const [questsOpen, setQuestsOpen] = useState(false);
  const [codexOpen, setCodexOpen] = useState(false);
  // The Pass is a page (activeView 'passe') like Ofícios; this opens it.
  const openPassView = () => setActiveView('passe');
  const [highlightBuy, setHighlightBuy] = useState(false);
  useEffect(() => { if (activeView !== 'passe') setHighlightBuy(false); }, [activeView]); // leaving the Pass page ends the buy-button highlight
  const [claimAllLines, setClaimAllLines] = useState<ClaimAllLine[] | null>(null);
  // "Bem-vindo de volta" (welcomeBack.ts): what the idle activities produced while the player was away; null = nothing to show.
  const [welcome, setWelcome] = useState<{ summary: WelcomeBackSummary; canClaimAll: boolean } | null>(null);
  // The pending hunt reward screen can be set aside to make room in the inventory first (shortcut from the screen itself); the hunt screen brings it back.
  const [rewardHidden, setRewardHidden] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  // The hero does one task at a time (activity.ts): what he is busy with when the player asks for another (BusyNotice), and whether the forge job waits on something (a full bag).
  const [busyNotice, setBusyNotice] = useState<HeroActivity | null>(null);
  const [craftStalled, setCraftStalled] = useState(false);
  // The brief rarity-coloured line on the forge result (ForgeModal `reveal`): what was just forged / refined, glowing in the colour of its rarity.
  const [forgeReveal, setForgeReveal] = useState<ForgeReveal | null>(null);
  const revealTimeout = useRef<number | null>(null);
  const revealForge = (text: string, tone: ForgeReveal['tone']) => {
    setForgeReveal({ id: Date.now(), text, tone });
    if (revealTimeout.current) window.clearTimeout(revealTimeout.current);
    revealTimeout.current = window.setTimeout(() => setForgeReveal(null), 3200);
  };
  // Forces a re-render when a dev-tunable changes (Admin panel) — nothing reads the value itself.
  const [, setVersion] = useState(0);
  // The UTC day the clock was last read on: a new one re-renders the sidebar so the streak dot appears while the game is open across midnight (weekly.ts).
  const [, setUtcToday] = useState(() => utcDay(Date.now()));
  const [, setLocaleVersion] = useState(0);
  // Music and effects each have a volume and a mute (audio.ts, a device preference); the top bar's mute button toggles both.
  const [audio, setAudio] = useState<AudioPrefs>(() => getAudioPrefs());
  const muted = audio.musicMuted && audio.sfxMuted;
  const [cheatMode, setCheatMode] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [tooltipQueue, setTooltipQueue] = useState<string[]>(() => TOOLTIP_IDS.filter((id) => !save.seenTooltips.includes(id)));
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
  const [tutorialStep, setTutorialStep] = useState<InitialTutorialStep | null>(() =>
    save.tutorial.initial === 'pending' || save.tutorial.initial === 'in_progress' ? save.tutorial.initialStep : null,
  );
  const [contextTutorial, setContextTutorial] = useState<ContextualTutorialId | null>(null);
  const [levelUp, setLevelUp] = useState<LevelUpSummary | null>(null);

  const saveRef = useRef(save);
  const cheatModeRef = useRef(false);
  // Web build: one server-backed item action (forge, equip, refine, pouch...) at a time, and the prompt that warns a change cancels a certificate (itemActions.ts).
  const itemBusyRef = useRef(false);
  const [voidPrompt, setVoidPrompt] = useState<{ run: () => Promise<void> } | null>(null);
  // The question before the game spends TRADEABLE materials (tradeableMaterials.ts): the change waits here until the player answers. `base` is the save it was computed from.
  const [tradeablePrompt, setTradeablePrompt] = useState<{ used: TradeableMap; npc: boolean; first: boolean; base: SaveData; next: SaveData } | null>(null);

  const toastTimeout = useRef<number | null>(null);
  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimeout.current) window.clearTimeout(toastTimeout.current);
    toastTimeout.current = window.setTimeout(() => setToast(null), 1600);
  };

  // What the market screens may do with the game: read the live save, replace it (the autosave persists it), and say something. Stable across renders; the functions are read through a ref.
  const marketFns = useRef<{ apply: (s: SaveData) => void; toast: (m: string) => void }>({ apply: () => undefined, toast: () => undefined });
  const marketHost = useMemo<MarketHost>(() => ({ getSave: () => saveRef.current, applySave: (next) => marketFns.current.apply(next), notify: (m) => marketFns.current.toast(m) }), []);

  // Character XP is intentionally never shown as a number anywhere in the UI (see TopHud/HeroModal/HuntModal/HuntRewardModal) and only Hunting pays it (since the League,
  // Rodada 20) — a level-up toast is the only XP-gain feedback left, so it's centralized here (setSaveBoth) rather than duplicated at every call site.
  const celebrateLook = (look: string, armorNameKey: string) => {
    playSfx('victory');
    showToast(look === 'hero_steel_v2' ? t('ui.heroKnighted') : t('ui.heroNewLook', { name: t(`gear.${armorNameKey}`) }));
    // The level-up style flash on every portrait: one class on <html>, styled in App.css (.hero-knighted-flash).
    const root = document.documentElement;
    root.classList.remove('hero-knighted-flash');
    void root.offsetWidth;
    root.classList.add('hero-knighted-flash');
    window.setTimeout(() => root.classList.remove('hero-knighted-flash'), 1400);
  };
  // Play time counted by the app clock since the last commit; it rides along with the next save (a flush every few minutes keeps it from waiting forever).
  const pendingSecondsRef = useRef(0);
  const setSaveBoth = (s: SaveData, opts: { npc?: boolean; confirmed?: boolean; tradeableFirst?: boolean } = {}) => {
    // Tradeable materials (tradeableMaterials.ts): every change is looked at once, here. Spending tradeable units is refused while the server cannot record it, asked about the first time
    // (and every time for a sale to an NPC merchant), and queued for the server's burn; moving them on purpose (a listing, a delivery) decides the portion itself.
    const rec = reconcileTradeable(saveRef.current, s, opts.tradeableFirst ? { first: true } : {});
    if (Object.keys(rec.used).length > 0) {
      const gate = opts.confirmed
        ? 'free'
        : gateTradeableUse(rec.used, { server: isServerItemAuthority(), reachable: isTradeableReachable(), acked: materialPrefs(saveRef.current).useAcked, npc: !!opts.npc });
      if (gate === 'blocked') {
        showToast(t('tradeable.blocked'));
        return;
      }
      if (gate === 'confirm') {
        setTradeablePrompt({ used: rec.used, npc: !!opts.npc, first: !!opts.tradeableFirst, base: saveRef.current, next: s });
        return;
      }
    }
    s = rec.save;
    // Lifetime statistics that are read from the change itself (stats.ts): the Gold gained, the full sets now worn, the seconds played.
    s = trackSave(saveRef.current, s, pendingSecondsRef.current);
    pendingSecondsRef.current = 0;
    const prevLevel = playerLevel(saveRef.current.xp);
    const nextLevel = playerLevel(s.xp);
    // The first time each look is worn (sprites.ts withLookMoment): a one-off toast + portrait flash, recorded in save.seenLooks so it never repeats; normalizeSave marks the
    // looks an old save already reached as seen.
    const moment = withLookMoment(s);
    if (moment) {
      s = moment.save;
      celebrateLook(moment.look, moment.armorNameKey);
    }
    if (isImportantChange(saveRef.current, s)) importantRef.current = true;
    saveRef.current = s;
    setSave(s);
    if (nextLevel > prevLevel) {
      playSfx('level_up');
      // The level-up banner (LevelUpBanner): levels gained while it is still up, or while the player was away, add to the same banner ("+3 níveis").
      setLevelUp((current) => extendLevelUp(current, prevLevel, nextLevel));
    }
  };

  // ---- The Adventurer Pass on the web: the server owns it (entitlements.ts). The save's flag is overwritten from the server's answer, whatever the save says.
  const passVersion = usePassEntitlementVersion();
  useEffect(() => {
    if (!isServerPassSource()) return;
    const owned = getServerPassOwned();
    if (!!saveRef.current.hasBattlePass !== owned) setSaveBoth(applyServerPass(saveRef.current, owned, Date.now()));
    // setSaveBoth is recreated every render; the inputs are the server answer and the save's own flag
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passVersion, save.hasBattlePass]);

  const userId = user?.id ?? null;
  // Web build: the account's certificates as the SERVER lists them. The screens say "Certificado" only for a piece whose certificate is in this list (itemCerts.ts); if the list cannot
  // be read the pieces simply show as not confirmed.
  const refreshCertificates = () => {
    if (!userId || !configured) {
      clearCertificates();
      return;
    }
    fetchMyCertificates()
      .then(setCertificates)
      .catch(() => undefined);
  };
  useEffect(() => {
    refreshCertificates();
    // refreshCertificates is recreated every render; the inputs are the account and the build
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, configured]);
  // Web build: the boss unique drops of banked Dungeon runs are rolled by the server. The claim stays in the save until it answers (same request id each time, so a retry is never a
  // second roll); if the server cannot be reached it is tried again every half minute.
  const bossClaimId = save.pendingBossClaims?.[0]?.id ?? null;
  const [bossRetry, setBossRetry] = useState(0);
  useEffect(() => {
    if (!bossClaimId || !userId || !configured || !isServerItemAuthority()) return;
    let cancelled = false;
    let timer: number | undefined;
    void (async () => {
      const claim = saveRef.current.pendingBossClaims?.find((c) => c.id === bossClaimId);
      if (!claim) return;
      const r = await settleBossClaim(itemApi, () => saveRef.current, claim, Date.now());
      if (cancelled) return;
      if (!r.ok) {
        timer = window.setTimeout(() => setBossRetry((n) => n + 1), 30_000);
        return;
      }
      setSaveBoth(r.save);
      if (r.uniques > 0) showToast(t('items.bossUniques', { n: r.uniques }));
    })();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
    // setSaveBoth / showToast are recreated every render; the inputs are the first queued claim and the retry counter
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bossClaimId, bossRetry, userId, configured]);
  // Web build: tradeable materials (tradeableMaterials.ts). The SERVER rolls which units of a claim are tradeable, records the ones the game spends and owns the balance; this keeps the save in step.
  useTradeableSync({
    enabled: configured && isServerItemAuthority(),
    userId,
    save,
    getSave: () => saveRef.current,
    commit: (s) => {
      setSaveBoth(s);
      importantRef.current = true; // a claim's roll or a burn: the server confirms the delivery against the save it holds
    },
    onFound: (found) => showToast(t('tradeable.found', { list: Object.entries(found).map(([id, n]) => t('tradeable.line', { n: fmtNum(n), name: t(`materials.${getMaterial(id as MaterialId)?.nameKey ?? id}`) })).join(', ') })),
  });
  // Season ranking (off unless VITE_SEASON_RANKING_ENABLED, and never in the desktop / offline build, which has no backend): posts the save in the background.
  useSeasonSubmit(seasonRankingEnabled && configured && !!userId, save);
  const [passFlow, setPassFlow] = useState<PassFlow>('idle');
  const confirmRun = useRef(0);
  // After the payment page: poll the entitlement for a short time (the webhook may take a moment) and say what happened.
  const cancelPassConfirm = () => {
    confirmRun.current++;
  };
  const confirmPassPurchase = () => {
    const run = ++confirmRun.current;
    setPassFlow('confirming');
    pollPassOwned(fetchServerPassOwned, { isCancelled: () => confirmRun.current !== run }).then((r) => {
      if (r === 'cancelled') return;
      if (r === 'owned') {
        setServerPassOwned(true);
        setPassFlow('confirmed');
        showToast(t('battlePass.activated'));
      } else setPassFlow('pending');
    });
  };
  useEffect(() => {
    if (!userId || !isServerPassSource() || takeCheckoutReturn() !== 'success') return;
    openPassView();
    confirmPassPurchase();
    return cancelPassConfirm;
    // once per page load, for the signed-in account
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);
  // Coming back to the tab after a while re-asks the server (a refund or a manual grant shows up without a reload); coming back from the payment page with Back resets the button.
  useEffect(() => {
    if (!userId || !isServerPassSource()) return;
    let last = Date.now();
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - last > 5 * 60 * 1000) {
        last = Date.now();
        void recheckServerPass(userId);
      }
    };
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) setPassFlow((f) => (f === 'starting' ? 'idle' : f));
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onShow);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onShow);
    };
  }, [userId]);

  // A delivery from the market (or a listing that left the bag) is acknowledged only once the server holds a save that has it: it is uploaded at once.
  marketFns.current = {
    apply: (next) => {
      setSaveBoth(next);
      importantRef.current = true;
    },
    toast: showToast,
  };

  const updateTutorial = (next: SaveData['tutorial']) => setSaveBoth({ ...saveRef.current, tutorial: next, seenWelcome: true });

  const advanceInitialTutorial = () => {
    const step = tutorialStep;
    if (!step) return;
    if (step === 'final') {
      const s = saveRef.current;
      setSaveBoth({ ...s, tutorial: { ...s.tutorial, initial: 'completed', initialStep: 'final' }, seenWelcome: true, seenTooltips: [...new Set([...s.seenTooltips, ...TOOLTIP_IDS])] });
      setTooltipQueue([]);
      setActiveTooltip(null);
      setTutorialStep(null);
      return;
    }
    const following = nextTutorialStep(step);
    if (!following) return;
    // The hunt that was just started keeps running behind the closing balloon; the Dungeon entry is only open while its own step is up.
    if (step === 'huntModal') setHuntOpen(false);
    if (step === 'dungeon') setDungeonOpen(false);
    if (following === 'points') setActiveView('personagem');
    updateTutorial({ ...saveRef.current.tutorial, initial: 'in_progress', initialStep: following });
    setTutorialStep(following);
  };

  const skipInitialTutorial = () => {
    const s = saveRef.current;
    setSaveBoth({ ...s, tutorial: { ...s.tutorial, initial: 'skipped', initialStep: 'final', automatic: false }, seenWelcome: true, seenTooltips: [...new Set([...s.seenTooltips, ...TOOLTIP_IDS])] });
    setTooltipQueue([]);
    setActiveTooltip(null);
    setTutorialStep(null);
  };

  // Escape only dismisses the current visual layer. The saved step remains intact and reload/replay
  // can resume it; only the explicit Skip button changes the automatic-tutorial preference.
  const dismissInitialTutorial = () => setTutorialStep(null);

  // A "do" step ends when the save shows it was done (points spent, descent finished, hunt running), whether the player did it through the balloon or ahead of it, and
  // also after a reload. The points step opens Personagem where the points are spent.
  useEffect(() => {
    if (tutorialStep && tutorialStepDone(tutorialStep, save)) advanceInitialTutorial();
    // advanceInitialTutorial is recreated every render; the inputs are the step and the save
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tutorialStep, save]);
  useEffect(() => {
    if (tutorialStep === 'points') setActiveView('personagem');
  }, [tutorialStep]);

  const replayTutorial = () => {
    setActiveView('home');
    updateTutorial({ ...saveRef.current.tutorial, initial: 'pending', initialStep: 'intro' });
    setTutorialStep('intro');
  };

  const openContextTutorial = (id: ContextualTutorialId) => {
    const tutorial = saveRef.current.tutorial;
    if (tutorialStep || contextTutorial || !tutorial.automatic || (tutorial.initial !== 'completed' && tutorial.initial !== 'skipped') || tutorial.seen.includes(id)) return;
    setContextTutorial(id);
  };

  // The first skill point (level 5): the Habilidades step of the contextual tutorials, shown once the player is back on a quiet screen (not in a fight, not behind a
  // reward) and never to a player who skipped the automatic tutorials.
  const level = playerLevel(save.xp);
  useEffect(() => {
    if (level < 5 || battleFloor !== null || (save.pendingHuntReward && !rewardHidden)) return;
    const id = window.setTimeout(() => openContextTutorial('skills'), 1500);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level >= 5, battleFloor === null, tutorialStep, contextTutorial]);

  const closeContextTutorial = () => {
    if (!contextTutorial) return;
    const tutorial = saveRef.current.tutorial;
    updateTutorial({ ...tutorial, seen: tutorial.seen.includes(contextTutorial) ? tutorial.seen : [...tutorial.seen, contextTutorial] });
    setContextTutorial(null);
  };

  const skipAutomaticTutorials = () => {
    const s = saveRef.current;
    setSaveBoth({ ...s, tutorial: { ...s.tutorial, automatic: false }, seenWelcome: true, seenTooltips: [...new Set([...s.seenTooltips, ...TOOLTIP_IDS])] });
    setTooltipQueue([]);
    setActiveTooltip(null);
    setContextTutorial(null);
  };

  const dismissContextTutorial = () => setContextTutorial(null);

  // First-view tooltip sequencing: shows one at a time from tooltipQueue (staggered, so a fresh save
  // with everything unlocked doesn't dump 9 bubbles at once), marks each seen the instant it's
  // displayed (so a reload mid-display never re-shows it — "seen" means shown, not "fully read"), and
  // never blocks the icon underneath — the icon's own onClick still fires normally either way. Held
  // off entirely while a guided tutorial card is up, so the two introduction systems never compete.
  useEffect(() => {
    if (tutorialStep || contextTutorial || activeTooltip || tooltipQueue.length === 0) return;
    const staggerId = window.setTimeout(() => {
      const [next, ...rest] = tooltipQueue;
      setTooltipQueue(rest);
      setActiveTooltip(next);
      const s = saveRef.current;
      if (!s.seenTooltips.includes(next)) {
        setSaveBoth({ ...s, seenTooltips: [...s.seenTooltips, next] });
      }
    }, 700);
    return () => window.clearTimeout(staggerId);
  }, [tutorialStep, contextTutorial, activeTooltip, tooltipQueue]);

  useEffect(() => {
    if (!activeTooltip) return;
    const dismissId = window.setTimeout(() => setActiveTooltip(null), 3000);
    const onAnyClick = () => setActiveTooltip(null);
    window.addEventListener('click', onAnyClick, true);
    return () => {
      window.clearTimeout(dismissId);
      window.removeEventListener('click', onAnyClick, true);
    };
  }, [activeTooltip]);

  // Phase 1 persistence: batched, conflict-aware save through whichever repository GameShell resolved (local or Supabase — see saveRepository.ts). This still sends the WHOLE SaveData object
  // as-is on every upload, same as the old direct-localStorage write; only WHERE it's stored changed, not who's trusted to compute gold/gear/RNG/timers (that's a later phase, see
  // docs/backend-phase1.md). WHEN it goes is decided by saveScheduler.ts: a signed-in hero's changes are mirrored to the device at once (pendingCloudSave.ts) and uploaded at most every
  // 45 s, at once for the important moments (saveImportance.ts), when a caller flushes, and when the page is going away. The local (offline) build still writes within a second.
  const leagueSwapRef = useRef(false);
  const uploadOnce = async ({ keepalive }: { keepalive: boolean }): Promise<UploadOutcome> => {
    // While the first League's reset swaps the hero, an autosave of the OLD hero must not land on top of it: stay pending, the scheduler asks again in a moment.
    if (leagueSwapRef.current) return 'skipped';
    setSaveStatus('saving');
    const toSave = saveRef.current;
    try {
      const result = await repository.save(toSave, revisionRef.current, { keepalive });
      revisionRef.current = result.revision;
      setSyncedSave(toSave); // the season ranking posts exactly what the server now holds
      setSaveStatus(saveRef.current === toSave ? 'saved' : 'dirty');
      return 'ok';
    } catch (err) {
      if (err instanceof SaveConflictError) {
        // Another tab/device saved first — the server always wins (§18/§21): reload its current state
        // rather than retry-and-clobber it.
        try {
          const fresh = await repository.load();
          if (fresh) {
            saveRef.current = fresh.save;
            revisionRef.current = fresh.revision;
            setSyncedSave(null); // the server's copy is not the object we hold until the next successful save
            setSave(fresh.save);
          }
        } catch {
          /* keep local state; the retry surfaces the same conflict again */
          setSaveStatus('error');
          return 'failed';
        }
        setSaveStatus('error');
        showToast(t('sync.conflict'));
        return 'conflict';
      }
      // A save over the upload size limit is not transient, but it is not lost either (it stays local); the error report tells support about it.
      if (err instanceof SaveTooLargeError) recordError('error', err);
      // Network/transient failure: stays pending, the scheduler retries with a growing delay (and at once when the browser comes back online) instead of silently dropping the change.
      setSaveStatus(navigator.onLine ? 'error' : 'offline');
      return 'failed';
    }
  };
  // Online, the player's preferences and the last-seen stamp live in memory (lib/deviceStore.ts) and ride in the save. A real preference change uploads with the next batch; the stamp alone only
  // rides along with whatever uploads next (and with the upload when the page is hidden or closed).
  const syncPrefs = (forceDirty: boolean) => {
    if (!repository.remote) return;
    const next = snapshotPrefs();
    const cur = saveRef.current;
    const before = cur.prefs ?? {};
    const keys = new Set([...Object.keys(before), ...Object.keys(next)]);
    const changed = [...keys].filter((k) => before[k] !== next[k]);
    if (changed.length === 0) return;
    saveRef.current = { ...cur, prefs: next };
    if (forceDirty || changed.some((k) => !k.startsWith('arena-last-seen'))) schedulerRef.current?.markDirty(false);
  };
  const syncPrefsRef = useRef(syncPrefs);
  syncPrefsRef.current = syncPrefs;
  useEffect(() => subscribePrefs(() => syncPrefsRef.current(false)), []);
  const uploadRef = useRef(uploadOnce);
  uploadRef.current = uploadOnce;
  if (!schedulerRef.current) {
    schedulerRef.current = new SaveScheduler(
      repository.remote ? { upload: (o) => uploadRef.current(o) } : { upload: (o) => uploadRef.current(o), minIntervalMs: 0, importantGapMs: 0 },
    );
  }

  useEffect(() => {
    const scheduler = schedulerRef.current!;
    scheduler.enable();
    setActiveSaveScheduler(scheduler);
    return () => {
      setActiveSaveScheduler(null);
      scheduler.dispose();
    };
  }, []);

  useEffect(() => {
    setSaveStatus((s) => (s === 'saving' ? s : 'dirty'));
    const important = importantRef.current;
    importantRef.current = false;
    schedulerRef.current!.markDirty(important);
  }, [save, repository, userId]);

  // The page is going away (tab hidden, closed, navigated off) or the network is back: send what is pending now. The hidden / pagehide upload is a keepalive request when the client supports it.
  useEffect(() => {
    const scheduler = schedulerRef.current!;
    const leaving = () => void scheduler.flush({ keepalive: true });
    // Online nothing is kept in the browser: a change not yet on the server exists only in this tab, so closing it asks first (and still tries the keepalive upload).
    const warn = (e: BeforeUnloadEvent) => {
      if (!repository.remote || !scheduler.pending) return;
      e.preventDefault();
      e.returnValue = '';
    };
    const onHide = () => {
      if (document.visibilityState === 'hidden') leaving();
    };
    const onOnline = () => scheduler.resumeNow();
    window.addEventListener('beforeunload', warn);
    window.addEventListener('beforeunload', leaving);
    window.addEventListener('pagehide', leaving);
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('beforeunload', warn);
      window.removeEventListener('beforeunload', leaving);
      window.removeEventListener('pagehide', leaving);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, []);

  // ...and one that ends while playing is settled within a minute. settleSeason returns the same object when there is nothing to do.
  useEffect(() => {
    const id = window.setInterval(() => {
      const now = Date.now();
      const settled = rollSaveWeekly(grantDailyPassKit(settleSeason(saveRef.current, now), new Date(now).toDateString()), now);
      if (settled !== saveRef.current) setSaveBoth(settled);
      setUtcToday(utcDay(now));
    }, 60_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Desktop / browser notification when an activity finishes while the window is not in focus (notify.ts; the toggle is in Settings). The first look only remembers what
  // is already finished; each finished fill is announced once, and never while the window has focus.
  const seenFillsRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    const tick = () => {
      if (!notificationsActive()) {
        seenFillsRef.current = null;
        return;
      }
      const plan = planNotifications(readyEvents(saveRef.current, Date.now()), seenFillsRef.current, document.hasFocus(), loadNotifyPref());
      seenFillsRef.current = plan.seen;
      for (const a of plan.announce) {
        const body = a.kind === 'garden' && a.count > 1 ? t('notify.gardenMany', { n: a.count }) : t(`notify.${a.kind}`);
        showNotification(t('notify.title'), body, a.kind);
      }
    };
    tick();
    const id = window.setInterval(tick, 15_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    setTunableListener(() => setVersion((v) => v + 1));
    return () => setTunableListener(null);
  }, []);

  useEffect(() => {
    setLocaleListener(() => setLocaleVersion((v) => v + 1));
    return () => setLocaleListener(null);
  }, []);

  useEffect(() => {
    void initAudio();
  }, []);

  useEffect(() => {
    // Admin panel is a dev-only tool — the listener must not even register in a production build.
    if (!import.meta.env.DEV) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        setAdminOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Escape closes the top-most open modal (reverse of render order below). Deliberately inert while a
  // dungeon run is on screen (a stray key must never retreat/abandon it), while the mandatory hunt-reward
  // claim is up, and while a tutorial overlay is visible (it handles Escape itself). Nested layers inside
  // a modal (garden picker, bag-expansion dialog) consume the key first via their own document listeners.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (tutorialStep || contextTutorial || battleFloor !== null || (save.pendingHuntReward && !rewardHidden)) return;
      const layers: Array<[boolean, () => void]> = [
        [settingsOpen, () => setSettingsOpen(false)],
        [welcome !== null, () => setWelcome(null)],
        [import.meta.env.DEV && adminOpen, () => setAdminOpen(false)],
        [questsOpen, () => setQuestsOpen(false)],
        [codexOpen, () => setCodexOpen(false)],
        [claimResult !== null, () => setClaimResult(null)],
        [gardenOpen, () => setGardenOpen(false)],
        [woodOpen, () => setWoodOpen(false)],
        [mineOpen, () => setMineOpen(false)],
        [expeditionOpen, () => setExpeditionOpen(false)],
        [huntOpen, () => setHuntOpen(false)],
        [dungeonOpen, () => setDungeonOpen(false)],
        [bagOpen, () => setBagOpen(false)],
        [shopOpen, () => setShopOpen(false)],
      ];
      const top = layers.find(([open]) => open);
      if (!top) return;
      e.preventDefault();
      playSfx('click');
      top[1]();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    tutorialStep,
    contextTutorial,
    battleFloor,
    save.pendingHuntReward,
    rewardHidden,
    settingsOpen,
    welcome,
    adminOpen,
    questsOpen,
    codexOpen,
    claimResult,
    gardenOpen,
    woodOpen,
    mineOpen,
    expeditionOpen,
    huntOpen,
    dungeonOpen,
    bagOpen,
    shopOpen,
  ]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    setAudio(getAudioPrefs());
    if (!next) playSfx('click');
  };

  // Settings: a change of either channel is applied at once and mirrored into the screen.
  const changeAudio = (apply: () => void) => {
    apply();
    setAudio(getAudioPrefs());
  };

  // Export: the hero as a JSON file (saveTransfer.ts: nothing but the save goes in).
  const exportSaveFile = () => {
    const { text, filename } = buildSaveExport(saveRef.current, Date.now());
    try {
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      showToast(t('settings.exported'));
    } catch {
      showToast(t('settings.exportFailed'));
    }
  };

  // Import and reset replace the hero: the current one is kept as a backup first (and nothing is replaced when the device refuses the backup). The screens that
  // were built from the old save (tutorial, first-view tooltips, the welcome-back summary) are rebuilt from the new one.
  const replaceHero = (next: SaveData, toastKey: string) => {
    if (!writeBackup(saveRef.current, Date.now())) {
      showToast(t('settings.backupFailed'));
      return;
    }
    commitSave(next, { important: true });
    setWelcome(null);
    setRewardHidden(false);
    setActiveView('home');
    setTutorialStep(next.tutorial.initial === 'pending' || next.tutorial.initial === 'in_progress' ? next.tutorial.initialStep : null);
    setContextTutorial(null);
    setActiveTooltip(null);
    setTooltipQueue(TOOLTIP_IDS.filter((id) => !next.seenTooltips.includes(id)));
    setSettingsOpen(false);
    showToast(t(toastKey));
  };
  const importSaveFile = (imported: SaveData) => replaceHero(imported, 'settings.imported');
  const resetHero = () => replaceHero(resetSave(saveRef.current), 'settings.resetDone');

  const openDungeon = () => {
    playSfx('click');
    setDungeonOpen(true);
  };

  const openHunt = () => {
    playSfx('click');
    setHuntOpen(true);
    setRewardHidden(false);
    if (tutorialStep === 'hunt') {
      updateTutorial({ ...saveRef.current.tutorial, initial: 'in_progress', initialStep: 'huntModal' });
      setTutorialStep('huntModal');
    }
  };

  // A "session" is one full Dungeon attempt (enter -> climb until death or voluntary retreat), capped
  // per-day (see freeSessionsPerDay/extraSessionShardCost below).
  const startSession = (depths: boolean) => {
    const s = saveRef.current;
    if (depths && !depthsUnlocked(s)) return;
    if (s.craftJob) {
      setBusyNotice('craft');
      return;
    }
    if (s.activeOreId) {
      showToast(t('mining.busyDungeon'));
      return;
    }
    if (s.activeWoodId) {
      showToast(t('woodcutting.busyOther'));
      return;
    }
    if (s.activeHuntingZone) {
      showToast(t('hunting.busyOther'));
      return;
    }
    const today = new Date().toDateString();
    const used = s.dungeonSessionsDay === today ? s.dungeonSessionsUsed : 0;
    const cost = T.dungeon.extraSessionShardCost;
    if (used >= T.dungeon.freeSessionsPerDay) {
      if (s.shards < cost) {
        showToast(t('dungeon.sessionsExhausted', { n: cost }));
        return;
      }
      setSaveBoth({ ...s, shards: s.shards - cost, dungeonSessionsDay: today, dungeonSessionsUsed: used + 1 });
      showToast(t('dungeon.extraSessionPaid', { n: cost }));
    } else {
      setSaveBoth({ ...s, dungeonSessionsDay: today, dungeonSessionsUsed: used + 1 });
    }
    playSfx('click');
    setDungeonOpen(false);
    // Profundezas (depths.ts) start one below the deepest depth cleared, the floors where the hero stands.
    setBattleFloor(depths ? nextDepthStage(s) : s.highestDungeonFloor);
  };
  const enterDungeon = () => startSession(false);
  const enterDepths = () => startSession(true);

  const finishRun = (startFloor: number, rewards: RunRewards, outcome: 'retreat' | 'defeat') => {
    const s = saveRef.current;
    // A finished run never refuses its loot: the drops go in even over the limit (the bag supports being over capacity until the player makes room).
    const looted = addForced(s, { materials: rewards.drops ?? {} });
    const stages = Math.max(0, rewards.stages);
    const success = outcome === 'retreat' && stages > 0;
    // Only the EQUIPPED weapon / armor instances wear down; every other copy is untouched.
    const worn = stages > 0 ? applyDurabilityLoss(s, DURABILITY_LOSS_PER_STAGE * stages) : s;
    // Biome-boss unique pieces (uniques.ts) become stored gear instances. A defeat keeps them like the boss gem; a full bag never costs the drop (the
    // Mochila may briefly show over capacity until the player frees a slot).
    let delivered = worn;
    for (const drop of rewards.uniques ?? []) delivered = addUniqueInstance(delivered, drop, `dg${startFloor}_${Date.now()}`, Date.now());
    // Boss relics are stackable gear: a copy goes into the stock (a second one just stacks), also over capacity and also after a defeat.
    delivered = addRelics(delivered, rewards.relics ?? []);
    // Floor checkpoint: every stage actually defeated this run is banked permanently, win or lose the
    // run overall — dying deep in a run no longer discards floors you already cleared to get there.
    // Only the one-time milestone loot below (gold/gems/title at 25/50/75/100) stays retreat-gated.
    const clearedFloor = stages > 0 ? Math.min(MAX_DUNGEON_FLOOR, startFloor + stages) : s.highestDungeonFloor;
    const nextFloor = Math.max(s.highestDungeonFloor, clearedFloor);
    const quests = { ...s.quests };
    let battlePassLevel = s.battlePassLevel;
    let battlePassXp = s.battlePassXp;
    if (stages > 0) {
      quests.daily = { ...quests.daily, kills: (quests.daily.kills ?? 0) + stages };
      quests.counters = { ...quests.counters, kills: (quests.counters.kills ?? 0) + stages };
      quests.counters.maxFloorCleared = Math.max(quests.counters.maxFloorCleared ?? 0, clearedFloor);
      ({ battlePassLevel, battlePassXp } = addBattlePassXp(s, T.battlePass.xpPerFloor * stages));
    }
    const subs = equippedSubstatTotals(s);
    // Gear goldBonus (capped inside equippedSubstatTotals) and the Fortune Tonic add up, see buffs.ts goldMultiplier.
    const goldGain = Math.round(rewards.gold * goldMultiplier(subs.goldBonus, isBuffActive(s, 'fortune', Date.now()), ownsAdventurerPass(s) ? T.battlePass.goldBonus : 0, saveSkillEffects(s).goldPct));
    const unlockedHuntingZones = Array.from(new Set([...s.unlockedHuntingZones, ...unlockedZoneIds(nextFloor)]));

    // Milestone (first-clear) rewards only ever apply to a successful retreat — dying still banks the
    // floor checkpoint above, but forfeits this run's shot at the milestone's bonus gold/gems/title.
    const crossed = success ? crossedMilestoneFloors(startFloor, stages, s.dungeonCheckpoints) : [];
    let gold = s.gold + goldGain;
    let gems = s.gems;
    // Per-clear gate-boss gem drop (waveRewards) — kept even on a defeat, same as its shards/drops.
    if (rewards.gems && Object.keys(rewards.gems).length > 0) {
      const g = { ...gems };
      for (const [gid, qty] of Object.entries(rewards.gems)) g[gid as GemId] = (g[gid as GemId] ?? 0) + (qty as number);
      gems = g;
    }
    let cosmetics = s.cosmetics;
    let dungeonCheckpoints = s.dungeonCheckpoints;
    if (crossed.length > 0) {
      dungeonCheckpoints = [...s.dungeonCheckpoints, ...crossed];
      for (const floor of crossed) {
        const reward = getMilestoneReward(floor);
        if (!reward) continue;
        gold += reward.gold;
        const g = { ...gems };
        for (const [gid, qty] of Object.entries(reward.gems)) g[gid as GemId] = (g[gid as GemId] ?? 0) + (qty as number);
        gems = g;
        if (reward.titleId && !cosmetics.includes(reward.titleId)) cosmetics = [...cosmetics, reward.titleId];
      }
    }

    // Web build: the boss uniques are rolled by the server; the run only leaves the claim (the stages) in the save until the server has answered (settleBossClaim, below).
    const bossStages = isServerItemAuthority() ? rewards.bossStages ?? [] : [];
    const queued = queueBossClaims(
        {
      ...s,
      stats: recordDungeonRun(s, startFloor, stages, (rewards.uniques ?? []).length).stats,
      gold,
      gems,
      cosmetics,
      dungeonCheckpoints,
      materials: looted.materials,
      shards: s.shards + rewards.shards,
      victories: s.victories + (success ? 1 : 0),
      highestDungeonFloor: nextFloor,
      unlockedHuntingZones,
      gearInstances: delivered.gearInstances,
      inventory: delivered.inventory,
      blessed: false,
      quests,
      battlePassLevel,
      battlePassXp,
        },
        bossStages,
        saveSkillEffects(s).bossLootMult,
        Date.now(),
        newRequestId,
      );
    // Corrida da Masmorra (leagueEvents.ts): the bosses this run cleared pay Gold and a timed Hunting XP buff while that event runs.
    setSaveBoth(applyDungeonRace(queued, startFloor, stages, Date.now()).save);
    if (bossStages.length > 0) showToast(t('items.bossPending'));
    playSfx(outcome === 'retreat' ? 'victory' : 'hit');
    setBattleFloor(null);
  };

  // `id` is a gear INSTANCE id.
  const repairItem = (id: string, blessed: boolean) => {
    const s = saveRef.current;
    const hit = resolveGearInstance(s, id);
    if (!hit) return;
    const next = applyRepair(s, id, blessed, effectiveRepairCost(s, hit.item.tier ?? 0));
    if (!next) return;
    playSfx('victory');
    setSaveBoth(next);
  };

  const buyGem = (id: GemId) => {
    const def = GEMS.find((g) => g.id === id);
    if (!def) return;
    const s = saveRef.current;
    if (s.shards < def.shardCost) return;
    playSfx('click');
    setSaveBoth({ ...s, shards: s.shards - def.shardCost, gems: { ...s.gems, [id]: (s.gems[id] ?? 0) + 1 } });
  };

  // Sockets belong to one gear INSTANCE.
  const socketGem = (instanceId: string, gemId: GemId) => {
    const next = applySocketGem(saveRef.current, instanceId, gemId);
    if (!next) return;
    playSfx('click');
    setSaveBoth(next);
  };

  const unsocketGem = (instanceId: string, index: number) => {
    const next = applyUnsocketGem(saveRef.current, instanceId, index);
    if (!next) return;
    playSfx('click');
    setSaveBoth(next);
  };

  // The board is filled/refreshed right before it is shown (offers are persisted, so a reload never reshuffles them).
  const openExpedition = () => {
    playSfx('click');
    const s = saveRef.current;
    const now = Date.now();
    const next = ensureDeliveryOffers(s, now, Math.random, ownsAdventurerPass(s));
    if (next !== s) setSaveBoth(next);
    setExpeditionOpen(true);
    openContextTutorial('deliveries');
  };

  const useAutoPotion = (id: ConsumableId) => {
    const s = saveRef.current;
    const qty = s.consumables[id] ?? 0;
    if (qty <= 0) return;
    setSaveBoth({ ...s, consumables: { ...s.consumables, [id]: qty - 1 } });
  };

  // A craft / purchase that does not fit the inventory is refused with a message and charges nothing (craftActions.ts).
  const craftBlockedToast = (reason: CraftFailure | undefined) => {
    if (reason === 'bag') showToast(t('inventory.bagFullAction'));
    else if (reason === 'stack') showToast(t('shop.stackFull'));
  };

  // Damage elixirs (elixirs.ts): using one again while it is active refreshes the full duration from now rather than
  // stacking magnitude or extending additively, so the bonus itself stays constant. One pure transition, committed and
  // persisted at once; nothing happens without a unit.
  const drinkElixir = (id: ElixirId) => {
    const next = applyElixir(saveRef.current, id, Date.now());
    if (!next) {
      if (id === 'hunter_lure' && (saveRef.current.consumables.hunter_lure ?? 0) > 0 && !saveRef.current.activeHuntingZone) showToast(t('consumables.hunter_lure_needs_hunt'));
      // A Knowledge Elixir is refused (and kept) while the one before it still runs
      if (id === 'knowledge_elixir' && (saveRef.current.consumables.knowledge_elixir ?? 0) > 0 && isBuffActive(saveRef.current, 'knowledge', Date.now())) showToast(t('consumables.knowledge_elixir_running'));
      return;
    }
    playSfx('victory');
    commitSave(next);
    showToast(t(`consumables.${id}_active`));
  };

  // Whetstone Oil (elixirs.ts): +30 durability on the equipped weapon and armor, one unit, nothing spent when both are already at full durability.
  const oilGear = () => {
    const next = applyWhetstoneOil(saveRef.current);
    if (!next) {
      showToast(t('consumables.whetstone_oil_full'));
      return;
    }
    playSfx('victory');
    commitSave(next);
    showToast(t('consumables.whetstone_oil_active'));
  };

  // Repair Kits (elixirs.ts): +60 durability (Master: full) on the equipped weapon and armor, one unit, nothing spent when both are already full.
  const repairWithKit = (id: RepairKitId) => {
    const next = applyRepairKit(saveRef.current, id);
    if (!next) {
      showToast(t('consumables.whetstone_oil_full'));
      return;
    }
    playSfx('victory');
    commitSave(next);
    showToast(t(`consumables.${id}_active`));
  };

  const useConsumableManually = (id: string) => {
    if (isBuffItem(id)) drinkElixir(id);
    else if (id === 'whetstone_oil') oilGear();
    else if (id === 'repair_kit' || id === 'master_repair_kit') repairWithKit(id);
    else if (id === 'stash_deed') redeemStashDeed();
  };

  // Stash Deed (seasonItems.ts): +5 stash slots for good; at the +20 cap it is refused and kept.
  const redeemStashDeed = () => {
    const next = applyUseStashDeed(saveRef.current);
    if (!next) {
      showToast(t('stash.deedCap', { n: STASH_BONUS_CAP }));
      return;
    }
    playSfx('victory');
    setSaveBoth(next);
    showToast(t('stash.deedUsed', { n: STASH_DEED_SLOTS }));
  };

  const selectSkin = (id: string | null) => {
    const next = applySelectSkin(saveRef.current, id);
    if (!next) return;
    playSfx('click');
    setSaveBoth(next);
  };

  const selectFrame = (id: string | null) => {
    const next = applySelectFrame(saveRef.current, id);
    if (!next) return;
    playSfx('click');
    setSaveBoth(next);
  };

  const claimQuest = (id: string) => {
    const s = saveRef.current;
    const def = [...QUESTS_DAILY, ...QUESTS_ACHIEVEMENTS].find((q) => q.id === id);
    if (!def || isClaimed(def, s.quests)) return;
    if (!isComplete(def, s.quests, questContext(s))) return;
    const quests = { ...s.quests };
    if (def.kind === 'daily') {
      quests.dailyClaimed = [...quests.dailyClaimed, id];
    } else {
      quests.claimed = [...quests.claimed, id];
    }
    const cosmetics = def.titleId && !s.cosmetics.includes(def.titleId) ? [...s.cosmetics, def.titleId] : s.cosmetics;
    // Corrida Final (leagueEvents.ts): the fourth daily goal of a day starts the day's Hunting XP buff.
    setSaveBoth(applyFinalRaceClaim({ ...s, gold: s.gold + def.gold, shards: s.shards + def.shards, cosmetics, quests }, Date.now()));
    playSfx('victory');
    if (def.titleId && cosmetics !== s.cosmetics) showToast(t('quests.titleToast', { name: t(`titles.${getTitleDef(def.titleId)?.nameKey ?? ''}`) }));
  };

  // Semana das Profissoes (leagueEvents.ts): the player picks ONE profession for the week; the pick is final for that week.
  const pickProfession = (profession: ProfessionId) => {
    const next = applyProfessionPick(saveRef.current, profession, Date.now());
    if (!next) return;
    playSfx('click');
    setSaveBoth(next);
  };

  // Weekly goals and the login streak (weekly.ts): each claim is one pure transition on the latest save, rolled to the current UTC week first.
  const claimWeekly = (id: WeeklyGoalId) => {
    const now = Date.now();
    const claim = claimWeeklyGoal(rollSaveWeekly(saveRef.current, now), id, now);
    if (!claim) return;
    setSaveBoth(claim.save);
    playSfx('victory');
  };
  const claimWeeklyAll = () => {
    const now = Date.now();
    const claim = claimWeeklyBonus(rollSaveWeekly(saveRef.current, now), now);
    if (!claim) return;
    setSaveBoth(claim.save);
    playSfx('victory');
    showToast(t('quests.weeklyBonusToast', { g: fmtNum(claim.gold), s: claim.shards }));
  };
  const claimStreakReward = () => {
    const s = saveRef.current;
    const claim = claimStreak(s, Date.now(), ownsAdventurerPass(s));
    if (!claim) return;
    setSaveBoth(claim.save);
    playSfx('victory');
    if (claim.usedSaver) showToast(t('quests.streakSaved'));
  };

  // Delivery orders (deliveries.ts): every handler is one pure transition on the latest save, committed at once.
  const acceptDelivery = (offerId: string) => {
    const now = Date.now();
    const next = applyDeliveryAccept(saveRef.current, offerId, now, Math.random, ownsAdventurerPass(saveRef.current));
    if (!next) {
      showToast(t('deliveries.cannotAccept'));
      return;
    }
    playSfx('click');
    setSaveBoth(next);
  };

  const claimDelivery = () => {
    const now = Date.now();
    const claim = applyDeliveryClaim(saveRef.current, now);
    if (!claim) return;
    playSfx('victory');
    setSaveBoth(ensureDeliveryOffers(claim.save, now, Math.random, ownsAdventurerPass(claim.save)));
    setClaimResult({
      title: t('deliveries.rewards'),
      name: t(`deliveries.dest_${claim.offer.arch}_${claim.offer.dest}`),
      rewards: { gold: claim.offer.gold, shards: claim.offer.shards },
    });
  };

  const rerollDeliveries = () => {
    const s = saveRef.current;
    const now = Date.now();
    const next = applyDeliveryReroll(s, now, Math.random, ownsAdventurerPass(s));
    if (!next) return;
    playSfx('click');
    setSaveBoth(next);
  };

  const useDeliveryTicket = (ticketId: ConsumableId) => {
    const next = applyDeliveryTicket(saveRef.current, ticketId, Date.now());
    if (!next) return;
    playSfx('click');
    setSaveBoth(next);
  };

  // LEGACY: an Expedition started before delivery orders still finishes and pays the old way (nothing new can start).
  const claimExpedition = (index: number) => {
    const s = saveRef.current;
    const exp = s.expeditions[index];
    if (!exp || Date.now() < exp.endsAt) return;
    const def = getExpedition(exp.id);
    if (!def) return;
    const rewards = expeditionRewards(def);
    setSaveBoth({
      ...s,
      gold: s.gold + rewards.gold,
      shards: s.shards + rewards.shards,
      expeditions: s.expeditions.filter((_, i) => i !== index),
      quests: {
        ...s.quests,
        daily: { ...s.quests.daily, deliveries: (s.quests.daily.deliveries ?? 0) + 1 },
      },
    });
    playSfx('victory');
    setClaimResult({ title: t('expedition.rewards'), name: t(`expedition.${def.nameKey}`), rewards });
  };

  const useExpeditionTicket = (index: number, ticketId: ConsumableId) => {
    const s = saveRef.current;
    const exp = s.expeditions[index];
    const skipMs = EXPEDITION_TICKET_SKIP_MS[ticketId];
    if (!exp || !skipMs) return;
    if ((s.consumables[ticketId] ?? 0) < 1) return;
    playSfx('click');
    const expeditions = [...s.expeditions];
    expeditions[index] = { ...exp, endsAt: Math.max(Date.now(), exp.endsAt - skipMs) };
    setSaveBoth({ ...s, expeditions, consumables: { ...s.consumables, [ticketId]: (s.consumables[ticketId] ?? 0) - 1 } });
  };

  const startMining = (oreId: string) => {
    const s = saveRef.current;
    if (s.craftJob) {
      setBusyNotice('craft');
      return;
    }
    if (battleFloor !== null) {
      showToast(t('mining.busyBattle'));
      return;
    }
    if (s.activeWoodId) {
      showToast(t('woodcutting.busyOther'));
      return;
    }
    if (s.activeHuntingZone) {
      showToast(t('hunting.busyOther'));
      return;
    }
    // Switching tiers collects the running session first (gathering.ts), so nothing mined is thrown away.
    const started = applyStartGathering(s, 'mining', oreId, Date.now());
    if (!started) return;
    playSfx('click');
    setSaveBoth(started.save);
    if (started.claimed) showToast(gatherToast(started.claimed.units, started.claimed.leftBehind, 'mining.readyOre'));
  };

  // What a collect says: the units that came in and, spelled out, the ones the inventory had no room for (gathering.ts leaves them behind).
  const gatherToast = (units: number, leftBehind: number, key: string, gold = 0, dust = 0, gems = 0): string =>
    t(key, { n: units - leftBehind }) +
    (gold > 0 ? ' · ' + t('mining.readyGold', { n: gold }) : '') +
    (dust > 0 ? ' · ' + t('mastery.byDust', { n: dust }) : '') +
    (gems > 0 ? ' · ' + t('mastery.byGems', { n: gems }) : '') +
    (leftBehind > 0 ? ' · ' + t('inventory.leftBehind', { n: fmtNum(leftBehind) }) : '');

  // Home "Resgatar tudo" (claimAll.ts, Adventurer Pass owners): every finished activity through its own transition, one combined summary.
  const claimEverything = () => {
    const finish = (res: ReturnType<typeof applyClaimAll>) => {
      if (res.lines.length === 0) {
        showToast(t('claimAll.nothing'));
        return;
      }
      playSfx('victory');
      commitSave(res.save);
      setRewardHidden(false);
      setClaimAllLines(res.lines);
    };
    const res = applyClaimAll(saveRef.current, Date.now());
    // Web build: a Hunting reward waits for the server's roll of its uniques (applyClaimAll leaves it), so the rest is collected now and the hunt is claimed after the roll.
    if (isServerItemAuthority() && needsServerUniques(res.save.pendingHuntReward)) {
      void withItemLock(async () => {
        commitSave(res.save);
        const rolled = await resolveHuntUniques(itemApi, () => saveRef.current);
        if (!rolled.ok) {
          failToast(rolled);
          if (res.lines.length > 0) setClaimAllLines(res.lines);
          return;
        }
        commitSave(rolled.save);
        const second = applyClaimAll(saveRef.current, Date.now());
        finish({ save: second.save, lines: [...res.lines, ...second.lines] });
      });
      return;
    }
    finish(res);
  };

  // Welcome back: shown on load and when the window comes back after ten minutes or more away, never over the tutorial / first run, a dungeon fight or the
  // mandatory hunt reward. The last-seen stamp is a local convenience (welcomeBack.ts), refreshed while the game is open and when it loses focus.
  const seenId = user?.id ?? null;
  const welcomeBlockedRef = useRef(false);
  welcomeBlockedRef.current =
    tutorialStep !== null ||
    contextTutorial !== null ||
    battleFloor !== null ||
    !save.seenWelcome ||
    save.tutorial.initial === 'pending' ||
    save.tutorial.initial === 'in_progress' ||
    !!save.pendingHuntReward;
  useEffect(() => {
    const check = () => {
      const now = Date.now();
      const away = awayLongEnough(readLastSeen(seenId), now);
      writeLastSeen(now, seenId);
      if (!away || welcomeBlockedRef.current) return;
      const s = saveRef.current;
      const summary = buildWelcomeBack(s, now);
      if (summary.rows.length === 0) return;
      setWelcome({ summary, canClaimAll: ownsAdventurerPass(s) && readyActivities(s, now).count > 0 });
    };
    const leave = () => {
      writeLastSeen(Date.now(), seenId);
      syncPrefsRef.current(true);
    };
    const leaveAndSend = () => {
      leave();
      void schedulerRef.current?.flush({ keepalive: true });
    };
    const onVisibility = () => (document.visibilityState === 'hidden' ? leaveAndSend() : check());
    check();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', leave);
    window.addEventListener('focus', check);
    window.addEventListener('pagehide', leaveAndSend);
    const beat = window.setInterval(() => {
      if (document.visibilityState === 'visible') writeLastSeen(Date.now(), seenId);
    }, 60_000);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', leave);
      window.removeEventListener('focus', check);
      window.removeEventListener('pagehide', leaveAndSend);
      window.clearInterval(beat);
    };
  }, []);

  // Seconds played: the clock counts every ten seconds the window is visible; the total joins the next save, and a flush every five minutes keeps a quiet
  // session from losing it (one extra save per five minutes at most).
  useEffect(() => {
    const tick = window.setInterval(() => {
      if (document.visibilityState === 'visible') pendingSecondsRef.current += 10;
    }, 10_000);
    const flush = window.setInterval(() => {
      if (pendingSecondsRef.current >= 60) setSaveBoth(saveRef.current);
    }, 300_000);
    return () => {
      window.clearInterval(tick);
      window.clearInterval(flush);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const welcomeAction = (action: WelcomeBackAction) => {
    const dropRow = (kind: string) =>
      setWelcome((w) => {
        if (!w) return w;
        const rows = w.summary.rows.filter((r) => r.kind !== kind);
        return rows.length === 0 ? null : { ...w, summary: { rows } };
      });
    const now = Date.now();
    if (action === 'hunt') {
      setWelcome(null);
      openHunt();
      return;
    }
    if (action === 'mining') claimMining();
    else if (action === 'woodcutting') claimWoodcutting();
    else if (action === 'garden') harvestPlots(readySlots(saveRef.current, now));
    else if (action === 'delivery') claimDelivery();
    dropRow(action);
  };

  const welcomeClaimAll = () => {
    setWelcome(null);
    claimEverything();
  };

  const openNextStep = (target: NextStepTarget) => {
    if (target === 'inventory') {
      playSfx('click');
      setBagOpen(true);
    } else if (target === 'forge') {
      playSfx('click');
      setActiveView('forja');
    } else if (target === 'skills') {
      playSfx('click');
      setActiveView('skills');
    } else if (target === 'hero') {
      playSfx('click');
      setActiveView('personagem');
    } else if (target === 'hunt') openHunt();
    else if (target === 'dungeon') openDungeon();
    // The screen the suggestion points to opens, and the part of it to look at flashes for a moment.
    const marks: Record<NextStepTarget, string[]> = {
      inventory: ['inventory-modal'],
      forge: ['forge-modal'],
      skills: ['skills-view'],
      hero: ['attrs'],
      hunt: ['hunt-start', 'hunt-modal'],
      dungeon: ['dungeon-start'],
      none: [],
    };
    highlightTarget(marks[target]);
  };

  const claimMining = () => {
    const claim = applyClaimGathering(saveRef.current, 'mining', Date.now());
    if (!claim) return;
    playSfx('victory');
    setSaveBoth(claim.save);
    showToast(gatherToast(claim.units, claim.leftBehind, 'mining.readyOre', claim.gold, claim.dust, claim.gems));
  };

  const cancelMining = () => {
    const s = saveRef.current;
    if (!s.activeOreId) return;
    playSfx('click');
    setSaveBoth({ ...s, activeOreId: null });
  };

  // Mirrors startMining/claimMining/cancelMining exactly — see gathering.ts and woodcutting.ts/computeWoodcuttingStatus.
  const startWoodcutting = (woodId: string) => {
    const s = saveRef.current;
    if (s.craftJob) {
      setBusyNotice('craft');
      return;
    }
    if (battleFloor !== null) {
      showToast(t('woodcutting.busyBattle'));
      return;
    }
    if (s.activeOreId) {
      showToast(t('mining.busyOther'));
      return;
    }
    if (s.activeHuntingZone) {
      showToast(t('hunting.busyOther'));
      return;
    }
    const started = applyStartGathering(s, 'woodcutting', woodId, Date.now());
    if (!started) return;
    playSfx('click');
    setSaveBoth(started.save);
    if (started.claimed) showToast(gatherToast(started.claimed.units, started.claimed.leftBehind, 'woodcutting.readyWood'));
  };

  const claimWoodcutting = () => {
    const claim = applyClaimGathering(saveRef.current, 'woodcutting', Date.now());
    if (!claim) return;
    playSfx('victory');
    setSaveBoth(claim.save);
    showToast(gatherToast(claim.units, claim.leftBehind, 'woodcutting.readyWood', 0, claim.dust, claim.gems));
  };

  const cancelWoodcutting = () => {
    const s = saveRef.current;
    if (!s.activeWoodId) return;
    playSfx('click');
    setSaveBoth({ ...s, activeWoodId: null });
  };

  // Garden (see gardenActions.ts): every action is one pure transition, committed and persisted at once. A repeated
  // click finds the plot already planted / harvested and does nothing.
  const plantInPlots = (plantId: string, slotIndices: number[]) => {
    const next = applyPlant(saveRef.current, plantId, slotIndices, Date.now());
    if (!next) {
      showToast(t('garden.busy'));
      return;
    }
    playSfx('click');
    commitSave(next);
  };

  const harvestPlots = (slotIndices: number[]) => {
    const res = applyHarvest(saveRef.current, slotIndices, Date.now());
    if (!res) return;
    if (res.harvested.length === 0) {
      showToast(t('garden.bagFull'));
      return;
    }
    playSfx('victory');
    commitSave(res.save);
    const first = res.harvested[0];
    const done =
      res.harvested.length === 1
        ? `${t('garden.harvest')} +${first.qty} ${t(`materials.mat_${first.material}`)}`
        : t('garden.harvestedMany', { n: res.harvested.length });
    showToast(res.blocked.length > 0 ? `${done} · ${t('garden.bagFull')}` : done);
  };

  const fertilizePlot = (slotIndex: number) => {
    const next = applyFertilizer(saveRef.current, slotIndex, Date.now());
    if (!next) return;
    playSfx('click');
    commitSave(next);
    showToast(t('garden.fertilizeToast'));
  };

  const uprootPlot = (slotIndex: number) => {
    const next = applyUproot(saveRef.current, slotIndex);
    if (!next) return;
    playSfx('click');
    commitSave(next);
  };

  // Hunting lifecycle (see huntLifecycle.ts): each step is ONE pure transition committed in one go and persisted right
  // away (not only by the save effect), so a reload can never land between a step's parts. The reward a stop produces
  // lives in the save (pendingHuntReward), not in React state.
  // ---- Server-backed item actions (web build; docs/MARKET_FOUNDATION.md). One at a time; if the server cannot be reached the action is blocked with a clear message.
  const withItemLock = async (run: () => Promise<void>): Promise<void> => {
    if (itemBusyRef.current) return;
    itemBusyRef.current = true;
    try {
      await run();
    } catch (err) {
      recordError('error', err);
    } finally {
      itemBusyRef.current = false;
    }
  };
  const REFUSAL_KEYS = ['forge_rate', 'seal_limit', 'seal_pass_required', 'cert_day_limit', 'too_early', 'burn_not_held', 'pouch_gold_limit', 'pouch_count_limit', 'level_too_low'];
  const failToast = (r: { blocked?: ActionFail['blocked']; reason?: string }) => {
    if (r.blocked === 'unreachable') showToast(t('items.unreachable'));
    else if (r.blocked === 'listed') showToast(t('items.listed'));
    else if (r.blocked === 'refused') showToast(r.reason && REFUSAL_KEYS.includes(r.reason) ? t(`items.refused.${r.reason}`) : t('items.refusedGeneric'));
  };
  // Refining, reforging and lapidating a piece that still carries a certificate cancels it: ask first (a bound or uncertified piece changes at once).
  const requestChange = (id: string, reason: 'refine' | 'reforge' | 'lapidar', canApply: (s: SaveData) => boolean, apply: (s: SaveData) => void) => {
    const run = async () => {
      const gate = await changeAction(itemApi, () => saveRef.current, id, reason, canApply);
      if (!gate.ok) {
        if (gate.blocked !== 'game') failToast(gate);
        return;
      }
      apply(gate.save);
    };
    if (changeVoidsCertificate(saveRef.current.gearInstances[id])) setVoidPrompt({ run });
    else void withItemLock(run);
  };

  // A time-sensitive transition (stop a hunt, harvest, claim): changes the save and asks for an upload. On the signed-in build it joins the batch (the device keeps it meanwhile); only
  // `important` ones, and every change of the local build, are written at once.
  const commitSave = (next: SaveData, opts: { important?: boolean } = {}) => {
    setSaveBoth(next);
    if (opts.important || !repository.remote) importantRef.current = true;
  };

  // The first League (leagueReset.ts): on login GameShell already settled the hero; this keeps it true for a tab that stays open or comes back. It asks the server for the reset
  // moment, adopts the SERVER's save (another tab may have settled it already) and replaces a hero from before the reset by a fresh one, once. Offline / desktop: never runs.
  const adoptLeagueSave = (next: SaveData, revision: number) => {
    saveRef.current = next;
    revisionRef.current = revision;
    setSyncedSave(null);
    setSave(next);
    setShopOpen(false);
    setForgeFocus(null);
    setBagOpen(false);
    setDungeonOpen(false);
    setHuntOpen(false);
    setBattleFloor(null);
    refreshCertificates(); // the League voided every certificate of the heroes it replaced
    setWelcome(null);
    setRewardHidden(false);
    setActiveView('home');
    setTutorialStep(next.tutorial.initial === 'pending' || next.tutorial.initial === 'in_progress' ? next.tutorial.initialStep : null);
    setContextTutorial(null);
    setActiveTooltip(null);
    setTooltipQueue(TOOLTIP_IDS.filter((id) => !next.seenTooltips.includes(id)));
  };
  const adoptLeagueRef = useRef(adoptLeagueSave);
  adoptLeagueRef.current = adoptLeagueSave;
  useEffect(() => {
    if (!userId || !configured) return;
    let stopped = false;
    let busy = false;
    const check = async () => {
      if (busy) return;
      busy = true;
      try {
        // Once the League opened its reset moment never changes (set-once on the server): a known one is not asked again, only an unknown one (League not open yet, or never answered) is.
        const knownAt = getServerResetAt();
        const resetAt = typeof knownAt === 'number' ? knownAt : await readLeagueResetAt();
        if (stopped || typeof resetAt !== 'number') return;
        const local = saveRef.current;
        if (!needsLeagueReset(local, resetAt) && !needsPioneerCheck(local, resetAt)) return;
        // This adopts the SERVER's save, and uploads are batched: make the server hold the latest one first so nothing played since the last upload is replaced.
        await flushCloudSave();
        leagueSwapRef.current = true;
        const server = await repository.load();
        if (stopped || !server) return;
        const outcome = await settleLeague(repository, server, { accountId: userId, resetAt, applyPass: (s) => applyServerPass(s, getServerPassOwned(), Date.now()) });
        if (stopped) return;
        adoptLeagueRef.current(outcome.save, outcome.revision);
      } catch {
        /* the server could not be asked or written: the next resume or tick tries again */
      } finally {
        leagueSwapRef.current = false;
        busy = false;
      }
    };
    // now, then every 5 minutes (+-10 %) while the tab is visible; coming back to an overdue tab asks again within a couple of seconds (lib/poller.ts)
    const stopPolling = startPolling({ intervalMs: 5 * 60 * 1000, startDelayMs: 0, run: check });
    return () => {
      stopped = true;
      stopPolling();
    };
  }, [userId, configured, repository]);
  // Referral rewards (docs/WAITLIST.md): the SERVER grants the inviter a title and a portrait frame; the game reads what it granted and puts those cosmetics in the save. Online only, and idempotent
  // (the same rewards change nothing the second time, so nothing is saved and nothing re-renders). Read at login and every 30 minutes while the tab is visible (lib/poller.ts: paused while hidden, jittered, asked again when the tab comes back overdue). The free Pass needs nothing here:
  // it is an entitlement the Pass check already reads.
  const commitReferralRef = useRef<(next: SaveData) => void>(() => undefined);
  commitReferralRef.current = commitSave;
  useEffect(() => {
    if (!userId || !configured) return;
    let stopped = false;
    const sync = async () => {
      const status = await fetchReferralStatus();
      if (stopped || !status) return;
      const current = saveRef.current;
      const next = applyReferralCosmetics(current, status.rewards);
      if (next !== current) commitReferralRef.current(next);
    };
    const stopPolling = startPolling({ intervalMs: REFERRAL_POLL_MS, startDelayMs: 0, run: sync });
    return () => {
      stopped = true;
      stopPolling();
    };
  }, [userId, configured]);
  const dismissLeagueNotice = () => {
    const s = saveRef.current;
    if (s.league) commitSave({ ...s, league: { ...s.league, noticeSeen: true } });
  };

  // §22: try to flush whatever's pending before actually signing out, so a quick "sign out right after
  // an action" can't lose that action. Best-effort — signOut still proceeds even if the flush fails.
  const handleSignOut = async () => {
    try {
      await schedulerRef.current!.flush();
    } catch {
      /* proceed with sign-out regardless; nothing server-side is deleted either way */
    }
    await signOut();
  };

  const startHunt = (zoneId: string, depth: HuntingDepth = DEFAULT_HUNTING_DEPTH) => {
    const s = saveRef.current;
    const zone = getHuntingZone(zoneId);
    if (!zone || !isZoneOpen(zone, s.highestDungeonFloor, playerLevel(s.xp))) return;
    if (s.activeHuntingZone === zoneId && s.activeHuntingDepth === depth) return;
    if (!isDepthUnlocked(zone, depth, computeCP(s))) return;
    if (s.craftJob) {
      setBusyNotice('craft');
      return;
    }
    if (s.pendingHuntReward) {
      setRewardHidden(false);
      showToast(t('hunting.claimFirst'));
      return;
    }
    if (s.activeOreId) {
      showToast(t('mining.busyDungeon'));
      return;
    }
    if (s.activeWoodId) {
      showToast(t('woodcutting.busyOther'));
      return;
    }
    // While another session runs this only ENDS it and opens its reward (never a silent claim): the new zone is picked
    // after collecting.
    const next = requestHuntStart(s, zoneId, depth, Date.now());
    if (!next) return;
    playSfx('click');
    commitSave(next);
    if (s.activeHuntingZone && next.pendingHuntReward) showToast(t('hunting.switchClaimFirst'));
  };

  const stopHunt = () => {
    const next = applyHuntStop(saveRef.current, Date.now());
    if (!next) return;
    playSfx('click');
    commitSave(next);
  };

  const confirmHuntReward = () => {
    const pending = saveRef.current.pendingHuntReward;
    if (!pending) return;
    // Web build: the server rolls the unique drops of this reward first (bounded by server time) and certifies them; unreachable = the claim waits, nothing is lost.
    if (needsServerUniques(pending)) {
      void withItemLock(async () => {
        const r = await resolveHuntUniques(itemApi, () => saveRef.current);
        if (!r.ok) {
          failToast(r);
          return;
        }
        commitSave(r.save);
        const refused = (r as { refused?: string }).refused;
        if (refused) showToast(t('items.huntNoUniques', { r: refused }));
        else if (r.uniques > 0) showToast(t('items.huntUniques', { n: r.uniques }));
        claimHuntReward();
      });
      return;
    }
    claimHuntReward();
  };
  const claimHuntReward = () => {
    const pending = saveRef.current.pendingHuntReward;
    if (!pending) return;
    const plan = planHuntClaim(saveRef.current, pending);
    const next = applyHuntClaim(saveRef.current, pending.id);
    if (!next) return;
    playSfx('victory');
    commitSave(next);
    setRewardHidden(false);
    // Uniques (and units owed from before the inventory rule) the bag had no room for stay pending (held); drops without room are gone and said so.
    const lostUnits = plan.leftBehind.reduce((sum, i) => sum + i.count, 0);
    if (huntClaimBlocked(next)) showToast(t('hunting.uniquesHeldToast'));
    else if (lostUnits > 0) showToast(t('hunting.leftBehindToast', { n: fmtNum(lostUnits) }));
  };

  // Web (server mode): the button opens Stripe Checkout through the create-checkout function; the entitlement arrives by webhook. Offline/desktop build: entitlements.ts,
  // where a DEV build grants the Pass for testing and a production build shows a disabled button (Steam will sell it).
  const purchaseBattlePass = async () => {
    playSfx('click');
    if (isServerPassSource()) {
      if (!passPurchaseEnabled || passFlow === 'starting') return;
      setPassFlow('starting');
      const started = await startCheckout();
      if (started.ok) return; // the browser is leaving for the payment page
      setPassFlow('idle');
      const reason = (started as { reason?: string }).reason;
      if (reason === 'already_owned' && userId) void recheckServerPass(userId);
      else showToast(t(reason === 'rate_limited' ? 'battlePass.checkoutRateLimited' : 'battlePass.checkoutError'));
      return;
    }
    const res = purchaseAdventurerPass(saveRef.current, Date.now());
    if (!res.ok) return;
    setSaveBoth(res.save);
    showToast(t('battlePass.activated'));
  };

  // The "Comprar o Passe" link of the website (/?comprar=passe, captured in main.tsx): once signed in, open the Pass modal and, with sales on and the account not owning the
  // Pass according to the server, highlight the buy button. It never starts the checkout: the player clicks to go to Stripe. Runs once per page load (a ref, so React StrictMode's second effect pass does not lose it).
  const buyIntentDone = useRef(false);
  useEffect(() => {
    if (!userId || !isServerPassSource() || buyIntentDone.current || !hasBuyIntent()) return;
    buyIntentDone.current = true;
    clearBuyIntent();
    openPassView();
    if (!passPurchaseEnabled && !marketOn) return;
    fetchServerPassOwned()
      .then((owned) => setHighlightBuy(buyIntentAction(passPurchaseEnabled || marketOn, owned) === 'highlight'))
      .catch(() => undefined);
    // once per page load, for the signed-in account
  }, [userId, passVersion]);

  const dismissSeasonSummary = () => setSaveBoth({ ...saveRef.current, pendingSeasonSummary: null });

  // A Pass reward that is an item must fit the inventory; if it does not it stays claimable (battlepass.ts) and the player is told.
  const claimBattlePassLevel = (level: number, track: 'free' | 'premium') => {
    const res = applyBattlePassClaim(saveRef.current, level, track, Date.now());
    if (res.blocked) showToast(t('inventory.bagFullAction'));
    if (!res.save) return;
    playSfx('victory');
    setSaveBoth(res.save);
  };

  // Claims everything claimable; an item reward the bag has no room for is skipped (it stays claimable) and counted so the screen can say so.
  const claimAllBattlePassRewards = (): { claimed: number; blocked: number } => {
    let s = saveRef.current;
    let claimed = 0;
    let blocked = 0;
    const now = Date.now();
    for (let level = 1; level <= s.battlePassLevel; level++) {
      for (const track of ['free', 'premium'] as const) {
        const res = applyBattlePassClaim(s, level, track, now);
        if (res.blocked) blocked++;
        if (res.save) {
          s = res.save;
          claimed++;
        }
      }
    }
    if (blocked > 0) showToast(t('inventory.bagFullAction'));
    if (claimed > 0) {
      playSfx('victory');
      setSaveBoth(s);
    }
    return { claimed, blocked };
  };

  const buyConsumable = (id: ConsumableId) => {
    const res = applyBuyConsumable(saveRef.current, id);
    if (!res.ok || !res.save) {
      if (res.reason === 'bag') showToast(t('shop.bagFull'));
      else craftBlockedToast(res.reason);
      return;
    }
    playSfx('click');
    setSaveBoth(res.save);
  };

  // Descartar (bagActions.ts): part or all of a stack, or one stored gear instance; the screen has already asked for the confirmation.
  const discardItem = (kind: 'gear' | 'material' | 'consumable', id: string, qty: number | 'all' = 'all', variant?: 'tradeable') => {
    const s = saveRef.current;
    if (kind === 'material') qty = stackQty(s, id as MaterialId, variant, qty);
    // Web build: a certified piece is burned on the server first, so it cannot be sold after it is gone.
    if (isServerItemAuthority() && s.gearInstances[id]?.certificateId) {
      void withItemLock(async () => {
        const gate = await removeAction(itemApi, () => saveRef.current, id, 'discard', (x) => !!applyDiscard(x, 'instance', id));
        if (!gate.ok) {
          if (gate.blocked !== 'game') failToast(gate);
          return;
        }
        const next = applyDiscard(gate.save, 'instance', id);
        if (!next) return;
        setSaveBoth(next);
        playSfx('click');
      });
      return;
    }
    // A stack of Gold Pouches: the certificates of the pouches thrown away are burned on the server first (itemActions.discardPouchAction).
    if (isServerItemAuthority() && kind === 'consumable' && isPouchId(id)) {
      void withItemLock(async () => {
        const gate = await discardPouchAction(itemApi, () => saveRef.current, id, qty);
        if (!gate.ok) {
          if (gate.blocked !== 'game') failToast(gate);
          return;
        }
        setSaveBoth(gate.save);
        playSfx('click');
      });
      return;
    }
    const next = s.gearInstances[id] ? applyDiscard(s, 'instance', id) : applyDiscard(s, kind, id, qty);
    if (!next) return;
    setSaveBoth(next, { tradeableFirst: variant === 'tradeable' });
    playSfx('click');
  };

  // Baú (stash.ts): moving is partial by nature (what the destination has room for); say so when part stayed behind.
  const moveStash = (dir: 'store' | 'take', kind: StackKind, id: string, qty: number | 'all') => {
    const s = saveRef.current;
    const r = applyStashMove(s, dir, kind, id, qty);
    if (r.moved <= 0) {
      showToast(t(dir === 'store' ? 'stash.fullToast' : 'stash.bagFullToast'));
      return;
    }
    playSfx('click');
    setSaveBoth(r.save);
    const before = dir === 'store' ? bagCount(s, kind, id) : stashCount(s, kind, id);
    if (r.moved < (qty === 'all' ? before : Math.min(qty, before))) showToast(t(dir === 'store' ? 'stash.partialStore' : 'stash.partialTake', { n: fmtNum(r.moved) }));
  };

  const storeAllMaterials = () => {
    const r = applyStoreAll(saveRef.current, 'material');
    if (r.moved <= 0) {
      showToast(t('stash.fullToast'));
      return;
    }
    playSfx('click');
    setSaveBoth(r.save);
    showToast(t('stash.stored', { n: fmtNum(r.moved) }));
  };

  const upgradeStash = () => {
    const next = applyStashUpgrade(saveRef.current);
    if (!next) {
      showToast(t('stash.upgradeMissing'));
      return;
    }
    playSfx('victory');
    setSaveBoth(next);
    showToast(t('stash.upgraded', { n: next.stash.level }));
  };

  // Vender ao mercador (merchant.ts): a low price and a daily budget; the toast says what it paid, or that the budget is spent.
  const sellItem = (kind: SellKind, id: string, qty: number | 'all', variant?: 'tradeable') => {
    // A material's stacks are separate (tradeable units are their own stack): 'all' means all of the stack the player picked, never the total of both
    const r = applyMerchantSell(saveRef.current, kind, id, kind === 'material' ? stackQty(saveRef.current, id as MaterialId, variant, qty) : qty, Date.now());
    if (!r.ok || !r.save) {
      showToast(t(r.reason === 'budget' ? 'merchant.budgetSpent' : 'merchant.cannotSell'));
      return;
    }
    playSfx('victory');
    setSaveBoth(r.save, { npc: true, tradeableFirst: variant === 'tradeable' });
    showToast(r.capped ? t('merchant.soldCapped', { n: fmtNum(r.units ?? 0), g: fmtNum(r.gold ?? 0) }) : t('merchant.sold', { n: fmtNum(r.units ?? 0), g: fmtNum(r.gold ?? 0) }));
  };

  // Mercador Atacadista (wholesale.ts): ONLY called from a button the player pressed (one stack, or a ticked list he confirmed); the toast says what it paid.
  const sellWholesale = (lines: WholesaleLine[]) => {
    const r = applyWholesaleBatch(saveRef.current, lines, Date.now());
    if (r.units <= 0) {
      showToast(t('wholesale.worthless'));
      return;
    }
    playSfx('victory');
    setSaveBoth(r.save, { npc: true });
    showToast(t('wholesale.sold', { n: fmtNum(r.units), g: fmtNum(r.gold) }));
  };
  // Gold Pouches (goldPouch.ts): any player turns Gold into one (fee on top, lower for the Pass owner, daily limit, needs bag room); anyone opens one for exactly its face value.
  // Web build: the server limits how much Gold can become pouches and certifies each one; opening a certified pouch burns its certificate first (itemActions.ts).
  const createPouch = (id: PouchId) => {
    void withItemLock(async () => {
      const r = await createPouchAction(itemApi, () => saveRef.current, id, Date.now());
      if (!r.ok) {
        if (r.blocked === 'game') showToast(t(r.reason === 'limit' ? 'pouch.failLimit' : r.reason === 'bag' ? 'pouch.failBag' : 'pouch.failGold'));
        else failToast(r);
        return;
      }
      playSfx('victory');
      setSaveBoth(r.save);
      showToast(t('pouch.created', { g: fmtNum(r.gold) }));
    });
  };
  const openPouch = (id: PouchId) => {
    void withItemLock(async () => {
      const r = await openPouchAction(itemApi, () => saveRef.current, id);
      if (!r.ok) {
        if (r.blocked !== 'game') failToast(r);
        return;
      }
      playSfx('victory');
      setSaveBoth(r.save);
      showToast(t('pouch.opened', { g: fmtNum(r.gold) }));
    });
  };
  const openWholesale = () => {
    playSfx('click');
    setWelcome(null);
    // The shop sits under the hunt and the inventory modals, and the reward screen has its own way back (the next time the hunt is opened).
    if (saveRef.current.pendingHuntReward) setRewardHidden(true);
    setHuntOpen(false);
    setBagOpen(false);
    setShopTab('wholesale');
    setShopOpen(true);
  };

  // "Usar em..." from an item: open the screen that consumes it, focused on the first recipe that does.
  const [forgeFocus, setForgeFocus] = useState<{ tab: ForgeTab; itemId?: string; nonce: number } | null>(null);
  useEffect(() => { if (activeView !== 'forja') setForgeFocus(null); }, [activeView]); // the deep link is spent once the Forge page is left
  const [oficiosFocus, setOficiosFocus] = useState<{ category: RefiningStation | 'potions'; recipeId: string } | null>(null);
  const openUse = (use: ItemUse) => {
    playSfx('click');
    const first = use.refs[0];
    if (use.kind === 'forge' || use.kind === 'upgrade') {
      setBagOpen(false);
      setForgeFocus({ tab: use.kind === 'forge' ? 'forge' : 'upgrade', itemId: use.kind === 'forge' ? first : undefined, nonce: Date.now() });
      setActiveView('forja');
    } else if (use.kind === 'refine' || use.kind === 'alchemy') {
      setBagOpen(false);
      setOficiosFocus({ category: use.kind === 'alchemy' ? 'potions' : refiningRecipeById(first)?.station ?? 'furnace', recipeId: first });
      setActiveView('oficios');
    } else if (use.kind === 'delivery') {
      setBagOpen(false);
      openExpedition();
    } else if (use.kind === 'garden') {
      setBagOpen(false);
      setGardenOpen(true);
    }
  };

  // `id` is a weapon / armor INSTANCE id (or a relic template id). The equipped piece can never be salvaged,
  // another copy of the same template can; socketed gems return to the stock.
  const salvageItem = (id: string) => {
    const done = (result: NonNullable<ReturnType<typeof applySalvage>>) => {
      playSfx('click');
      setSaveBoth(result.save);
      showToast(result.bonusGranted ? t('inventory.salvageBonus') : t('inventory.salvageDone'));
    };
    const blocked = salvageBlockReason(saveRef.current, id);
    if (blocked) {
      if (blocked === 'bag') showToast(t('inventory.salvageBagFull'));
      return;
    }
    // Web build: a certified piece is burned on the server first, so it cannot be sold after it is gone.
    if (isServerItemAuthority() && saveRef.current.gearInstances[id]?.certificateId) {
      void withItemLock(async () => {
        const gate = await removeAction(itemApi, () => saveRef.current, id, 'salvage', (s) => salvageBlockReason(s, id) === null);
        if (!gate.ok) {
          if (gate.blocked !== 'game') failToast(gate);
          return;
        }
        const result = applySalvage(gate.save, id);
        if (result) done(result);
      });
      return;
    }
    const result = applySalvage(saveRef.current, id);
    if (result) done(result);
  };

  // A weapon / armor craft creates ONE new independent instance (its own rarity roll). Recipe ingredients that
  // are gear consume real instances: `consumedIds` is the selection the player confirmed in the Forge, otherwise
  // the cheapest unequipped copies (see gearInstances.planForgeIngredients). Their gems go back to the stock.
  // ---- Forge / Oficios batch production (craftJob.ts): the batch is paid when it starts, the hero makes one unit per second, a closed game finishes them too, Cancel gives back the rest. -------
  const craftNameOf = (kind: CraftJobKind, recipeId: string): string => {
    if (kind === 'forge') return gearText(getGear(recipeId)?.nameKey ?? recipeId);
    if (kind === 'refine') return t(`materials.mat_${getRefiningRecipe(recipeId)?.output ?? recipeId}`);
    return t(`consumables.${getPotionRecipe(recipeId)?.id ?? recipeId}`);
  };
  const startBatch = (kind: CraftJobKind, recipeId: string, qty: number, seal?: boolean) => {
    const res = startCraftJob(saveRef.current, kind, recipeId, qty, Date.now(), { seal });
    if (!res.ok || !res.save) {
      if (res.reason === 'busy' && res.busyWith) {
        playSfx('click');
        setBusyNotice(res.busyWith);
      } else if (res.reason === 'bag' || res.reason === 'capacity') showToast(t(kind === 'forge' ? 'forge.gearFull' : 'inventory.bagFullAction', { n: inventoryCapacity(saveRef.current) }));
      return;
    }
    playSfx('click');
    setSaveBoth(res.save);
    setCraftStalled(false);
    showToast(t('craft.started', { n: qty, name: craftNameOf(kind, recipeId) }));
  };

  // Gear: one server call per finished unit (the web build never rolls a piece on the device). Runs inside the item lock; stops at the first unit that cannot be made yet.
  const settleForgeDue = async (): Promise<void> => {
    for (let guard = 0; guard < 1000; guard++) {
      const job = saveRef.current.craftJob;
      if (!job || job.kind !== 'forge' || craftUnitsDue(job, Date.now()) <= 0) {
        setCraftStalled(false);
        return;
      }
      const item = getGear(job.recipeId);
      // The batch paid this unit at the start: the action sees the save with the unit's price added back and charges it again, so the save it returns is already right.
      const result = await forgeAction(itemApi, () => prepaidForgeSave(saveRef.current), job.recipeId, { level: playerLevel(saveRef.current.xp), seal: job.seal });
      if (!result.ok) {
        if (result.blocked !== 'game') failToast(result);
        else if (result.reason === 'capacity') showToast(t('forge.gearFull', { n: inventoryCapacity(saveRef.current) }));
        setCraftStalled(true);
        return;
      }
      setSaveBoth(settleForgeUnit(result.save));
      const rarity = result.instance?.rarity ?? 'common';
      playSfx(rarity === 'epic' || rarity === 'legendary' ? 'forge_rare' : 'forge_success');
      if (item) revealForge(rarity === 'common' ? gearText(item.nameKey) : `${gearText(item.nameKey)} · ${t(`rarity.${rarityDef(rarity).nameKey}`)}`, rarity);
    }
  };

  // The clock of the job: delivers what is due, every second and right when the game loads (so units finished while it was closed arrive).
  const craftTick = () => {
    const s = saveRef.current;
    const job = s.craftJob;
    if (!job) return;
    if (job.kind === 'forge') {
      if (craftUnitsDue(job, Date.now()) > 0) void withItemLock(settleForgeDue);
      return;
    }
    const next = resolveCraftJob(s, Date.now());
    if (next === s) return;
    setSaveBoth(next);
    if (!next.craftJob) {
      playSfx('forge_success');
      showToast(t('craft.finished', { n: job.qty, name: craftNameOf(job.kind, job.recipeId) }));
    }
  };
  const craftTickRef = useRef(craftTick);
  craftTickRef.current = craftTick;
  useEffect(() => {
    craftTickRef.current();
    const id = window.setInterval(() => craftTickRef.current(), 1000);
    return () => window.clearInterval(id);
  }, []);

  const cancelCraft = () => {
    const done = () => {
      const { save: next, refundedUnits } = cancelCraftJob(saveRef.current);
      setSaveBoth(next);
      setCraftStalled(false);
      playSfx('click');
      showToast(t('craft.cancelled', { n: refundedUnits }));
    };
    const job = saveRef.current.craftJob;
    if (!job) return;
    if (job.kind === 'forge') {
      // pieces that were finished in time are delivered first (they stay); then the rest is refunded
      void withItemLock(async () => {
        await settleForgeDue();
        if (saveRef.current.craftJob) done();
      });
      return;
    }
    // units finished in time are delivered first (they stay); then the rest is refunded
    const resolved = resolveCraftJob(saveRef.current, Date.now());
    if (resolved !== saveRef.current) setSaveBoth(resolved);
    if (resolved.craftJob) done();
  };

  // Stops what the hero is doing so another task can start (BusyNotice): each activity's own stop / claim.
  const stopActivity = (activity: HeroActivity) => {
    setBusyNotice(null);
    if (activity === 'craft') cancelCraft();
    else if (activity === 'mining') claimMining();
    else if (activity === 'woodcutting') claimWoodcutting();
    else {
      stopHunt();
      setHuntOpen(true); // the reward the stop leaves is claimed on the hunt screen
      setRewardHidden(false);
    }
  };

  const forgeItem = (id: string, _consumedIds?: string[], useSeal?: boolean, qty = 1) => startBatch('forge', id, qty, useSeal);
  const refineMaterial = (recipeId: string, qty = 1) => startBatch('refine', recipeId, qty);
  const craftPotion = (recipeId: string, qty = 1) => startBatch('potion', recipeId, qty);

  // Economic reforge (reforge.ts), per INSTANCE: rerolls only that piece's substats; all-or-nothing charge.
  const reforgeItem = (id: string) =>
    requestChange(id, 'reforge', (s) => !!applyReforge(s, id), (s) => {
      const next = applyReforge(s, id);
      if (!next) return;
      setSaveBoth(next);
      playSfx('click');
      showToast(t('forge.reforged'));
    });

  // Lapidar (lapidar.ts): lock one substat of an Epic / Legendary piece, roll the others again; all-or-nothing charge.
  const lapidarItem = (id: string, lockIndex: number) =>
    requestChange(id, 'lapidar', (s) => !!applyLapidar(s, id, lockIndex, () => 0), (s) => {
      const next = applyLapidar(s, id, lockIndex);
      if (!next) return;
      setSaveBoth(next);
      playSfx('forge_success');
      showToast(t('forge.lapidarDone'));
    });

  // `id` is a gear INSTANCE id: only that piece changes level.
  const performUpgrade = (id: string, useCatalyst: boolean) => {
    const hit = resolveGearInstance(saveRef.current, id);
    if (!hit) return;
    requestChange(id, 'refine', (s) => !!applyUpgrade(s, id, useCatalyst, () => 0), (s) => {
      const result = applyUpgrade(s, id, useCatalyst);
      if (!result) return;
      setSaveBoth(result.save);
      if (result.success) {
        playSfx('forge_success');
        revealForge(t('forge.upgradeOk', { n: gearText(hit.item.nameKey), m: result.level + 1 }), 'ok');
        showToast(t('forge.upgradeOk', { n: gearText(hit.item.nameKey), m: result.level + 1 }));
      } else {
        playSfx('refine_fail');
        const text = result.dropped ? t('forge.upgradeDropped', { m: result.level - 1 }) : t('forge.upgradeFail');
        revealForge(text, 'fail');
        showToast(text);
      }
    });
  };

  const upgradeItem = (id: string) => performUpgrade(id, false);
  const upgradeItemWithCatalyst = (id: string) => performUpgrade(id, true);

  const updateAutoPotionSettings = (threshold: number, priority: 'small_first' | 'large_first') => {
    setSaveBoth({ ...saveRef.current, autoPotionThreshold: threshold, autoPotionPriority: priority });
  };

  const attrChange = (attr: 'str' | 'vit' | 'agi' | 'res', delta: number) => {
    const cur = saveRef.current[attr];
    const next = cur + delta;
    if (next < 0) return;
    const totalPoints = playerLevel(saveRef.current.xp) * 3;
    const spent = saveRef.current.str + saveRef.current.vit + saveRef.current.agi + saveRef.current.res;
    if (delta > 0 && spent + 1 > totalPoints) return;
    playSfx('click');
    setSaveBoth({ ...saveRef.current, [attr]: next });
  };

  // "Distribuir sugerido" (attributes.ts suggestedSpend): every unspent point at once, balanced by the fixed share.
  const suggestAttributes = () => {
    const s = saveRef.current;
    const add = suggestedSpend(s);
    if (add.str + add.vit + add.agi + add.res === 0) return;
    playSfx('click');
    setSaveBoth({ ...s, str: s.str + add.str, vit: s.vit + add.vit, agi: s.agi + add.agi, res: s.res + add.res });
  };

  // Hero skills (heroSkills.ts): the pending allocation lives in the screen; these commit it, take everything back (gold after the first time) or switch the loadout.
  // Respec and switching are refused in a Dungeon battle; a Hunting / Mining / Woodcutting session keeps the stats it froze at the start.
  const applySkills = (draft: SkillRanks) => {
    const s = saveRef.current;
    const r = applySkillAllocation(s, playerLevel(s.xp), draft);
    if (!r.ok) return;
    playSfx('click');
    setSaveBoth(r.save);
    showToast(t('heroSkills.ui.toastApplied'));
  };
  const respecSkills = () => {
    const s = saveRef.current;
    const r = applyRespec(s, playerLevel(s.xp), battleFloor !== null);
    if (!r.ok) {
      showToast(t(r.reason === 'gold' ? 'heroSkills.ui.respecNoGold' : r.reason === 'battle' ? 'heroSkills.ui.respecBattle' : 'heroSkills.ui.maxed'));
      return;
    }
    playSfx('click');
    setSaveBoth(r.save);
    showToast(r.cost ? t('heroSkills.ui.toastRespecPaid', { n: fmtNum(r.cost) }) : t('heroSkills.ui.toastRespec'));
  };
  const switchLoadout = (index: 0 | 1) => {
    const r = applyLoadoutSwitch(saveRef.current, index, battleFloor !== null);
    if (!r.ok) {
      if (r.reason === 'pass') openPassView();
      else if (r.reason === 'battle') showToast(t('heroSkills.ui.respecBattle'));
      return;
    }
    playSfx('click');
    setSaveBoth(r.save);
    showToast(t('heroSkills.ui.toastSwitched', { n: index + 1 }));
  };

  const selectTitle = (id: string | null) => {
    const s = saveRef.current;
    if (id !== null && (!getTitleDef(id) || !s.cosmetics.includes(id))) return;
    playSfx('click');
    setSaveBoth({ ...s, activeTitle: id });
  };

  const adminAddGold = () => {
    playSfx('click');
    setSaveBoth({ ...saveRef.current, gold: saveRef.current.gold + 10000 });
  };

  const adminAddShards = () => {
    playSfx('click');
    setSaveBoth({ ...saveRef.current, shards: saveRef.current.shards + 50 });
  };

  const adminUnlockAll = () => {
    playSfx('click');
    const s = saveRef.current;
    const inv = { ...s.inventory };
    const gearInstances = { ...s.gearInstances };
    for (const g of GEAR.filter((x) => x.slot !== 'relic')) {
      if (isInstancedSlot(g.slot)) {
        if (!Object.values(gearInstances).some((i) => i.templateId === g.id)) {
          const inst = createGearInstance(g.id, { origin: 'admin', createdAt: Date.now() });
          gearInstances[inst.id] = inst;
        }
      } else {
        inv[g.id] = Math.max(inv[g.id] ?? 0, 1);
      }
    }
    setSaveBoth({ ...s, inventory: inv, gearInstances });
  };

  const adminToggleCheat = () => {
    setCheatMode((c) => {
      cheatModeRef.current = !c;
      return !c;
    });
  };

  const adminReset = () => {
    playSfx('click');
    const fresh = defaultSave();
    setSaveBoth(fresh);
    cheatModeRef.current = false;
    setCheatMode(false);
    setAdminOpen(false);
    setShopOpen(false);
  };

  // `id` is a weapon / armor INSTANCE id, or a template id for stackable gear (relic, tools).
  const equipGear = (id: string) => {
    const s = saveRef.current;
    // Wearing needs the hero level the piece needs (gearInstances.equipLevelBlock). The buttons are disabled with the same reason; this guards every other path (and a stale click).
    const levelBlock = s.gearInstances[id] ? equipBlock(s, id) : equipLevelBlock(s, id);
    if (levelBlock) {
      showToast(t('inventory.requiresLevel', { n: levelBlock.requiredLevel }));
      return;
    }
    if (s.gearInstances[id]) {
      // Web build: wearing a certified piece binds its certificate on the server first (irreversible, and a bound certificate can never be listed). Anything else equips as always.
      const inst = s.gearInstances[id];
      if (isServerItemAuthority() && inst.certificateId && !inst.bound) {
        void withItemLock(async () => {
          const r = await equipAction(itemApi, () => saveRef.current, id);
          if (!r.ok) {
            if (r.blocked !== 'game') failToast(r);
            return;
          }
          playSfx('click');
          setSaveBoth(r.save);
        });
        return;
      }
      const next = applyEquipInstance(s, id);
      if (!next) return;
      playSfx('click');
      setSaveBoth(next);
      return;
    }
    const item = getGear(id);
    if (!item || isInstancedSlot(item.slot) || (s.inventory[id] ?? 0) <= 0) return;
    if (s.equipped[item.slot] === id) return;
    playSfx('click');
    setSaveBoth({ ...s, equipped: { ...s.equipped, [item.slot]: id } });
  };

  // Weapon / armor slot -> empty ("bare hands", zero-stat starter); the piece goes back into the bag —
  // which means it now needs a free slot: an equipped instance is free, a stored one is not.
  const unequipGear = (id: string) => {
    const s = saveRef.current;
    const hit = resolveGearInstance(s, id);
    if (hit) {
      if (!canAddInstances(s, 1)) {
        showToast(t('inventory.bagFullUnequip'));
        return;
      }
      playSfx('click');
      setSaveBoth(applyUnequipSlot(s, hit.item.slot as InstancedSlot));
      return;
    }
    const item = getGear(id);
    if (!item || isInstancedSlot(item.slot)) return;
    playSfx('click');
    setSaveBoth({ ...s, equipped: { ...s.equipped, [item.slot]: null } });
  };

  const expandInventoryBag = () => {
    const s = saveRef.current;
    const next = expandInventory(s);
    if (!next) {
      showToast(t('inventory.expandFailed'));
      return;
    }
    playSfx('click');
    setSaveBoth(next);
    showToast(t('inventory.expanded', { n: next.inventoryCapacity }));
  };

  const heroSpriteUrl = playerSpriteUrl(save);
  const isDesktop = useIsDesktop();
  // Phone / tablet: the Hunt, Dungeon and Forge tutorial steps point at entries of the nav drawer, which is closed by default - without this the "use the highlighted button" step
  // of the Hunt had no button on screen and could only be skipped.
  useEffect(() => {
    if (isDesktop) return;
    if (tutorialStep === 'hunt' || tutorialStep === 'dungeon') setDrawerOpen(true);
    else if (tutorialStep === 'final') setDrawerOpen(false);
  }, [isDesktop, tutorialStep]);

  const closeDrawer = () => setDrawerOpen(false);

  const desktopNavGroups: DesktopNavGroup[] = [
    {
      key: 'main',
      items: [
        { key: 'hero', icon: '🧝', label: t('nav.hero'), active: activeView === 'personagem', badge: attributePointsAvailable(save) > 0, onClick: () => { closeDrawer(); playSfx('click'); setActiveView('personagem'); } },
        { key: 'skills', icon: <img className="pixel-icon" src="/assets/icons/skill_path_warrior.png" alt="" />, label: t('nav.skills'), active: activeView === 'skills', badge: skillPointsAvailable(save, level) > 0, tutorialTarget: 'skills', onClick: () => { closeDrawer(); playSfx('click'); setActiveView('skills'); } },
        { key: 'hunt', icon: <img className="pixel-icon" src="/assets/icons/demon_claw.png" alt="" />, label: t('nav.hunt'), active: huntOpen, badge: !!save.activeHuntingZone, extra: save.activeHuntingZone ? <HuntNavMini save={save} onOpen={() => { closeDrawer(); openHunt(); }} /> : undefined, tutorialTarget: 'hunt', onClick: () => { closeDrawer(); openHunt(); } },
        { key: 'dungeon', icon: <img className="pixel-icon" src="/assets/icons/dragon_flameblade.png" alt="" />, label: t('nav.dungeon'), active: dungeonOpen, tutorialTarget: 'dungeon', onClick: () => { closeDrawer(); openDungeon(); } },
        { key: 'quests', icon: <img className="pixel-icon" src="/assets/icons/nav_quests.png" alt="" />, label: t('nav.quests'), active: questsOpen, badge: claimableCount(save.quests, questContext(save)) + periodClaimable(save, Date.now(), ownsAdventurerPass(save)) > 0, onClick: () => { closeDrawer(); playSfx('click'); setQuestsOpen(true); } },
        { key: 'codex', icon: '📖', label: t('codex.nav'), active: codexOpen, onClick: () => { closeDrawer(); playSfx('click'); setCodexOpen(true); } },
      ],
    },
    {
      key: 'professions',
      header: t('nav.groupProfessions'),
      items: [
        { key: 'mining', icon: <img className="pixel-icon" src="/assets/icons/nav_mining.png" alt="" />, label: t('nav.mining'), active: mineOpen, badge: computeMiningStatus(save, Date.now()).full, onClick: () => { closeDrawer(); playSfx('click'); setMineOpen(true); openContextTutorial('mining'); } },
        { key: 'woodcutting', icon: <img className="pixel-icon" src="/assets/icons/oak_wood.png" alt="" />, label: t('nav.woodcutting'), active: woodOpen, badge: computeWoodcuttingStatus(save, Date.now()).full, onClick: () => { closeDrawer(); playSfx('click'); setWoodOpen(true); openContextTutorial('woodcutting'); } },
        { key: 'garden', icon: <img className="pixel-icon" src="/assets/icons/common_herb.png" alt="" />, label: t('nav.garden'), active: gardenOpen, badge: computeGardenStatuses(save, Date.now()).some((s) => s.ready), onClick: () => { closeDrawer(); playSfx('click'); setGardenOpen(true); openContextTutorial('garden'); } },
        { key: 'oficios', icon: <img className="pixel-icon" src="/assets/icons/refine_catalyst.png" alt="" />, label: t('nav.oficios'), active: activeView === 'oficios', onClick: () => { closeDrawer(); playSfx('click'); setActiveView('oficios'); } },
      ],
    },
    {
      key: 'equipment',
      header: t('nav.groupEquipment'),
      items: [
        { key: 'forge', icon: <img className="pixel-icon" src="/assets/icons/steel.png" alt="" />, label: t('nav.forge'), active: activeView === 'forja', tutorialTarget: 'forge', onClick: () => {
            closeDrawer();
            playSfx('click');
            setActiveView('forja');
            if (Object.values(saveRef.current.gearInstances).some((item) => (getGear(item.templateId)?.tier ?? 0) >= 1)) openContextTutorial('sockets');
          } },
        { key: 'inventory', icon: <img className="pixel-icon" src="/assets/icons/nav_bag.png" alt="" />, label: t('nav.inventory'), active: bagOpen, onClick: () => { closeDrawer(); playSfx('click'); setBagOpen(true); openContextTutorial('reforge'); } },
      ],
    },
    {
      key: 'economy',
      header: t('nav.groupEconomy'),
      items: [
        { key: 'deliveries', icon: <img className="pixel-icon" src="/assets/icons/expedition_ticket_2h.png" alt="" />, label: t('nav.deliveries'), active: expeditionOpen, badge: isDeliveryReady(save, Date.now()) || save.expeditions.some((e) => Date.now() >= e.endsAt), onClick: () => { closeDrawer(); openExpedition(); } },
        { key: 'battlePass', icon: <img className="pixel-icon" src="/assets/icons/nav_battlepass.png" alt="" />, label: t('nav.battlePass'), active: activeView === 'passe', onClick: () => { closeDrawer(); playSfx('click'); setActiveView('passe'); } },
        // Inviting friends is online only (an account holds the code): no entry in the offline / desktop build.
        ...(configured ? [{ key: 'invites', icon: '🤝', label: t('invites.nav'), active: activeView === 'convites', onClick: () => { closeDrawer(); playSfx('click'); setActiveView('convites'); } }] : []),
        { key: 'shop', icon: <img className="pixel-icon" src="/assets/icons/gold.png" alt="" />, label: t('nav.shop'), active: shopOpen, onClick: () => { closeDrawer(); playSfx('click'); setShopTab('buy'); setShopOpen(true); } },
        ...(marketOn ? [{ key: 'market', icon: <img className="pixel-icon" src="/assets/icons/gold_pouch.png" alt="" />, label: mt('title'), active: activeView === 'mercado', onClick: () => { closeDrawer(); playSfx('click'); setActiveView('mercado'); } }] : []),
      ],
    },
    {
      key: 'settings',
      items: [
        { key: 'settings', icon: '⚙️', label: t('nav.settings'), active: settingsOpen, onClick: () => { closeDrawer(); playSfx('click'); setSettingsOpen(true); } },
      ],
    },
  ];

  return (
    <BagContext.Provider value={{ save, move: moveStash, storeAllMaterials, sell: sellItem, openUse, upgradeStash, openWholesale, openPouch, ...(marketOn ? { openMarket: (materialId: string) => { playSfx('click'); setMarketPick(materialId); setBagOpen(false); setActiveView('mercado'); } } : {}) }}>
    <div className="game-root">
      <div className="desktop-shell">
        {isDesktop ? (
          <DesktopSidebar groups={desktopNavGroups} onLogoClick={() => setActiveView('home')} />
        ) : (
          <MobileDrawer open={drawerOpen} onClose={closeDrawer}>
            <DesktopSidebar groups={desktopNavGroups} onLogoClick={() => { closeDrawer(); setActiveView('home'); }} />
          </MobileDrawer>
        )}
        <div className="desktop-main">
          <DesktopTopbar
            save={save}
            spriteUrl={heroSpriteUrl}
            onOpenProfile={() => setActiveView('personagem')}
            onOpenSettings={() => { playSfx('click'); setSettingsOpen(true); }}
            onOpenMenu={() => setDrawerOpen(true)}
            showMenuButton={!isDesktop}
            muted={muted}
            onToggleMute={toggleMute}
            syncStatus={saveStatus}
          />
          {activeView === 'home' && (
            <DesktopHome
              save={save}
              spriteUrl={heroSpriteUrl}
              onOpenHero={() => setActiveView('personagem')}
              onOpenHunt={openHunt}
              onOpenDungeon={openDungeon}
              onOpenForge={() => { playSfx('click'); setActiveView('forja'); }}
              onOpenExpedition={openExpedition}
              onOpenMining={() => { playSfx('click'); setMineOpen(true); }}
              onOpenWoodcutting={() => { playSfx('click'); setWoodOpen(true); }}
              onOpenGarden={() => { playSfx('click'); setGardenOpen(true); }}
              onOpenInventory={() => { playSfx('click'); setBagOpen(true); }}
              onClaimAll={claimEverything}
              onOpenPass={() => { playSfx('click'); openPassView(); }}
              onOpenNextStep={openNextStep}
              onPickProfession={pickProfession}
            />
          )}
          {activeView === 'personagem' && (
            <PersonagemView
              save={save}
              spriteUrl={heroSpriteUrl}
              onAttrChange={attrChange}
              onSuggestAttrs={suggestAttributes}
              onEquip={equipGear}
              onUnequip={unequipGear}
              onSelectTitle={selectTitle}
              onSelectFrame={selectFrame}
              onSelectSkin={selectSkin}
              onDiscard={discardItem}
              onReforge={reforgeItem}
              onLapidar={lapidarItem}
              onSalvage={salvageItem}
              onUseConsumable={useConsumableManually}
              onExpandInventory={expandInventoryBag}
              onOpenSkills={() => { playSfx('click'); setActiveView('skills'); }}
            />
          )}
          {activeView === 'skills' && (
            <SkillsView save={save} battleActive={battleFloor !== null} onApply={applySkills} onRespec={respecSkills} onSwitchLoadout={switchLoadout} onOpenPass={() => { playSfx('click'); openPassView(); }} />
          )}
          {activeView === 'mercado' && marketOn && MarketScreen && (
            <Suspense fallback={null}>
              <MarketScreen save={save} host={marketHost} pick={marketPick} onPickUsed={() => setMarketPick(null)} />
            </Suspense>
          )}
          {activeView === 'passe' && (
            <BattlePassView
              save={save}
              onActivate={purchaseBattlePass}
              highlightBuy={highlightBuy}
              passFlow={passFlow}
              onRecheck={confirmPassPurchase}
              buyExtra={marketOn && PassUsdc && isServerPassSource() ? (
                <Suspense fallback={null}>
                  <PassUsdc onGranted={confirmPassPurchase} autoOpen={highlightBuy} />
                </Suspense>
              ) : undefined}
              onClaim={claimBattlePassLevel}
              onClaimAll={claimAllBattlePassRewards}
              onOpenInvites={configured ? () => { playSfx('click'); setActiveView('convites'); } : undefined}
            />
          )}
          {activeView === 'convites' && configured && <InvitesPage online />}
          {activeView === 'forja' && (
            <ForgeView
              key={forgeFocus?.nonce ?? 'free'}
              save={save}
              onForge={forgeItem}
              onCancelCraft={cancelCraft}
              craftStalled={craftStalled}
              onUpgrade={upgradeItem}
              onUpgradeWithCatalyst={upgradeItemWithCatalyst}
              onRepair={repairItem}
              onSocket={socketGem}
              onUnsocket={unsocketGem}
              reveal={forgeReveal}
              initialTab={forgeFocus?.tab}
              focusItemId={forgeFocus?.itemId}
            />
          )}
          {activeView === 'oficios' && <OficiosView key={oficiosFocus?.recipeId ?? 'free'} save={save} onRefine={refineMaterial} onCraftPotion={craftPotion} onCancelCraft={cancelCraft} craftStalled={craftStalled} focus={oficiosFocus} />}
        </div>
      </div>
      {import.meta.env.DEV && !adminOpen && (
        <button className="dev-admin-fab" onClick={() => setAdminOpen(true)} aria-label="Admin" data-ui>
          ⚙️
        </button>
      )}

      {marketOn && MarketSync && (
        <Suspense fallback={null}>
          <MarketSync host={marketHost} />
        </Suspense>
      )}

      {shopOpen && (
        <ShopModal
          save={save}
          onBuyConsumable={buyConsumable}
          onBuyGem={buyGem}
          onSell={sellItem}
          onSellWholesale={sellWholesale}
          onCreatePouch={createPouch}
          onOpenPouch={openPouch}
          initialTab={shopTab}
          onClose={() => {
            playSfx('click');
            setShopOpen(false);
          }}
        />
      )}

      {bagOpen && (
        <InventoryModal
          save={save}
          onEquip={equipGear}
          onUnequip={unequipGear}
          onDiscard={discardItem}
          onReforge={reforgeItem}
              onLapidar={lapidarItem}
          onSalvage={salvageItem}
          onUseConsumable={useConsumableManually}
          onExpand={expandInventoryBag}
          onClose={() => {
            playSfx('click');
            setBagOpen(false);
          }}
        />
      )}

      {dungeonOpen && (
        <DungeonMapModal
          save={save}
          onEnterDungeon={enterDungeon}
          onEnterDepths={enterDepths}
          onUpdateAutoPotionSettings={updateAutoPotionSettings}
          onClose={() => {
            playSfx('click');
            setDungeonOpen(false);
          }}
        />
      )}

      {huntOpen && (
        <HuntModal
          save={save}
          onStartHunt={startHunt}
          onStopHunt={stopHunt}
          onClose={() => {
            playSfx('click');
            setHuntOpen(false);
          }}
        />
      )}

      {expeditionOpen && (
        <DeliveryModal
          save={save}
          passActive={ownsAdventurerPass(save)}
          onAccept={acceptDelivery}
          onClaim={claimDelivery}
          onReroll={rerollDeliveries}
          onUseTicket={useDeliveryTicket}
          onClaimLegacy={claimExpedition}
          onUseLegacyTicket={useExpeditionTicket}
          onClose={() => {
            playSfx('click');
            setExpeditionOpen(false);
          }}
        />
      )}

      {mineOpen && (
        <MiningModal
          save={save}
          onStartOre={startMining}
          onClaim={claimMining}
          onCancel={cancelMining}
          onClose={() => {
            playSfx('click');
            setMineOpen(false);
          }}
        />
      )}

      {woodOpen && (
        <WoodcuttingModal
          save={save}
          onStartWood={startWoodcutting}
          onClaim={claimWoodcutting}
          onCancel={cancelWoodcutting}
          onClose={() => {
            playSfx('click');
            setWoodOpen(false);
          }}
        />
      )}

      {gardenOpen && (
        <GardenModal
          save={save}
          onPlant={plantInPlots}
          onHarvest={harvestPlots}
          onUproot={uprootPlot}
          onFertilize={fertilizePlot}
          onClose={() => {
            playSfx('click');
            setGardenOpen(false);
          }}
        />
      )}

      {claimResult && (
        <ClaimModal
          title={claimResult.title}
          name={claimResult.name}
          rewards={claimResult.rewards}
          onClose={() => {
            playSfx('click');
            setClaimResult(null);
          }}
        />
      )}

      {save.pendingHuntReward && !rewardHidden && (
        <HuntRewardModal
          save={save}
          reward={save.pendingHuntReward}
          subLevels={T.hunting.subLevels}
          onClaim={confirmHuntReward}
          onOpenInventory={() => {
            playSfx('click');
            setRewardHidden(true);
            setHuntOpen(false);
            setBagOpen(true);
          }}
        />
      )}

      {questsOpen && (
        <QuestsModal
          save={save}
          onClaim={claimQuest}
          ownsPass={ownsAdventurerPass(save)}
          onClaimWeekly={claimWeekly}
          onClaimWeeklyBonus={claimWeeklyAll}
          onClaimStreak={claimStreakReward}
          onClose={() => {
            playSfx('click');
            setQuestsOpen(false);
          }}
        />
      )}

      {codexOpen && (
        <CodexModal
          save={save}
          onClose={() => {
            playSfx('click');
            setCodexOpen(false);
          }}
        />
      )}

      {save.league && !save.league.noticeSeen && <LeagueResetModal pioneer={save.cosmetics.includes(PIONEER_TITLE_ID)} onClose={dismissLeagueNotice} />}

      {claimAllLines && <ClaimAllModal lines={claimAllLines} onClose={() => setClaimAllLines(null)} />}
      {voidPrompt && (
        <ConfirmVoidModal
          onConfirm={() => {
            const p = voidPrompt;
            setVoidPrompt(null);
            void withItemLock(p.run);
          }}
          onCancel={() => setVoidPrompt(null)}
        />
      )}

      {tradeablePrompt && (
        <TradeableUseModal
          used={tradeablePrompt.used}
          npc={tradeablePrompt.npc}
          onCancel={() => setTradeablePrompt(null)}
          onConfirm={() => {
            const p = tradeablePrompt;
            setTradeablePrompt(null);
            // the change was computed from p.base: if the materials moved meanwhile (a claim, another action) it is not applied blindly
            if (saveRef.current.materials !== p.base.materials || saveRef.current.tradeableMaterials !== p.base.tradeableMaterials) {
              showToast(t('tradeable.useRetry'));
              return;
            }
            setSaveBoth(p.npc ? p.next : withMaterialPrefs(p.next, { useAcked: true }), { npc: p.npc, confirmed: true, tradeableFirst: p.first });
          }}
        />
      )}

      {welcome && (
        <WelcomeBackModal
          summary={welcome.summary}
          canClaimAll={welcome.canClaimAll}
          onAction={welcomeAction}
          onClaimAll={welcomeClaimAll}
          onClose={() => {
            playSfx('click');
            setWelcome(null);
          }}
        />
      )}

      {save.pendingSeasonSummary && <SeasonSummaryModal save={save} onDismiss={dismissSeasonSummary} />}

      {battleFloor !== null && (
        <BattleModal
          save={save}
          startFloor={battleFloor}
          guidedStopFloor={tutorialStep === 'dungeon' ? GUIDED_DESCENT_FLOOR : undefined}
          onRetreat={(rewards) => finishRun(battleFloor, rewards, 'retreat')}
          onDefeat={(rewards) => finishRun(battleFloor, rewards, 'defeat')}
          onUsePotion={useAutoPotion}
        />
      )}

      {busyNotice && <BusyNotice activity={busyNotice} onStop={() => stopActivity(busyNotice)} onKeep={() => setBusyNotice(null)} />}
      {toast && <div className="toast">{toast}</div>}

      {levelUp && (
        <LevelUpBanner
          summary={levelUp}
          attrPoints={attributePointsAvailable(save)}
          skillPoints={skillPointsAvailable(save, level)}
          onSpend={(where) => {
            playSfx('click');
            setLevelUp(null);
            setActiveView(where);
            highlightTarget(where === 'skills' ? ['skills-view'] : ['attrs']);
          }}
          onClose={() => setLevelUp(null)}
        />
      )}

      {import.meta.env.DEV && adminOpen && (
        <AdminModal
          cheatMode={cheatMode}
          onGold={adminAddGold}
          onShards={adminAddShards}
          onUnlock={adminUnlockAll}
          onToggleCheat={adminToggleCheat}
          onReset={adminReset}
          onClose={() => setAdminOpen(false)}
        />
      )}

      {tutorialStep && battleFloor === null && (
        <TutorialOverlay
          step={tutorialStep}
          onAdvance={advanceInitialTutorial}
          onSkip={skipInitialTutorial}
          onDismiss={dismissInitialTutorial}
          requiresInteraction={tutorialStep === 'points' || tutorialStep === 'dungeon' || tutorialStep === 'hunt' || tutorialStep === 'huntModal'}
        />
      )}

      {settingsOpen && (
        <SettingsModal
          save={save}
          audio={audio}
          onMusicVolume={(v) => changeAudio(() => setMusicVolume(v))}
          onSfxVolume={(v) => changeAudio(() => setSfxVolume(v))}
          onToggleMusicMute={() => changeAudio(() => setMusicMuted(!audio.musicMuted))}
          onToggleSfxMute={() => changeAudio(() => setSfxMuted(!audio.sfxMuted))}
          onChangeLocale={(locale: Locale) => setLocale(locale)}
          onExportSave={exportSaveFile}
          onImportSave={importSaveFile}
          onResetSave={resetHero}
          onMaterialPrefs={(patch) => setSaveBoth(withMaterialPrefs(saveRef.current, patch))}
          walletSlot={
            marketOn && SettingsWallet && configured ? (
              <Suspense fallback={null}>
                <SettingsWallet />
              </Suspense>
            ) : undefined
          }
          onReplayTutorial={() => {
            setSettingsOpen(false);
            replayTutorial();
          }}
          accountConfigured={configured}
          accountEmail={user?.email ?? null}
          onSignOut={() => {
            setSettingsOpen(false);
            void handleSignOut();
          }}
          onClose={() => {
            playSfx('click');
            setSettingsOpen(false);
          }}
        />
      )}
      {contextTutorial && <TutorialOverlay step={contextTutorial} onAdvance={closeContextTutorial} onSkip={skipAutomaticTutorials} onDismiss={dismissContextTutorial} />}
    </div>
    </BagContext.Provider>
  );
}

export default App;
