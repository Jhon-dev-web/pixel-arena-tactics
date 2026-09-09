export interface TitleDef {
  id: string;
  nameKey: string;
  reqKey: string;
}

export const TITLES: TitleDef[] = [
  { id: 'title_season_lv30', nameKey: 'title_legend', reqKey: 'req_season_lv30' },
  { id: 'title_shadow_pathfinder', nameKey: 'title_shadow_pathfinder', reqKey: 'req_shadow_pathfinder' },
  { id: 'title_abyss_conqueror', nameKey: 'title_abyss_conqueror', reqKey: 'req_abyss_conqueror' },
  { id: 'title_100_floors_legend', nameKey: 'title_100_floors_legend', reqKey: 'req_100_floors_legend' },
];

export function getTitleDef(id: string): TitleDef | undefined {
  return TITLES.find((title) => title.id === id);
}
