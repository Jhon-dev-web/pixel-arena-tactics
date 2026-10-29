// REGENERA docs/EQUIPAMENTOS.md: todos os equipamentos do jogo (src/game/gear.ts, GEAR) separados por classe, para o dono ler. Nao ha numero copiado a mao: tudo sai de GEAR, dos nomes do locale pt e das
// habilidades de abilities.ts. Rode de novo sempre que gear.ts mudar:
//   npx vitest run --config vitest.sim.config.ts equipamentos
// As classes saem do que o codigo ja usa (affinity.ts, abilities.ts): peso da armadura (`weight`, ausente = placa) e linha da arma (`line`, ausente = espada). O que nao pertence a nenhuma classe (aneis,
// reliquias, o equipamento inicial de tier 0) vai numa secao a parte, para a lista nao mentir por omissao. Confere o total contra GEAR.length e falha se alguma peca ficar de fora.
import { it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { GEAR, GearItem, WeaponLine } from '../../src/game/gear';
import { ABILITY_IDS, abilityDef } from '../../src/game/abilities';
import { setLocale, t } from '../../src/locales';

type Klass = 'warrior' | 'archer' | 'mage' | 'common';
const WEIGHT_SLOTS = ['armor', 'helmet', 'gloves', 'boots', 'shield'];
const CLASS_OF_LINE: Record<WeaponLine, Klass> = { sword: 'warrior', axe: 'warrior', bow: 'archer', crossbow: 'archer', staff: 'mage', scepter: 'mage' };
const CLASS_OF_WEIGHT: Record<string, Klass> = { plate: 'warrior', leather: 'archer', cloth: 'mage' };
const CLASS_TITLE: Record<Klass, string> = { warrior: 'Guerreiro', archer: 'Arqueiro', mage: 'Mago', common: 'Comuns a todas as classes' };
const SLOT_ORDER = ['weapon', 'armor', 'helmet', 'gloves', 'boots', 'shield', 'ring', 'relic'];

const missing: string[] = [];
function nameOf(g: GearItem): string {
  const key = `gear.${g.nameKey}`;
  const v = t(key);
  if (!v || v === key) {
    missing.push(g.id);
    return `(sem nome no locale: ${g.id})`;
  }
  return v;
}
const slotName = (slot: string): string => {
  const v = t(`gear.${slot}`);
  return v && v !== `gear.${slot}` ? v : slot;
};
const num = (x: number, decimals = 1): string => String(Math.round(x * 10 ** decimals) / 10 ** decimals).replace('.', ',');
const pct = (share: number): string => `${num(share * 100)}%`;
const LINE_NAME: Record<WeaponLine, string> = { sword: 'Espada', axe: 'Machado', bow: 'Arco', crossbow: 'Besta', staff: 'Cajado', scepter: 'Cetro' };
const lineOf = (g: GearItem): WeaponLine => g.line ?? 'sword';
const weightOf = (g: GearItem): string => g.weight ?? 'plate';
const isTier0 = (g: GearItem): boolean => g.tier === 0;

// os atributos que a peca da, como o jogador le (valores BASE da peca: sem raridade, refino nem encaixes)
function statsOf(g: GearItem): string {
  const out: string[] = [];
  if (g.damage !== undefined) out.push(`Dano ${num(g.damage, 0)}`);
  if (g.critChance) out.push(`${t('profile.critRate')} +${pct(g.critChance)}`);
  if (g.critMultBonus) out.push(`${t('profile.critDamage')} +${pct(g.critMultBonus)}`);
  if (g.attackSpeedBonus) out.push(`${t('profile.attackSpeed')} +${pct(g.attackSpeedBonus)}`);
  if (g.maxHp) out.push(`${t('profile.maxHp')} +${num(g.maxHp, 0)}`);
  if (g.resistance) out.push(`${t('profile.defense')} +${pct(g.resistance)}`);
  if (g.reflect) out.push(`Reflexo ${pct(g.reflect)} do dano sofrido`);
  if (g.hpRegenPct) out.push(`Regenera ${pct(g.hpRegenPct)} da vida/s`);
  if (g.damagePct) out.push(`${t('profile.finalDamage')} +${pct(g.damagePct)}`);
  if (g.lifestealPct) out.push(`${t('profile.lifesteal')} +${num(g.lifestealPct)}%`);
  if (g.goldBonusPct) out.push(`${t('profile.goldBonus')} +${num(g.goldBonusPct)}%`);
  if (g.xpBonusPct) out.push(`${t('profile.xpBonus')} +${num(g.xpBonusPct)}%`);
  if (g.burn) out.push('Queima o inimigo');
  return out.length ? out.join('; ') : '—';
}

// as habilidades que a peca concede: a arma pela linha e o peitoral pelo peso (abilities.ts); nada para tier 0
function abilitiesOf(g: GearItem): string {
  if (isTier0(g)) return 'nenhuma (equipamento inicial)';
  if (g.slot !== 'weapon' && g.slot !== 'armor') return '—';
  const ids: string[] =
    g.slot === 'weapon'
      ? ABILITY_IDS.filter((id) => 'line' in abilityDef(id)!.source && (abilityDef(id)!.source as { line: string }).line === lineOf(g))
      : ABILITY_IDS.filter((id) => 'weight' in abilityDef(id)!.source && (abilityDef(id)!.source as { weight: string }).weight === weightOf(g));
  return ids.map((id) => t(`tactics.names.${id}`)).join(', ');
}

function classOf(g: GearItem): Klass {
  if (isTier0(g)) return 'common';
  if (g.slot === 'weapon') return CLASS_OF_LINE[lineOf(g)];
  if (WEIGHT_SLOTS.includes(g.slot)) return CLASS_OF_WEIGHT[weightOf(g)];
  return 'common';
}

function note(g: GearItem): string {
  const parts: string[] = [];
  if (g.unique) parts.push('peça única, só por drop');
  if (g.source && 'bossFloor' in g.source) parts.push(`cai do chefe do andar ${g.source.bossFloor}`);
  if (g.source && 'zone' in g.source && !g.unique) parts.push(`cai em ${g.source.zone}`);
  if (g.slot === 'relic' && !g.recipe && !g.source) parts.push('vem do Passe');
  return parts.length ? ` — ${parts.join('; ')}` : '';
}

const order = (a: GearItem, b: GearItem): number => (a.tier ?? 99) - (b.tier ?? 99) || (a.slot === 'weapon' ? LINE_NAME[lineOf(a)].localeCompare(LINE_NAME[lineOf(b)]) : 0) || (a.unique ? 1 : 0) - (b.unique ? 1 : 0) || nameOf(a).localeCompare(nameOf(b));

function table(items: GearItem[], slot: string): string[] {
  const weapon = slot === 'weapon';
  const hasAbil = slot === 'weapon' || slot === 'armor';
  const head = ['Peça', 'Tier', ...(weapon ? ['Linha'] : []), 'Atributos', ...(hasAbil ? ['Habilidades'] : [])];
  const rows = items.sort(order).map((g) => {
    const cells = [`${nameOf(g)}${note(g)}`, g.tier === undefined ? '—' : String(g.tier), ...(weapon ? [isTier0(g) ? '— (sem linha)' : LINE_NAME[lineOf(g)]] : []), statsOf(g), ...(hasAbil ? [abilitiesOf(g)] : [])];
    return `| ${cells.join(' | ')} |`;
  });
  return [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows, ''];
}

it('gera docs/EQUIPAMENTOS.md', () => {
  setLocale('pt');
  const by: Record<Klass, GearItem[]> = { warrior: [], archer: [], mage: [], common: [] };
  for (const g of GEAR) by[classOf(g)].push(g);
  const total = by.warrior.length + by.archer.length + by.mage.length + by.common.length;
  if (total !== GEAR.length) throw new Error(`faltam pecas: ${total} de ${GEAR.length}`);

  const out: string[] = [];
  out.push('# Equipamentos do jogo, por classe', '');
  out.push(
    `Existem **${GEAR.length} peças** de equipamento hoje: **${by.warrior.length}** do Guerreiro, **${by.archer.length}** do Arqueiro, **${by.mage.length}** do Mago e **${by.common.length}** comuns a todas as classes (o total confere com \`GEAR.length\` em \`src/game/gear.ts\`). ` +
      'A classe não é um atributo do herói: ela é o reflexo do que ele veste. A armadura (elmo, peitoral, luvas, botas e escudo) define pelo peso: **placa** = Guerreiro, **couro** = Arqueiro, **tecido** = Mago. A arma define pela linha: **espada e machado** = Guerreiro, **arco e besta** = Arqueiro, **cajado e cetro** = Mago. Anéis, relíquias e o equipamento inicial (tier 0) não pertencem a nenhuma classe e estão na última seção.',
    '',
  );
  out.push(
    '**Como ler.** Os atributos são os **valores base** da peça: a raridade, o refino (+1 a +12), os encaixes e os atributos extras sorteados somam por cima. "Habilidades" é o que a peça concede na tela de Táticas: a arma concede as da sua linha e o peitoral as do seu peso (elmo, luvas, botas, escudo, anéis e relíquias não concedem). As peças de tier 0 não concedem nenhuma.',
    '',
  );
  out.push('> Este arquivo é gerado por `scripts/sim/equipamentos.gen.ts` (`npx vitest run --config vitest.sim.config.ts equipamentos`). Não edite à mão: mude o código e gere de novo.', '');

  for (const k of ['warrior', 'archer', 'mage'] as const) {
    out.push(`## ${CLASS_TITLE[k]} (${by[k].length} peças)`, '');
    for (const slot of SLOT_ORDER) {
      const items = by[k].filter((g) => g.slot === slot);
      if (!items.length) continue;
      out.push(`### ${CLASS_TITLE[k]}: ${slotName(slot)} (${items.length})`, '', ...table(items, slot));
    }
  }
  out.push(`## ${CLASS_TITLE.common} (${by.common.length} peças)`, '');
  out.push('Aqui estão o equipamento inicial de tier 0 (a clava e as roupas esfarrapadas), que **não concede habilidade nenhuma**, os anéis e as relíquias.', '');
  for (const slot of SLOT_ORDER) {
    const items = by.common.filter((g) => g.slot === slot);
    if (!items.length) continue;
    out.push(`### Comuns: ${slotName(slot)} (${items.length})`, '', ...table(items, slot));
  }
  if (missing.length) out.push(`Peças sem nome no locale: ${missing.join(', ')}.`, '');

  fs.writeFileSync(path.resolve(__dirname, '../../docs/EQUIPAMENTOS.md'), out.join('\n'));
  console.log(`docs/EQUIPAMENTOS.md: ${GEAR.length} pecas (guerreiro ${by.warrior.length}, arqueiro ${by.archer.length}, mago ${by.mage.length}, comuns ${by.common.length}); sem nome: ${missing.length ? missing.join(', ') : 'nenhuma'}`);
});
