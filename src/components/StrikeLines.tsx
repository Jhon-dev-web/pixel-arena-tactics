import { t } from '../locales';
import { StrikeTally } from '../game/derivedStats';
import { HERO_SKILLS } from '../game/heroSkills';

// One line per learned strike on a result screen: how many times it triggered and the share of the total damage it dealt ("Golpe Esmagador x412 - 18% do dano").
// Display only: the engine counts these (StrikeTally) and nothing reads them to decide anything.
export default function StrikeLines({ tally, total }: { tally: StrikeTally; total: number }) {
  const rows = HERO_SKILLS.filter((s) => tally[s.id as keyof StrikeTally]).map((s) => ({ def: s, e: tally[s.id as keyof StrikeTally]! }));
  if (rows.length === 0) return null;
  return (
    <ul className="sk-strike-lines">
      {rows.map(({ def, e }) => (
        <li key={def.id}>
          <img src={def.icon} alt="" />
          <span>{t('heroSkills.fx.line', { name: t(`heroSkills.skills.${def.id}.name`), n: e.n, p: total > 0 ? Math.round((e.dmg / total) * 100) : 0 })}</span>
        </li>
      ))}
    </ul>
  );
}
