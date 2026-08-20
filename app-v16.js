(() => {
'use strict';
const VERSION='V16';
const $=id=>document.getElementById(id);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const mean=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:0;
const median=a=>{if(!a.length)return 0;const b=[...a].sort((x,y)=>x-y),m=b.length>>1;return b.length%2?b[m]:(b[m-1]+b[m])/2};
const lum=x=>.2126*x[0]+.7152*x[1]+.0722*x[2];
const sat=x=>{const hi=Math.max(...x),lo=Math.min(...x);return hi?(hi-lo)/hi:0};
const rgbHex=x=>'#'+x.map(v=>clamp(Math.round(v),0,255).toString(16).padStart(2,'0')).join('');
function srgb(v){v/=255;return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4)}
function lab(a){const r=srgb(a[0]),g=srgb(a[1]),b=srgb(a[2]),x=(.4124*r+.3576*g+.1805*b)/.95047,y=.2126*r+.7152*g+.0722*b,z=(.0193*r+.1192*g+.9505*b)/1.08883,f=t=>t>.008856?Math.cbrt(t):7.787*t+16/116,fx=f(x),fy=f(y),fz=f(z);return[116*fy-16,500*(fx-fy),200*(fy-fz)]}
function de(a,b){const A=lab(a),B=lab(b);return Math.hypot(A[0]-B[0],A[1]-B[1],A[2]-B[2])}

const S={rows:0,cols:0,cells:[],done:new Set(),selectedCode:null,selectedCell:-1,active:false,busy:false,worker:null,clusters:[],legend:{codes:new Set(),counts:new Map()},imageName:'',savedAt:0,undo:null};
window.PindouV16=S;
const COLORS=window.PINDOU_MARD_COLORS||[];
const MARD=new Map(COLORS.map(x=>[x[0],[x[1],x[2],x[3]]]));
const VALID=new Set(MARD.keys());

function showVersion(){
  document.title=`拼豆定位器 · ${VERSION}`;
  let b=$('pindouVersionBadge');
  if(!b){const host=document.querySelector('.topbar > div');if(host){b=document.createElement('div');b.id='pindouVersionBadge';host.appendChild(b)}}
  if(b){b.textContent='V16 · 精准补漏 + 本地保存';b.style.cssText='display:inline-flex;align-items:center;margin-top:6px;padding:4px 9px;border-radius:999px;background:#191714;color:#fff;font-size:11px;font-weight:800;letter-spacing:.03em;line-height:1.2;'}
}
function toast(t){const e=$('toast');if(!e)return;e.textContent=t;e.classList.remove('hidden');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.add('hidden'),2000)}
function notice(t,k='ok'){const e=$('detectNotice');if(!e)return;e.textContent=t;e.className=`notice ${k}`;e.classList.remove('hidden')}
function progress(t,p){const b=$('progressBox');if(!b)return;b.classList.remove('hidden');$('progressText').textContent=t;$('progressPct').textContent=`${Math.round(p)}%`;$('progressBar').style.width=`${clamp(p,0,100)}%`}
function hideProgress(){$('progressBox')?.classList.add('hidden')}
function norm(raw){let s=String(raw||'').toUpperCase().replace(/[^A-Z0-9]/g,'');if(VALID.has(s))return s;const m=s.match(/^([A-Z]{1,2})([0-9OILSZGB]{1,3})$/);if(!m)return'';s=m[1]+m[2].replace(/O/g,'0').replace(/[IL]/g,'1').replace(/Z/g,'2').replace(/S/g,'5').replace(/G/g,'6').replace(/B/g,'8');return VALID.has(s)?s:''}

