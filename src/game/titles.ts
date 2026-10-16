export interface TitleDef {
  id: string;
  nameKey: string;
  reqKey: string;
  iconUrl: string;
}

export const TITLES: TitleDef[] = [
  { id: 'title_season_lv30', nameKey: 'title_legend', reqKey: 'req_season_lv30', iconUrl: '/assets/icons/title_season_lv30.png' },
  { id: 'title_shadow_pathfinder', nameKey: 'title_shadow_pathfinder', reqKey: 'req_shadow_pathfinder', iconUrl: '/assets/icons/title_shadow_pathfinder.png' },
  { id: 'title_abyss_conqueror', nameKey: 'title_abyss_conqueror', reqKey: 'req_abyss_conqueror', iconUrl: '/assets/icons/title_abyss_conqueror.png' },
  { id: 'title_100_floors_legend', nameKey: 'title_100_floors_legend', reqKey: 'req_100_floors_legend', iconUrl: '/assets/icons/title_100_floors_legend.png' },
  // Earned by the hardest achievements (quests.ts). They reuse the four crests above until each gets its own.
  { id: 'title_slayer', nameKey: 'title_slayer', reqKey: 'req_slayer', iconUrl: '/assets/icons/title_abyss_conqueror.png' },
  { id: 'title_boss_hunter', nameKey: 'title_boss_hunter', reqKey: 'req_boss_hunter', iconUrl: '/assets/icons/title_shadow_pathfinder.png' },
  { id: 'title_grand_smith', nameKey: 'title_grand_smith', reqKey: 'req_grand_smith', iconUrl: '/assets/icons/title_100_floors_legend.png' },
  { id: 'title_treasure_seeker', nameKey: 'title_treasure_seeker', reqKey: 'req_treasure_seeker', iconUrl: '/assets/icons/title_season_lv30.png' },
  { id: 'title_set_collector', nameKey: 'title_set_collector', reqKey: 'req_set_collector', iconUrl: '/assets/icons/title_abyss_conqueror.png' },
  { id: 'title_tycoon', nameKey: 'title_tycoon', reqKey: 'req_tycoon', iconUrl: '/assets/icons/title_season_lv30.png' },
  { id: 'title_artisan', nameKey: 'title_artisan', reqKey: 'req_artisan', iconUrl: '/assets/icons/title_shadow_pathfinder.png' },
  { id: 'title_depths_walker', nameKey: 'title_depths_walker', reqKey: 'req_depths_walker', iconUrl: '/assets/icons/title_abyss_conqueror.png' },
  // Thanks to the testers of the open pre-season (leagueReset.ts): granted when the first League resets the heroes. Decoration only, no stats.
  { id: 'title_pioneer', nameKey: 'title_pioneer', reqKey: 'req_pioneer', iconUrl: '/assets/icons/title_season_lv30.png' },
  // Rewards of the invite program (referralRewards.ts): granted by the SERVER when enough invited people qualify. Decoration only, no stats; they reuse existing crests until each gets its own.
  { id: 'title_recruiter', nameKey: 'title_recruiter', reqKey: 'req_recruiter', iconUrl: '/assets/icons/title_shadow_pathfinder.png' },
  { id: 'title_recruitment_legend', nameKey: 'title_recruitment_legend', reqKey: 'req_recruitment_legend', iconUrl: '/assets/icons/title_100_floors_legend.png' },
  { id: 'title_codex_sage', nameKey: 'title_codex_sage', reqKey: 'req_codex_sage', iconUrl: '/assets/icons/title_100_floors_legend.png' },
];

export function getTitleDef(id: string): TitleDef | undefined {
  return TITLES.find((title) => title.id === id);
}
