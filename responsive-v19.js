(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const MODE_KEY = 'pindou-v19-layout-mode';
  const MODES = new Set(['auto','phone','tablet','desktop']);
  let selected = localStorage.getItem(MODE_KEY) || 'auto';
  if (!MODES.has(selected)) selected = 'auto';

  function inferred() {
    const w = window.innerWidth || document.documentElement.clientWidth || 390;
    if (w <= 640) return 'phone';
    if (w <= 1180) return 'tablet';
    return 'desktop';
  }
  function resolved() { return selected === 'auto' ? inferred() : selected; }

  function injectStyles() {
    if ($('v19ResponsiveStyles')) return;
    const st = document.createElement('style');
    st.id = 'v19ResponsiveStyles';
    st.textContent = `
      :root{--pindou-page-max:920px;--pindou-card-pad:16px;--pindou-ui-scale:1}
      .v19-view-control{display:flex;align-items:center;gap:7px;margin-left:auto;margin-right:8px;padding:5px 7px;border:1px solid var(--line,#e9e1d8);border-radius:13px;background:rgba(255,255,255,.72);backdrop-filter:blur(10px)}
      .v19-view-control span{font-size:10px;color:var(--muted,#7a746d);font-weight:800;white-space:nowrap}
      .v19-view-control select{height:32px;max-width:116px;border:0;border-radius:9px;background:#f7f0e8;color:#1f1d1a;font-size:12px;font-weight:800;padding:0 25px 0 9px;outline:none}
      .v19-layout-note{display:none;margin:4px 0 0;font-size:10px;color:#7a746d}

      html[data-pindou-layout="phone"] main{max-width:560px;padding-left:10px;padding-right:10px}
      html[data-pindou-layout="phone"] .card{padding:16px;border-radius:20px}
      html[data-pindou-layout="phone"] .source-viewport{height:min(58vh,520px);min-height:280px}
      html[data-pindou-layout="phone"] .grid-scroller{max-height:68vh}

      html[data-pindou-layout="tablet"] main{max-width:1120px;padding:16px 20px 100px}
      html[data-pindou-layout="tablet"] .topbar{padding-left:22px;padding-right:22px}
      html[data-pindou-layout="tablet"] .topbar h1{font-size:27px}
      html[data-pindou-layout="tablet"] .card{padding:22px 24px;border-radius:24px;margin:16px 0}
      html[data-pindou-layout="tablet"] .section-title h2{font-size:21px}
      html[data-pindou-layout="tablet"] .section-title p,html[data-pindou-layout="tablet"] .advanced p{font-size:13px}
      html[data-pindou-layout="tablet"] button,html[data-pindou-layout="tablet"] .native-picker{min-height:48px}
      html[data-pindou-layout="tablet"] .source-viewport{height:min(66vh,690px);min-height:440px}
      html[data-pindou-layout="tablet"] .drop-zone{min-height:285px}
      html[data-pindou-layout="tablet"] .grid-scroller{max-height:75vh}
      html[data-pindou-layout="tablet"] .grid-scroller canvas{margin-left:auto;margin-right:auto}
      html[data-pindou-layout="tablet"] .chip{min-width:102px;padding:11px}
      html[data-pindou-layout="tablet"] .chip strong{font-size:14px}
      html[data-pindou-layout="tablet"] .chip span{font-size:11px}
      html[data-pindou-layout="tablet"] .stat{padding:13px}
      html[data-pindou-layout="tablet"] .stat b{font-size:22px}

      html[data-pindou-layout="desktop"] main{max-width:1580px;padding:22px 32px 110px}
      html[data-pindou-layout="desktop"] .topbar{padding:18px 30px 16px}
      html[data-pindou-layout="desktop"] .topbar h1{font-size:31px}
      html[data-pindou-layout="desktop"] .eyebrow{font-size:12px}
      html[data-pindou-layout="desktop"] .card{padding:28px 32px;border-radius:26px;margin:20px 0}
      html[data-pindou-layout="desktop"] .section-title h2{font-size:24px}
      html[data-pindou-layout="desktop"] .section-title p,html[data-pindou-layout="desktop"] .advanced p{font-size:14px}
      html[data-pindou-layout="desktop"] button,html[data-pindou-layout="desktop"] .native-picker{min-height:50px;font-size:14px}
      html[data-pindou-layout="desktop"] .drop-zone{min-height:340px;padding:34px}
      html[data-pindou-layout="desktop"] .upload-emoji{font-size:48px}
      html[data-pindou-layout="desktop"] .drop-zone>strong{font-size:24px}
      html[data-pindou-layout="desktop"] .drop-zone>span{font-size:14px}
      html[data-pindou-layout="desktop"] .source-viewport{height:min(73vh,850px);min-height:580px;border-radius:20px}
      html[data-pindou-layout="desktop"] .mode-btn{font-size:14px;min-height:46px}
      html[data-pindou-layout="desktop"] .calibration-info span{font-size:12px}
      html[data-pindou-layout="desktop"] .calibration-info b{font-size:15px}
      html[data-pindou-layout="desktop"] .helper-actions button{font-size:13px;min-height:46px}
      html[data-pindou-layout="desktop"] .control-grid label span,html[data-pindou-layout="desktop"] .slider-grid label span{font-size:13px}
      html[data-pindou-layout="desktop"] .control-grid input,html[data-pindou-layout="desktop"] .edit-row input{height:50px;font-size:18px}
      html[data-pindou-layout="desktop"] .stats{gap:12px}
      html[data-pindou-layout="desktop"] .stat{padding:16px;border-radius:16px}
      html[data-pindou-layout="desktop"] .stat span{font-size:12px}
      html[data-pindou-layout="desktop"] .stat b{font-size:26px}
      html[data-pindou-layout="desktop"] .palette-wrap{padding:14px;border-radius:18px}
      html[data-pindou-layout="desktop"] .palette-head{font-size:14px}
      html[data-pindou-layout="desktop"] .chip{min-width:118px;padding:12px;border-radius:14px}
      html[data-pindou-layout="desktop"] .chip-color{height:28px}
      html[data-pindou-layout="desktop"] .chip strong{font-size:15px}
      html[data-pindou-layout="desktop"] .chip span{font-size:12px}
      html[data-pindou-layout="desktop"] .navigator strong{font-size:21px}
      html[data-pindou-layout="desktop"] .navigator .muted{font-size:12px}
      html[data-pindou-layout="desktop"] .current-cell{font-size:14px;padding:14px 16px}
      html[data-pindou-layout="desktop"] .current-cell b{font-size:18px}
      html[data-pindou-layout="desktop"] .zoom-row{font-size:13px}
      html[data-pindou-layout="desktop"] .grid-scroller{max-height:79vh;border-radius:18px}
      html[data-pindou-layout="desktop"] .grid-scroller canvas{margin-left:auto;margin-right:auto}
      html[data-pindou-layout="desktop"] .legend{font-size:12px}
      html[data-pindou-layout="desktop"] .v16-assist,html[data-pindou-layout="desktop"] .v17-repair{font-size:14px}
      html[data-pindou-layout="desktop"] .v17-start{min-height:60px;font-size:18px}

      html[data-pindou-layout="desktop"] .v17-immersive .v17-im-head{padding-left:24px;padding-right:24px}
      html[data-pindou-layout="desktop"] .v17-immersive .v17-im-scroll{padding:24px 36px}
      html[data-pindou-layout="desktop"] .v17-immersive .v17-im-foot{padding-left:24px;padding-right:24px}
      html[data-pindou-layout="desktop"] .v17-immersive .v17-im-title strong{font-size:28px}
      html[data-pindou-layout="desktop"] .v17-immersive .v17-im-chip{min-height:44px;font-size:14px}
      html[data-pindou-layout="desktop"] .v17-immersive .v17-im-next{min-height:56px;font-size:17px}

      @media(max-width:680px){
        .topbar{flex-wrap:wrap;gap:7px}
        .v19-view-control{order:3;width:100%;margin:2px 0 0;justify-content:flex-end;background:transparent;border:0;padding:0}
        .v19-view-control span{display:none}
        .v19-view-control select{height:30px;font-size:11px;max-width:128px}
      }
    `;
    document.head.appendChild(st);
  }

  function ensureControl() {
    let wrap = $('v19ViewControl');
    if (wrap) return wrap;
    const topbar = document.querySelector('.topbar');
    if (!topbar) return null;
    wrap = document.createElement('div');
    wrap.id = 'v19ViewControl';
    wrap.className = 'v19-view-control';
    wrap.innerHTML = `<span>界面</span><select id="v19ViewSelect" aria-label="切换界面布局"><option value="auto">自动适配</option><option value="phone">手机</option><option value="tablet">平板</option><option value="desktop">电脑</option></select>`;
    const reset = $('resetBtn');
    if (reset) topbar.insertBefore(wrap, reset); else topbar.appendChild(wrap);
    const sel = $('v19ViewSelect');
    sel.value = selected;
    sel.addEventListener('change', () => {
      selected = MODES.has(sel.value) ? sel.value : 'auto';
      localStorage.setItem(MODE_KEY, selected);
      apply(true);
    });
    return wrap;
  }

  function syncWorkZoom(layout, force) {
    const z = $('zoomRange');
    if (!z || !$('workSection') || $('workSection').classList.contains('hidden')) return;
    const target = layout === 'desktop' ? 46 : layout === 'tablet' ? 40 : 34;
    const current = +z.value || 34;
    if (!force && Math.abs(current - target) < 2) return;
    z.value = target;
    z.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function apply(fromUser = false) {
    const layout = resolved();
    document.documentElement.dataset.pindouLayout = layout;
    document.documentElement.dataset.pindouLayoutChoice = selected;
    const sel = $('v19ViewSelect');
    if (sel && sel.value !== selected) sel.value = selected;
    if (fromUser) syncWorkZoom(layout, true);
    const badge = $('pindouVersionBadge');
    if (badge) badge.textContent = 'V19 · 手机 / 平板 / 电脑适配';
    document.title = '拼豆定位器 · V19';
  }

  function watchWork() {
    const work = $('workSection');
    if (!work) return;
    let wasHidden = work.classList.contains('hidden');
    new MutationObserver(() => {
      const hidden = work.classList.contains('hidden');
      if (wasHidden && !hidden) setTimeout(() => syncWorkZoom(resolved(), false), 120);
      wasHidden = hidden;
    }).observe(work, { attributes: true, attributeFilter: ['class'] });
  }

  function boot() {
    injectStyles();
    ensureControl();
    apply(false);
    watchWork();
    let t;
    window.addEventListener('resize', () => {
      clearTimeout(t);
      t = setTimeout(() => { if (selected === 'auto') apply(false); }, 120);
    });
    window.addEventListener('orientationchange', () => setTimeout(() => { if (selected === 'auto') apply(false); }, 180));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
