export interface TitleDef {
  id: string;
  nameKey: string;
}

export const TITLES: TitleDef[] = [
  { id: 'title_season_lv10', nameKey: 'title_adventurer' },
  { id: 'title_season_lv20', nameKey: 'title_brave' },
  { id: 'title_season_lv30', nameKey: 'title_legend' },
  { id: 'title_shadow_pathfinder', nameKey: 'title_shadow_pathfinder' },
  { id: 'title_abyss_conqueror', nameKey: 'title_abyss_conqueror' },
  { id: 'title_100_floors_legend', nameKey: 'title_100_floors_legend' },
];

export function getTitleDef(id: string): TitleDef | undefined {
  return TITLES.find((title) => title.id === id);
}
