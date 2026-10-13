import { fmtNum, t } from '../locales';
import { getHuntingZone } from '../game/huntingZones';
import { getMaterial, MaterialId } from '../game/materials';
import { WelcomeBackRow } from '../game/welcomeBack';

export type WelcomeBackAction = 'hunt' | 'mining' | 'woodcutting' | 'garden' | 'delivery';

const matName = (id: MaterialId): string => {
  const m = getMaterial(id);
  return m ? t(`materials.${m.nameKey}`) : id;
};

function formatSpan(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}`;
  return `${Math.max(1, m)}min`;
}

export interface WelcomeRowText {
  title: string;
  detail: string;
  note: string;
  button: string;
  action: WelcomeBackAction;
  rare: boolean; // a unique piece was found: the row glows
}

export function welcomeRowText(row: WelcomeBackRow): WelcomeRowText {
  switch (row.kind) {
    case 'hunt': {
      const zone = getHuntingZone(row.zoneId);
      const mats = row.top.map((m) => `${matName(m.id)} x${fmtNum(m.n)}`).join(', ');
      return {
        title: t('welcomeBack.hunt'),
        detail: t('welcomeBack.huntDetail', { zone: zone ? t(`dungeon.${zone.nameKey}`) : '', time: formatSpan(row.timeMs), n: fmtNum(row.kills) }),
        note: [mats, row.uniques > 0 ? t('welcomeBack.uniqueFound', { n: row.uniques }) : '', row.capHit ? t('welcomeBack.capHit') : ''].filter(Boolean).join(' · '),
        button: t('welcomeBack.open'),
        action: 'hunt',
        rare: row.uniques > 0,
      };
    }
    case 'mining':
    case 'woodcutting':
      return {
        title: t(row.kind === 'mining' ? 'claimAll.mining' : 'claimAll.woodcutting'),
        detail: `${matName(row.material)} x${fmtNum(row.units)} · ${formatSpan(row.timeMs)}`,
        note: row.capHit ? t('welcomeBack.capHit') : '',
        button: t('welcomeBack.collect'),
        action: row.kind,
        rare: false,
      };
    case 'garden':
      return { title: t('claimAll.garden'), detail: t('home.gardenStatus', { n: row.ready, m: row.ready }), note: '', button: t('welcomeBack.collect'), action: 'garden', rare: false };
    case 'delivery':
      return { title: t('home.delivery'), detail: t('home.deliveryReady'), note: '', button: t('welcomeBack.collect'), action: 'delivery', rare: false };
  }
}
