// V23 entrypoint. Keep legacy filename so existing tabs upgrade in place.
(() => {
  'use strict';
  const load=(src)=>new Promise((resolve,reject)=>{
    const s=document.createElement('script');
    s.src=src;
    s.onload=()=>resolve(s);
    s.onerror=()=>reject(new Error('load failed: '+src));
    document.head.appendChild(s);
  });

  (async()=>{
    try {
      await load('./app-v16.js?v=23');
      await load('./app-v17-addon.js?v=23');
      try { await load('./responsive-v19.js?v=23'); } catch(e) { console.warn(e); }
      try { await load('./resume-fix-v18.js?v=23'); } catch(e) { console.warn(e); }
      try { await load('./immersive-responsive-v21.js?v=23'); } catch(e) { console.warn(e); }
      await load('./smart-leak-colors-v22.js?v=23');
      await load('./v22-immersive-toggle-fix.js?v=23');
      await load('./v23-freeze-hotfix.js?v=23');
    } catch (e) {
      console.error('[Pindou V23] bootstrap error',e);
      const badge=document.getElementById('pindouVersionBadge');
      if(badge) badge.textContent='V23 · 加载异常，请刷新';
    }
  })();
})();
