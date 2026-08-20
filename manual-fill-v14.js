(() => {
'use strict';
const $=id=>document.getElementById(id);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const mean=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:0;
function srgb(v){v/=255;return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4)}
function lab(a){const r=srgb(a[0]),g=srgb(a[1]),b=srgb(a[2]),x=(.4124*r+.3576*g+.1805*b)/.95047,y=.2126*r+.7152*g+.0722*b,z=(.0193*r+.1192*g+.9505*b)/1.08883,f=t=>t>.008856?Math.cbrt(t):7.787*t+16/116,fx=f(x),fy=f(y),fz=f(z);return[116*fy-16,500*(fx-fy),200*(fy-fz)]}
function de(a,b){const A=lab(a),B=lab(b);return Math.hypot(A[0]-B[0],A[1]-B[1],A[2]-B[2])}
function toast(t){const e=$('toast');if(!e)return;e.textContent=t;e.classList.remove('hidden');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.add('hidden'),1900)}
function setVersion(){document.title='拼豆定位器 · V15';const b=$('pindouVersionBadge');if(b)b.textContent='V15 · 点一颗补整色（直连）'}
function dominant(data,W,H,x,y,w,h){
  const x0=Math.max(0,Math.floor(x+w*.2)),x1=Math.min(W,Math.ceil(x+w*.8)),y0=Math.max(0,Math.floor(y+h*.2)),y1=Math.min(H,Math.ceil(y+h*.8));
  const step=Math.max(1,Math.floor(Math.min(w,h)/16)),bins=new Map(),px=[];
  for(let yy=y0;yy<y1;yy+=step)for(let xx=x0;xx<x1;xx+=step){const i=(yy*W+xx)*4,p=[data[i],data[i+1],data[i+2]],k=`${Math.round(p[0]/6)*6},${Math.round(p[1]/6)*6},${Math.round(p[2]/6)*6}`;px.push(p);bins.set(k,(bins.get(k)||0)+1)}
  let key='255,255,255',bn=-1;for(const[k,n]of bins)if(n>bn){bn=n;key=k}
  const base=key.split(',').map(Number),near=px.filter(p=>Math.hypot(p[0]-base[0],p[1]-base[1],p[2]-base[2])<22),src=near.length?near:px;
  return [0,1,2].map(j=>Math.round(mean(src.map(p=>p[j]))));
}
function boot(){
  setVersion();
  const panel=$('manualFillV14'),grid=$('gridCanvas'),scroller=$('gridScroller'),src=$('sourceCanvas');
  const modeBtn=$('mf14Mode'),info=$('mf14Info'),code=$('mf14Code'),tol=$('mf14Tol'),tolVal=$('mf14TolVal');
  const edit=$('editCodeInput'),save=$('saveCodeBtn');
  if(!panel||!grid||!scroller||!src||!modeBtn||!info||!edit||!save)return;
  const colors=window.PINDOU_MARD_COLORS||[],valid=new Set(colors.map(x=>x[0]));
  let mode=false,selected=-1,candidates=[],undo=[],rawCache=null;

  scroller.style.position='relative';
  let overlay=$('mf15Overlay');
  if(!overlay){overlay=document.createElement('canvas');overlay.id='mf15Overlay';overlay.style.cssText='position:absolute;left:0;top:0;z-index:50;display:none;touch-action:none;pointer-events:auto;';scroller.appendChild(overlay)}

  function dims(){const cols=parseInt($('colsInput')?.value,10)||0,rows=parseInt($('rowsInput')?.value,10)||0;return{cols,rows}}
  function ready(){const {cols,rows}=dims();return cols>0&&rows>0&&grid.width>2&&grid.height>2&&!$('workSection')?.classList.contains('hidden')}
  function cropRect(){
    const l=(+$('leftCrop')?.value||0)/100,r=(+$('rightCrop')?.value||100)/100,t=(+$('topCrop')?.value||0)/100,b=(+$('bottomCrop')?.value||100)/100;
    return{x:src.width*clamp(l,0,.99),y:src.height*clamp(t,0,.99),w:src.width*clamp(r-l,.01,1),h:src.height*clamp(b-t,.01,1)};
  }
  function rawCells(){
    const {cols,rows}=dims();if(!cols||!rows||!src.width)return[];const cr=cropRect();
    const key=[src.width,src.height,cols,rows,cr.x.toFixed(1),cr.y.toFixed(1),cr.w.toFixed(1),cr.h.toFixed(1)].join(':');
    if(rawCache?.key===key)return rawCache.cells;
    const X=src.getContext('2d',{willReadFrequently:true}),d=X.getImageData(0,0,src.width,src.height).data,out=[];
    for(let rr=0;rr<rows;rr++)for(let cc=0;cc<cols;cc++){const x=cr.x+cc*cr.w/cols,y=cr.y+rr*cr.h/rows,w=cr.w/cols,h=cr.h/rows;out.push({r:rr,c:cc,rgb:dominant(d,src.width,src.height,x,y,w,h)})}
    rawCache={key,cells:out};return out;
  }
  function syncOverlay(){
    overlay.width=grid.width;overlay.height=grid.height;overlay.style.width=grid.width+'px';overlay.style.height=grid.height+'px';overlay.style.display=(mode&&ready())?'block':'none';paint();
  }
  function getCandidates(){
    if(selected<0||!ready())return[];const raw=rawCells(),base=raw[selected];if(!base)return[];const limit=+tol.value||4;
    return raw.map((q,i)=>({i,q,d:de(base.rgb,q.rgb)})).filter(x=>x.d<=limit).sort((a,b)=>a.d-b.d);
  }
  function paint(){
    const X=overlay.getContext('2d');X.clearRect(0,0,overlay.width,overlay.height);if(!mode||!ready())return;const {cols,rows}=dims(),cw=(grid.width-1)/cols,ch=(grid.height-1)/rows;
    X.fillStyle='rgba(255,111,77,.16)';X.strokeStyle='#ff6f4d';X.lineWidth=2;
    for(const x of candidates){const c=x.i%cols,r=Math.floor(x.i/cols);X.fillRect(c*cw+2,r*ch+2,cw-4,ch-4);X.strokeRect(c*cw+2,r*ch+2,cw-4,ch-4)}
    if(selected>=0){const c=selected%cols,r=Math.floor(selected/cols);X.strokeStyle='#1677ff';X.lineWidth=4;X.strokeRect(c*cw+2,r*ch+2,cw-4,ch-4)}
  }
  function update(){
    if(!ready()){info.innerHTML='<b>还没完成自动识别。</b> 识别完成后这里会自动连上当前工作图。';candidates=[];paint();return}
    if(selected<0){info.innerHTML='<b>已连接当前工作图。</b> 点“开始选一颗参考豆”，再直接点下面工作图中的一格。';candidates=[];paint();return}
    candidates=getCandidates();const {cols}=dims(),r=Math.floor(selected/cols),c=selected%cols;
    info.innerHTML=`参考豆：<b>第 ${r+1} 行 / 第 ${c+1} 列</b><br>按原始上传图的真实底色找到 <b>${candidates.length}</b> 个候选格。拖动“严格/宽松”可以增减候选。`;
    paint();
  }
  function dispatchGridClick(index){
    const {cols,rows}=dims(),rect=grid.getBoundingClientRect(),c=index%cols,r=Math.floor(index/cols),cw=rect.width/cols,ch=rect.height/rows;
    const ev=new MouseEvent('click',{bubbles:true,cancelable:true,view:window,clientX:rect.left+(c+.5)*cw,clientY:rect.top+(r+.5)*ch});grid.dispatchEvent(ev);
  }
  function selectForEdit(index){
    dispatchGridClick(index);
    const old=String(edit.value||'').trim().toUpperCase();
    if(old)dispatchGridClick(index); // existing coded cell: second click cancels the app's done-toggle side effect
    return old;
  }
  function writeCode(index,newCode){
    const old=selectForEdit(index);edit.value=newCode;save.click();return old;
  }
  function apply(all){
    if(!ready())return toast('先完成一次自动识别');if(selected<0)return toast('先点一颗参考豆');
    const k=String(code.value||'').trim().toUpperCase();if(!valid.has(k))return toast('请输入有效 MARD 色号');
    candidates=getCandidates();if(!candidates.length)return toast('没有找到同底色候选');
    const changed=[];
    for(const x of candidates){
      const old=selectForEdit(x.i);
      if(!all&&old){continue}
      edit.value=k;save.click();changed.push({i:x.i,old});
    }
    if(!changed.length)return toast(all?'没有需要修改的格子':'这些同色格目前都有编号');
    undo=changed;$('mf14Undo').disabled=false;update();syncOverlay();toast(`${all?'已统一':'已补上'} ${changed.length} 格 → ${k}`);
  }
  function undoLast(){
    if(!undo.length)return;
    for(const u of undo){selectForEdit(u.i);edit.value=u.old||'';save.click()}
    undo=[];$('mf14Undo').disabled=true;update();syncOverlay();toast('已撤销上一次补色');
  }

  modeBtn.addEventListener('click',()=>{
    if(!ready())return toast('先完成一次自动识别');mode=!mode;modeBtn.classList.toggle('on',mode);modeBtn.textContent=mode?'✅ 现在点下面工作图中的一颗参考豆':'开始选一颗参考豆';syncOverlay();if(mode)toast('现在直接点工作图中的一颗参考豆');
  });
  overlay.addEventListener('click',e=>{
    if(!mode||!ready())return;const {cols,rows}=dims(),r=overlay.getBoundingClientRect(),px=(e.clientX-r.left)*overlay.width/r.width,py=(e.clientY-r.top)*overlay.height/r.height,cw=overlay.width/cols,ch=overlay.height/rows,c=Math.floor(px/cw),rr=Math.floor(py/ch);if(c<0||rr<0||c>=cols||rr>=rows)return;selected=rr*cols+c;candidates=getCandidates();update();toast('参考豆已选中，输入正确色号后补整色');
  });
  tol.addEventListener('input',()=>{tolVal.textContent=(+tol.value).toFixed(1);update()});
  code.addEventListener('input',()=>{code.value=code.value.toUpperCase()});
  $('mf14Preview').addEventListener('click',update);
  $('mf14Missing').addEventListener('click',()=>apply(false));
  $('mf14All').addEventListener('click',()=>apply(true));
  $('mf14Undo').addEventListener('click',undoLast);
  $('zoomRange')?.addEventListener('input',()=>setTimeout(syncOverlay,0));
  ['leftCrop','rightCrop','topCrop','bottomCrop','colsInput','rowsInput'].forEach(id=>$(id)?.addEventListener('input',()=>{rawCache=null;selected=-1;update()}));
  if(window.ResizeObserver)new ResizeObserver(syncOverlay).observe(grid);
  new MutationObserver(()=>setTimeout(()=>{rawCache=null;update();syncOverlay()},60)).observe($('workSection'),{attributes:true,attributeFilter:['class']});
  info.innerHTML='<b>V15 直连模式已加载。</b> 它直接使用现有工作图的“点格子 + 保存编号”接口，不再依赖另一套识别器状态。';
  update();syncOverlay();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();