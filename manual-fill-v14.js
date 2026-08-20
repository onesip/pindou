// V20 entrypoint. Keep legacy filename so existing tabs upgrade in place.
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
      await load('./app-v16.js?v=20');
      await load('./app-v17-addon.js?v=20');
      try { await load('./responsive-v19.js?v=20'); } catch(e) { console.warn(e); }
      // Load the compatibility fix LAST so it owns the visible version badge and
      // cannot block the responsive layer if one optional script fails.
      await load('./resume-fix-v18.js?v=20');
    } catch (e) {
      console.error('[Pindou V20] bootstrap error',e);
      const badge=document.getElementById('pindouVersionBadge');
      if(badge) badge.textContent='V20 · 加载异常，请刷新';
    }
  })();
})();
