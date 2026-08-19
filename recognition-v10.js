(() => {
'use strict';
const $=id=>document.getElementById(id);
const COLORS=window.PINDOU_MARD_COLORS||[];
if(!COLORS.length)return;
const MARD=new Map(COLORS.map(x=>[x[0],x]));
const VALID=new Set(MARD.keys());
const S={active:false,rows:0,cols:0,cells:[],done:new Set(),selectedCode:null,selectedCell:null,worker:null,busy:false};
window.__pindouV10=S;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const mean=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:0;
const median=a=>{if(!a.length)return 0;const b=[...a].sort((x,y)=>x-y),m=b.length>>1;return b.length%2?b[m]:(b[m-1]+b[m])/2};
const lum=x=>.2126*x[0]+.7152*x[1]+.0722*x[2];
const sat=x=>{const hi=Math.max(...x),lo=Math.min(...x);return hi?(hi-lo)/hi:0};
const hex=x=>'#'+x.map(v=>clamp(Math.round(v),0,255).toString(16).padStart(2,'0')).join('');
function norm(raw){
  let s=String(raw||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  if(VALID.has(s))return s;
  const m=s.match(/^([A-Z]{1,2})([0-9OILSZGB]{1,3})$/);if(!m)return'';
  s=m[1]+m[2].replace(/O/g,'0').replace(/[IL]/g,'1').replace(/Z/g,'2').replace(/S/g,'5').replace(/G/g,'6').replace(/B/g,'8');
  return VALID.has(s)?s:'';
}
function srgb(v){v/=255;return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4)}
function lab(a){const r=srgb(a[0]),g=srgb(a[1]),b=srgb(a[2]),x=(.4124*r+.3576*g+.1805*b)/.95047,y=.2126*r+.7152*g+.0722*b,z=(.0193*r+.1192*g+.9505*b)/1.08883,f=t=>t>.008856?Math.cbrt(t):7.787*t+16/116,fx=f(x),fy=f(y),fz=f(z);return[116*fy-16,500*(fx-fy),200*(fy-fz)]}
function de(a,b){const A=lab(a),B=lab(b);return Math.hypot(A[0]-B[0],A[1]-B[1],A[2]-B[2])}
function notice(t,k='ok'){const e=$('detectNotice');if(e){e.textContent=t;e.className=`notice ${k}`;e.classList.remove('hidden')}}
function toast(t){const e=$('toast');if(!e)return;e.textContent=t;e.classList.remove('hidden');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.add('hidden'),1800)}
function progress(t,p){const b=$('progressBox');if(!b)return;b.classList.remove('hidden');$('progressText').textContent=t;$('progressPct').textContent=`${Math.round(p)}%`;$('progressBar').style.width=`${clamp(p,0,100)}%`}
function hideProgress(){$('progressBox')?.classList.add('hidden')}
async function worker(){
  if(S.worker)return S.worker;
  if(!window.Tesseract)throw new Error('OCR 组件未加载，请联网刷新页面');
  S.worker=await Tesseract.createWorker('eng',1,{logger:m=>{if(m.status==='recognizing text'&&S.busy)progress('正在读取格内编号…',25+(m.progress||0)*48)}});
  await S.worker.setParameters({tessedit_char_whitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789()[]',preserve_interword_spaces:'0'});
  return S.worker;
}
function cropRect(){
  const c=$('sourceCanvas'),o=$('cropOverlay');if(!c?.width)throw new Error('请先上传图纸');
  let x=parseFloat(o?.style.left),y=parseFloat(o?.style.top),w=parseFloat(o?.style.width),h=parseFloat(o?.style.height);
  if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(w)||!Number.isFinite(h)||w<2||h<2){x=0;y=0;w=c.width;h=c.height}
  x=clamp(x,0,c.width-1);y=clamp(y,0,c.height-1);w=clamp(w,1,c.width-x);h=clamp(h,1,c.height-y);return{x,y,w,h};
}
function cropCanvas(src,r){const c=document.createElement('canvas');c.width=Math.max(1,Math.round(r.w));c.height=Math.max(1,Math.round(r.h));c.getContext('2d',{willReadFrequently:true}).drawImage(src,r.x,r.y,r.w,r.h,0,0,c.width,c.height);return c}
function dominant(data,W,H,x,y,w,h){
  const x0=Math.max(0,Math.floor(x+w*.14)),x1=Math.min(W,Math.ceil(x+w*.86)),y0=Math.max(0,Math.floor(y+h*.14)),y1=Math.min(H,Math.ceil(y+h*.86));
  const step=Math.max(1,Math.floor(Math.min(w,h)/18)),bins=new Map(),px=[];
  for(let yy=y0;yy<y1;yy+=step)for(let xx=x0;xx<x1;xx+=step){const i=(yy*W+xx)*4,p=[data[i],data[i+1],data[i+2]],k=`${Math.round(p[0]/8)*8},${Math.round(p[1]/8)*8},${Math.round(p[2]/8)*8}`;px.push(p);bins.set(k,(bins.get(k)||0)+1)}
  let key='255,255,255',bn=-1;for(const[k,n]of bins)if(n>bn){bn=n;key=k}
  const base=key.split(',').map(Number),near=px.filter(p=>Math.hypot(p[0]-base[0],p[1]-base[1],p[2]-base[2])<28);
  const rgb=[0,1,2].map(j=>Math.round(mean((near.length?near:px).map(p=>p[j]))));
  let ink=0;for(const p of px){if(Math.hypot(p[0]-rgb[0],p[1]-rgb[1],p[2]-rgb[2])>34&&Math.abs(lum(p)-lum(rgb))>17)ink++}
  return{rgb,ink:ink/Math.max(1,px.length),support:bn/Math.max(1,px.length)};
}
function buildCells(c,rows,cols){
  const X=c.getContext('2d',{willReadFrequently:true}),W=c.width,H=c.height,d=X.getImageData(0,0,W,H).data,out=[];
  for(let r=0;r<rows;r++)for(let col=0;col<cols;col++){
    const x=col*W/cols,y=r*H/rows,w=W/cols,h=H/rows,z=dominant(d,W,H,x,y,w,h);
    const blankNeutral=sat(z.rgb)<.035&&lum(z.rgb)>228&&z.ink<.018;
    out.push({r,c:col,x,y,w,h,rgb:z.rgb,hex:hex(z.rgb),ink:z.ink,support:z.support,occupied:!blankNeutral,code:'',votes:new Map(),confidence:'none'});
  }
  return out;
}
function region(src,x,y,w,h,max=2600){if(w<18||h<18)return null;const sc=Math.min(5,max/Math.max(w,h)),c=document.createElement('canvas');c.width=Math.max(1,Math.round(w*sc));c.height=Math.max(1,Math.round(h*sc));c.getContext('2d',{willReadFrequently:true}).drawImage(src,x,y,w,h,0,0,c.width,c.height);return c}
function rotateCanvas(src,deg){if(!deg)return src;const c=document.createElement('canvas');if(Math.abs(deg)===90){c.width=src.height;c.height=src.width}else{c.width=src.width;c.height=src.height}const x=c.getContext('2d');x.translate(c.width/2,c.height/2);x.rotate(deg*Math.PI/180);x.drawImage(src,-src.width/2,-src.height/2);return c}
function bgAround(c,b){const X=c.getContext('2d',{willReadFrequently:true}),W=c.width,H=c.height,d=X.getImageData(0,0,W,H).data,bw=Math.max(10,b.x1-b.x0),bh=Math.max(10,b.y1-b.y0);return dominant(d,W,H,b.x0-bw*.55,b.y0-bh*.65,bw*2.1,bh*2.3).rgb}
function parseLegendText(text){
  const out=new Map(),s=String(text||'').toUpperCase().replace(/\n/g,' ');
  const re=/\b((?:ZG|[A-HMPRQTY])\s*\d{1,2})\s*[\(\[]?\s*(\d{1,3})\s*[\)\]]?/g;
  for(const m of s.matchAll(re)){const k=norm(m[1]);if(!k)continue;const n=parseInt(m[2],10);if(n>0&&n<1000)out.set(k,n)}
  return out;
}
async function readLegend(w,src,r){
  const regs=[];const bottom=src.height-r.y-r.h,right=src.width-r.x-r.w,top=r.y,left=r.x;
  if(bottom>22)regs.push(region(src,0,r.y+r.h,src.width,bottom));
  if(right>22)regs.push(region(src,r.x+r.w,0,right,src.height));
  if(top>22)regs.push(region(src,0,0,src.width,top));
  if(left>22)regs.push(region(src,0,0,left,src.height));
  const codes=new Set(),counts=new Map(),rgbLists=new Map();
  for(const base of regs.filter(Boolean)){
    for(const deg of [0,90,-90]){
      const c=rotateCanvas(base,deg);
      for(const psm of ['6','11']){
        try{
          await w.setParameters({tessedit_pageseg_mode:psm,tessedit_char_whitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789()[]'});
          const z=await w.recognize(c);
          for(const[k,n]of parseLegendText(z.data?.text))counts.set(k,n);
          for(const word of z.data?.words||[]){const k=norm(word.text);if(!k||!word.bbox)continue;codes.add(k);if(!rgbLists.has(k))rgbLists.set(k,[]);rgbLists.get(k).push(bgAround(c,word.bbox))}
        }catch(_){}
      }
    }
  }
  for(const k of counts.keys())codes.add(k);
  const rgb=new Map();for(const[k,a]of rgbLists)rgb.set(k,[0,1,2].map(i=>Math.round(median(a.map(v=>v[i])))));
  return{codes,counts,rgb};
}
function cellTile(c,s,binary=true){
  const TW=112,TH=78,t=document.createElement('canvas');t.width=TW;t.height=TH;const T=t.getContext('2d',{willReadFrequently:true});T.fillStyle='#fff';T.fillRect(0,0,TW,TH);
  const sx=s.x+s.w*.06,sy=s.y+s.h*.06,sw=s.w*.88,sh=s.h*.88,raw=document.createElement('canvas');raw.width=Math.max(2,Math.round(sw));raw.height=Math.max(2,Math.round(sh));const R=raw.getContext('2d',{willReadFrequently:true});R.drawImage(c,sx,sy,sw,sh,0,0,raw.width,raw.height);
  if(binary){const im=R.getImageData(0,0,raw.width,raw.height),d=im.data,B=s.rgb,L=lum(B);for(let i=0;i<d.length;i+=4){const p=[d[i],d[i+1],d[i+2]],dist=Math.hypot(p[0]-B[0],p[1]-B[1],p[2]-B[2]),ld=Math.abs(lum(p)-L),isInk=dist>28&&ld>10,v=isInk?0:255;d[i]=d[i+1]=d[i+2]=v;d[i+3]=255}R.putImageData(im,0,0)}
  T.imageSmoothingEnabled=false;const sc=Math.min(98/raw.width,64/raw.height),dw=Math.max(1,Math.round(raw.width*sc)),dh=Math.max(1,Math.round(raw.height*sc));T.drawImage(raw,0,0,raw.width,raw.height,(TW-dw)/2,(TH-dh)/2,dw,dh);return t;
}
function sheetFor(c,cells,binary,start,count){
  const use=cells.slice(start,start+count),TW=112,TH=78,NC=7,NR=Math.ceil(use.length/NC),sh=document.createElement('canvas');sh.width=NC*TW;sh.height=Math.max(TH,NR*TH);const X=sh.getContext('2d');X.fillStyle='#fff';X.fillRect(0,0,sh.width,sh.height);use.forEach((s,i)=>X.drawImage(cellTile(c,s,binary),(i%NC)*TW,Math.floor(i/NC)*TH));return{sh,use,TW,TH,NC};
}
async function ocrCells(w,c,cells,legend){
  let hits=0;const batch=cells.length>1200?220:300,passes=cells.length>1200?[true]:[true,false];
  for(let start=0;start<cells.length;start+=batch){
    for(const binary of passes){
      const{sh,use,TW,TH,NC}=sheetFor(c,cells,binary,start,batch);
      for(const psm of ['6','11']){
        try{await w.setParameters({tessedit_pageseg_mode:psm,tessedit_char_whitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'});const z=await w.recognize(sh);for(const word of z.data?.words||[]){const k=norm(word.text);if(!k||!word.bbox)continue;const cx=(word.bbox.x0+word.bbox.x1)/2,cy=(word.bbox.y0+word.bbox.y1)/2,idx=Math.floor(cy/TH)*NC+Math.floor(cx/TW),s=use[idx];if(!s)continue;let weight=1;if(legend.codes.size&&legend.codes.has(k))weight=2;s.votes.set(k,(s.votes.get(k)||0)+weight);s.occupied=true;hits++}}catch(_){}
      }
    }
    progress(`逐格读取编号 ${Math.min(cells.length,start+batch)}/${cells.length}`,30+50*Math.min(1,(start+batch)/cells.length));
  }
  return hits;
}
function ref(k,off=[0,0,0]){const e=MARD.get(k);return[e[1]+off[0],e[2]+off[1],e[3]+off[2]].map(v=>clamp(v,0,255))}
function topVote(s,allowed=null){const a=[...s.votes].filter(([k])=>!allowed||allowed.has(k)).sort((x,y)=>y[1]-x[1]);return{one:a[0]||['',0],two:a[1]||['',0']}}
function highConfidence(cells,legend){
  const allowed=legend.codes.size?legend.codes:null,byCode=new Map();
  for(const s of cells){const{one,two}=topVote(s,allowed);if(one[0]&&one[1]>=2&&one[1]-two[1]>=1){s.code=one[0];s.confidence='ocr';if(!byCode.has(s.code))byCode.set(s.code,[]);byCode.get(s.code).push(s.rgb)}}
  return byCode;
}
function calibrate(byCode){const dif=[[],[],[]];for(const[k,a]of byCode){const e=MARD.get(k);if(!e||!a.length)continue;const obs=[0,1,2].map(i=>median(a.map(x=>x[i])));for(let i=0;i<3;i++)dif[i].push(obs[i]-e[i+1])}return dif.map(a=>clamp(median(a),-55,55))}
function prototypes(byCode,legend,off){const p=new Map();for(const k of (legend.codes.size?legend.codes:VALID)){if(byCode.has(k)){const a=byCode.get(k);p.set(k,[0,1,2].map(i=>median(a.map(x=>x[i]))))}else if(legend.rgb.has(k))p.set(k,legend.rgb.get(k));else p.set(k,ref(k,off))}return p}
function score(s,k,p,legend){let v=de(s.rgb,p.get(k));const n=s.votes.get(k)||0;v-=Math.min(10,n*2.5);if(legend.codes.size&&!legend.codes.has(k))v+=10;return v}
function assignWithCounts(cells,legend,p){
  const locked=new Set(),quota=new Map(legend.counts),allowed=legend.codes.size?legend.codes:new Set(p.keys());
  for(const k of allowed){const a=cells.filter(s=>s.code===k);const target=quota.get(k);if(target&&a.length>target){a.sort((x,y)=>score(x,k,p,legend)-score(y,k,p,legend));for(let i=target;i<a.length;i++){a[i].code='';a[i].confidence='none'}}}
  for(const s of cells)if(s.code){locked.add(s);if(quota.has(s.code))quota.set(s.code,Math.max(0,quota.get(s.code)-1))}
  const open=cells.filter(s=>s.occupied&&!s.code),pairs=[];
  for(const s of open)for(const k of allowed){if(quota.has(k)&&quota.get(k)<=0)continue;pairs.push({s,k,v:score(s,k,p,legend)})}
  pairs.sort((a,b)=>a.v-b.v);const used=new Set();
  for(const x of pairs){if(used.has(x.s))continue;if(quota.has(x.k)&&quota.get(x.k)<=0)continue;if(x.v>24)continue;x.s.code=x.k;x.s.confidence='color';used.add(x.s);if(quota.has(x.k))quota.set(x.k,quota.get(x.k)-1)}
  for(const[k,n0]of quota){let n=n0;if(n<=0)continue;const rest=cells.filter(s=>s.occupied&&!s.code).sort((a,b)=>score(a,k,p,legend)-score(b,k,p,legend));for(const s of rest){if(n<=0)break;if(score(s,k,p,legend)>34)break;s.code=k;s.confidence='quota';n--}quota.set(k,n)}
  return quota;
}
function assignNoCounts(cells,legend,p){
  const allowed=legend.codes.size?legend.codes:new Set(p.keys());
  for(const s of cells){if(s.code||!s.occupied)continue;let best='',bd=1e9,second=1e9;for(const k of allowed){const d=score(s,k,p,legend);if(d<bd){second=bd;bd=d;best=k}else if(d<second)second=d}if(best&&bd<18&&(second-bd>.35||legend.codes.has(best))){s.code=best;s.confidence='color'}}
}
function mergeConsistency(cells){
  const groups=[];for(const s of cells.filter(x=>x.occupied)){let q=null,bd=1e9;for(const g of groups){const d=de(s.rgb,g.rgb);if(d<bd){bd=d;q=g}}if(q&&bd<2.2){const n=q.cells.length;q.cells.push(s);q.rgb=q.rgb.map((v,i)=>(v*n+s.rgb[i])/(n+1))}else groups.push({rgb:[...s.rgb],cells:[s]})}
  let fixes=0;for(const g of groups){const counts=new Map();for(const s of g.cells)if(s.code)counts.set(s.code,(counts.get(s.code)||0)+(s.confidence==='ocr'?3:1));if(!counts.size)continue;const k=[...counts].sort((a,b)=>b[1]-a[1])[0][0];for(const s of g.cells){if(s.code!==k){s.code=k;s.confidence='merged';fixes++}}}return fixes;
}
function groups(){const m=new Map();for(const s of S.cells){if(!s.code)continue;if(!m.has(s.code))m.set(s.code,{code:s.code,count:0,rgb:s.rgb});const g=m.get(s.code);g.count++}return[...m.values()].sort((a,b)=>b.count-a.count||a.code.localeCompare(b.code))}
function draw(){const cv=$('gridCanvas'),size=+$('zoomRange').value||34;cv.width=S.cols*size+1;cv.height=S.rows*size+1;$('zoomValue').textContent=String(size);const x=cv.getContext('2d');x.font=`${Math.max(7,Math.floor(size*.28))}px -apple-system,BlinkMacSystemFont,sans-serif`;x.textAlign='center';x.textBaseline='middle';for(const s of S.cells){const px=s.c*size,py=s.r*size,vis=!S.selectedCode||s.code===S.selectedCode;x.globalAlpha=s.code?(vis?1:.07):1;x.fillStyle=s.code?s.hex:'#fff';x.fillRect(px,py,size,size);if(s.code&&vis){x.fillStyle=lum(s.rgb)<130?'#fff':'#222';x.fillText(s.code,px+size/2,py+size/2)}if(S.done.has(`${s.r},${s.c}`)&&vis){x.strokeStyle='#111';x.lineWidth=2;x.beginPath();x.moveTo(px+size*.24,py+size*.52);x.lineTo(px+size*.43,py+size*.7);x.lineTo(px+size*.77,py+size*.27);x.stroke()}x.globalAlpha=1;x.strokeStyle='rgba(0,0,0,.17)';x.lineWidth=1;x.strokeRect(px+.5,py+.5,size,size)}x.strokeStyle='#111';x.lineWidth=2.5;for(let i=5;i<S.cols;i+=5){x.beginPath();x.moveTo(i*size+.5,0);x.lineTo(i*size+.5,cv.height);x.stroke()}for(let i=5;i<S.rows;i+=5){x.beginPath();x.moveTo(0,i*size+.5);x.lineTo(cv.width,i*size+.5);x.stroke()}}
function render(){const gs=groups(),rec=S.cells.filter(s=>s.code).length;$('stats').innerHTML=`<div class="stat"><span>网格</span><b>${S.cols}×${S.rows}</b></div><div class="stat"><span>颜色</span><b>${gs.length}</b></div><div class="stat"><span>已识别</span><b>${rec}</b></div><div class="stat"><span>已完成</span><b>${S.done.size}</b></div>`;const p=$('palette');p.innerHTML='';for(const g of gs){const b=document.createElement('button');b.type='button';b.className='chip'+(S.selectedCode===g.code?' active':'');b.dataset.v10code=g.code;b.innerHTML=`<div class="chip-color" style="background:${hex(g.rgb)}"></div><strong>${g.code}</strong><span>${g.count} 颗</span>`;p.appendChild(b)}$('activeCode').textContent=S.selectedCode||'全部';draw()}
function showCell(s){S.selectedCell=s;const e=$('currentCell');e.classList.remove('hidden');e.innerHTML=`<b>${s.code||'未识别'}</b> · 总第 ${s.r+1} 行 / 第 ${s.c+1} 列<br>5×5 模块：第 ${Math.floor(s.r/5)+1} 行模块 × 第 ${Math.floor(s.c/5)+1} 列模块；模块内第 ${s.r%5+1} 行 / 第 ${s.c%5+1} 列`;$('editCodeInput').value=s.code||''}
async function recognize(){
  if(S.busy)return;const src=$('sourceCanvas'),cols=parseInt($('colsInput').value,10),rows=parseInt($('rowsInput').value,10);if(!src?.width)throw new Error('请先上传图纸');if(!cols||!rows||cols<1||rows<1||cols>160||rows>160)throw new Error('请填写正确的列数和行数');if(rows*cols>11000)throw new Error('网格太大，请分区识别');
  S.busy=true;$('recognizeBtn').disabled=true;progress('V10：按你框选的区域固定均分网格…',5);
  const r=cropRect(),c=cropCanvas(src,r),cells=buildCells(c,rows,cols),w=await worker();progress('读取图纸自带色卡和颗数…',14);const legend=await readLegend(w,src,r);progress('逐格放大 OCR，不再依赖整图猜颜色…',24);const hits=await ocrCells(w,c,cells,legend);progress('建立这张图自己的颜色校准…',82);const byCode=highConfidence(cells,legend),off=calibrate(byCode),p=prototypes(byCode,legend,off);let quotaLeft=null;if(legend.counts.size>=2)quotaLeft=assignWithCounts(cells,legend,p);else assignNoCounts(cells,legend,p);const fixes=mergeConsistency(cells);
  S.active=true;S.rows=rows;S.cols=cols;S.cells=cells;S.done.clear();S.selectedCode=null;S.selectedCell=null;render();$('workSection').classList.remove('hidden');hideProgress();const gs=groups(),rec=cells.filter(s=>s.code).length,occupied=cells.filter(s=>s.occupied).length,remain=quotaLeft?[...quotaLeft.values()].reduce((a,b)=>a+b,0):0;notice(`V10：色卡读到 ${legend.codes.size} 种，带颗数 ${legend.counts.size} 种；逐格 OCR 命中 ${hits} 次；最终 ${gs.length} 种颜色、${rec}/${occupied} 个有内容格；同底色统一修正 ${fixes} 格${remain?`；仍有 ${remain} 颗色卡数量未匹配`:''}。`,remain||rec<occupied*.82?'warn':'ok');$('workSection').scrollIntoView({behavior:'smooth',block:'start'});S.busy=false;$('recognizeBtn').disabled=false;
}
document.addEventListener('click',async e=>{
  const t=e.target.closest?.('#recognizeBtn,[data-v10code],#showAllBtn,#gridCanvas,#nextBtn,#saveCodeBtn');if(!t)return;
  if(t.id==='recognizeBtn'){e.preventDefault();e.stopImmediatePropagation();try{await recognize()}catch(err){S.busy=false;$('recognizeBtn').disabled=false;hideProgress();notice(`识别失败：${err.message||err}`,'warn')}return}
  if(!S.active)return;
  if(t.dataset?.v10code){e.preventDefault();e.stopImmediatePropagation();S.selectedCode=S.selectedCode===t.dataset.v10code?null:t.dataset.v10code;render();return}
  if(t.id==='showAllBtn'){e.preventDefault();e.stopImmediatePropagation();S.selectedCode=null;render();return}
  if(t.id==='gridCanvas'){e.preventDefault();e.stopImmediatePropagation();const r=t.getBoundingClientRect(),size=+$('zoomRange').value||34,col=Math.floor((e.clientX-r.left)*t.width/r.width/size),row=Math.floor((e.clientY-r.top)*t.height/r.height/size);if(col<0||col>=S.cols||row<0||row>=S.rows)return;const s=S.cells[row*S.cols+col],key=`${row},${col}`;if(s.code){S.done.has(key)?S.done.delete(key):S.done.add(key)}showCell(s);render();return}
  if(t.id==='nextBtn'){e.preventDefault();e.stopImmediatePropagation();const a=S.cells.filter(s=>s.code&&(!S.selectedCode||s.code===S.selectedCode)&&!S.done.has(`${s.r},${s.c}`));if(!a.length){toast('当前颜色已经完成');return}const s=a[0];showCell(s);const size=+$('zoomRange').value||34,sc=$('gridScroller');sc.scrollTo({left:Math.max(0,s.c*size-sc.clientWidth/2),top:Math.max(0,s.r*size-sc.clientHeight/2),behavior:'smooth'});return}
  if(t.id==='saveCodeBtn'){e.preventDefault();e.stopImmediatePropagation();if(!S.selectedCell){toast('先点一个格子');return}const k=norm($('editCodeInput').value);if($('editCodeInput').value.trim()&&!k){toast('无效 MARD 色号');return}S.selectedCell.code=k;render();showCell(S.selectedCell);toast('已保存');return}
},true);
document.addEventListener('input',e=>{if(S.active&&e.target.id==='zoomRange'){e.stopImmediatePropagation();draw()}},true);
$('resetBtn')?.addEventListener('click',()=>{S.active=false;S.cells=[];S.done.clear()},true);
})();