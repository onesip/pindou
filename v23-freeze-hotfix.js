(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  let safeObserver = null;

  function markVersion(){
    document.title='拼豆定位器 · V23';
    const b=$('pindouVersionBadge');
    if(b) b.textContent='V23 · 修复卡死 + 智能补漏';
  }

  function lum(a){return .2126*a[0]+.7152*a[1]+.0722*a[2]}
  function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
  function mean(a){return a.length?a.reduce((s,v)=>s+v,0)/a.length:0}
  function rgbHex(a){return '#'+a.map(v=>clamp(Math.round(v),0,255).toString(16).padStart(2,'0')).join('')}
  function textColor(rgb){return lum(rgb)<145?'#fff':'#191714'}

  function state(){return window.PindouV16||null}
  function avgForCode(code){
    const S=state(); if(!S) return null;
    const a=S.cells.filter(s=>s.code===code).map(s=>s.rgb);
    return a.length?[0,1,2].map(j=>mean(a.map(x=>x[j]))):null;
  }

  function paintImmersiveChips(){
    const box=$('v17ImColors'); if(!box) return;
    for(const b of box.querySelectorAll('.v17-im-chip')){
      const code=(b.textContent||'').trim().split(/\s+/)[0];
      const rgb=avgForCode(code); if(!rgb) continue;
      if(!b.classList.contains('v22-im-chip')) b.classList.add('v22-im-chip');
      b.style.background=rgbHex(rgb);
      b.style.color=textColor(rgb);
      b.style.borderColor='rgba(0,0,0,.16)';
      b.style.boxShadow=b.classList.contains('active')
        ? 'inset 0 0 0 2px rgba(255,255,255,.7),0 0 0 3px #191714'
        : 'inset 0 0 0 1px rgba(0,0,0,.12)';
    }
  }

  function detachBuggyObserver(){
    const old=$('v17ImColors');
    if(!old || old.dataset.v23Cloned) return false;

    // V22 attached a MutationObserver to this node and watched class changes.
    // Its own colorizer then changed classes again, creating an endless observer loop
    // as soon as immersive chips rendered. Replacing the node detaches that observer
    // while preserving the id/classes expected by the V17 renderer.
    const fresh=old.cloneNode(false);
    fresh.dataset.v23Cloned='1';
    old.replaceWith(fresh);

    safeObserver?.disconnect();
    safeObserver=new MutationObserver(()=>{
      requestAnimationFrame(paintImmersiveChips);
    });
    safeObserver.observe(fresh,{childList:true,subtree:true});
    return true;
  }

  function makeButtonsClickable(){
    const im=$('v17Immersive');
    if(im){
      im.style.pointerEvents='auto';
      for(const el of im.querySelectorAll('button,canvas,input,select')) el.style.pointerEvents='auto';
    }
  }

  function boot(){
    markVersion();
    let tries=0;
    const t=setInterval(()=>{
      const ok=detachBuggyObserver();
      makeButtonsClickable();
      paintImmersiveChips();
      if(ok || ++tries>160) clearInterval(t);
    },50);

    // Keep this deliberately lightweight: no attribute-observing loop.
    document.addEventListener('click',()=>setTimeout(()=>{
      makeButtonsClickable();
      paintImmersiveChips();
    },0),true);
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
