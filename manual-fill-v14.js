// V24 entrypoint. Keep legacy filename so existing tabs upgrade in place.
(() => {
  'use strict';
  const VERSION='V24';
  const LABEL='V24 · 版本锁定 + 智能补漏';
  const setVersion=()=>{
    document.title=`拼豆定位器 · ${VERSION}`;
    const badge=document.getElementById('pindouVersionBadge');
    if(badge && badge.textContent!==LABEL) badge.textContent=LABEL;
  };
  // Older feature modules still contain their historical V16/V17/V21 labels.
  // Keep the release badge authoritative without using a MutationObserver loop.
  window.PINDOU_RELEASE={version:VERSION,label:LABEL};
  setVersion();
  let guardCount=0;
  const guard=setInterval(()=>{
    setVersion();
    if(++guardCount>=40) clearInterval(guard);
  },250);
  document.addEventListener('visibilitychange',()=>{ if(!document.hidden) setVersion(); });
  window.addEventListener('pageshow',setVersion);

  const load=(src)=>new Promise((resolve,reject)=>{
    const s=document.createElement('script');
    s.src=src;
    s.onload=()=>{setVersion();resolve(s)};
    s.onerror=()=>reject(new Error('load failed: '+src));
    document.head.appendChild(s);
  });

  (async()=>{
    try {
      await load('./app-v16.js?v=24');
      await load('./app-v17-addon.js?v=24');
      try { await load('./responsive-v19.js?v=24'); } catch(e) { console.warn(e); }
      try { await load('./resume-fix-v18.js?v=24'); } catch(e) { console.warn(e); }
      try { await load('./immersive-responsive-v21.js?v=24'); } catch(e) { console.warn(e); }
      await load('./smart-leak-colors-v22.js?v=24');
      await load('./v22-immersive-toggle-fix.js?v=24');
      await load('./v23-freeze-hotfix.js?v=24');
      setVersion();
      document.documentElement.dataset.pindouRelease='24';
    } catch (e) {
      console.error('[Pindou V24] bootstrap error',e);
      setVersion();
      const badge=document.getElementById('pindouVersionBadge');
      if(badge) badge.textContent='V24 · 部分功能加载异常';
    }
  })();
})();