function cropRect(){
  const c=$('sourceCanvas'),o=$('cropOverlay');if(!c?.width)return null;
  let x=parseFloat(o?.style.left),y=parseFloat(o?.style.top),w=parseFloat(o?.style.width),h=parseFloat(o?.style.height);
  if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(w)||!Number.isFinite(h)||w<2||h<2){x=0;y=0;w=c.width;h=c.height}
  return{x:clamp(x,0,c.width-1),y:clamp(y,0,c.height-1),w:clamp(w,1,c.width-x),h:clamp(h,1,c.height-y)};
}
function cropCanvas(){const src=$('sourceCanvas'),r=cropRect();if(!src||!r)return null;const c=document.createElement('canvas');c.width=Math.max(1,Math.round(r.w));c.height=Math.max(1,Math.round(r.h));c.getContext('2d',{willReadFrequently:true}).drawImage(src,r.x,r.y,r.w,r.h,0,0,c.width,c.height);return c}
function dominant(data,W,H,x,y,w,h){
  const x0=Math.max(0,Math.floor(x+w*.16)),x1=Math.min(W,Math.ceil(x+w*.84)),y0=Math.max(0,Math.floor(y+h*.16)),y1=Math.min(H,Math.ceil(y+h*.84));
  const step=Math.max(1,Math.floor(Math.min(w,h)/18)),bins=new Map(),px=[];
  for(let yy=y0;yy<y1;yy+=step)for(let xx=x0;xx<x1;xx+=step){const i=(yy*W+xx)*4,p=[data[i],data[i+1],data[i+2]],k=`${Math.round(p[0]/5)*5},${Math.round(p[1]/5)*5},${Math.round(p[2]/5)*5}`;px.push(p);bins.set(k,(bins.get(k)||0)+1)}
  let key='255,255,255',bn=-1;for(const[k,n]of bins)if(n>bn){bn=n;key=k}
  const base=key.split(',').map(Number),near=px.filter(p=>Math.hypot(p[0]-base[0],p[1]-base[1],p[2]-base[2])<20),src=near.length?near:px;
  const rgb=[0,1,2].map(j=>Math.round(mean(src.map(p=>p[j]))));
  let ink=0;for(const p of px){const d=Math.hypot(p[0]-rgb[0],p[1]-rgb[1],p[2]-rgb[2]),ld=Math.abs(lum(p)-lum(rgb));if(d>27&&(ld>10||d>50))ink++}
  return{rgb,ink:ink/Math.max(1,px.length),support:bn/Math.max(1,px.length)};
}
function buildCells(c,rows,cols){
  const X=c.getContext('2d',{willReadFrequently:true}),W=c.width,H=c.height,d=X.getImageData(0,0,W,H).data,out=[];
  for(let r=0;r<rows;r++)for(let col=0;col<cols;col++){const x=col*W/cols,y=r*H/rows,w=W/cols,h=H/rows,z=dominant(d,W,H,x,y,w,h);out.push({r,c:col,x,y,w,h,rgb:z.rgb,ink:z.ink,support:z.support,occupied:true,code:'',confidence:'none',cluster:-1,suggestions:[]})}
  const neutral=out.filter(s=>sat(s.rgb)<.075&&lum(s.rgb)>198&&s.ink<.055);
  const bg=[];
  for(const s of neutral){let q=bg.find(q=>de(q.rgb,s.rgb)<3.2);if(q){q.n++;q.rgb=q.rgb.map((v,j)=>(v*(q.n-1)+s.rgb[j])/q.n)}else bg.push({rgb:[...s.rgb],n:1})}
  bg.sort((a,b)=>b.n-a.n);const refs=bg.slice(0,3).map(x=>x.rgb);
  for(const s of out){const bgLike=refs.some(r=>de(s.rgb,r)<5.5);s.occupied=!(bgLike&&s.ink<.025)}
  return out;
}
function makeClusters(cells){
  const qs=[];
  for(const s of cells){if(!s.occupied)continue;let bi=-1,bd=1e9;for(let i=0;i<qs.length;i++){const d=de(s.rgb,qs[i].rgb);if(d<bd){bd=d;bi=i}}if(bi>=0&&bd<3.0){const q=qs[bi],n=q.cells.length;q.cells.push(s);q.rgb=q.rgb.map((v,j)=>(v*n+s.rgb[j])/(n+1));s.cluster=bi}else{s.cluster=qs.length;qs.push({rgb:[...s.rgb],cells:[s],votes:new Map(),code:'',confidence:'none',suggestions:[]})}}
  return qs;
}

