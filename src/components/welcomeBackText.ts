import { fmtNum, t } from '../locales';
import { getHuntingZone } from '../game/huntingZones';
import { getMaterial, MaterialId } from '../game/materials';
import { splitMaterials, WelcomeBackRow, WelcomeMaterial } from '../game/welcomeBack';
import type { UiIconName } from './uiIcons';
import type { CardRarity } from './ui';

export type WelcomeBackAction = 'hunt' | 'mining' | 'woodcutting' | 'garden' | 'delivery';

export const matName = (id: MaterialId): string => {
  const m = getMaterial(id);
  return m ? t(`materials.${m.nameKey}`) : id;
};

export function formatSpan(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}`;
  return `${Math.max(1, m)}min`;
}

// The subtitle of the modal: how long the player was away, or the plain "while you were away" when that is not known.
export const awaySubtitle = (awayMs: number | undefined): string => (awayMs === undefined ? t('welcomeBack.hint') : t('welcomeBack.away', { time: formatSpan(awayMs) }));

// What a card of the modal says. The card is: the activity (icon + name), one short line (where, time counted, wins), the materials as icons with their amount (`mats`, at most
// WELCOME_MATERIALS_SHOWN, and `more` counts the others), the gold and XP the activity already worked out, short badges, and the one button.
export interface WelcomeRowText {
  icon: UiIconName;
  title: string;
  detail: string;
  mats: (WelcomeMaterial & { name: string; tier: CardRarity })[];
  more: number;
  gold: number;
  xp: number;
  badges: { text: string; tone: 'gold' | 'bad' }[];
  button: string;
  action: WelcomeBackAction;
  rare: boolean; // a unique piece was found: the card glows
  glow: 'unique' | 'rare' | null; // the rarity colour of that glow (a unique piece, or a rare material among the ones the hunt found)
}

// The frame colour of a drop, as on the Hunt screen: plain, refined = green, noble = purple (a gathered material is plain).
const tierOf = (rarity: string | undefined): CardRarity => (rarity === 'rare' ? 'epic' : rarity === 'uncommon' ? 'rare' : 'common');
const named = (list: WelcomeMaterial[], rarityOf: (id: MaterialId) => string | undefined = () => undefined): WelcomeRowText['mats'] =>
  list.map((m) => ({ ...m, name: matName(m.id), tier: tierOf(rarityOf(m.id)) }));

export function welcomeRowText(row: WelcomeBackRow): WelcomeRowText {
  switch (row.kind) {
    case 'hunt': {
      const zone = getHuntingZone(row.zoneId);
      const { shown, more } = splitMaterials(row.mats);
      return {
        icon: 'hunt',
        title: t('welcomeBack.hunt'),
        detail: t('welcomeBack.huntDetail', { zone: zone ? t(`dungeon.${zone.nameKey}`) : '', time: formatSpan(row.timeMs), n: fmtNum(row.kills) }),
        mats: named(shown, (id) => zone?.drops.find((d) => d.material === id)?.rarity),
        more,
        gold: row.gold,
        xp: row.xp,
        badges: [
          ...(row.uniques > 0 ? [{ text: t('welcomeBack.uniqueFound', { n: row.uniques }), tone: 'gold' as const }] : []),
          ...(row.capHit ? [{ text: t('welcomeBack.capHit'), tone: 'bad' as const }] : []),
        ],
        button: t('welcomeBack.viewRewards'),
        action: 'hunt',
        rare: row.uniques > 0,
        glow: row.uniques > 0 ? 'unique' : row.mats.some((m) => zone?.drops.find((d) => d.material === m.id)?.rarity === 'rare') ? 'rare' : null,
      };
    }
    case 'mining':
    case 'woodcutting':
      return {
        icon: row.kind,
        title: t(row.kind === 'mining' ? 'claimAll.mining' : 'claimAll.woodcutting'),
        detail: t('welcomeBack.gatherDetail', { name: matName(row.material), time: formatSpan(row.timeMs) }),
        mats: named(row.units > 0 ? [{ id: row.material, n: row.units }] : []),
        more: 0,
        gold: row.gold,
        xp: 0,
        badges: row.capHit ? [{ text: t('welcomeBack.capHit'), tone: 'bad' }] : [],
        button: t('welcomeBack.collect'),
        action: row.kind,
        rare: false,
        glow: null,
      };
    case 'garden':
      return { icon: 'garden', title: t('claimAll.garden'), detail: t('home.gardenStatus', { n: row.ready, m: row.ready }), mats: [], more: 0, gold: 0, xp: 0, badges: [], button: t('welcomeBack.collect'), action: 'garden', rare: false, glow: null };
    case 'delivery':
      return { icon: 'deliveries', title: t('home.delivery'), detail: t('home.deliveryReady'), mats: [], more: 0, gold: 0, xp: 0, badges: [], button: t('welcomeBack.collect'), action: 'delivery', rare: false, glow: null };
  }
}
