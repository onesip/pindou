(() => {
'use strict';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const mean=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:0;
const lum=x=>.2126*x[0]+.7152*x[1]+.0722*x[2];
const sat=x=>{const hi=Math.max(...x),lo=Math.min(...x);return hi?(hi-lo)/hi:0};
const hex=x=>'#'+x.map(v=>clamp(Math.round(v),0,255).toString(16).padStart(2,'0')).join('');
function srgb(v){v/=255;return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4)}
function lab(a){const r=srgb(a[0]),g=srgb(a[1]),b=srgb(a[2]),x=(.4124*r+.3576*g+.1805*b)/.95047,y=.2126*r+.7152*g+.0722*b,z=(.0193*r+.1192*g+.9505*b)/1.08883,f=t=>t>.008856?Math.cbrt(t):7.787*t+16/116,fx=f(x),fy=f(y),fz=f(z);return[116*fy-16,500*(fx-fy),200*(fy-fz)]}
function de(a,b){const A=lab(a),B=lab(b);return Math.hypot(A[0]-B[0],A[1]-B[1],A[2]-B[2])}
function dominant(data,W,H,x,y,w,h){
  const x0=Math.max(0,Math.floor(x+w*.18)),x1=Math.min(W,Math.ceil(x+w*.82)),y0=Math.max(0,Math.floor(y+h*.18)),y1=Math.min(H,Math.ceil(y+h*.82));
  const step=Math.max(1,Math.floor(Math.min(w,h)/18)),bins=new Map(),px=[];
  for(let yy=y0;yy<y1;yy+=step)for(let xx=x0;xx<x1;xx+=step){const i=(yy*W+xx)*4,p=[data[i],data[i+1],data[i+2]],k=`${Math.round(p[0]/6)*6},${Math.round(p[1]/6)*6},${Math.round(p[2]/6)*6}`;px.push(p);bins.set(k,(bins.get(k)||0)+1)}
  let key='255,255,255',bn=-1;for(const[k,n]of bins)if(n>bn){bn=n;key=k}
  const base=key.split(',').map(Number),near=px.filter(p=>Math.hypot(p[0]-base[0],p[1]-base[1],p[2]-base[2])<22),rgb=[0,1,2].map(j=>Math.round(mean((near.length?near:px).map(p=>p[j]))));
  let ink=0;for(const p of px){const d=Math.hypot(p[0]-rgb[0],p[1]-rgb[1],p[2]-rgb[2]),ld=Math.abs(lum(p)-lum(rgb));if(d>30&&ld>13)ink++}
  return{rgb,ink:ink/Math.max(1,px.length),support:bn/Math.max(1,px.length)};
}
async function boot(){
  for(let i=0;i<120&&!window.__pindouV11;i++)await sleep(100);
  const S=window.__pindouV11;if(!S)return;
  const COLORS=window.PINDOU_MARD_COLORS||[], VALID=new Set(COLORS.map(x=>x[0]));
  const $=id=>document.getElementById(id);
  const work=$('workSection'), scroller=$('gridScroller'), grid=$('gridCanvas');
  if(!work||!scroller||!grid)return;

  const style=document.createElement('style');
  style.textContent=`
  .smart-fill{margin-top:12px;border:1px solid #eadfd5;background:#fffaf5;border-radius:16px;padding:12px}
  .smart-fill h3{font-size:14px;margin:0 0 5px}.smart-fill p{font-size:11px;line-height:1.55;color:#7a746d;margin:0 0 10px}
  .smart-mode{width:100%;margin-bottom:9px}.smart-mode.on{background:#ff6f4d;color:white;border-color:#ff6f4d}
  .smart-info{background:#fff;border:1px solid #eadfd5;border-radius:12px;padding:9px 10px;font-size:11px;line-height:1.55;margin-bottom:9px}
  .smart-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px;align-items:center;margin-top:8px}
  .smart-row input[type=text]{height:42px;border:1px solid #e9e1d8;border-radius:11px;padding:0 11px;font-size:16px;text-transform:uppercase;min-width:0}
  .smart-range{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:8px;align-items:center;font-size:11px;color:#7a746d;margin:10px 0}.smart-range input{width:100%}
  .smart-actions{display:grid;grid-template-columns:1fr 1fr;gap:7px}.smart-actions button{min-height:42px;padding:8px;font-size:11px}
  .smart-undo{width:100%;margin-top:7px}.smart-overlay{position:absolute;left:0;top:0;z-index:20;display:none;touch-action:none}.smart-overlay.on{display:block}
  @media(max-width:430px){.smart-actions{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);

  const box=document.createElement('div');box.className='smart-fill';box.innerHTML=`
    <h3>人工补色 · 点一个格子教它</h3>
    <p>自动识别漏掉时，不用逐颗改。打开补色模式 → 点原图里这种颜色的任意一格 → 填正确 MARD 色号 → 系统按这张图的真实底色把同色格一起找出来。</p>
    <button id="smartModeBtn" type="button" class="secondary smart-mode">🎯 开启“点格子补色”模式</button>
    <div id="smartInfo" class="smart-info">还没选参考格。开启模式后直接点工作图里的任意格子。</div>
    <div class="smart-row"><input id="smartCode" type="text" maxlength="4" placeholder="色号，例如 A4 / E9 / D24" list="smartCodes"><button id="smartPreview" class="secondary" type="button">重新预览</button></div>
    <datalist id="smartCodes">${COLORS.map(x=>`<option value="${x[0]}"></option>`).join('')}</datalist>
    <div class="smart-range"><span>严格</span><input id="smartTol" type="range" min="1.5" max="12" step="0.5" value="4"><b id="smartTolVal">4.0</b><span style="display:none"></span></div>
    <div class="smart-actions"><button id="smartFillMissing" class="secondary" type="button">只补未识别的同色格</button><button id="smartFillAll" class="primary" type="button">这一色全部改成该色号</button></div>
    <button id="smartUndo" class="ghost smart-undo" type="button" disabled>撤销上一次补色</button>
  `;
  const corrections=work.querySelector('.corrections');
  if(corrections)work.insertBefore(box,corrections);else work.appendChild(box);

  scroller.style.position='relative';
  const overlay=document.createElement('canvas');overlay.className='smart-overlay';overlay.id='smartOverlay';scroller.appendChild(overlay);
  let mode=false, selected=null, candidates=[], rawCache=null, undo=null;

  function cropRect(){const src=$('sourceCanvas'),o=$('cropOverlay');let x=parseFloat(o?.style.left),y=parseFloat(o?.style.top),w=parseFloat(o?.style.width),h=parseFloat(o?.style.height);if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(w)||!Number.isFinite(h)||w<2||h<2){x=0;y=0;w=src.width;h=src.height}return{x:clamp(x,0,src.width-1),y:clamp(y,0,src.height-1),w:clamp(w,1,src.width-x),h:clamp(h,1,src.height-y)}}
  function buildRaw(){
    const src=$('sourceCanvas');if(!S.active||!src?.width||!S.rows||!S.cols)return[];
    const r=cropRect(),X=src.getContext('2d',{willReadFrequently:true}),d=X.getImageData(0,0,src.width,src.height).data,out=[];
    for(let rr=0;rr<S.rows;rr++)for(let cc=0;cc<S.cols;cc++){const x=r.x+cc*r.w/S.cols,y=r.y+rr*r.h/S.rows,w=r.w/S.cols,h=r.h/S.rows,z=dominant(d,src.width,src.height,x,y,w,h);out.push({...z,r:rr,c:cc})}
    rawCache={key:`${src.width}:${src.height}:${S.rows}:${S.cols}:${r.x.toFixed(1)}:${r.y.toFixed(1)}:${r.w.toFixed(1)}:${r.h.toFixed(1)}`,cells:out};return out;
  }
  function rawCells(){const src=$('sourceCanvas'),r=cropRect(),key=`${src.width}:${src.height}:${S.rows}:${S.cols}:${r.x.toFixed(1)}:${r.y.toFixed(1)}:${r.w.toFixed(1)}:${r.h.toFixed(1)}`;return rawCache?.key===key?rawCache.cells:buildRaw()}
  function syncOverlay(){overlay.width=grid.width;overlay.height=grid.height;overlay.style.width=grid.width+'px';overlay.style.height=grid.height+'px';overlay.classList.toggle('on',mode&&S.active);paintPreview()}
  function toast(t){const e=$('toast');if(!e)return;e.textContent=t;e.classList.remove('hidden');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.add('hidden'),1900)}
  function getCandidates(){
    if(!selected||!S.active)return[];const raws=rawCells(),base=raws[selected.r*S.cols+selected.c];if(!base)return[];const tol=parseFloat($('smartTol').value)||4;
    const neutral=sat(base.rgb)<.07&&lum(base.rgb)>215;
    const out=[];
    for(let i=0;i<raws.length;i++){const q=raws[i],dist=de(base.rgb,q.rgb);if(dist>tol)continue;if(neutral){const minInk=Math.max(.006,base.ink*.28);if(q.ink<minInk)continue}out.push({i,raw:q,cell:S.cells[i],dist})}
    out.sort((a,b)=>a.dist-b.dist);return out;
  }
  function updateInfo(){
    candidates=getCandidates();const info=$('smartInfo');if(!selected){info.textContent='还没选参考格。开启模式后直接点工作图里的任意格子。';paintPreview();return}
    const s=S.cells[selected.r*S.cols+selected.c],raw=rawCells()[selected.r*S.cols+selected.c],missing=candidates.filter(x=>!x.cell.code).length;
    info.innerHTML=`参考格：<b>第 ${selected.r+1} 行 / 第 ${selected.c+1} 列</b>　当前：<b>${s?.code||'未识别'}</b><br>这张图里找到 <b>${candidates.length}</b> 个同底色候选，其中 <b>${missing}</b> 个目前没识别。${raw?`<br>底色 RGB ${raw.rgb.join(', ')} · 色差阈值 ΔE ${(+ $('smartTol').value).toFixed(1)}`:''}`;
    if(s?.code&&!$('smartCode').value)$('smartCode').value=s.code;
    paintPreview();
  }
  function paintPreview(){
    const X=overlay.getContext('2d');X.clearRect(0,0,overlay.width,overlay.height);if(!mode||!S.active)return;const size=+$('zoomRange').value||34;
    X.lineWidth=2;X.strokeStyle='rgba(255,111,77,.95)';X.fillStyle='rgba(255,111,77,.14)';
    for(const x of candidates){const px=x.cell.c*size,py=x.cell.r*size;X.fillRect(px+2,py+2,size-4,size-4);X.strokeRect(px+2,py+2,size-4,size-4)}
    if(selected){X.lineWidth=3.5;X.strokeStyle='#1677ff';X.strokeRect(selected.c*size+2,selected.r*size+2,size-4,size-4)}
  }
  function setMode(on){mode=on;const b=$('smartModeBtn');b.classList.toggle('on',mode);b.textContent=mode?'✅ 补色模式已开启：点一个参考格':'🎯 开启“点格子补色”模式';syncOverlay();if(mode)toast('现在直接点工作图里的一个参考格')}
  function normalizeCode(){const k=String($('smartCode').value||'').trim().toUpperCase().replace(/\s/g,'');return VALID.has(k)?k:''}
  function apply(all){
    if(!selected)return toast('先开启补色模式并点一个参考格');const k=normalizeCode();if(!k)return toast('请输入有效 MARD 色号');candidates=getCandidates();if(!candidates.length)return toast('没有找到同底色候选');
    const targets=candidates.filter(x=>all||!x.cell.code);if(!targets.length)return toast(all?'没有候选格':'没有未识别格需要补');
    undo=targets.map(x=>({i:x.i,code:x.cell.code,rgb:[...x.cell.rgb],hex:x.cell.hex,occupied:x.cell.occupied,confidence:x.cell.confidence}));
    for(const x of targets){x.cell.code=k;x.cell.rgb=[...x.raw.rgb];x.cell.hex=hex(x.raw.rgb);x.cell.occupied=true;x.cell.confidence='manual-same-color'}
    $('smartUndo').disabled=false;S.selectedCode=null;$('showAllBtn')?.click();updateInfo();toast(`${all?'已统一':'已补上'} ${targets.length} 格 → ${k}`);
  }
  function undoLast(){if(!undo?.length)return;for(const u of undo){const s=S.cells[u.i];if(!s)continue;s.code=u.code;s.rgb=[...u.rgb];s.hex=u.hex;s.occupied=u.occupied;s.confidence=u.confidence}undo=null;$('smartUndo').disabled=true;S.selectedCode=null;$('showAllBtn')?.click();updateInfo();toast('已撤销上一次补色')}

  overlay.addEventListener('click',e=>{if(!mode||!S.active)return;const r=overlay.getBoundingClientRect(),x=(e.clientX-r.left)*overlay.width/r.width,y=(e.clientY-r.top)*overlay.height/r.height,size=+$('zoomRange').value||34,c=Math.floor(x/size),rr=Math.floor(y/size);if(c<0||rr<0||c>=S.cols||rr>=S.rows)return;selected={r:rr,c};const s=S.cells[rr*S.cols+c];$('smartCode').value=s?.code||'';updateInfo()});
  $('smartModeBtn').addEventListener('click',()=>setMode(!mode));
  $('smartPreview').addEventListener('click',updateInfo);
  $('smartTol').addEventListener('input',()=>{$('smartTolVal').textContent=(+$('smartTol').value).toFixed(1);updateInfo()});
  $('smartCode').addEventListener('input',()=>{$('smartCode').value=$('smartCode').value.toUpperCase()});
  $('smartFillMissing').addEventListener('click',()=>apply(false));
  $('smartFillAll').addEventListener('click',()=>apply(true));
  $('smartUndo').addEventListener('click',undoLast);
  $('zoomRange').addEventListener('input',()=>setTimeout(syncOverlay,0));
  new MutationObserver(()=>{if(!work.classList.contains('hidden')&&S.active){rawCache=null;setTimeout(syncOverlay,50)}}).observe(work,{attributes:true,attributeFilter:['class']});
  const ro=new ResizeObserver(()=>syncOverlay());ro.observe(grid);
  setTimeout(syncOverlay,200);
}
boot();
})();
