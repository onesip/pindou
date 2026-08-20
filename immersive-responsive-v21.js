(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  let mode='fit';
  let userScale=1;
  let installed=false;
  let ro=null;
  let mo=null;

  function markVersion(){
    document.title='拼豆定位器 · V21';
    const badge=$('pindouVersionBadge');
    if(badge) badge.textContent='V21 · 沉浸式自适应全屏';
  }

  function addStyles(){
    if($('v21ImmersiveStyles'))return;
    const st=document.createElement('style');
    st.id='v21ImmersiveStyles';
    st.textContent=`
      .v21-fitbar{display:flex;gap:6px;align-items:center;margin-top:9px;overflow-x:auto;scrollbar-width:none}
      .v21-fitbar::-webkit-scrollbar{display:none}.v21-fitbar button{flex:0 0 auto;min-height:34px;padding:6px 9px;border-radius:10px;font-size:11px}
      .v21-fitbar button.active{background:#191714;color:#fff;border-color:#191714}.v21-fitbar .v21-scale{margin-left:auto;font-size:10px;color:#777;white-space:nowrap}
      .v17-im-scroll{min-width:0;min-height:0}.v17-im-board{min-width:0!important;display:flex;align-items:center;justify-content:center}
      #v17ImCanvas{max-width:none!important;max-height:none!important;transform-origin:center center}
      .v17-immersive.v21-landscape{display:grid!important;grid-template-columns:minmax(0,1fr) minmax(250px,34vw);grid-template-rows:auto minmax(0,1fr)}
      .v17-immersive.v21-landscape .v17-im-head{grid-column:1/-1;grid-row:1;padding-top:max(6px,env(safe-area-inset-top));padding-bottom:6px}
      .v17-immersive.v21-landscape .v17-im-scroll{grid-column:1;grid-row:2;padding:8px 10px;overflow:auto}
      .v17-immersive.v21-landscape .v17-im-foot{grid-column:2;grid-row:2;border-top:0;border-left:1px solid #eadfd5;padding:10px calc(10px + env(safe-area-inset-right)) calc(10px + env(safe-area-inset-bottom)) 10px;overflow:auto;display:flex;flex-direction:column;justify-content:center}
      .v17-immersive.v21-landscape .v17-im-colors{max-height:42vh;flex-wrap:wrap;overflow:auto}
      .v17-immersive.v21-landscape .v17-im-controls{grid-template-columns:1fr 1fr;gap:7px}
      .v17-immersive.v21-landscape .v17-im-controls .v17-im-next{grid-column:1/-1;order:-1}
      .v17-immersive.v21-landscape .v17-im-hint{margin-top:8px}
      @media (max-height:500px) and (orientation:landscape){
        .v17-immersive.v21-landscape{grid-template-columns:minmax(0,1fr) minmax(220px,31vw)}
        .v17-immersive.v21-landscape .v17-im-title strong{font-size:18px}.v17-immersive.v21-landscape .v17-im-title small{font-size:9px}
        .v17-immersive.v21-landscape .v17-im-close{width:36px;height:36px;min-height:36px}.v17-immersive.v21-landscape .v17-im-swatch{width:26px;height:26px}
        .v17-immersive.v21-landscape .v17-im-progress{margin-top:5px;height:6px}.v21-fitbar{margin-top:5px}.v21-fitbar button{min-height:28px;padding:4px 7px;font-size:10px}
      }
      @media (min-width:1200px){
        .v17-immersive.v21-landscape{grid-template-columns:minmax(0,1fr) 360px}.v17-immersive.v21-landscape .v17-im-scroll{padding:18px 24px}.v17-immersive.v21-landscape .v17-im-foot{padding:20px}
      }
    `;
    document.head.appendChild(st);
  }

  function ensureControls(){
    const head=document.querySelector('#v17Immersive .v17-im-head');
    if(!head||$('v21Fitbar'))return;
    const bar=document.createElement('div');
    bar.id='v21Fitbar';bar.className='v21-fitbar';
    bar.innerHTML=`<button id="v21Fit" class="secondary active" type="button">适应屏幕</button><button id="v21Width" class="secondary" type="button">适应宽度</button><button id="v21Original" class="secondary" type="button">100%</button><button id="v21Minus" class="ghost" type="button">−</button><button id="v21Plus" class="ghost" type="button">＋</button><span id="v21Scale" class="v21-scale">自动</span>`;
    head.appendChild(bar);
    $('v21Fit').onclick=()=>{mode='fit';userScale=1;updateButtons();fitNow(true)};
    $('v21Width').onclick=()=>{mode='width';userScale=1;updateButtons();fitNow(true)};
    $('v21Original').onclick=()=>{mode='original';userScale=1;updateButtons();fitNow(true)};
    $('v21Minus').onclick=()=>{mode='custom';userScale=Math.max(.25,currentScale()*.88);updateButtons();applyScale(userScale,true)};
    $('v21Plus').onclick=()=>{mode='custom';userScale=Math.min(3,currentScale()*1.12);updateButtons();applyScale(userScale,true)};
  }

  function updateButtons(){for(const [id,m] of [['v21Fit','fit'],['v21Width','width'],['v21Original','original']]) $(id)?.classList.toggle('active',mode===m)}
  function viewport(){const vv=window.visualViewport;return{w:vv?.width||innerWidth,h:vv?.height||innerHeight}}
  function isLandscape(){const v=viewport();return v.w>v.h*1.08}
  function natural(){const c=$('v17ImCanvas');return{w:c?.width||0,h:c?.height||0}}
  function currentScale(){const c=$('v17ImCanvas'),n=natural();if(!c||!n.w)return 1;const rect=c.getBoundingClientRect();return rect.width/n.w||1}

  function applyScale(scale,center){
    const c=$('v17ImCanvas'),scroll=$('v17ImScroll'),n=natural();if(!c||!scroll||!n.w||!n.h)return;
    scale=Math.max(.18,Math.min(3,scale));
    c.style.width=Math.max(1,Math.round(n.w*scale))+'px';
    c.style.height=Math.max(1,Math.round(n.h*scale))+'px';
    const label=$('v21Scale');if(label)label.textContent=Math.round(scale*100)+'%';
    if(center)requestAnimationFrame(()=>{scroll.scrollLeft=Math.max(0,(scroll.scrollWidth-scroll.clientWidth)/2);scroll.scrollTop=Math.max(0,(scroll.scrollHeight-scroll.clientHeight)/2)});
  }

  function fitNow(center=false){
    markVersion();
    const im=$('v17Immersive'),scroll=$('v17ImScroll'),c=$('v17ImCanvas'),n=natural();if(!im||!scroll||!c||!n.w||!n.h||!im.classList.contains('on'))return;
    const landscape=isLandscape();im.classList.toggle('v21-landscape',landscape);
    requestAnimationFrame(()=>{
      const pad=landscape?14:18,aw=Math.max(80,scroll.clientWidth-pad),ah=Math.max(80,scroll.clientHeight-pad);let s=1;
      if(mode==='fit')s=Math.min(aw/n.w,ah/n.h);else if(mode==='width')s=aw/n.w;else if(mode==='original')s=1;else s=userScale;
      s=Math.min(s,landscape?1.85:1.55);applyScale(s,center);
    });
  }

  function observe(){
    const im=$('v17Immersive'),scroll=$('v17ImScroll'),c=$('v17ImCanvas');if(!im||!scroll||!c)return false;
    ensureControls();
    if(!ro&&window.ResizeObserver){ro=new ResizeObserver(()=>fitNow(false));ro.observe(scroll);ro.observe(im)}
    if(!mo){mo=new MutationObserver(muts=>{for(const m of muts){if(m.type==='attributes'){setTimeout(()=>fitNow(false),20);break}}});mo.observe(c,{attributes:true,attributeFilter:['width','height']});mo.observe(im,{attributes:true,attributeFilter:['class']})}
    return true;
  }

  function boot(){
    if(installed)return;installed=true;markVersion();addStyles();
    let tries=0;const t=setInterval(()=>{if(observe()||++tries>160)clearInterval(t)},50);
    const onResize=()=>{markVersion();setTimeout(()=>fitNow(true),80)};
    addEventListener('resize',onResize);addEventListener('orientationchange',()=>{markVersion();setTimeout(()=>fitNow(true),220)});
    window.visualViewport?.addEventListener('resize',onResize);
    document.addEventListener('change',e=>{if(e.target?.id==='v19ViewSelect')setTimeout(markVersion,0)},true);
    document.addEventListener('fullscreenchange',()=>setTimeout(()=>fitNow(true),80));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
