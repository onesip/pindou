(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);

  function toast(msg) {
    const el = $('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.add('hidden'), 2200);
  }

  function addLegacyManualShim() {
    const panel = $('manualFillV14');
    if (!panel || $('v18LegacyManualShim')) return false;

    // app-v16's renderWork() still calls its old manual-fill status updater.
    // V17 replaced that UI, so the old updater was dereferencing missing mf14* nodes
    // during resume(), throwing before the work area could be shown.
    const shim = document.createElement('div');
    shim.id = 'v18LegacyManualShim';
    shim.hidden = true;
    shim.setAttribute('aria-hidden', 'true');
    shim.innerHTML = `
      <button id="mf14Mode" type="button"></button>
      <div id="mf14Info"></div>
      <input id="mf14Code" value="">
      <input id="mf14Tol" type="range" min="1" max="14" step="0.5" value="3.5">
      <span id="mf14TolVal">3.5</span>
      <button id="mf14Preview" type="button"></button>
      <button id="mf14Missing" type="button"></button>
      <button id="mf14All" type="button"></button>
      <button id="mf14Undo" type="button"></button>`;
    panel.appendChild(shim);
    return true;
  }

  function patchResumeButton() {
    const btn = $('v16ResumeBtn');
    if (!btn || btn.dataset.v18ResumePatched) return false;
    btn.dataset.v18ResumePatched = '1';
    btn.addEventListener('click', () => {
      const label = btn.textContent;
      btn.textContent = '正在恢复…';
      setTimeout(() => {
        const work = $('workSection');
        if (work && !work.classList.contains('hidden')) {
          toast('已恢复上次拼豆进度');
          btn.textContent = '已恢复';
        } else {
          btn.textContent = label;
          toast('恢复没有成功，请刷新后再试');
        }
      }, 550);
    }, true);
    return true;
  }

  function markVersion() {
    document.title = '拼豆定位器 · V18';
    const badge = $('pindouVersionBadge');
    if (badge) badge.textContent = 'V18 · 恢复修复 + 沉浸开拼';
  }

  function install() {
    markVersion();
    addLegacyManualShim();
    patchResumeButton();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }

  // Resume card and V17 repair UI are created asynchronously; keep a lightweight
  // observer until both have appeared.
  const observer = new MutationObserver(() => install());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  let tries = 0;
  const timer = setInterval(() => {
    install();
    if (++tries > 120 || ($('v18LegacyManualShim') && $('v16ResumeBtn')?.dataset.v18ResumePatched)) {
      clearInterval(timer);
      observer.disconnect();
    }
  }, 100);
})();
