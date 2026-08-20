(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  let marked = false;
  let observer = null;
  let timer = null;

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
    if (!panel) return false;
    if ($('v18LegacyManualShim')) return true;
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
    if (!btn) return false;
    if (btn.dataset.v20ResumePatched) return true;
    btn.dataset.v20ResumePatched = '1';
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

  function markVersionOnce() {
    if (marked) return;
    marked = true;
    document.title = '拼豆定位器 · V20';
    const badge = $('pindouVersionBadge');
    if (badge && badge.textContent !== 'V20 · 稳定加载 + 多端适配') {
      badge.textContent = 'V20 · 稳定加载 + 多端适配';
    }
  }

  function attempt() {
    markVersionOnce();
    const shimReady = addLegacyManualShim();
    const resumeReady = patchResumeButton();
    if (shimReady && resumeReady) {
      if (observer) observer.disconnect();
      if (timer) clearInterval(timer);
      observer = null;
      timer = null;
      return true;
    }
    return false;
  }

  function start() {
    attempt();
    if (!observer) {
      observer = new MutationObserver(() => {
        // Only look for the two asynchronously-created targets. Do not rewrite
        // version text here, otherwise observing our own DOM mutations can loop.
        const shimReady = $('v18LegacyManualShim') || addLegacyManualShim();
        const resumeReady = $('v16ResumeBtn')?.dataset.v20ResumePatched || patchResumeButton();
        if (shimReady && resumeReady) {
          observer.disconnect();
          observer = null;
          if (timer) { clearInterval(timer); timer = null; }
        }
      });
      observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
    }
    let tries = 0;
    timer = setInterval(() => {
      if (attempt() || ++tries > 120) {
        clearInterval(timer);
        timer = null;
        if (tries > 120 && observer) { observer.disconnect(); observer = null; }
      }
    }, 100);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
