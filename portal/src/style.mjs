export const style = `
@font-face { font-family: 'Press Start 2P'; font-style: normal; font-weight: 400; font-display: swap; src: url('/fonts/press-start-2p.woff2') format('woff2'); }
:root {
  color-scheme: dark;
  --bg: #0c1316; --surface: #121e22; --ink: #eee9dd; --muted: #a9b4b5;
  --gold: #e6bd7b; --border: #344044; --serif: Georgia, 'Times New Roman', serif; --pixel: 'Press Start 2P', ui-monospace, monospace;
}
* { box-sizing: border-box; }
html { scroll-padding-top: 24px; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.65 system-ui, sans-serif; }
a { color: inherit; text-decoration: none; }
button { font: inherit; }
a, button, summary { -webkit-tap-highlight-color: transparent; }
a:focus-visible, button:focus-visible, summary:focus-visible { outline: 2px solid var(--gold); outline-offset: 3px; }
main:focus { outline: none; }
p { color: var(--muted); }
h1,h2,h3,h4 { font-family: var(--serif); font-weight: 400; line-height: 1.14; text-wrap: balance; }
h1 { font-size: clamp(2.5rem, 5vw, 4.8rem); margin: 22px 0; }
h2 { font-size: clamp(2rem, 3.2vw, 3.25rem); margin: 14px 0 24px; }
h3 { font-size: 1.5rem; } h4 { font-size: 1.35rem; }
img { max-width: 100%; height: auto; }
.site-header { min-height: 90px; padding: 12px 4%; display: flex; align-items: center; gap: 24px; border-bottom: 1px solid #ffffff1a; background: #0b1317; position: relative; z-index: 5; }
.brand { min-height: 44px; display: inline-flex; align-items: center; gap: 6px; font-family: var(--pixel); font-size: .8125rem; letter-spacing: 1px; white-space: nowrap; }
.brand b { color: var(--gold); font-weight: 400; }
.brand-mark { display: grid; place-items: center; color: var(--gold); border: 1px solid var(--gold); width: 30px; height: 36px; margin-right: 8px; }
#main-nav { display: flex; gap: 14px; align-items: center; margin: auto; font-size: .875rem; }
#main-nav > a, .nav-group summary, .nav-group div > a { min-height: 44px; display: flex; align-items: center; padding: 8px; }
#main-nav a:hover, summary:hover, .text-link:hover { color: var(--gold); }
.nav-group { position: relative; border: 0; padding: 0; }
.nav-group summary { font: inherit; list-style: none; cursor: pointer; gap: 8px; }
.nav-group summary::-webkit-details-marker { display: none; }
.nav-group summary:after { content: '⌄'; color: var(--gold); }
.nav-group div { position: absolute; top: 100%; left: -8px; min-width: 230px; padding: 8px; background: var(--surface); border: 1px solid var(--border); }
.nav-group:not([open]) > div { display: none; }
.nav-group div > a { display: flex; }
a[aria-current], .nav-group.is-active > summary { color: var(--gold); }
.nav-group.is-active > summary, #main-nav > a[aria-current] { box-shadow: inset 0 -2px var(--gold); }
.header-actions { display: flex; align-items: center; gap: 18px; }
.language { display: flex; align-items: center; font-size: .875rem; white-space: nowrap; }
.language a { min-width: 44px; min-height: 44px; display: grid; place-items: center; }
.language a[aria-current] { font-weight: 700; text-decoration: underline; text-underline-offset: 6px; }
.language-separator { color: var(--muted); }
.button { min-height: 48px; display: inline-flex; align-items: center; justify-content: center; text-align: center; background: var(--gold); color: #151a1b; border: 1px solid var(--gold); padding: 12px 22px; font-size: .875rem; font-weight: 700; transition: background .2s; }
.button:hover { background: #f4d7a9; }
.button.secondary { background: #10191db0; color: var(--ink); border-color: #869091; }
.button.secondary:hover { background: #26343a; }
.text-link { display: inline-flex; align-items: center; min-height: 44px; color: var(--gold); font-size: .9375rem; padding: 8px 0; }
.menu-toggle, .mobile-cta { display: none; }
.hero { position: relative; display: grid; grid-template-columns: minmax(0,.9fr) minmax(0,1.1fr); gap: clamp(32px,5vw,72px); align-items: center; isolation: isolate; padding: 60px 7% 90px; }
.hero-art { position: absolute; inset: 0; z-index: -1; background: radial-gradient(ellipse 60% 70% at 78% 42%,#233842 0%,transparent 70%),linear-gradient(0deg,#0c1316 0%,transparent 40%); }
.hero-shot { margin: 0; min-width: 0; border: 1px solid #5b6a6e; box-shadow: 0 24px 80px #000a, 0 0 0 6px #0c131699; }
.hero-shot img { display: block; width: 100%; }
.hero-copy { max-width: 720px; }
.eyebrow { font-size: .875rem; letter-spacing: 1.8px; font-weight: 600; color: var(--gold); text-transform: uppercase; }
.hero-brand { font-family: var(--pixel); font-size: clamp(1.9rem,3.6vw,3.4rem); line-height: 1.25; letter-spacing: 2px; color: #f3e6cb; margin: 26px 0; }
.hero-brand span { display: block; color: var(--gold); letter-spacing: 6px; }
.hero h1 { font-size: clamp(2.1rem,3.5vw,3.4rem); max-width: 640px; margin: 30px 0 20px; }
.hero-copy > p:not(.eyebrow):not(.hero-state) { max-width: 545px; font-size: 1.125rem; color: #c3cccc; }
.actions { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; margin-top: 28px; }
.hero-state { font-size: .875rem; letter-spacing: 1.4px; margin-top: 26px; color: #b6c8c9; text-transform: uppercase; }
.hero-foot { position: absolute; bottom: 14px; left: 7%; right: 7%; font-size: .875rem; color: #b7c2c3; margin: 0; }
.section { padding: 70px 7%; border-bottom: 1px solid #ffffff0e; }
.section-head { display: flex; justify-content: space-between; align-items: end; gap: 28px; }
.section-head h2 { max-width: 770px; }
.section-head > .text-link { flex-shrink: 0; }
.section-copy { max-width: 720px; margin-bottom: 32px; }
.loop-section { background: linear-gradient(140deg,#1c2e2d55,transparent 65%); }
.progression-loop { list-style: none; padding: 0; margin: 38px 0 0; display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 16px; counter-reset: step; }
.progression-loop li { min-width: 0; border-top: 2px solid #65716a; background: linear-gradient(145deg,#25373588,#14202355); }
.progression-loop li:last-child { border-color: var(--gold); background: #332b1d66; }
.progression-loop a { position: relative; height: 100%; display: block; padding: 22px 22px 36px; }
.progression-loop a:hover { background: #ffffff08; }
.step-number { font-family: var(--serif); color: var(--gold); font-size: 1.15rem; }
.progression-loop h3 { margin: 14px 0 12px; font-size: 1.5rem; }
.progression-loop p { font-size: .9375rem; margin: 0; }
.step-arrow { position: absolute; right: 20px; bottom: 10px; color: var(--gold); font-size: 1.25rem; }
.progression-loop li:nth-child(4) .step-arrow { transform: rotate(90deg); }
.choice-section { display: grid; grid-template-columns: 1.25fr 1fr; gap: 9%; align-items: center; }
.choice-section h2 { font-size: clamp(2.25rem,4vw,4rem); max-width: 720px; }
.choice-section > div > p:last-child { max-width: 680px; }
.focus-paths { border-left: 1px solid var(--gold); padding-left: 28px; }
.focus-paths a { display: flex; min-height: 64px; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border); font-family: var(--serif); font-size: 1.4rem; }
.focus-paths a:hover { color: var(--gold); }
.focus-paths > p:last-child { font-size: .875rem; }
.profession-row { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); margin-top: 28px; }
.profession-row article { padding: 16px 28px; border-left: 1px solid var(--border); }
.profession-row article:first-child { padding-left: 0; border: 0; }
.profession-number { color: var(--gold); font-family: var(--serif); font-size: 2.75rem; opacity: .75; }
.profession-row h3 { margin: 12px 0; font-size: 1.75rem; }
.profession-row h3 a { display: inline-flex; align-items: center; min-height: 44px; }
.badge { display: inline-block; padding: 5px 9px; border: 1px solid currentColor; text-transform: uppercase; font: 500 .875rem/1.5 system-ui,sans-serif; letter-spacing: .3px; color: #9bc9b6; }
.development { color: var(--gold); } .planned { color: #9fc5e8; } .future { color: #c3afdb; }
.collective-status { max-width: 330px; }
.collective-status p { font-size: .875rem; margin: 10px 0; }
.dual { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 24px; }
.dual article { min-width: 0; padding: 36px; background: linear-gradient(135deg,#243038,#121c21); border: 1px solid var(--border); }
.dual article:last-child { background: linear-gradient(135deg,#272b35,#141a20); }
.dual .eyebrow { margin-top: 28px; }
.dual h2 { font-size: clamp(2rem,3vw,3rem); }
.roadmap { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 28px; margin-top: 32px; }
.road-column { border-top: 1px solid var(--border); padding-top: 16px; }
.road-column > h2,.road-column > h3 { margin: 0; }
.status-definition { font-size: .875rem; margin: 16px 0 24px; }
.road-column article { padding: 8px 0 12px; }
.road-column article h3,.road-column article h4 { font-size: 1.5rem; margin: 12px 0; }
.road-column article p { font-size: 1rem; }
.note { font-size: .875rem; margin-top: 26px; }
.status-legend { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 20px; padding-bottom: 24px; }
.status-legend > div { border-left: 2px solid var(--border); padding-left: 16px; }
.status-legend p { font-size: .9375rem; }
.availability-note { font-size: .9375rem; border-bottom: 1px solid var(--border); padding-bottom: 20px; }
.page-intro { padding: 60px 7% 45px; background: radial-gradient(ellipse at right top,#31504a55,transparent 65%); border-bottom: 1px solid var(--border); }
.page-intro h1 { max-width: 1060px; }
.lead { font-size: 1.125rem; max-width: 780px; }
.narrow { max-width: 1120px; margin: auto; }
.split { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 8%; align-items: start; }
.section-jumps { display: flex; flex-wrap: wrap; gap: 10px 28px; padding: 20px 7%; border-bottom: 1px solid var(--border); }
.section-jumps a { min-height: 44px; display: flex; align-items: center; color: var(--gold); font-size: .9375rem; }
.system-group { display: grid; grid-template-columns: 1fr 1.4fr; gap: 7%; align-items: start; }
.system-group:nth-of-type(even) { background: #16232633; }
.group-intro .collective-status { margin-top: 28px; }
.system-list { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 28px; margin: 0; }
.system-list > div { border-top: 1px solid #6b786766; padding-top: 24px; }
.system-list dt { font: 1.5rem/1.2 var(--serif); color: var(--ink); margin-bottom: 14px; }
.system-list dd { margin: 0; color: var(--muted); }
.guidance p { max-width: 780px; }
.category-list { list-style: none; padding: 0; display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 0 36px; }
.category-list li { display: flex; flex-wrap: wrap; align-items: center; gap: 16px; justify-content: space-between; padding: 24px 0; border-bottom: 1px solid var(--border); }
.category-list li > span:first-child { font: 1.5rem/1.2 var(--serif); }
.study-label { color: var(--gold); font-size: .875rem; text-transform: uppercase; }
.notice { border-left: 2px solid var(--gold); padding: 14px 24px; margin: 32px 0; background: var(--surface); }
.philosophy p { max-width: 780px; }
.empty { padding: 14px 0 30px; max-width: 760px; }
.empty h2 { font-size: 2rem; }
.post-list { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 32px; }
.post-card { min-width: 0; border-top: 1px solid var(--border); padding-top: 20px; }
.post-card h3 { margin: 14px 0; }
.post-card h3 a { display: block; padding: 8px 0; min-height: 44px; }
.post-meta { font-size: .875rem; }
.post-card img { width: 100%; max-height: 320px; object-fit: cover; }
.filter-nav,.pagination,.post-navigation { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 28px; }
.filter-nav a,.pagination a,.post-navigation a { min-height: 44px; min-width: 44px; display: inline-flex; align-items: center; padding: 8px 14px; border: 1px solid var(--border); }
.pagination { margin-top: 30px; }
.tags { display: flex; flex-wrap: wrap; gap: 10px; list-style: none; padding: 0; font-size: .875rem; color: var(--gold); }
.rich-content a { text-decoration: underline; text-underline-offset: 4px; }
.rich-content figure { margin: 32px 0; }
.rich-content figcaption { font-size: .875rem; color: var(--muted); }
.post-navigation { margin-top: 40px; }
.faq-list details { border-bottom: 1px solid var(--border); padding: 12px 0; }
.faq-list summary { min-height: 44px; padding: 10px 0; cursor: pointer; font-size: 1.125rem; }
.faq-list p { max-width: 800px; }
.final-cta { text-align: center; padding: 60px 7%; background: #17272b; }
.community { text-align: center; }
.community .actions { justify-content: center; }
footer { padding: 36px 7%; display: grid; grid-template-columns: 1fr 1fr 1.3fr; gap: 24px; align-items: start; }
footer p { margin: 0; font-size: .875rem; }
footer nav { display: flex; flex-wrap: wrap; gap: 4px 18px; font-size: .875rem; }
footer nav a { min-height: 44px; display: flex; align-items: center; }
footer small { color: var(--muted); font-size: .875rem; grid-column: 1/-1; }
.skip { position: fixed; top: -100px; left: 20px; padding: 10px; background: var(--gold); color: #111; z-index: 100; }
.skip:focus { top: 10px; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
.hero-shot figcaption { display: none; }
.shot { margin: 0; min-width: 0; }
.shot img { display: block; width: 100%; border: 1px solid var(--border); background: var(--surface); }
.shot figcaption { margin-top: 10px; font-size: .875rem; color: var(--muted); }
.shot.wide { max-width: 1100px; margin: 0 auto; }
.group-shot { margin-top: 28px; }
.gallery { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 28px 24px; }
.plain-list { color: var(--muted); padding-left: 1.2em; }
.plain-list li { margin: 10px 0; }
.notice.placeholder { border-style: dashed; }
@media (min-width:1600px) {
  .section,.page-intro,.section-jumps { padding-left: max(7%,calc((100vw - 1400px)/2)); padding-right: max(7%,calc((100vw - 1400px)/2)); }
  .narrow { padding-left: 70px; padding-right: 70px; }
}
@media (max-width:1250px) {
  .site-header { gap: 16px; }
  .has-js .menu-toggle { display: block; min-width: 60px; min-height: 44px; background: transparent; border: 1px solid var(--border); color: var(--ink); padding: 8px; margin-left: auto; }
  #main-nav { flex-direction: column; align-items: stretch; gap: 4px; padding: 16px; margin: 0; }
  .has-js #main-nav { display: none; position: absolute; top: 100%; left: 0; right: 0; background: #101b20; max-height: calc(100svh - 90px); overflow-y: auto; overscroll-behavior: contain; border-bottom: 1px solid var(--border); }
  .has-js #main-nav.open { display: flex; }
  #main-nav > a,.nav-group summary { padding: 10px 16px; }
  .nav-group div { position: static; padding: 4px 16px; border: 0; min-width: 0; }
  .nav-group.is-active > summary,#main-nav > a[aria-current] { box-shadow: inset 2px 0 var(--gold); background: #ffffff05; }
  .mobile-cta { display: block; padding: 12px 16px 4px; }
  .mobile-cta .button { width: 100%; }
  .progression-loop { grid-template-columns: repeat(3,minmax(0,1fr)); }
  .progression-loop li:nth-child(4) .step-arrow { transform: none; }
  .progression-loop li:nth-child(3n) .step-arrow { transform: rotate(90deg); }
  .status-legend { grid-template-columns: repeat(2,minmax(0,1fr)); }
}
@media (max-width:900px) {
  .hero { grid-template-columns: minmax(0,1fr); padding-bottom: 90px; }
  .gallery { grid-template-columns: repeat(2,minmax(0,1fr)); }
  .section-head { display: block; }
  .section-head > .text-link { margin-bottom: 12px; }
  .system-group { grid-template-columns: 1fr; gap: 32px; }
  .choice-section { grid-template-columns: 1fr; gap: 24px; }
  .roadmap { grid-template-columns: 1fr; gap: 20px; }
  .road-column { display: block; }
  .dual { grid-template-columns: minmax(0,1fr); }
  .collective-status { max-width: 650px; }
  .profession-row article { padding-left: 20px; padding-right: 20px; }
  footer { grid-template-columns: 1fr 1fr; } footer nav { grid-column: 1/-1; }
}
@media (max-width:650px) {
  .gallery { grid-template-columns: minmax(0,1fr); }
  .site-header { min-height: 76px; padding: 12px 5%; gap: 8px; flex-wrap: wrap; }
  .brand { font-size: .6875rem; letter-spacing: .5px; }
  .brand-mark { display: none; }
  .header-actions { gap: 0; }
  .primary-header { display: none; }
  .has-js .menu-toggle { min-width: 52px; font-size: .875rem; padding: 8px; }
  .has-js #main-nav { max-height: calc(100svh - 76px); }
  html:not(.has-js) #main-nav { order: 4; width: 100%; }
  .hero { padding: 36px 6% 80px; }
  .hero-art { background: linear-gradient(0deg,#0c1316 0%,transparent 40%); }
  .hero-brand { font-size: clamp(1.6rem,8.5vw,2.2rem); }
  .hero-brand span { letter-spacing: 4px; }
  .hero h1 { font-size: 2.2rem; }
  .hero-copy > p:not(.eyebrow):not(.hero-state) { font-size: 1rem; }
  .hero-foot { left: 6%; right: 6%; bottom: 18px; }
  .hero-state { letter-spacing: .8px; }
  .section { padding: 45px 6%; }
  .page-intro { padding: 42px 6% 32px; }
  .page-intro h1 { font-size: 2.5rem; overflow-wrap: break-word; }
  .progression-loop { grid-template-columns: 1fr; gap: 0; border-left: 1px solid var(--gold); margin-left: 10px; }
  .progression-loop li { border: 0; border-bottom: 1px solid var(--border); background: transparent; }
  .progression-loop a { padding: 18px 28px 24px; }
  .progression-loop h3 { margin: 8px 0; }
  .step-number { font-size: .9375rem; }
  .step-arrow,.progression-loop li:nth-child(4) .step-arrow { transform: rotate(90deg); }
  .progression-loop li:last-child .step-arrow { transform: none; }
  .profession-row,.split,.system-list,.category-list,.status-legend,.post-list { grid-template-columns: 1fr; }
  .profession-row article,.profession-row article:first-child { padding: 20px 0; border: 0; border-top: 1px solid var(--border); }
  .profession-number { float: right; font-size: 2rem; margin-left: 14px; }
  .profession-row h3 { margin-top: 8px; }
  .split { gap: 32px; }
  .dual article { padding: 26px; }
  .section-jumps { padding: 16px 6%; gap: 8px 20px; }
  .focus-paths { padding-left: 20px; }
  .status-legend { gap: 12px; }
  .status-legend p { margin-bottom: 8px; }
  .category-list li { padding: 20px 0; }
  .notice { padding: 12px 20px; }
  .final-cta { padding: 44px 6%; }
  footer { grid-template-columns: 1fr; padding: 30px 6%; gap: 18px; }
  .eyebrow { letter-spacing: 1.1px; }
}
/* Temporada: Pass meter and rankings */
.meter-bar { height: 22px; border: 1px solid var(--border); background: var(--surface); overflow: hidden; }
.meter-bar span { display: block; height: 100%; width: 0; background: linear-gradient(90deg, #9c7a43, var(--gold)); transition: width .6s ease; }
.meter-dates, .meter-countdown { margin: 6px 0; font-size: 1.125rem; color: var(--ink); }
.meter-countdown { color: var(--gold); font-family: var(--serif); font-size: 1.6rem; }
.buy-note, .board-note { font-size: .9375rem; }
.live-state { margin: 18px 0 0; font-size: .9375rem; }
.live-state[data-state="unavailable"] { color: #d9a98b; }
.live-state[data-state="live"] { color: #9bc9b6; }
.button.disabled { cursor: not-allowed; background: transparent; color: var(--muted); border-color: var(--border); }
.button.disabled:hover { background: transparent; }
.board-prize { color: var(--gold); border-left: 2px solid var(--gold); padding-left: 14px; }
.tabs { display: flex; flex-wrap: wrap; gap: 8px; margin: 18px 0 20px; }
.tab { min-height: 44px; padding: 8px 18px; background: transparent; color: var(--ink); border: 1px solid var(--border); cursor: pointer; }
.tab:hover { border-color: var(--gold); }
.tab[aria-selected="true"] { background: var(--gold); color: #151a1b; border-color: var(--gold); }
.table-wrap { overflow-x: auto; border: 1px solid var(--border); }
.table-wrap:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }
.rank-table { width: 100%; border-collapse: collapse; font-size: .9375rem; }
.rank-table th, .rank-table td { padding: 10px 14px; border-bottom: 1px solid #ffffff12; text-align: left; vertical-align: top; }
.rank-table thead th { background: var(--surface); color: var(--gold); font-weight: 600; white-space: nowrap; }
.rank-table tbody th { font-weight: 500; color: var(--ink); overflow-wrap: anywhere; min-width: 9ch; }
.rank-table .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.rank-table small { color: var(--muted); }
.rank-table .anon { color: var(--muted); }
.rank-empty { padding: 18px 0; }
@media (max-width:650px) { .rank-table { font-size: .875rem; } .rank-table th, .rank-table td { padding: 8px 8px; } .rank-table tbody th { min-width: 14ch; } .meter-bar { height: 18px; } }
/* Site v2: fun section, Pass purchase block, Liga steps, meter line, footer trust */
.fun-grid { list-style: none; padding: 0; margin: 28px 0 0; display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); }
.fun-grid li { padding: 8px 26px 8px; border-left: 1px solid var(--border); }
.fun-grid li:first-child { padding-left: 0; border: 0; }
.fun-grid h3 { margin: 10px 0 12px; font-size: 1.5rem; }
.fun-grid p { margin: 0; font-size: 1rem; }
.fun-grid .profession-number { display: block; }
.pass-buy { border-bottom: 1px solid var(--border); }
.pass-price { color: var(--ink); font-family: var(--serif); font-size: clamp(1.4rem,3.2vw,2.1rem); line-height: 1.3; margin: 0; }
.pass-price strong { color: var(--gold); font-weight: 400; }
.trust-line { font-size: .9375rem; margin: 18px 0 6px; }
.trust-line .text-link { margin-left: 4px; }
.steps { list-style: none; padding: 0; margin: 24px 0 0; display: grid; gap: 14px; counter-reset: league; }
.steps li { counter-increment: league; position: relative; padding: 16px 20px 16px 68px; background: var(--surface); border: 1px solid var(--border); color: var(--ink); font-size: 1.0625rem; }
.steps li::before { content: counter(league); position: absolute; left: 18px; top: 50%; transform: translateY(-50%); width: 36px; height: 36px; display: grid; place-items: center; border: 1px solid var(--gold); color: var(--gold); font: 1.25rem/1 var(--serif); }
.prize-fixed { margin: 20px 0 0; padding: 14px 20px; border-left: 2px solid var(--gold); background: var(--surface); color: var(--ink); font-size: 1.0625rem; }
.meter-line { margin: 14px 0 0; color: var(--ink); font-family: var(--serif); font-size: clamp(1.25rem,3.4vw,1.9rem); line-height: 1.3; }
.meter-bar span { min-width: 0; }
.footer-trust { grid-column: 1/-1; border-top: 1px solid var(--border); padding-top: 18px; display: flex; flex-wrap: wrap; gap: 6px 28px; align-items: center; }
.footer-trust nav { margin-left: auto; }
.rank-empty[data-kind="failed"] { color: #d9a98b; }
@media (max-width:900px) { .fun-grid { grid-template-columns: repeat(2,minmax(0,1fr)); gap: 12px 0; } .fun-grid li:nth-child(3) { padding-left: 0; border: 0; } .footer-trust nav { margin-left: 0; } }
@media (max-width:650px) { .fun-grid { grid-template-columns: 1fr; } .fun-grid li, .fun-grid li:first-child, .fun-grid li:nth-child(3) { padding: 16px 0; border: 0; border-top: 1px solid var(--border); } .steps li { padding-left: 60px; } .hero .actions .button { flex: 1 1 100%; } }
@media (prefers-reduced-motion:reduce) { * { transition: none!important; scroll-behavior: auto!important; } }
/* Waitlist ("Avise-me no lançamento") */
.waitlist { background: linear-gradient(140deg,#243038,#121c21); }
/* A class that sets display (grid, inline-flex) would beat the hidden attribute: the form, the buttons and the panels must really disappear while they are hidden. */
.waitlist [hidden], .waitlist-unsub [hidden] { display: none !important; }
.waitlist-inner { max-width: 1120px; margin: auto; display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: 8%; align-items: center; }
.waitlist h2 { margin: 6px 0 12px; font-size: clamp(1.6rem,3.4vw,2.4rem); }
.wl-lead { margin: 0; max-width: 520px; }
.waitlist-form { display: grid; gap: 14px; }
.wl-field { display: grid; gap: 6px; }
.wl-field label { color: var(--ink); font-size: .9375rem; font-weight: 600; }
.wl-field input { min-height: 48px; width: 100%; box-sizing: border-box; padding: 10px 14px; background: var(--bg); color: var(--ink); border: 1px solid #869091; border-radius: 0; font: inherit; }
.wl-field input:focus-visible, .wl-consent input:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }
.wl-consent { display: flex; gap: 12px; align-items: flex-start; color: var(--ink); font-size: .9375rem; line-height: 1.5; cursor: pointer; }
.wl-consent input { flex: none; width: 24px; height: 24px; margin: 1px 0 0; accent-color: var(--gold); }
.wl-privacy { margin: -6px 0 0; font-size: .875rem; }
.wl-privacy a { color: var(--gold); text-decoration: underline; }
.waitlist-form .button { justify-self: start; cursor: pointer; }
.waitlist-form .button:disabled { opacity: .6; cursor: progress; }
.wl-hp { position: absolute; left: -10000px; top: auto; width: 1px; height: 1px; overflow: hidden; }
.wl-status { min-height: 1.5em; margin: 12px 0 0; font-size: .9375rem; }
.wl-status[data-state="error"] { color: #e8a98f; }
.wl-status[data-state="busy"] { color: var(--muted); }
.wl-note { margin: 12px 0 0; font-size: .9375rem; }
.wl-count { margin: 12px 0 0; font-family: var(--serif); color: var(--gold); font-size: 1.2rem; }
.wl-done { padding: 18px 22px; border-left: 2px solid var(--gold); background: var(--surface); }
.wl-done-text { margin: 0; color: var(--ink); font-size: 1.0625rem; }
.waitlist-season { padding-top: 40px; padding-bottom: 40px; }
.waitlist-unsub .button { margin-top: 10px; cursor: pointer; }
@media (max-width:800px) { .waitlist-inner { grid-template-columns: 1fr; gap: 22px; } .waitlist-form .button { justify-self: stretch; } }
.wl-referral { margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--border); }
.wl-referral h3 { margin: 0 0 6px; font-size: 1.35rem; }
.wl-referral h4 { margin: 18px 0 6px; font-family: var(--serif); font-weight: 400; font-size: 1.1rem; color: var(--ink); }
.wl-link-row { display: flex; gap: 10px; margin-top: 12px; }
.wl-link { flex: 1 1 auto; min-width: 0; min-height: 48px; box-sizing: border-box; padding: 10px 14px; background: var(--bg); color: var(--ink); border: 1px solid #869091; border-radius: 0; font: inherit; font-size: .9375rem; }
.wl-link:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }
.wl-link-row .button { flex: none; cursor: pointer; }
.wl-share-title { margin: 14px 0 6px; font-size: .875rem; font-weight: 600; color: var(--ink); text-transform: uppercase; letter-spacing: 1px; }
.wl-share { display: flex; flex-wrap: wrap; gap: 10px; }
.wl-share .button { min-height: 44px; padding: 8px 18px; }
.wl-counts { margin: 14px 0 0; color: var(--gold); font-family: var(--serif); font-size: 1.1rem; }
.wl-tiers { margin: 0 0 4px; font-size: .9375rem; }
@media (max-width:520px) { .wl-link { font-size: .8125rem; } .wl-link-row { flex-direction: column; } .wl-link-row .button { width: 100%; } .wl-share .button { flex: 1 1 auto; } }
/* Home v3: epic hero, framed Season and Pass cards, feature strip (self-hosted Cinzel, OFL) */
@font-face { font-family: 'Cinzel'; font-style: normal; font-weight: 500; font-display: swap; src: url('/fonts/cinzel-latin-500-normal.woff2') format('woff2'); }
@font-face { font-family: 'Cinzel'; font-style: normal; font-weight: 700; font-display: swap; src: url('/fonts/cinzel-latin-700-normal.woff2') format('woff2'); }
:root { --cinzel: 'Cinzel', Georgia, 'Times New Roman', serif; --gold-hi: #f6dc9c; --gold-mid: #d9a94f; --gold-lo: #8f6526; --gold-line: #b8914a; }
html { scroll-behavior: smooth; }
.hero.hero-epic { display: block; min-height: 560px; padding: 56px 0 120px; background: #0c1316; overflow: hidden; }
.hero-epic .hero-art { inset: 0; background: none; }
.hero-epic .hero-art img { position: absolute; top: 0; right: 0; height: 100%; width: auto; max-width: none; min-width: 62%; object-fit: cover; object-position: left top; opacity: .96; }
.hero-epic .hero-art::before { content: ''; position: absolute; inset: 0; z-index: 1; background: linear-gradient(90deg,#0c1316 0%,#0c1316 30%,#0c1316cc 48%,#0c131633 70%,transparent 100%),linear-gradient(0deg,#0c1316 0%,transparent 28%); }
.hero-epic .hero-art::after { content: ''; position: absolute; inset: 0; z-index: 1; background: radial-gradient(ellipse 45% 60% at 18% 40%,#2a1a0a55,transparent 70%); }
.hero-epic .hero-copy { position: relative; max-width: 640px; margin-left: max(7%,calc((100vw - 1400px)/2)); padding-right: 16px; }
.hero-epic .hero-brand { margin: 0 0 22px; width: max-content; max-width: 100%; text-align: center; font-family: var(--cinzel); line-height: 1; letter-spacing: 0; }
.h-arena, .h-idle b, .h-price strong, .h-length strong, .h-card h2 { color: var(--gold); background: linear-gradient(180deg,var(--gold-hi) 0%,var(--gold-mid) 52%,var(--gold-lo) 100%); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
@supports not ((background-clip: text) or (-webkit-background-clip: text)) { .h-arena, .h-idle b, .h-price strong, .h-length strong, .h-card h2 { -webkit-text-fill-color: currentColor; background: none; } }
.h-arena { display: block; font-size: clamp(3.2rem,8.4vw,6.6rem); font-weight: 700; letter-spacing: .01em; filter: drop-shadow(0 3px 0 #00000099) drop-shadow(0 0 22px #e6a43c44); }
.hero-brand span.h-idle { display: flex; align-items: center; justify-content: center; gap: 14px; letter-spacing: 0; margin-top: 2px; color: inherit; }
.h-idle b { font-size: clamp(1.6rem,4.2vw,3.1rem); font-weight: 700; letter-spacing: .5em; margin-right: -.5em; }
.h-idle i { flex: 1; height: 1px; background: linear-gradient(90deg,transparent,var(--gold-line)); position: relative; }
.h-idle i:last-child { background: linear-gradient(270deg,transparent,var(--gold-line)); }
.h-idle i::after { content: ''; position: absolute; top: -3px; width: 7px; height: 7px; background: var(--gold-mid); transform: rotate(45deg); right: 0; }
.h-idle i:last-child::after { right: auto; left: 0; }
.hero-epic h1 { font-family: Georgia, 'Times New Roman', serif; font-size: clamp(2rem,3.6vw,3.35rem); line-height: 1.1; max-width: 560px; margin: 0 0 18px; color: #f6efe0; text-shadow: 0 2px 14px #000c; }
.hero-epic .h-sub { max-width: 520px; font-size: 1.0625rem; color: #d3d0c6; margin: 0; text-shadow: 0 1px 8px #000; }
.hero-epic .actions { margin-top: 26px; }
.button.h-gold { min-height: 54px; padding: 12px 30px; color: #1c1206; font-weight: 700; font-size: 1rem; border: 1px solid #f0cf8a; background: linear-gradient(180deg,#f3d795,#dfaa55 55%,#c58d3c); box-shadow: 0 6px 22px #d9a94f33, inset 0 1px #fff6; gap: 10px; }
.button.h-gold:hover { background: linear-gradient(180deg,#f9e3ae,#e8b867 55%,#d09947); }
.button.h-gold.disabled { background: #151a1d; color: #9a9f9f; border-color: #5a5440; box-shadow: none; }
.button.h-ghost { min-height: 54px; padding: 12px 26px; background: #070a0dcc; border: 1px solid #cfc6ae66; color: #f3ecda; gap: 10px; }
.button.h-ghost:hover { border-color: var(--gold); color: var(--gold); background: #0d1318; }
.h-cards { position: relative; z-index: 2; display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 24px; margin: -74px max(2.5%,calc((100vw - 1500px)/2)) 0; }
.h-card { position: relative; min-width: 0; min-height: 440px; display: flex; flex-direction: column; padding: 32px 34px 26px; background: #090d12; border: 1px solid var(--gold-line); isolation: isolate; overflow: hidden; }
.h-card::before { content: ''; position: absolute; inset: 5px; border: 1px solid #b8914a55; z-index: 3; pointer-events: none; }
.h-card::after { content: ''; position: absolute; inset: 0; z-index: 3; pointer-events: none; background: linear-gradient(var(--gold-hi),var(--gold-hi)) top left/14px 2px no-repeat,linear-gradient(var(--gold-hi),var(--gold-hi)) top left/2px 14px no-repeat,linear-gradient(var(--gold-hi),var(--gold-hi)) top right/14px 2px no-repeat,linear-gradient(var(--gold-hi),var(--gold-hi)) top right/2px 14px no-repeat,linear-gradient(var(--gold-hi),var(--gold-hi)) bottom left/14px 2px no-repeat,linear-gradient(var(--gold-hi),var(--gold-hi)) bottom left/2px 14px no-repeat,linear-gradient(var(--gold-hi),var(--gold-hi)) bottom right/14px 2px no-repeat,linear-gradient(var(--gold-hi),var(--gold-hi)) bottom right/2px 14px no-repeat; }
.h-season { background: radial-gradient(ellipse 80% 70% at 85% 35%,#16253d,#090d12 70%); }
.h-pass { background: radial-gradient(ellipse 80% 70% at 85% 40%,#2e1840,#0b0910 72%); }
.h-card-copy { position: relative; z-index: 2; max-width: 58%; }
.h-eyebrow { display: flex; align-items: center; gap: 12px; margin: 0 0 10px; font-size: .75rem; letter-spacing: .32em; text-transform: uppercase; color: var(--gold); }
.h-eyebrow::before, .h-eyebrow::after { content: ''; height: 1px; background: var(--gold-line); width: 22px; }
.h-eyebrow::after { flex: 1; max-width: 70px; }
.h-card h2 { font-family: var(--cinzel); font-weight: 700; font-size: clamp(1.7rem,2.5vw,2.45rem); line-height: 1.04; margin: 0; text-transform: uppercase; text-wrap: balance; }
.h-tagline { margin: 10px 0 22px; font-size: .75rem; letter-spacing: .16em; text-transform: uppercase; color: #cfd2d6; }
.h-bullets, .h-features { list-style: none; margin: 0; padding: 0; }
.h-bullets li { display: flex; gap: 14px; align-items: center; margin: 0 0 14px; }
.h-bullets span:last-child, .h-features span:last-child { display: block; font-size: .875rem; line-height: 1.35; color: #aab1b6; }
.h-bullets strong, .h-features strong { display: block; font-size: 1rem; font-weight: 600; color: #f1ead9; }
.h-ring { flex: none; width: 46px; height: 46px; display: grid; place-items: center; border: 1.5px solid var(--gold-line); border-radius: 50%; color: var(--gold-hi); background: radial-gradient(circle,#2b200e,#0c0e12); }
.h-icon { display: block; }
.h-art { position: absolute; z-index: 1; display: block; height: auto; }
.h-trophy { right: 5px; top: 70px; width: min(42%,300px); filter: drop-shadow(0 0 24px #e0a23a55); }
.h-passcard { right: 5px; top: 8px; width: min(34%,250px); filter: drop-shadow(0 0 24px #a35ee055); }
.h-card-foot { position: relative; z-index: 2; margin-top: auto; padding-top: 18px; display: flex; align-items: center; gap: 16px; flex-wrap: wrap; justify-content: space-between; }
.h-length, .h-price { margin: 0; display: flex; align-items: center; gap: 14px; padding: 12px 22px; border: 1px solid var(--gold-line); background: #05070aee; color: var(--gold-hi); }
.h-length > span, .h-price { line-height: 1.1; }
.h-length small, .h-price small { display: block; font-size: .6875rem; letter-spacing: .2em; text-transform: uppercase; color: #c7cbd0; margin-bottom: 4px; }
.h-length strong, .h-price strong { font-family: var(--cinzel); font-weight: 700; font-size: 1.75rem; text-transform: uppercase; white-space: nowrap; }
.h-length .h-icon { width: 32px; height: 32px; flex: none; }
.h-price { display: block; padding: 10px 22px; }
.h-price strong { display: block; font-size: 2rem; }
.h-items { display: block; width: 260px; max-width: 100%; height: auto; }
.h-card-foot .button.h-gold { flex: 1 1 210px; }
.h-features { position: relative; z-index: 2; display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); margin: 0 max(2.5%,calc((100vw - 1500px)/2)); padding: 34px 0 40px; }
.h-features li { display: flex; gap: 16px; align-items: center; padding: 0 22px; border-left: 1px solid #ffffff1c; }
.h-features li:first-child { border: 0; padding-left: 12px; }
.h-features strong { font-size: .8125rem; letter-spacing: .12em; text-transform: uppercase; color: var(--gold); font-weight: 600; }
@media (max-width:1100px) {
  .h-card { padding: 28px 24px 22px; }
  .h-card-copy { max-width: 62%; }
  .h-features { grid-template-columns: repeat(2,minmax(0,1fr)); gap: 24px 0; }
  .h-features li:nth-child(3) { border-left: 0; padding-left: 12px; }
}
@media (max-width:900px) {
  .h-cards { grid-template-columns: minmax(0,1fr); }
  .hero.hero-epic { min-height: 0; padding: 44px 0 110px; }
}
@media (max-width:650px) {
  .hero.hero-epic { padding: 36px 0 96px; }
  .hero-epic .hero-copy { margin: 0 16px; padding: 0; }
  .hero-epic .hero-art img { min-width: 100%; opacity: .55; }
  .hero-epic .hero-art::before { background: linear-gradient(90deg,#0c1316cc 0%,#0c131688 60%,#0c131644 100%),linear-gradient(0deg,#0c1316 0%,transparent 30%); }
  .hero-epic .hero-brand { margin: 0 auto 20px; }
  .hero-epic h1 { font-size: 2rem; }
  .hero-epic .actions .button { flex: 1 1 100%; }
  .h-cards { margin: -60px 16px 0; gap: 18px; }
  .h-card { min-height: 0; padding: 24px 18px 20px; }
  .h-card-copy { max-width: none; order: 1; }
  .h-art, .h-trophy, .h-passcard { position: relative; right: auto; top: auto; margin: -6px auto 0; width: min(70%,240px); order: 2; }
  .h-card-foot { order: 3; flex-direction: column; align-items: stretch; }
  .h-items { margin: 0 auto; }
  .h-card-foot .button.h-gold { flex: none; }
  .h-length { justify-content: center; padding: 12px 14px; }
  .h-length strong { font-size: 1.35rem; white-space: normal; }
  .h-price { text-align: center; }
  .h-features { grid-template-columns: minmax(0,1fr); margin: 0 16px; padding: 24px 0 30px; gap: 0; }
  .h-features li, .h-features li:first-child, .h-features li:nth-child(3) { border: 0; border-top: 1px solid #ffffff1c; padding: 14px 4px; }
  .h-features li:first-child { border-top: 0; }
}
@media (prefers-reduced-motion:no-preference) { .h-arena { animation: h-glow 5s ease-in-out infinite alternate; } @keyframes h-glow { from { filter: drop-shadow(0 3px 0 #00000099) drop-shadow(0 0 14px #e6a43c22); } to { filter: drop-shadow(0 3px 0 #00000099) drop-shadow(0 0 30px #e6a43c66); } } }
@media (prefers-reduced-motion:reduce) { html { scroll-behavior: auto; } }
`;
