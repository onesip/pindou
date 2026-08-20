// V21 entrypoint. Keep legacy filename so existing tabs upgrade in place.
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
      await load('./app-v16.js?v=21');
      await load('./app-v17-addon.js?v=21');
      try { await load('./responsive-v19.js?v=21'); } catch(e) { console.warn(e); }
      try { await load('./resume-fix-v18.js?v=21'); } catch(e) { console.warn(e); }
      // Load last so immersive screen can size itself after all existing UI exists.
      await load('./immersive-responsive-v21.js?v=21');
    } catch (e) {
      console.error('[Pindou V21] bootstrap error',e);
      const badge=document.getElementById('pindouVersionBadge');
      if(badge) badge.textContent='V21 · 加载异常，请刷新';
    }
  })();
})();
