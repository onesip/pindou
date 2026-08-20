// V13 loader + built-in manual same-color fill helper.
(() => {
  'use strict';
  const APP_VERSION='V13';
  const $=id=>document.getElementById(id);
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const hex=rgb=>'#'+rgb.map(v=>clamp(Math.round(v),0,255).toString(16).padStart(2,'0')).join('');
  const mean=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:0;
  function srgb(v){v/=255;return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4)}
  function lab(a){const r=srgb(a[0]),g=srgb(a[1]),b=srgb(a[2]),x=(.4124*r+.3576*g+.1805*b)/.95047,y=.2126*r+.7152*g+.0722*b,z=(.0193*r+.1192*g+.9505*b)/1.08883,f=t=>t>.008856?Math.cbrt(t):7.787*t+16/116,fx=f(x),fy=f(y),fz=f(z);return[116*fy-16,500*(fx-fy),200*(fy-fz)]}
  function de(a,b){const A=lab(a),B=lab(b);return Math.hypot(A[0]-B[0],A[1]-B[1],A[2]-B[2])}
  function showVersion(){
    document.title='拼豆定位器 · V13';
    let badge=$('pindouVersionBadge');
    if(!badge){const host=document.querySelector('.topbar > div');if(!host)return;badge=document.createElement('div');badge.id='pindouVersionBadge';host.appendChild(badge)}
    badge.textContent=`${APP_VERSION} · 点一颗补整色`;
    badge.style.cssText='display:inline-flex;align-items:center;margin-top:6px;padding:4px 9px;border-radius:999px;background:#191714;color:#fff;font-size:11px;font-weight:800;letter-spacing:.03em;line-height:1.2;';
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',showVersion,{once:true});else showVersion();

  const s=document.createElement('script');
  s.src='./recognition-v11.js?v=13';
  s.onload=()=>bootManualFill();
  document.head.appendChild(s);

  async function bootManualFill(){
    for(let i=0;i<160&&!window.__pindouV11;i++)await new Promise(r=>setTimeout(r,50));
    const S=window.__pindouV11;
    const grid=$('gridCanvas'),scroller=$('gridScroller'),work=$('workSection');
    if(!S||!grid||!scroller||!work)return;
    if($('manualFillV13'))return;
    const COLORS=window.PINDOU_MARD_COLORS||[];
    const VALID=new Set(COLORS.map(x=>x[0]));

    const style=document.createElement('style');
    style.textContent=`
      .mf13{margin:12px 0 14px;padding:12px;border:2px solid #191714;border-radius:16px;background:#fffaf4}
      .mf13 h3{margin:0 0 5px;font-size:15px}.mf13 p{margin:0 0 10px;color:#716b65;font-size:11px;line-height:1.5}
      .mf13-main{width:100%;min-height:46px;font-weight:900}.mf13-main.on{background:#ff6f4d;color:#fff;border-color:#ff6f4d}
      .mf13-status{margin:9px 0;padding:9px 10px;border-radius:12px;background:#fff;border:1px solid #eadfd5;font-size:11px;line-height:1.55}
      .mf13-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px;align-items:center}.mf13-row input{min-width:0;height:44px;border:1px solid #dfd7cf;border-radius:11px;padding:0 10px;font-size:17px;text-transform:uppercase;background:#fff}
      .mf13-range{display:grid;grid-template-columns:auto 1fr auto;gap:8px;align-items:center;margin:10px 0;font-size:11px;color:#716b65}.mf13-range input{width:100%}
      .mf13-actions{display:grid;grid-template-columns:1fr 1fr;gap:7px}.mf13-actions button{min-height:44px;padding:7px;font-size:11px}.mf13-undo{width:100%;margin-top:7px}
      .mf13-overlay{position:absolute;left:0;top:0;z-index:30;display:none;touch-action:none}.mf13-overlay.on{display:block}
      @media(max-width:430px){.mf13-actions{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);

    const box=document.createElement('div');
    box.id='manualFillV13';box.className='mf13';
    box.innerHTML=`
      <h3>🎯 漏色？点一颗豆子补整色</h3>
      <p>自动识别后开启这个模式，点工作图里任意一颗参考豆 → 输入正确色号 → 一键把原图中同底色的格子全部补上。</p>
      <button id="mf13Mode" class="secondary mf13-main" type="button">开始选一颗参考豆</button>
      <div id="mf13Status" class="mf13-status">还没选参考豆。</div>
      <div class="mf13-row"><input id="mf13Code" maxlength="4" placeholder="色号，例如 E9 / A4 / D24" list="mf13Codes"><button id="mf13Preview" class="secondary" type="button">预览同色</button></div>
      <datalist id="mf13Codes">${COLORS.map(x=>`<option value="${x[0]}"></option>`).join('')}</datalist>
      <div class="mf13-range"><span>严格</span><input id="mf13Tol" type="range" min="1.5" max="14" step="0.5" value="4"><b id="mf13TolVal">4.0</b></div>
      <div class="mf13-actions"><button id="mf13Missing" class="secondary" type="button">只补目前空白/漏掉的</button><button id="mf13All" class="primary" type="button">一键全部标成这个色号</button></div>
      <button id="mf13Undo" class="ghost mf13-undo" type="button" disabled>撤销上一次补色</button>
    `;
    const zoom=work.querySelector('.zoom-row');
    if(zoom)work.insertBefore(box,zoom);else work.appendChild(box);

    scroller.style.position='relative';
    const overlay=document.createElement('canvas');overlay.className='mf13-overlay';scroller.appendChild(overlay);
    let mode=false,selected=null,candidates=[],undo=null,rawCache=null;

    function cropRect(){
      const src=$('sourceCanvas'),o=$('cropOverlay');
      let x=parseFloat(o?.style.left),y=parseFloat(o?.style.top),w=parseFloat(o?.style.width),h=parseFloat(o?.style.height);
      if(!src?.width)return null;
      if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(w)||!Number.isFinite(h)||w<2||h<2){x=0;y=0;w=src.width;h=src.height}
      return{x:clamp(x,0,src.width-1),y:clamp(y,0,src.height-1),w:clamp(w,1,src.width-x),h:clamp(h,1,src.height-y)};
    }
    function dominant(data,W,H,x,y,w,h){
      const x0=Math.max(0,Math.floor(x+w*.2)),x1=Math.min(W,Math.ceil(x+w*.8)),y0=Math.max(0,Math.floor(y+h*.2)),y1=Math.min(H,Math.ceil(y+h*.8));
      const step=Math.max(1,Math.floor(Math.min(w,h)/16)),bins=new Map(),px=[];
      for(let yy=y0;yy<y1;yy+=step)for(let xx=x0;xx<x1;xx+=step){const i=(yy*W+xx)*4,p=[data[i],data[i+1],data[i+2]],k=`${Math.round(p[0]/6)*6},${Math.round(p[1]/6)*6},${Math.round(p[2]/6)*6}`;px.push(p);bins.set(k,(bins.get(k)||0)+1)}
      let key='255,255,255',bn=-1;for(const[k,n]of bins)if(n>bn){bn=n;key=k}
      const base=key.split(',').map(Number),near=px.filter(p=>Math.hypot(p[0]-base[0],p[1]-base[1],p[2]-base[2])<22),src=near.length?near:px;
      return [0,1,2].map(j=>Math.round(mean(src.map(p=>p[j]))));
    }
    function rawCells(){
      const src=$('sourceCanvas'),r=cropRect();if(!src?.width||!r||!S.rows||!S.cols)return[];
      const key=[src.width,src.height,S.rows,S.cols,r.x.toFixed(1),r.y.toFixed(1),r.w.toFixed(1),r.h.toFixed(1)].join(':');
      if(rawCache?.key===key)return rawCache.cells;
      const X=src.getContext('2d',{willReadFrequently:true}),d=X.getImageData(0,0,src.width,src.height).data,out=[];
      for(let rr=0;rr<S.rows;rr++)for(let cc=0;cc<S.cols;cc++){const x=r.x+cc*r.w/S.cols,y=r.y+rr*r.h/S.rows,w=r.w/S.cols,h=r.h/S.rows;out.push({r:rr,c:cc,rgb:dominant(d,src.width,src.height,x,y,w,h)})}
      rawCache={key,cells:out};return out;
    }
    function syncOverlay(){overlay.width=grid.width;overlay.height=grid.height;overlay.style.width=grid.width+'px';overlay.style.height=grid.height+'px';overlay.classList.toggle('on',mode&&S.active);paint()}
    function getCandidates(){
      if(!selected||!S.active)return[];const raw=rawCells(),base=raw[selected.r*S.cols+selected.c];if(!base)return[];const tol=parseFloat($('mf13Tol').value)||4,out=[];
      for(let i=0;i<raw.length;i++){const dist=de(base.rgb,raw[i].rgb);if(dist<=tol)out.push({i,dist,raw:raw[i],cell:S.cells[i]})}
      return out.sort((a,b)=>a.dist-b.dist);
    }
    function paint(){
      const X=overlay.getContext('2d');X.clearRect(0,0,overlay.width,overlay.height);if(!mode||!S.active)return;const size=+$('zoomRange').value||34;
      X.fillStyle='rgba(255,111,77,.16)';X.strokeStyle='#ff6f4d';X.lineWidth=2;
      for(const q of candidates){const x=q.cell.c*size,y=q.cell.r*size;X.fillRect(x+2,y+2,size-4,size-4);X.strokeRect(x+2,y+2,size-4,size-4)}
      if(selected){X.strokeStyle='#1677ff';X.lineWidth=4;X.strokeRect(selected.c*size+2,selected.r*size+2,size-4,size-4)}
    }
    function update(){
      candidates=getCandidates();const st=$('mf13Status');
      if(!selected){st.textContent='还没选参考豆。';paint();return}
      const s0=S.cells[selected.r*S.cols+selected.c],miss=candidates.filter(q=>!q.cell.code).length;
      st.innerHTML=`参考：<b>第 ${selected.r+1} 行 / 第 ${selected.c+1} 列</b> · 当前 <b>${s0?.code||'未识别'}</b><br>找到 <b>${candidates.length}</b> 个同底色候选，其中 <b>${miss}</b> 个目前未识别。`;
      if(s0?.code&&!$('mf13Code').value)$('mf13Code').value=s0.code;paint();
    }
    function refreshGrid(){S.selectedCode=null;$('showAllBtn')?.click();setTimeout(syncOverlay,0)}
    function apply(all){
      if(!selected)return toast('先点一颗参考豆');const k=String($('mf13Code').value||'').trim().toUpperCase();if(!VALID.has(k))return toast('请输入有效 MARD 色号');
      candidates=getCandidates();const targets=candidates.filter(q=>all||!q.cell.code);if(!targets.length)return toast('没有需要补的格子');
      undo=targets.map(q=>({i:q.i,code:q.cell.code,rgb:[...q.cell.rgb],hex:q.cell.hex,occupied:q.cell.occupied,confidence:q.cell.confidence}));
      for(const q of targets){q.cell.code=k;q.cell.rgb=[...q.raw.rgb];q.cell.hex=hex(q.raw.rgb);q.cell.occupied=true;q.cell.confidence='manual-v13'}
      $('mf13Undo').disabled=false;refreshGrid();update();toast(`已补 ${targets.length} 格 → ${k}`);
    }
    function undoLast(){if(!undo?.length)return;for(const u of undo){const c=S.cells[u.i];if(!c)continue;c.code=u.code;c.rgb=[...u.rgb];c.hex=u.hex;c.occupied=u.occupied;c.confidence=u.confidence}undo=null;$('mf13Undo').disabled=true;refreshGrid();update();toast('已撤销')}
    function toast(t){const e=$('toast');if(!e)return;e.textContent=t;e.classList.remove('hidden');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.add('hidden'),1800)}
    function setMode(on){mode=on;$('mf13Mode').classList.toggle('on',on);$('mf13Mode').textContent=on?'✅ 现在点工作图里的一颗参考豆':'开始选一颗参考豆';syncOverlay();if(on)toast('点工作图里的一颗参考豆')}

    overlay.addEventListener('click',e=>{if(!mode||!S.active)return;const r=overlay.getBoundingClientRect(),px=(e.clientX-r.left)*overlay.width/r.width,py=(e.clientY-r.top)*overlay.height/r.height,size=+$('zoomRange').value||34,c=Math.floor(px/size),rr=Math.floor(py/size);if(c<0||rr<0||c>=S.cols||rr>=S.rows)return;selected={r:rr,c};const cell=S.cells[rr*S.cols+c];$('mf13Code').value=cell?.code||'';update()});
    $('mf13Mode').addEventListener('click',()=>setMode(!mode));
    $('mf13Preview').addEventListener('click',update);
    $('mf13Tol').addEventListener('input',()=>{$('mf13TolVal').textContent=(+$('mf13Tol').value).toFixed(1);update()});
    $('mf13Code').addEventListener('input',()=>{$('mf13Code').value=$('mf13Code').value.toUpperCase()});
    $('mf13Missing').addEventListener('click',()=>apply(false));
    $('mf13All').addEventListener('click',()=>apply(true));
    $('mf13Undo').addEventListener('click',undoLast);
    $('zoomRange')?.addEventListener('input',()=>setTimeout(syncOverlay,0));
    new ResizeObserver(()=>syncOverlay()).observe(grid);
    new MutationObserver(()=>{if(S.active&&!work.classList.contains('hidden')){rawCache=null;setTimeout(syncOverlay,40)}}).observe(work,{attributes:true,attributeFilter:['class']});
    setTimeout(syncOverlay,150);
  }
})();
