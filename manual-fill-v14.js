// V22 entrypoint. Keep legacy filename so existing tabs upgrade in place.
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
      await load('./app-v16.js?v=22');
      await load('./app-v17-addon.js?v=22');
      try { await load('./responsive-v19.js?v=22'); } catch(e) { console.warn(e); }
      try { await load('./resume-fix-v18.js?v=22'); } catch(e) { console.warn(e); }
      try { await load('./immersive-responsive-v21.js?v=22'); } catch(e) { console.warn(e); }
      // V22 adds interactive smart-leak confirmation, real-color chips,
      // and an immersive "show all colors" switch.
      await load('./smart-leak-colors-v22.js?v=22');
    } catch (e) {
      console.error('[Pindou V22] bootstrap error',e);
      const badge=document.getElementById('pindouVersionBadge');
      if(badge) badge.textContent='V22 · 加载异常，请刷新';
    }
  })();
})();
