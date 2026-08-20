(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  let tries=0;
  const timer=setInterval(()=>{
    const btn=$('v22ImToggle');
    if(!btn){if(++tries>160)clearInterval(timer);return;}
    if(btn.dataset.v22ToggleFix){clearInterval(timer);return;}
    btn.dataset.v22ToggleFix='1';
    btn.addEventListener('click',()=>{
      setTimeout(()=>{
        // After the V22 handler runs, this label means we just returned to
        // current-color-only mode. Ask the original immersive renderer to redraw.
        if(btn.textContent==='显示全部颜色'){
          const code=$('v17ImCode')?.textContent?.trim();
          const chip=[...document.querySelectorAll('#v17ImColors .v17-im-chip')]
            .find(x=>(x.textContent||'').trim().split(/\s+/)[0]===code);
          chip?.click();
          const sub=document.querySelector('#v17Immersive .v17-im-title small');
          if(sub)sub.textContent='当前只拼这一色';
        }
      },0);
    });
    clearInterval(timer);
  },50);
})();
