(() => {
'use strict';
const $=id=>document.getElementById(id);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function srgb(v){v/=255;return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4)}
function lab(a){const r=srgb(a[0]),g=srgb(a[1]),b=srgb(a[2]),x=(.4124*r+.3576*g+.1805*b)/.95047,y=.2126*r+.7152*g+.0722*b,z=(.0193*r+.1192*g+.9505*b)/1.08883,f=t=>t>.008856?Math.cbrt(t):7.787*t+16/116,fx=f(x),fy=f(y),fz=f(z);return[116*fy-16,500*(fx-fy),200*(fy-fz)]}
function de(a,b){const A=lab(a),B=lab(b);return Math.hypot(A[0]-B[0],A[1]-B[1],A[2]-B[2])}
function toast(t){const e=$('toast');if(!e)return;e.textContent=t;e.classList.remove('hidden');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.add('hidden'),1900)}
async function waitState(){for(let i=0;i<240;i++){if(window.__pindouV11)return window.__pindouV11;await new Promise(r=>setTimeout(r,100))}return null}
async function boot(){
  const S=await waitState();
  const panel=$('manualFillV14'),grid=$('gridCanvas'),scroller=$('gridScroller');
  if(!panel||!grid||!scroller){return}
  if(!S){$('mf14Info').textContent='补色模块没有连接到识别器，请刷新页面。';return}
  const colors=window.PINDOU_MARD_COLORS||[],valid=new Set(colors.map(x=>x[0]));
  const modeBtn=$('mf14Mode'),info=$('mf14Info'),code=$('mf14Code'),tol=$('mf14Tol'),tolVal=$('mf14TolVal');
  let mode=false,selected=-1,candidates=[],undo=[];
  scroller.style.position='relative';
  const overlay=document.createElement('canvas');
  overlay.id='mf14Overlay';overlay.style.cssText='position:absolute;left:0;top:0;z-index:40;display:none;touch-action:none;pointer-events:auto;';
  scroller.appendChild(overlay);
  function syncOverlay(){
    overlay.width=grid.width;overlay.height=grid.height;
    overlay.style.width=grid.width+'px';overlay.style.height=grid.height+'px';
    overlay.style.display=(mode&&S.active)?'block':'none';
    paint();
  }
  function getCandidates(){
    if(selected<0||!S.active||!S.cells[selected])return[];
    const base=S.cells[selected],limit=+tol.value||4;
    return S.cells.map((s,i)=>({s,i,d:(s?.rgb&&base.rgb)?de(s.rgb,base.rgb):999})).filter(x=>x.d<=limit).sort((a,b)=>a.d-b.d);
  }
  function paint(){
    const X=overlay.getContext('2d');X.clearRect(0,0,overlay.width,overlay.height);
    if(!mode||!S.active)return;
    const size=+$('zoomRange').value||34;
    X.fillStyle='rgba(255,111,77,.16)';X.strokeStyle='#ff6f4d';X.lineWidth=2;
    for(const q of candidates){const x=q.s.c*size,y=q.s.r*size;X.fillRect(x+2,y+2,size-4,size-4);X.strokeRect(x+2,y+2,size-4,size-4)}
    if(selected>=0){const s=S.cells[selected];X.strokeStyle='#1677ff';X.lineWidth=4;X.strokeRect(s.c*size+2,s.r*size+2,size-4,size-4)}
  }
  function update(){
    if(!S.active){info.innerHTML='<b>先完成一次自动识别。</b> 识别完成后再点“开始选一颗参考豆”。';candidates=[];paint();return}
    if(selected<0){info.textContent='还没选参考豆。开启模式后直接点工作图中的一格。';candidates=[];paint();return}
    const base=S.cells[selected];candidates=getCandidates();
    const blank=candidates.filter(q=>!q.s.code).length;
    info.innerHTML=`参考豆：<b>第 ${base.r+1} 行 / 第 ${base.c+1} 列</b> · 当前 <b>${base.code||'未识别'}</b><br>找到 <b>${candidates.length}</b> 个同底色候选，其中 <b>${blank}</b> 个目前没有色号。`;
    if(base.code&&!code.value)code.value=base.code;
    paint();
  }
  function redraw(){S.selectedCode=null;const b=$('showAllBtn');if(b)b.click();setTimeout(syncOverlay,0)}
  function apply(all){
    if(!S.active)return toast('先完成自动识别');
    if(selected<0)return toast('先点一颗参考豆');
    const k=String(code.value||'').trim().toUpperCase();
    if(!valid.has(k))return toast('请输入有效 MARD 色号');
    candidates=getCandidates();
    const targets=candidates.filter(q=>all||!q.s.code);
    if(!targets.length)return toast(all?'没有同色候选':'没有漏色格需要补');
    undo=targets.map(q=>({i:q.i,code:q.s.code,rgb:[...q.s.rgb],hex:q.s.hex,occupied:q.s.occupied,confidence:q.s.confidence}));
    for(const q of targets){q.s.code=k;q.s.occupied=true;q.s.confidence='manual-v14'}
    $('mf14Undo').disabled=false;redraw();update();toast(`${all?'已统一':'已补上'} ${targets.length} 格 → ${k}`);
  }
  modeBtn.addEventListener('click',()=>{
    if(!S.active)return toast('先完成自动识别');
    mode=!mode;modeBtn.classList.toggle('on',mode);modeBtn.textContent=mode?'✅ 现在点工作图中的一颗参考豆':'开始选一颗参考豆';
    syncOverlay();if(mode)toast('现在点工作图中的一颗参考豆');
  });
  overlay.addEventListener('click',e=>{
    if(!mode||!S.active)return;
    const r=overlay.getBoundingClientRect(),px=(e.clientX-r.left)*overlay.width/r.width,py=(e.clientY-r.top)*overlay.height/r.height,size=+$('zoomRange').value||34;
    const c=Math.floor(px/size),rr=Math.floor(py/size);
    if(c<0||rr<0||c>=S.cols||rr>=S.rows)return;
    selected=rr*S.cols+c;code.value=S.cells[selected]?.code||'';update();toast('参考豆已选中，填色号后点一键补色');
  });
  tol.addEventListener('input',()=>{tolVal.textContent=(+tol.value).toFixed(1);update()});
  code.addEventListener('input',()=>{code.value=code.value.toUpperCase()});
  $('mf14Preview').addEventListener('click',update);
  $('mf14Missing').addEventListener('click',()=>apply(false));
  $('mf14All').addEventListener('click',()=>apply(true));
  $('mf14Undo').addEventListener('click',()=>{
    if(!undo.length)return;
    for(const u of undo){const s=S.cells[u.i];if(!s)continue;s.code=u.code;s.rgb=[...u.rgb];s.hex=u.hex;s.occupied=u.occupied;s.confidence=u.confidence}
    undo=[];$('mf14Undo').disabled=true;redraw();update();toast('已撤销上一次补色');
  });
  $('zoomRange')?.addEventListener('input',()=>setTimeout(syncOverlay,0));
  if(window.ResizeObserver)new ResizeObserver(syncOverlay).observe(grid);
  new MutationObserver(()=>{if(!panel.closest('#workSection')?.classList.contains('hidden'))setTimeout(()=>{update();syncOverlay()},50)}).observe($('workSection'),{attributes:true,attributeFilter:['class']});
  info.textContent='补色功能已加载。识别完成后即可点一颗豆子补整色。';
  syncOverlay();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
