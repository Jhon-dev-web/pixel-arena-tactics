export const style = `
:root {
  color-scheme: dark;
  --bg: #0c1316; --surface: #121e22; --ink: #eee9dd; --muted: #a9b4b5;
  --gold: #e6bd7b; --border: #344044; --serif: Georgia, 'Times New Roman', serif;
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
.brand { min-height: 44px; display: inline-flex; align-items: center; gap: 6px; font-family: var(--serif); font-size: 1.15rem; letter-spacing: 2px; white-space: nowrap; }
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
.hero { min-height: calc(100svh - 90px); position: relative; display: flex; align-items: center; isolation: isolate; padding: 65px 7% 90px; }
.hero-art { position: absolute; inset: 0; z-index: -1; background: linear-gradient(90deg,#091216f5 0%,#091216bc 35%,#09121626 73%),linear-gradient(0deg,#0c1316 0%,transparent 45%),url('/hero.png') center 45%/cover; }
.hero-copy { max-width: 720px; }
.eyebrow { font-size: .875rem; letter-spacing: 1.8px; font-weight: 600; color: var(--gold); text-transform: uppercase; }
.hero-brand { font-family: var(--serif); font-size: clamp(3.8rem,7vw,7rem); line-height: .95; letter-spacing: 5px; color: #f3e6cb; margin: 26px 0; }
.hero-brand span { display: block; color: var(--gold); letter-spacing: 20px; }
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
  .site-header { min-height: 76px; padding: 12px 5%; gap: 8px; flex-wrap: wrap; }
  .brand { font-size: .9375rem; letter-spacing: 1px; }
  .brand-mark { display: none; }
  .header-actions { gap: 0; }
  .primary-header { display: none; }
  .has-js .menu-toggle { min-width: 52px; font-size: .875rem; padding: 8px; }
  .has-js #main-nav { max-height: calc(100svh - 76px); }
  html:not(.has-js) #main-nav { order: 4; width: 100%; }
  .hero { min-height: calc(100svh - 76px); padding: 44px 6% 90px; }
  .hero-art { background: linear-gradient(90deg,#091216e8,#09121688),linear-gradient(0deg,#0c1316,transparent),url('/hero.png') 65% center/cover; }
  .hero-brand { font-size: clamp(3rem,17vw,4rem); }
  .hero-brand span { letter-spacing: 14px; }
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
@media (prefers-reduced-motion:reduce) { * { transition: none!important; scroll-behavior: auto!important; } }
`;
