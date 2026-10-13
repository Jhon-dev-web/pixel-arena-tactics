import type { SaveData } from './engine';
import { computeGardenSlotStatus, computeHuntingStatus, computeMiningStatus, computeWoodcuttingStatus } from './engine';
import { isDeliveryReady } from './deliveries';

// Desktop notifications when an activity finishes while the game window is not in focus (Round 13). This file is the pure half: what is finished right now, which
// of it is NEW, and the stored preference. The app polls it (App.tsx), the Settings toggle writes the preference, and showNotification() hands the text to the
// platform: the Electron main process (desktop/main.cjs, through the preload bridge) or the browser's Notification API.
//
// "At most one notification per activity per fill": every finished thing has an id that changes with the next fill (the hunt that started at T, the mining session
// that started at T, a garden plot planted at T, the order accepted at T), and an id is announced once. An id seen while the window had focus is marked as seen too:
// the player was looking at it, so it never pops up afterwards.

export type NotifyKind = 'hunt' | 'mining' | 'woodcutting' | 'garden' | 'order';

export interface ReadyEvent {
  kind: NotifyKind;
  ids: string[]; // one per finished fill (garden: one per ready plot)
}

// What is finished in `save` at `now`: a hunt whose storage is full (or whose reward waits), mining / woodcutting at their cap, ready garden plots, a delivered order.
export function readyEvents(save: SaveData, now: number): ReadyEvent[] {
  const out: ReadyEvent[] = [];
  if (save.pendingHuntReward) out.push({ kind: 'hunt', ids: [`hunt:${save.pendingHuntReward.id}`] });
  else if (save.activeHuntingZone) {
    const st = computeHuntingStatus(save, now);
    if (st.full && st.capMs > 0) out.push({ kind: 'hunt', ids: [`hunt:${save.huntingOfflineStart}:${save.activeHuntingZone}`] });
  }
  if (save.activeOreId && computeMiningStatus(save, now).full) out.push({ kind: 'mining', ids: [`mining:${save.lastMiningClaim}:${save.activeOreId}`] });
  if (save.activeWoodId && computeWoodcuttingStatus(save, now).full) out.push({ kind: 'woodcutting', ids: [`wood:${save.lastWoodcuttingClaim}:${save.activeWoodId}`] });
  const plots: string[] = [];
  save.gardenSlots.forEach((slot, i) => {
    if (slot.plantId && computeGardenSlotStatus(save, now, i).ready) plots.push(`garden:${i}:${slot.plantId}:${slot.startedAt}`);
  });
  if (plots.length > 0) out.push({ kind: 'garden', ids: plots });
  const active = save.deliveries?.active;
  if (active && isDeliveryReady(save, now)) out.push({ kind: 'order', ids: [`order:${active.offer.id}:${active.startedAt}`] });
  return out;
}

export interface NotifyPlan {
  announce: { kind: NotifyKind; count: number }[]; // what to show now: one entry per activity, `count` = newly finished fills of it
  seen: Set<string>; // the ids to remember for the next call (everything finished right now; ids no longer finished are forgotten)
}

// `seen` = ids already announced (or seen with the window focused). With `focused` true nothing is announced but everything finished is remembered; with `enabled`
// false the same. A null `seen` is the first look after the game opened: whatever is already finished is remembered, never announced.
export function planNotifications(events: ReadyEvent[], seen: Set<string> | null, focused: boolean, enabled: boolean): NotifyPlan {
  const now = new Set<string>();
  const announce: NotifyPlan['announce'] = [];
  for (const ev of events) {
    const fresh = ev.ids.filter((id) => !(seen ?? new Set<string>()).has(id));
    for (const id of ev.ids) now.add(id);
    if (seen !== null && enabled && !focused && fresh.length > 0) announce.push({ kind: ev.kind, count: fresh.length });
  }
  return { announce, seen: now };
}

// ---------------------------------------------------------------------------------------------------------------------------------- platform

interface DesktopBridge {
  isDesktop?: boolean;
  notify?: (payload: { title: string; body: string }) => Promise<boolean>;
}
const bridge = (): DesktopBridge | undefined => (typeof window === 'undefined' ? undefined : (window as unknown as { arenaDesktop?: DesktopBridge }).arenaDesktop);

export const isDesktopApp = (): boolean => !!bridge()?.isDesktop;
export const notificationsSupported = (): boolean => !!bridge()?.notify || (typeof window !== 'undefined' && 'Notification' in window);

const PREF_KEY = 'arena-rpg-notify';

// Stored per device (not in the save: it is not progress). The desktop app defaults to ON, the browser to OFF.
export function loadNotifyPref(): boolean {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    if (raw === 'on') return true;
    if (raw === 'off') return false;
  } catch {
    /* storage blocked: the default below */
  }
  return isDesktopApp();
}

// The preference AND the means to honour it: a browser whose permission was refused (or later revoked) shows nothing, whatever was stored.
export function notificationsActive(): boolean {
  const perm = notifyPermission();
  return loadNotifyPref() && (perm === 'desktop' || perm === 'granted');
}

export function saveNotifyPref(on: boolean): void {
  try {
    localStorage.setItem(PREF_KEY, on ? 'on' : 'off');
  } catch {
    /* ignore */
  }
}

// 'granted' | 'denied' | 'default' in a browser; the desktop app needs no permission.
export function notifyPermission(): NotificationPermission | 'desktop' | 'unsupported' {
  if (bridge()?.notify) return 'desktop';
  return typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported';
}

// Turning it ON in a browser asks the permission (must run from a click). Resolves to whether notifications may be shown now.
export async function enableNotifications(): Promise<boolean> {
  if (bridge()?.notify) return true;
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try {
    return (await Notification.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}

// `tag` (the activity) makes a browser replace the previous notice of the same activity instead of stacking them.
export function showNotification(title: string, body: string, tag = 'arena-duel'): void {
  try {
    const b = bridge();
    if (b?.notify) {
      void b.notify({ title, body }).catch(() => undefined);
    } else if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/assets/icons/nav_quests.png', tag });
    }
  } catch {
    /* a notification must never break the game */
  }
}
