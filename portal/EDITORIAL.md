# Guia editorial — estrutura preparada

Não há publicações cadastradas. Este guia documenta como inserir conteúdo real e revisado em `articles`, dentro de `src/content.mjs`. Use português e inglês em cada campo localizado. Um registro com `published: false` passa por validação, mas não aparece nas páginas.

```js
{
  slug: 'identificador-unico',
  type: 'dev', // dev | major | patch
  published: false,
  date: 'AAAA-MM-DD', // data real de publicação; obrigatória ao criar o registro
  title: { pt: 'Título revisado', en: 'Reviewed title' },
  subtitle: { pt: 'Subtítulo opcional', en: 'Optional subtitle' },
  summary: { pt: 'Resumo revisado', en: 'Reviewed summary' },
  version: '0.1', // opcional; usar somente quando houver versão oficial
  categories: [{ pt: 'Categoria', en: 'Category' }],
  image: { // opcional; arquivo local em public/ ou URL HTTPS aprovada
    src: '/imagem-aprovada.webp',
    width: 1200,
    height: 675,
    alt: { pt: 'Descrição visual', en: 'Visual description' }
  },
  body: {
    pt: [
      { type: 'heading', level: 2, text: 'Seção' },
      { type: 'paragraph', content: [{ type: 'text', text: 'Parágrafo.' }] },
      { type: 'list', ordered: false, items: [[{ type: 'text', text: 'Item de lista' }]] }
    ],
    en: [
      { type: 'heading', level: 2, text: 'Section' },
      { type: 'paragraph', content: [{ type: 'text', text: 'Paragraph.' }] },
      { type: 'list', ordered: false, items: [[{ type: 'text', text: 'List item' }]] }
    ]
  }
}
```

O exemplo é documentação, não conteúdo publicado. Blocos aceitos: `paragraph`, `heading` (níveis 2–4), `list` (ordenada ou não) e `image` com `src`, `alt`, `width`, `height` e `caption` opcional. Dentro de parágrafos e listas, use nós `text`, `strong`, `em` e `link` com `href` local ou HTTPS. O gerador escapa texto e rejeita URLs externas sem HTTPS.

Os artigos aparecem por data decrescente em Notícias e no arquivo de seu tipo. Listas com mais de `config.pageSize` registros recebem páginas de arquivo automaticamente; artigos incluem links para o anterior e o seguinte. Registros aprovados também recebem uma página individual sob `/pt/news/<slug>/` e `/en/news/<slug>/`. Essas páginas só são geradas quando houver conteúdo publicado; nenhuma foi criada nesta rodada.

Antes de marcar `published: true`, conferir fatos, PT/EN, data real, direitos da imagem e rótulo de status. Não divulgar fórmulas, números de balanceamento sem aprovação, mecanismos internos ou regras competitivas ainda não confirmadas. A existência de campos como versão, categoria e recompensa não implica que haverá anúncio desses dados.