async function getWorker(){
  if(S.worker)return S.worker;
  if(!window.Tesseract)throw new Error('OCR 组件没有加载，请联网刷新页面');
  S.worker=await Tesseract.createWorker('eng',1,{logger:m=>{if(S.busy&&m.status==='recognizing text')progress('正在读取格内色号…',20+(m.progress||0)*55)}});
  await S.worker.setParameters({tessedit_char_whitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789()[]',preserve_interword_spaces:'0'});
  return S.worker;
}
function tile(c,s,binary=true){
  const TW=132,TH=84,t=document.createElement('canvas');t.width=TW;t.height=TH;const T=t.getContext('2d',{willReadFrequently:true});T.fillStyle='#fff';T.fillRect(0,0,TW,TH);
  const sx=s.x+s.w*.06,sy=s.y+s.h*.06,sw=s.w*.88,sh=s.h*.88,raw=document.createElement('canvas');raw.width=Math.max(2,Math.round(sw));raw.height=Math.max(2,Math.round(sh));const R=raw.getContext('2d',{willReadFrequently:true});R.drawImage(c,sx,sy,sw,sh,0,0,raw.width,raw.height);
  if(binary){const im=R.getImageData(0,0,raw.width,raw.height),d=im.data,B=s.rgb,L=lum(B);for(let i=0;i<d.length;i+=4){const p=[d[i],d[i+1],d[i+2]],dist=Math.hypot(p[0]-B[0],p[1]-B[1],p[2]-B[2]),ld=Math.abs(lum(p)-L),isInk=dist>24&&(ld>7||dist>52),v=isInk?0:255;d[i]=d[i+1]=d[i+2]=v;d[i+3]=255}R.putImageData(im,0,0)}
  T.imageSmoothingEnabled=false;const sc=Math.min(120/raw.width,72/raw.height),dw=Math.max(1,Math.round(raw.width*sc)),dh=Math.max(1,Math.round(raw.height*sc));T.drawImage(raw,0,0,raw.width,raw.height,(TW-dw)/2,(TH-dh)/2,dw,dh);return t;
}
function reps(q){const a=[...q.cells].sort((x,y)=>(y.ink-x.ink)||(y.support-x.support));if(a.length<=4)return a;return[a[0],a[Math.floor(a.length*.25)],a[Math.floor(a.length*.55)],a[a.length-1]]}
function makeSheet(c,items,binary){const TW=132,TH=84,NC=6,sh=document.createElement('canvas');sh.width=NC*TW;sh.height=Math.max(TH,Math.ceil(items.length/NC)*TH);const X=sh.getContext('2d');X.fillStyle='#fff';X.fillRect(0,0,sh.width,sh.height);items.forEach((it,i)=>X.drawImage(tile(c,it.s,binary),(i%NC)*TW,Math.floor(i/NC)*TH));return{sh,TW,TH,NC}}
async function ocrClusterReps(w,c,qs,legend){
  const items=[];qs.forEach((q,qi)=>reps(q).forEach(s=>items.push({q,qi,s})));
  let hits=0;
  for(const binary of [true,false]){const{sh,TW,TH,NC}=makeSheet(c,items,binary);for(const psm of ['6','11']){try{await w.setParameters({tessedit_pageseg_mode:psm,tessedit_char_whitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'});const z=await w.recognize(sh);for(const word of z.data?.words||[]){const k=norm(word.text);if(!k||!word.bbox)continue;const cx=(word.bbox.x0+word.bbox.x1)/2,cy=(word.bbox.y0+word.bbox.y1)/2,idx=Math.floor(cy/TH)*NC+Math.floor(cx/TW),it=items[idx];if(!it)continue;const wt=legend.codes.has(k)?2:1;it.q.votes.set(k,(it.q.votes.get(k)||0)+wt);it.s.direct=(it.s.direct||new Map());it.s.direct.set(k,(it.s.direct.get(k)||0)+wt);hits++}}catch(_){}}}
  return hits;
}
function parseLegendText(text){const codes=new Set(),counts=new Map(),s=String(text||'').toUpperCase();for(const m of s.matchAll(/(?:ZG|[A-Z]{1,2})\s*[0-9OILSZGB]{1,3}/g)){const k=norm(m[0]);if(k)codes.add(k)}for(const m of s.replace(/\n/g,' ').matchAll(/((?:ZG|[A-Z]{1,2})\s*[0-9OILSZGB]{1,3})\s*[\(\[]?\s*(\d{1,4})\s*[\)\]]?/g)){const k=norm(m[1]),n=parseInt(m[2],10);if(k&&n>0&&n<10000){codes.add(k);counts.set(k,n)}}return{codes,counts}}
function region(src,x,y,w,h,max=2600){if(w<18||h<18)return null;const sc=Math.min(4,max/Math.max(w,h)),c=document.createElement('canvas');c.width=Math.max(1,Math.round(w*sc));c.height=Math.max(1,Math.round(h*sc));c.getContext('2d').drawImage(src,x,y,w,h,0,0,c.width,c.height);return c}
async function readLegend(w){
  const src=$('sourceCanvas'),r=cropRect(),regs=[];if(!src||!r)return{codes:new Set(),counts:new Map()};
  const bottom=src.height-r.y-r.h,right=src.width-r.x-r.w,top=r.y,left=r.x;
  if(bottom>24)regs.push(region(src,0,r.y+r.h,src.width,bottom));if(right>24)regs.push(region(src,r.x+r.w,0,right,src.height));if(top>24)regs.push(region(src,0,0,src.width,top));if(left>24)regs.push(region(src,0,0,left,src.height));
  const codes=new Set(),counts=new Map();for(const c of regs.filter(Boolean)){for(const psm of ['6','11']){try{await w.setParameters({tessedit_pageseg_mode:psm,tessedit_char_whitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789()[]'});const z=await w.recognize(c),p=parseLegendText(z.data?.text);for(const k of p.codes)codes.add(k);for(const[k,n]of p.counts)counts.set(k,n)}catch(_){}}}
  return{codes,counts};
}
function topVotes(m){const a=[...m].sort((x,y)=>y[1]-x[1]);return{one:a[0]||['',0],two:a[1]||['',0]}}
function calibrate(qs){const ds=[[],[],[]];for(const q of qs){if(!q.code)continue;const o=MARD.get(q.code);if(!o)continue;for(let j=0;j<3;j++)ds[j].push(q.rgb[j]-o[j])}return ds.map(x=>clamp(median(x),-45,45))}
function nearest(rgb,off,legend,count){
  const scored=[];for(const[k,o]of MARD){const ref=o.map((v,j)=>clamp(v+off[j],0,255)),d=de(rgb,ref);let score=d;if(legend.codes.has(k))score-=2.2;const n=legend.counts.get(k);if(n&&count){const rel=Math.abs(n-count)/Math.max(1,n);score+=Math.min(8,rel*10)}scored.push({k,d,score})}scored.sort((a,b)=>a.score-b.score);return scored.slice(0,4)
}
async function resolveAmbiguous(w,c,q){
  const items=q.cells.map(s=>({s})),votes=new Map();for(const binary of [true,false]){for(let st=0;st<items.length;st+=180){const chunk=items.slice(st,st+180),{sh,TW,TH,NC}=makeSheet(c,chunk,binary);for(const psm of ['6','11']){try{await w.setParameters({tessedit_pageseg_mode:psm,tessedit_char_whitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'});const z=await w.recognize(sh);for(const word of z.data?.words||[]){const k=norm(word.text);if(!k||!word.bbox)continue;const idx=Math.floor(((word.bbox.y0+word.bbox.y1)/2)/TH)*NC+Math.floor(((word.bbox.x0+word.bbox.x1)/2)/TW),it=chunk[idx];if(!it)continue;if(!votes.has(it.s))votes.set(it.s,new Map());const m=votes.get(it.s);m.set(k,(m.get(k)||0)+1)}}catch(_){}}}}
  return votes;
}
async function assign(qs,w,c,legend){
  for(const q of qs){const{one,two}=topVotes(q.votes);if(one[0]&&one[1]>=2&&(one[1]>=two[1]+2||one[1]>=4)){q.code=one[0];q.confidence='cluster-ocr'}}
  for(const q of qs){const{one,two}=topVotes(q.votes);if(q.code||!one[0]||!two[0]||two[1]<2||two[1]<one[1]*.55)continue;const per=await resolveAmbiguous(w,c,q);let direct=0;for(const[s,m]of per){const t=topVotes(m);if(t.one[0]&&t.one[1]>=2&&t.one[1]>=t.two[1]+1){s.code=t.one[0];s.confidence='cell-ocr';direct++}}if(direct>=Math.max(2,Math.round(q.cells.length*.25))){q.confidence='split'}}
  let off=calibrate(qs);
  for(const q of qs){if(q.code)continue;const unresolved=q.cells.filter(s=>!s.code);if(!unresolved.length)continue;const cand=nearest(q.rgb,off,legend,q.cells.length);q.suggestions=cand;q.cells.forEach(s=>s.suggestions=cand);const best=cand[0],second=cand[1];const clear=best&&(best.d<12||best.score+2.2<(second?.score??999));if(clear){q.code=best.k;q.confidence=best.d<8?'color-strong':'color-fallback'}}
  off=calibrate(qs);
  for(const q of qs){if(q.code)for(const s of q.cells)if(!s.code){s.code=q.code;s.confidence=q.confidence}}
}

function drawGrid(){
  if(!S.active)return;const size=+$('zoomRange').value||34;$('zoomValue').textContent=size;const c=$('gridCanvas');c.width=S.cols*size+1;c.height=S.rows*size+1;const X=c.getContext('2d');X.clearRect(0,0,c.width,c.height);X.textAlign='center';X.textBaseline='middle';X.font=`${Math.max(8,Math.floor(size*.31))}px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;
  for(let i=0;i<S.cells.length;i++){const s=S.cells[i],x=s.c*size,y=s.r*size,dim=(S.selectedCode==='__UNKNOWN__'?!!s.code:(S.selectedCode&&s.code!==S.selectedCode));X.save();X.globalAlpha=dim?.08:1;if(s.occupied){X.fillStyle=rgbHex(s.rgb);X.fillRect(x,y,size,size);X.fillStyle=lum(s.rgb)<135?'#fff':'#111';X.fillText(s.code||'?',x+size/2,y+size/2)}else{X.fillStyle='#f5f5f2';X.fillRect(x,y,size,size)}X.restore();if(S.done.has(i)&&s.code){X.save();X.strokeStyle='#111';X.lineWidth=Math.max(2,size*.08);X.beginPath();X.moveTo(x+size*.2,y+size*.55);X.lineTo(x+size*.43,y+size*.78);X.lineTo(x+size*.82,y+size*.22);X.stroke();X.restore()}if(i===S.selectedCell){X.save();X.strokeStyle='#1677ff';X.lineWidth=3;X.strokeRect(x+2,y+2,size-4,size-4);X.restore()}}
  X.strokeStyle='rgba(0,0,0,.18)';X.lineWidth=1;for(let x=0;x<=S.cols;x++){X.beginPath();X.moveTo(x*size+.5,0);X.lineTo(x*size+.5,c.height);X.stroke()}for(let y=0;y<=S.rows;y++){X.beginPath();X.moveTo(0,y*size+.5);X.lineTo(c.width,y*size+.5);X.stroke()}X.strokeStyle='#111';X.lineWidth=Math.max(2,size*.07);for(let x=5;x<S.cols;x+=5){X.beginPath();X.moveTo(x*size,0);X.lineTo(x*size,c.height);X.stroke()}for(let y=5;y<S.rows;y+=5){X.beginPath();X.moveTo(0,y*size);X.lineTo(c.width,y*size);X.stroke()}
}
function groups(){const m=new Map();for(const s of S.cells){if(!s.code)continue;if(!m.has(s.code))m.set(s.code,{code:s.code,count:0,rgb:[]});const g=m.get(s.code);g.count++;g.rgb.push(s.rgb)}for(const g of m.values())g.avg=[0,1,2].map(j=>mean(g.rgb.map(x=>x[j])));return[...m.values()].sort((a,b)=>a.code.localeCompare(b.code,undefined,{numeric:true}))}
function renderStats(){const g=groups(),coded=S.cells.filter(s=>s.code).length,unknown=S.cells.filter(s=>s.occupied&&!s.code).length,done=[...S.done].filter(i=>S.cells[i]?.code).length;$('stats').innerHTML=`<div class="stat"><span>网格</span><b>${S.cols}×${S.rows}</b></div><div class="stat"><span>颜色</span><b>${g.length}</b></div><div class="stat"><span>未识别</span><b>${unknown}</b></div><div class="stat"><span>已完成</span><b>${done}</b></div>`}
function renderPalette(){const p=$('palette');p.innerHTML='';for(const g of groups()){const b=document.createElement('button');b.type='button';b.className='chip'+(S.selectedCode===g.code?' active':'');b.innerHTML=`<div class="chip-color" style="background:${rgbHex(g.avg)}"></div><strong>${g.code}</strong><span>${g.count} 颗</span>`;b.onclick=()=>{S.selectedCode=S.selectedCode===g.code?null:g.code;renderWork();scheduleSave()};p.appendChild(b)}const u=S.cells.filter(s=>s.occupied&&!s.code).length;if(u){const b=document.createElement('button');b.type='button';b.className='chip'+(S.selectedCode==='__UNKNOWN__'?' active':'');b.innerHTML=`<div class="chip-color" style="background:repeating-linear-gradient(45deg,#fff,#fff 5px,#ffd9cf 5px,#ffd9cf 10px)"></div><strong>未识别</strong><span>${u} 颗</span>`;b.onclick=()=>{S.selectedCode=S.selectedCode==='__UNKNOWN__'?null:'__UNKNOWN__';renderWork();scheduleSave()};p.appendChild(b)}$('activeCode').textContent=S.selectedCode==='__UNKNOWN__'?'未识别':(S.selectedCode||'全部')}
function updateCurrent(){const box=$('currentCell');if(S.selectedCell<0||!S.cells[S.selectedCell]){box.classList.add('hidden');return}const s=S.cells[S.selectedCell],mr=Math.floor(s.r/5)+1,mc=Math.floor(s.c/5)+1,wr=s.r%5+1,wc=s.c%5+1;box.classList.remove('hidden');const sug=(s.suggestions||[]).slice(0,3).map(x=>`${x.k}${Number.isFinite(x.d)?`(${x.d.toFixed(1)})`:''}`).join(' / ');box.innerHTML=`<b>${s.code||'未识别'}</b> · 第 ${s.r+1} 行 / 第 ${s.c+1} 列<br>5×5 模块：第 ${mr} 排第 ${mc} 块 · 模块内第 ${wr} 行第 ${wc} 格${!s.code&&sug?`<br>可能是：${sug}`:''}`;$('editCodeInput').value=s.code||''}
function renderUnknownPanel(){
  let box=$('unknownAssistV16');if(!box){box=document.createElement('div');box.id='unknownAssistV16';box.className='v16-assist';const manual=$('manualFillV14');manual?.parentNode?.insertBefore(box,manual)}
  if(!box)return;const unk=S.cells.filter(s=>s.occupied&&!s.code),by=new Map();for(const s of unk){const k=s.cluster>=0?s.cluster:`c${s.r}-${s.c}`;if(!by.has(k))by.set(k,[]);by.get(k).push(s)}const arr=[...by.values()].sort((a,b)=>b.length-a.length);box.innerHTML=`<div class="v16-title">🧠 智能补漏 <span>${unk.length?`还有 ${unk.length} 颗没认出来`:'已没有漏色'}</span></div>${unk.length?'<div class="v16-sub">点下面的未识别色组，我会帮你定位到一颗代表豆，然后直接填色号补整组。</div>':''}<div class="v16-clusters"></div>`;const list=box.querySelector('.v16-clusters');arr.slice(0,12).forEach((a,idx)=>{const s=a[0],b=document.createElement('button');b.type='button';b.className='v16-cluster';const sug=(s.suggestions||[])[0]?.k||'待确认';b.innerHTML=`<i style="background:${rgbHex(s.rgb)}"></i><b>未识别色 ${idx+1}</b><span>${a.length} 颗 · 可能 ${sug}</span>`;b.onclick=()=>{S.selectedCell=S.cells.indexOf(s);updateCurrent();selectManualReference(S.selectedCell);$('manualFillV14')?.scrollIntoView({behavior:'smooth',block:'center'})};list.appendChild(b)})
}
function renderWork(){if(!S.active)return;renderStats();renderPalette();drawGrid();updateCurrent();renderUnknownPanel();updateManualStatus();$('workSection')?.classList.remove('hidden')}

function setupStyles(){const st=document.createElement('style');st.textContent=`
.v16-savebar{margin:10px 0;padding:10px 12px;border:1px solid #e3d8cc;border-radius:14px;background:#fffaf4;display:flex;justify-content:space-between;gap:10px;align-items:center;font-size:12px}.v16-savebar b{display:block;font-size:13px}.v16-savebar span{color:#777}.v16-resume{margin-top:12px;padding:14px;border:2px solid #191714;border-radius:18px;background:#fffdf8}.v16-resume h3{margin:0 0 4px}.v16-resume p{margin:0 0 10px;color:#716b65;font-size:12px;line-height:1.5}.v16-resume-actions{display:grid;grid-template-columns:1fr auto;gap:8px}.v16-assist{margin:12px 0;padding:12px;border:1px solid #eadfd5;border-radius:16px;background:#fffaf7}.v16-title{font-weight:900;font-size:15px}.v16-title span{font-weight:500;font-size:11px;color:#7a746d;margin-left:6px}.v16-sub{font-size:11px;color:#7a746d;line-height:1.5;margin:5px 0 9px}.v16-clusters{display:flex;gap:7px;overflow-x:auto;padding-bottom:2px}.v16-cluster{min-width:150px;text-align:left;padding:8px;border:1px solid #e6ddd5;border-radius:12px;background:#fff}.v16-cluster i{display:inline-block;width:22px;height:22px;border-radius:6px;vertical-align:middle;margin-right:6px;border:1px solid rgba(0,0,0,.08)}.v16-cluster b{font-size:12px}.v16-cluster span{display:block;margin-top:4px;color:#777;font-size:10px}.v16-unknown{outline:2px solid #ff6f4d}@media(max-width:430px){.v16-resume-actions{grid-template-columns:1fr}.v16-savebar{align-items:flex-start;flex-direction:column}}
`;document.head.appendChild(st)}

let manualMode=false,manualRef=-1,manualCandidates=[];
function manualEls(){return{panel:$('manualFillV14'),mode:$('mf14Mode'),info:$('mf14Info'),code:$('mf14Code'),tol:$('mf14Tol'),tolVal:$('mf14TolVal'),preview:$('mf14Preview'),missing:$('mf14Missing'),all:$('mf14All'),undo:$('mf14Undo')}}
function selectManualReference(i){manualRef=i;const E=manualEls(),s=S.cells[i];if(!E.panel||!s)return;E.code.value=s.code||'';updateManualStatus()}
function manualFind(){if(manualRef<0||!S.cells[manualRef])return[];const E=manualEls(),base=S.cells[manualRef],t=+E.tol.value||3.5;return S.cells.map((s,i)=>({s,i,d:s.occupied?de(s.rgb,base.rgb):999})).filter(x=>x.d<=t).sort((a,b)=>a.d-b.d)}
function updateManualStatus(){const E=manualEls();if(!E.panel)return;if(!S.active){E.info.textContent='先完成一次识别，或者继续本地保存的项目。';return}if(manualRef<0){E.info.innerHTML='<b>已连接当前工作图。</b> 开启模式后点一颗参考豆。';return}manualCandidates=manualFind();const s=S.cells[manualRef],miss=manualCandidates.filter(x=>!x.s.code).length;E.info.innerHTML=`参考：<b>第 ${s.r+1} 行 / 第 ${s.c+1} 列</b> · 当前 <b>${s.code||'未识别'}</b><br>找到 <b>${manualCandidates.length}</b> 个同底色候选，其中 <b>${miss}</b> 个目前漏识别。`}
function manualApply(all){const E=manualEls();if(manualRef<0)return toast('先选一颗参考豆');const k=norm(E.code.value);if(!k)return toast('请输入有效 MARD 色号');manualCandidates=manualFind();const targets=manualCandidates.filter(x=>all||!x.s.code);if(!targets.length)return toast('没有需要补的格子');S.undo=targets.map(x=>({i:x.i,code:x.s.code,confidence:x.s.confidence}));for(const x of targets){x.s.code=k;x.s.confidence='manual-v16'}E.undo.disabled=false;S.selectedCode=null;renderWork();scheduleSave(true);toast(`已${all?'统一':'补上'} ${targets.length} 格 → ${k}`)}
function setupManual(){const E=manualEls();if(!E.panel)return;
  E.info.textContent='已连接当前工作图。识别完成后即可补色。';
  E.mode.onclick=()=>{if(!S.active)return toast('先完成识别或继续上次项目');manualMode=!manualMode;E.mode.classList.toggle('on',manualMode);E.mode.textContent=manualMode?'✅ 现在点工作图中的一颗参考豆':'开始选一颗参考豆';toast(manualMode?'现在点工作图里的一颗参考豆':'已退出选豆模式')};
  E.preview.onclick=()=>updateManualStatus();E.tol.oninput=()=>{E.tolVal.textContent=(+E.tol.value).toFixed(1);updateManualStatus()};E.code.oninput=()=>E.code.value=E.code.value.toUpperCase();E.missing.onclick=()=>manualApply(false);E.all.onclick=()=>manualApply(true);E.undo.onclick=()=>{if(!S.undo?.length)return;for(const u of S.undo){const s=S.cells[u.i];if(s){s.code=u.code;s.confidence=u.confidence}}S.undo=null;E.undo.disabled=true;renderWork();scheduleSave(true);toast('已撤销上一次补色')};
}

function gridClick(e){if(!S.active)return;const c=$('gridCanvas'),r=c.getBoundingClientRect(),sx=c.width/r.width,sy=c.height/r.height,size=+$('zoomRange').value||34,col=clamp(Math.floor((e.clientX-r.left)*sx/size),0,S.cols-1),row=clamp(Math.floor((e.clientY-r.top)*sy/size),0,S.rows-1),i=row*S.cols+col,s=S.cells[i];if(manualMode){manualRef=i;manualEls().code.value=s.code||'';updateManualStatus();toast('参考豆已选中，输入正确色号后补整色');return}S.selectedCell=i;if(s.code){if(S.done.has(i))S.done.delete(i);else S.done.add(i)}updateCurrent();drawGrid();renderStats();scheduleSave()}
function setupControls(){
  const recognize=$('recognizeBtn');recognize?.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();recognizeV16()},true);
  $('gridCanvas')?.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();gridClick(e)},true);
  $('zoomRange')?.addEventListener('input',e=>{e.stopImmediatePropagation();drawGrid();scheduleSave()},true);
  $('showAllBtn')?.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();S.selectedCode=null;renderWork();scheduleSave()},true);
  $('nextBtn')?.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();const cand=S.cells.map((s,i)=>({s,i})).filter(x=>S.selectedCode==='__UNKNOWN__'?(x.s.occupied&&!x.s.code):(x.s.code&&(!S.selectedCode||x.s.code===S.selectedCode))),t=cand.find(x=>S.selectedCode==='__UNKNOWN__'||!S.done.has(x.i));if(!t)return toast(S.selectedCode?'这一色已经完成':'没有未完成的已识别格');S.selectedCell=t.i;updateCurrent();drawGrid();const size=+$('zoomRange').value||34,sc=$('gridScroller');sc?.scrollTo({left:Math.max(0,t.s.c*size-sc.clientWidth/2+size/2),top:Math.max(0,t.s.r*size-sc.clientHeight/2+size/2),behavior:'smooth'})},true);
  $('saveCodeBtn')?.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();if(S.selectedCell<0)return toast('先点工作图里的一个格子');const k=$('editCodeInput').value.trim()?norm($('editCodeInput').value):'';if($('editCodeInput').value.trim()&&!k)return toast('请输入有效 MARD 色号');S.cells[S.selectedCell].code=k;S.cells[S.selectedCell].confidence='manual-single';renderWork();scheduleSave(true);toast(k?`已改为 ${k}`:'已清空这个格子的色号')},true);
  $('resetBtn')?.addEventListener('click',async e=>{e.preventDefault();e.stopImmediatePropagation();if(!confirm('确定清空当前图纸、拼豆进度和本地保存吗？'))return;await deleteProject();location.reload()},true);
}

async function recognizeV16(){
  if(S.busy)return;const src=$('sourceCanvas');if(!src?.width)return notice('请先上传图纸','warn');let cols=parseInt($('colsInput').value,10),rows=parseInt($('rowsInput').value,10);if(!cols||!rows||cols<1||rows<1||cols>160||rows>160)return notice('请先确认正确的列数和行数','warn');if(rows*cols>10000)return notice('超过 10,000 格，手机会很吃力。建议分区域识别。','warn');
  S.busy=true;$('recognizeBtn').disabled=true;progress('正在按格子读取底色…',6);
  try{
    const crop=cropCanvas();if(!crop)throw new Error('无法取得识别区域');let cells=buildCells(crop,rows,cols),qs=makeClusters(cells);progress(`检测到 ${qs.length} 个实际底色组，正在读取图例…`,14);
    const w=await getWorker();const legend=await readLegend(w);S.legend=legend;progress(`图例读到 ${legend.codes.size} 种色，正在放大读取每种底色的编号…`,22);
    const hits=await ocrClusterReps(w,crop,qs,legend);progress('正在解决相近色和漏读色…',78);await assign(qs,w,crop,legend);
    S.rows=rows;S.cols=cols;S.cells=cells;S.clusters=qs;S.done.clear();S.selectedCode=null;S.selectedCell=-1;S.active=true;S.imageName=$('imageMeta')?.textContent?.split('·')[0]?.trim()||'图纸';
    renderWork();hideProgress();$('workSection').classList.remove('hidden');const coded=cells.filter(s=>s.code).length,unknown=cells.filter(s=>s.occupied&&!s.code).length;notice(`V16：识别 ${coded} 颗，仍有 ${unknown} 颗需要确认；OCR 有效命中 ${hits} 次。未识别的不会消失，会显示“?”并进入智能补漏。`,unknown?'warn':'ok');await saveProject(true);$('workSection').scrollIntoView({behavior:'smooth',block:'start'});
  }catch(err){hideProgress();notice(`识别失败：${err.message||err}`,'warn')}finally{S.busy=false;$('recognizeBtn').disabled=false}
}

const DB='pindou-local-v16',STORE='projects',KEY='current';let saveTimer=null;
function openDB(){return new Promise((res,rej)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE)};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function idbPut(v){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(v,KEY);tx.oncomplete=()=>{db.close();res()};tx.onerror=()=>{db.close();rej(tx.error)}})}
async function idbGet(){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readonly'),r=tx.objectStore(STORE).get(KEY);r.onsuccess=()=>{db.close();res(r.result||null)};r.onerror=()=>{db.close();rej(r.error)}})}
async function idbDel(){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(KEY);tx.oncomplete=()=>{db.close();res()};tx.onerror=()=>{db.close();rej(tx.error)}})}
function serialize(){return{version:16,savedAt:Date.now(),imageName:S.imageName,rows:S.rows,cols:S.cols,cells:S.cells.map(s=>({r:s.r,c:s.c,rgb:s.rgb,ink:s.ink,support:s.support,occupied:s.occupied,code:s.code,confidence:s.confidence,cluster:s.cluster,suggestions:s.suggestions||[]})),done:[...S.done],selectedCode:S.selectedCode,zoom:+($('zoomRange')?.value||34)}}
async function saveProject(now=false){if(!S.active)return;const v=serialize();try{await idbPut(v);S.savedAt=v.savedAt;updateSaveBar('已自动保存')}catch(_){try{localStorage.setItem('pindou-v16-fallback',JSON.stringify(v));S.savedAt=v.savedAt;updateSaveBar('已保存（兼容模式）')}catch(__){updateSaveBar('保存失败')}}}
function scheduleSave(immediate=false){clearTimeout(saveTimer);saveTimer=setTimeout(()=>saveProject(),immediate?20:350)}
async function loadSaved(){try{return await idbGet()}catch(_){try{return JSON.parse(localStorage.getItem('pindou-v16-fallback')||'null')}catch(__){return null}}}
async function deleteProject(){try{await idbDel()}catch(_){}localStorage.removeItem('pindou-v16-fallback')}
function fmtTime(ts){if(!ts)return'';const d=new Date(ts);return d.toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}
function updateSaveBar(msg){let b=$('v16SaveBar');if(!b){b=document.createElement('div');b.id='v16SaveBar';b.className='v16-savebar';const stats=$('stats');stats?.parentNode?.insertBefore(b,stats)}if(!b)return;b.innerHTML=`<div><b>💾 ${msg||'本机自动保存已开启'}</b><span>${S.savedAt?`最近：${fmtTime(S.savedAt)}`:'识别后会自动保存，关掉网页也能继续'}</span></div><button id="v16SaveNow" class="ghost tiny" type="button">现在保存</button>`;$('v16SaveNow').onclick=()=>saveProject(true)}
function resume(v){if(!v?.cells?.length)return;S.rows=v.rows;S.cols=v.cols;S.cells=v.cells.map(s=>({...s,suggestions:s.suggestions||[]}));S.done=new Set(v.done||[]);S.selectedCode=v.selectedCode||null;S.selectedCell=-1;S.active=true;S.imageName=v.imageName||'上次图纸';S.savedAt=v.savedAt||0;$('zoomRange').value=v.zoom||34;renderWork();updateSaveBar('已恢复上次进度');$('workSection').classList.remove('hidden');$('workSection').scrollIntoView({behavior:'smooth',block:'start'});toast('已恢复上次拼豆进度')}
async function showResume(){const v=await loadSaved();if(!v?.cells?.length)return;const up=$('uploadSection');if(!up||$('v16Resume'))return;const coded=v.cells.filter(s=>s.code).length,done=(v.done||[]).length,box=document.createElement('div');box.id='v16Resume';box.className='v16-resume';box.innerHTML=`<h3>💾 上次拼豆还在</h3><p>${v.imageName||'图纸'} · ${v.cols}×${v.rows} · 已识别 ${coded} 颗 · 已完成 ${done} 颗<br>保存于 ${fmtTime(v.savedAt)}</p><div class="v16-resume-actions"><button id="v16ResumeBtn" class="primary" type="button">继续上次拼豆</button><button id="v16DeleteBtn" class="ghost" type="button">删除记录</button></div>`;up.appendChild(box);$('v16ResumeBtn').onclick=()=>resume(v);$('v16DeleteBtn').onclick=async()=>{if(confirm('删除本机保存的拼豆进度吗？')){await deleteProject();box.remove();toast('已删除本地记录')}}}

async function boot(){
  showVersion();setupStyles();
  for(let i=0;i<60&&!$('recognizeBtn');i++)await sleep(50);
  setupControls();setupManual();updateSaveBar('本机自动保存已开启');await showResume();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();