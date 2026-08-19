(() => {
  'use strict';

  const COLORS = window.PINDOU_MARD_COLORS || [];
  if (!COLORS.length) return;
  const MARD = new Map(COLORS.map(x => [x[0], x]));
  const $ = id => document.getElementById(id);
  const S = { active:false, rows:0, cols:0, cells:[], done:new Set(), selectedCode:null, selectedCell:null, worker:null };
  window.__pindouV5 = S;

  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const median=a=>{if(!a.length)return 0;const b=[...a].sort((x,y)=>x-y),m=Math.floor(b.length/2);return b.length%2?b[m]:(b[m-1]+b[m])/2};
  const rgbHex=rgb=>'#'+rgb.map(v=>clamp(Math.round(v),0,255).toString(16).padStart(2,'0')).join('');
  const lum=rgb=>.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];
  const sat=rgb=>{const hi=Math.max(...rgb),lo=Math.min(...rgb);return hi?((hi-lo)/hi):0};

  function notice(msg,kind=''){
    const el=$('detectNotice'); if(!el)return;
    el.textContent=msg; el.className=`notice ${kind}`.trim(); el.classList.remove('hidden');
  }
  function progress(text,pct){
    const box=$('progressBox'); if(!box)return;
    box.classList.remove('hidden'); $('progressText').textContent=text; $('progressPct').textContent=`${Math.round(pct)}%`; $('progressBar').style.width=`${clamp(pct,0,100)}%`;
  }
  function hideProgress(){ $('progressBox')?.classList.add('hidden'); }
  function toast(msg){
    const el=$('toast'); if(!el)return;
    el.textContent=msg;el.classList.remove('hidden');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.add('hidden'),2200);
  }

  function normalizeCode(raw){
    let s=String(raw||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
    if(MARD.has(s))return s;
    const m=s.match(/^([A-Z]{1,2})([0-9OILSZGB]{1,3})$/);
    if(!m)return '';
    const n=m[2].replace(/O/g,'0').replace(/[IL]/g,'1').replace(/Z/g,'2').replace(/S/g,'5').replace(/G/g,'6').replace(/B/g,'8');
    s=m[1]+n;
    return MARD.has(s)?s:'';
  }

  function cropRectFromDOM(){
    const src=$('sourceCanvas'), ov=$('cropOverlay');
    if(!src||!src.width||!src.height)throw new Error('请先上传图纸');
    let x=parseFloat(ov?.style.left), y=parseFloat(ov?.style.top), w=parseFloat(ov?.style.width), h=parseFloat(ov?.style.height);
    if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(w)||!Number.isFinite(h)||w<2||h<2){x=0;y=0;w=src.width;h=src.height;}
    x=clamp(x,0,src.width-1); y=clamp(y,0,src.height-1); w=clamp(w,1,src.width-x); h=clamp(h,1,src.height-y);
    return {x,y,w,h};
  }
  function makeCrop(src,rect){
    const c=document.createElement('canvas');c.width=Math.max(1,Math.round(rect.w));c.height=Math.max(1,Math.round(rect.h));
    c.getContext('2d',{willReadFrequently:true}).drawImage(src,rect.x,rect.y,rect.w,rect.h,0,0,c.width,c.height);return c;
  }

  function projectionScores(ctx,vertical){
    const W=ctx.canvas.width,H=ctx.canvas.height,d=ctx.getImageData(0,0,W,H).data;
    const n=vertical?W:H, m=vertical?H:W, out=new Float32Array(n), step=Math.max(1,Math.floor(m/420));
    for(let i=1;i<n-1;i++){
      let s=0,k=0;
      for(let j=0;j<m;j+=step){
        const p1=vertical?(j*W+i-1)*4:((i-1)*W+j)*4;
        const p2=vertical?(j*W+i+1)*4:((i+1)*W+j)*4;
        const l1=.2126*d[p1]+.7152*d[p1+1]+.0722*d[p1+2], l2=.2126*d[p2]+.7152*d[p2+1]+.0722*d[p2+2];
        s+=Math.abs(l2-l1);k++;
      }
      out[i]=s/Math.max(1,k);
    }
    return out;
  }
  function fitLine(cands,count,length){
    if(cands.length<3)return {a:0,b:length/count};
    let a=0,b=length/count;
    for(let pass=0;pass<2;pass++){
      const pts=cands.filter(p=>Math.abs(p.x-(a+b*p.i))<Math.max(4,b*.42));
      const use=pts.length>=3?pts:cands;
      const mi=use.reduce((s,p)=>s+p.i,0)/use.length, mx=use.reduce((s,p)=>s+p.x,0)/use.length;
      let num=0,den=0;for(const p of use){num+=(p.i-mi)*(p.x-mx);den+=(p.i-mi)*(p.i-mi);}
      if(den){b=num/den;a=mx-b*mi;}
    }
    if(!(b>length/count*.65&&b<length/count*1.35)){a=0;b=length/count;}
    return {a,b};
  }
  function snapAxis(scores,length,count){
    const pitch=length/count, rad=Math.max(3,Math.min(32,pitch*.38)), cands=[];
    for(let i=0;i<=count;i++){
      const exp=i*pitch, lo=Math.max(1,Math.floor(exp-rad)), hi=Math.min(length-2,Math.ceil(exp+rad));
      let bx=clamp(Math.round(exp),0,length),bs=-1;
      for(let x=lo;x<=hi;x++){
        const q=(scores[x]||0)+.55*(scores[x-1]||0)+.55*(scores[x+1]||0);
        if(q>bs){bs=q;bx=x;}
      }
      cands.push({i,x:bx,score:bs});
    }
    const fit=fitLine(cands,count,length), lines=[];
    for(let i=0;i<=count;i++){
      const target=fit.a+fit.b*i, cand=cands[i].x;
      let x=Math.abs(cand-target)<fit.b*.23?cand:target;
      if(i===0&&Math.abs(x)<fit.b*.35)x=0;
      if(i===count&&Math.abs(x-length)<fit.b*.35)x=length;
      lines.push(clamp(x,0,length));
    }
    lines[0]=clamp(lines[0],0,length-1);
    for(let i=1;i<lines.length;i++)lines[i]=Math.max(lines[i],lines[i-1]+1);
    lines[count]=clamp(lines[count],lines[count-1]+1,length);
    return lines;
  }
  function snappedGrid(crop,rows,cols){
    const maxSide=900,s=Math.min(1,maxSide/Math.max(crop.width,crop.height));
    const mini=document.createElement('canvas');mini.width=Math.max(2,Math.round(crop.width*s));mini.height=Math.max(2,Math.round(crop.height*s));
    const ctx=mini.getContext('2d',{willReadFrequently:true});ctx.drawImage(crop,0,0,mini.width,mini.height);
    const xs=snapAxis(projectionScores(ctx,true),mini.width,cols).map(x=>x/s);
    const ys=snapAxis(projectionScores(ctx,false),mini.height,rows).map(y=>y/s);
    return {xs,ys};
  }

  function sampleCell(data,W,H,x,y,w,h){
    const mx=Math.max(1,w*.16),my=Math.max(1,h*.16),x0=clamp(Math.floor(x+mx),0,W-1),x1=clamp(Math.ceil(x+w-mx),x0+1,W),y0=clamp(Math.floor(y+my),0,H-1),y1=clamp(Math.ceil(y+h-my),y0+1,H);
    const step=Math.max(1,Math.floor(Math.min(w,h)/14)), bins=new Map(), pixels=[];
    for(let yy=y0;yy<y1;yy+=step)for(let xx=x0;xx<x1;xx+=step){const p=(yy*W+xx)*4,r=data[p],g=data[p+1],b=data[p+2];pixels.push([r,g,b]);const k=`${Math.round(r/12)*12},${Math.round(g/12)*12},${Math.round(b/12)*12}`;bins.set(k,(bins.get(k)||0)+1);}
    let key='255,255,255',best=-1;for(const [k,n] of bins)if(n>best){best=n;key=k;}
    const base=key.split(',').map(Number), close=pixels.filter(p=>Math.hypot(p[0]-base[0],p[1]-base[1],p[2]-base[2])<34);
    const rgb=[0,1,2].map(i=>close.length?Math.round(close.reduce((s,p)=>s+p[i],0)/close.length):base[i]);
    let ink=0;for(const p of pixels){const dist=Math.hypot(p[0]-rgb[0],p[1]-rgb[1],p[2]-rgb[2]);if(dist>42&&Math.abs(lum(p)-lum(rgb))>28)ink++;}
    ink/=Math.max(1,pixels.length);
    const support=best/Math.max(1,pixels.length);
    const visual=(sat(rgb)>.09||lum(rgb)<232||ink>.025) && support>.18;
    return {rgb,ink,support,visual};
  }
  function buildCells(crop,rows,cols,grid){
    const ctx=crop.getContext('2d',{willReadFrequently:true}),W=crop.width,H=crop.height,d=ctx.getImageData(0,0,W,H).data,cells=[];
    for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
      const x=grid.xs[c],y=grid.ys[r],w=Math.max(1,grid.xs[c+1]-x),h=Math.max(1,grid.ys[r+1]-y),s=sampleCell(d,W,H,x,y,w,h);
      cells.push({r,c,x,y,w,h,...s,code:'',direct:false,hex:rgbHex(s.rgb)});
    }
    return cells;
  }
  function interval(lines,v){
    let lo=0,hi=lines.length-2;while(lo<=hi){const m=(lo+hi)>>1;if(v<lines[m])hi=m-1;else if(v>=lines[m+1])lo=m+1;else return m;}return -1;
  }

  async function getWorker(){
    if(S.worker)return S.worker;
    if(!window.Tesseract)throw new Error('OCR 组件未加载，请联网刷新页面');
    S.worker=await Tesseract.createWorker('eng',1,{logger:m=>{if(m.status==='recognizing text')progress('正在读取格内编号…',35+(m.progress||0)*38);}});
    await S.worker.setParameters({tessedit_char_whitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',preserve_interword_spaces:'0'});
    return S.worker;
  }
  function mapGridOCR(data,cells,grid,cols){
    let n=0;
    for(const w of data.words||[]){
      const code=normalizeCode(w.text);if(!code||!w.bbox)continue;
      const cx=(w.bbox.x0+w.bbox.x1)/2,cy=(w.bbox.y0+w.bbox.y1)/2,c=interval(grid.xs,cx),r=interval(grid.ys,cy);if(c<0||r<0)continue;
      const cell=cells[r*cols+c];if(!cell.code){cell.code=code;cell.direct=true;n++;}
    }
    return n;
  }
  function parseCodes(data){
    const out=new Set();
    for(const w of data.words||[]){const c=normalizeCode(w.text);if(c)out.add(c);}
    const text=String(data.text||'').toUpperCase();
    for(const m of text.matchAll(/([A-Z]{1,2})\s*([0-9OILSZGB]{1,2})/g)){const c=normalizeCode(m[1]+m[2]);if(c)out.add(c);}
    return out;
  }
  function regionCanvas(src,x,y,w,h){
    if(w<20||h<20)return null;const scale=Math.min(3,1800/Math.max(w,h));const c=document.createElement('canvas');c.width=Math.max(1,Math.round(w*scale));c.height=Math.max(1,Math.round(h*scale));c.getContext('2d').drawImage(src,x,y,w,h,0,0,c.width,c.height);return c;
  }
  async function readLegend(worker,src,rect){
    const regions=[];
    if(src.height-(rect.y+rect.h)>35)regions.push(regionCanvas(src,0,rect.y+rect.h,src.width,src.height-(rect.y+rect.h)));
    if(src.width-(rect.x+rect.w)>35)regions.push(regionCanvas(src,rect.x+rect.w,0,src.width-(rect.x+rect.w),src.height));
    if(rect.y>35)regions.push(regionCanvas(src,0,0,src.width,rect.y));
    const cols=$('colsInput'),rows=$('rowsInput'),cv=cols.value,rv=rows.value,found=new Set();
    try{
      cols.value='';rows.value='';await worker.setParameters({tessedit_pageseg_mode:'6'});
      for(const canvas of regions.filter(Boolean).slice(0,2)){
        progress('正在读取图纸自带色卡…',18);
        const res=await worker.recognize(canvas);for(const c of parseCodes(res.data||{}))found.add(c);if(found.size>=4)break;
      }
    }catch(_){
    }finally{cols.value=cv;rows.value=rv;}
    return found;
  }

  function srgb(v){v/=255;return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4)}
  function lab(rgb){const r=srgb(rgb[0]),g=srgb(rgb[1]),b=srgb(rgb[2]),x=(.4124*r+.3576*g+.1805*b)/.95047,y=(.2126*r+.7152*g+.0722*b),z=(.0193*r+.1192*g+.9505*b)/1.08883,f=t=>t>.008856?Math.cbrt(t):7.787*t+16/116,fx=f(x),fy=f(y),fz=f(z);return [116*fy-16,500*(fx-fy),200*(fy-fz)]}
  function de(a,b){const A=lab(a),B=lab(b);return Math.hypot(A[0]-B[0],A[1]-B[1],A[2]-B[2])}
  function clusterCells(cells){
    const qs=[];
    for(const c of cells){if(!c.direct&&!c.visual&&c.ink<.018)continue;let best=null,bd=1e9;for(const q of qs){const d=de(c.rgb,q.rgb);if(d<bd){bd=d;best=q;}}if(best&&bd<8.5){const n=best.cells.length;best.cells.push(c);best.rgb=best.rgb.map((v,i)=>(v*n+c.rgb[i])/(n+1));}else qs.push({rgb:[...c.rgb],cells:[c]});}
    return qs;
  }
  function assignColors(cells,legend){
    const direct=cells.filter(c=>c.direct&&c.code), delta=[0,1,2].map(i=>median(direct.map(c=>c.rgb[i]-MARD.get(c.code)[i+1])));
    const allowed=new Set([...legend,...direct.map(c=>c.code)]), useAllowed=allowed.size>=3;
    const palette=(useAllowed?[...allowed]:COLORS.map(x=>x[0])).map(code=>{const x=MARD.get(code);return {code,rgb:[x[1]+delta[0],x[2]+delta[1],x[3]+delta[2]]};});
    const clusters=clusterCells(cells);let filled=0;
    for(const q of clusters){
      const votes=new Map();for(const c of q.cells)if(c.direct&&c.code)votes.set(c.code,(votes.get(c.code)||0)+1);
      let code=votes.size?[...votes].sort((a,b)=>b[1]-a[1])[0][0]:'';
      if(!code){let best=null,bd=1e9;for(const p of palette){const d=de(q.rgb,p.rgb);if(d<bd){bd=d;best=p;}}if(best&&bd<(useAllowed?24:17))code=best.code;}
      if(!code)continue;
      for(const c of q.cells){if(!c.code){c.code=code;c.hex=rgbHex(c.rgb);filled++;}}
    }
    return {filled,clusters:clusters.length,legendCount:legend.size,allowedCount:allowed.size};
  }

  function groups(){const m=new Map();for(const c of S.cells){if(!c.code)continue;if(!m.has(c.code))m.set(c.code,{code:c.code,count:0,rgb:c.rgb});const g=m.get(c.code);g.count++;}return [...m.values()].sort((a,b)=>b.count-a.count||a.code.localeCompare(b.code));}
  function draw(){
    const canvas=$('gridCanvas'),size=+$('zoomRange').value||34; $('zoomValue').textContent=String(size);canvas.width=S.cols*size+1;canvas.height=S.rows*size+1;const ctx=canvas.getContext('2d');ctx.font=`${Math.max(7,Math.floor(size*.28))}px -apple-system,BlinkMacSystemFont,sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';
    for(const c of S.cells){const x=c.c*size,y=c.r*size,vis=!S.selectedCode||c.code===S.selectedCode;ctx.globalAlpha=c.code?(vis?1:.08):1;ctx.fillStyle=c.code?c.hex:'#fff';ctx.fillRect(x,y,size,size);if(c.code&&vis){ctx.fillStyle=lum(c.rgb)<130?'#fff':'#222';ctx.fillText(c.code,x+size/2,y+size/2);}if(S.done.has(`${c.r},${c.c}`)&&vis){ctx.strokeStyle='#111';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x+size*.24,y+size*.52);ctx.lineTo(x+size*.43,y+size*.7);ctx.lineTo(x+size*.77,y+size*.27);ctx.stroke();}ctx.globalAlpha=1;ctx.strokeStyle='rgba(0,0,0,.17)';ctx.lineWidth=1;ctx.strokeRect(x+.5,y+.5,size,size);}
    ctx.strokeStyle='#111';ctx.lineWidth=2.5;for(let x=5;x<S.cols;x+=5){ctx.beginPath();ctx.moveTo(x*size+.5,0);ctx.lineTo(x*size+.5,canvas.height);ctx.stroke();}for(let y=5;y<S.rows;y+=5){ctx.beginPath();ctx.moveTo(0,y*size+.5);ctx.lineTo(canvas.width,y*size+.5);ctx.stroke();}
  }
  function render(){
    const gs=groups(),recognized=S.cells.filter(c=>c.code).length;$('stats').innerHTML=`<div class="stat"><span>网格</span><b>${S.cols}×${S.rows}</b></div><div class="stat"><span>颜色</span><b>${gs.length}</b></div><div class="stat"><span>已识别</span><b>${recognized}</b></div><div class="stat"><span>已完成</span><b>${S.done.size}</b></div>`;
    const pal=$('palette');pal.innerHTML='';for(const g of gs){const b=document.createElement('button');b.type='button';b.className='chip'+(S.selectedCode===g.code?' active':'');b.dataset.v5code=g.code;b.innerHTML=`<div class="chip-color" style="background:${rgbHex(g.rgb)}"></div><strong>${g.code}</strong><span>${g.count} 颗</span>`;pal.appendChild(b);}$('activeCode').textContent=S.selectedCode||'全部';draw();
  }
  function showCell(c){S.selectedCell=c;const el=$('currentCell');el.classList.remove('hidden');el.innerHTML=`<b>${c.code||'未识别'}</b> · 总第 ${c.r+1} 行 / 第 ${c.c+1} 列<br>5×5 模块：第 ${Math.floor(c.r/5)+1} 行模块 × 第 ${Math.floor(c.c/5)+1} 列模块；模块内第 ${c.r%5+1} 行 / 第 ${c.c%5+1} 列`;$('editCodeInput').value=c.code||'';}

  async function recognize(){
    const src=$('sourceCanvas');let cols=parseInt($('colsInput').value,10),rows=parseInt($('rowsInput').value,10);if(!src?.width)throw new Error('请先上传图纸');if(!cols||!rows||cols<1||rows<1||cols>160||rows>160)throw new Error('请先填写正确的列数和行数');
    const count=rows*cols;if(count>11000)throw new Error('网格超过 11000 格，请分区识别');
    $('recognizeBtn').disabled=true;progress('按你填写的行列数寻找真实格线…',6);
    const rect=cropRectFromDOM(),crop=makeCrop(src,rect),grid=snappedGrid(crop,rows,cols);progress('逐格读取底色…',12);const cells=buildCells(crop,rows,cols,grid);
    const worker=await getWorker();const legend=await readLegend(worker,src,rect);$('colsInput').value=cols;$('rowsInput').value=rows;await worker.setParameters({tessedit_pageseg_mode:'6'});progress('正在读取格内 MARD 编号…',30);const result=await worker.recognize(crop);const direct=mapGridOCR(result.data||{},cells,grid,cols);progress('用色卡和底色补全漏读格…',82);const info=assignColors(cells,legend);
    S.active=true;S.rows=rows;S.cols=cols;S.cells=cells;S.done.clear();S.selectedCode=null;S.selectedCell=null;render();$('workSection').classList.remove('hidden');hideProgress();const rec=cells.filter(c=>c.code).length,colors=groups().length,pct=Math.round(rec/count*100);notice(`V5：固定按 ${cols}×${rows} 识别；自动吸附真实格线。图纸色卡读到 ${legend.size} 种，格内 OCR 直接确认 ${direct} 格，颜色库补全 ${info.filled} 格；最终识别 ${colors} 种颜色、${rec}/${count} 格。`,pct>40?'ok':'warn');$('workSection').scrollIntoView({behavior:'smooth',block:'start'});
  }

  document.addEventListener('click',async e=>{
    const t=e.target.closest?.('button,[data-v5code],#gridCanvas');if(!t)return;
    if(t.id==='recognizeBtn'){
      e.preventDefault();e.stopImmediatePropagation();try{await recognize();}catch(err){hideProgress();notice(`识别失败：${err.message||err}`,'warn');}finally{$('recognizeBtn').disabled=false;}return;
    }
    if(!S.active)return;
    if(t.dataset?.v5code){e.preventDefault();e.stopImmediatePropagation();S.selectedCode=S.selectedCode===t.dataset.v5code?null:t.dataset.v5code;render();return;}
    if(t.id==='showAllBtn'){e.preventDefault();e.stopImmediatePropagation();S.selectedCode=null;render();return;}
    if(t.id==='gridCanvas'){
      e.preventDefault();e.stopImmediatePropagation();const rect=t.getBoundingClientRect(),sx=t.width/rect.width,sy=t.height/rect.height,size=+$('zoomRange').value||34,c=Math.floor((e.clientX-rect.left)*sx/size),r=Math.floor((e.clientY-rect.top)*sy/size);if(c<0||c>=S.cols||r<0||r>=S.rows)return;const cell=S.cells[r*S.cols+c],key=`${r},${c}`;if(cell.code){S.done.has(key)?S.done.delete(key):S.done.add(key);}showCell(cell);render();return;
    }
    if(t.id==='nextBtn'){e.preventDefault();e.stopImmediatePropagation();const a=S.cells.filter(c=>c.code&&(!S.selectedCode||c.code===S.selectedCode)&&!S.done.has(`${c.r},${c.c}`));if(!a.length){toast('当前颜色已经没有未完成格子了');return;}const c=a[0];showCell(c);const size=+$('zoomRange').value||34,$s=$('gridScroller');$s.scrollTo({left:Math.max(0,c.c*size-$s.clientWidth/2),top:Math.max(0,c.r*size-$s.clientHeight/2),behavior:'smooth'});return;}
    if(t.id==='saveCodeBtn'){e.preventDefault();e.stopImmediatePropagation();if(!S.selectedCell){toast('先点工作图里的一个格子');return;}const code=normalizeCode($('editCodeInput').value);if($('editCodeInput').value.trim()&&!code){toast('这个不是有效的 MARD 色号');return;}S.selectedCell.code=code;render();showCell(S.selectedCell);toast('已保存');return;}
  },true);
  document.addEventListener('input',e=>{if(S.active&&e.target.id==='zoomRange'){e.stopImmediatePropagation();draw();}},true);
  $('resetBtn')?.addEventListener('click',()=>{S.active=false;S.cells=[];S.done.clear();},true);
})();
