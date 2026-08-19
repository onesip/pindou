(() => {
  'use strict';

  const COLORS = window.PINDOU_MARD_COLORS || [];
  if (!COLORS.length) return;
  const MARD = new Map(COLORS.map(x => [x[0], x]));
  const $ = id => document.getElementById(id);
  const S = {active:false,rows:0,cols:0,cells:[],done:new Set(),selectedCode:null,selectedCell:null,worker:null};
  window.__pindouV6 = S;

  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const median=a=>{if(!a.length)return 0;const b=[...a].sort((x,y)=>x-y),m=Math.floor(b.length/2);return b.length%2?b[m]:(b[m-1]+b[m])/2};
  const mean=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:0;
  const rgbHex=rgb=>'#'+rgb.map(v=>clamp(Math.round(v),0,255).toString(16).padStart(2,'0')).join('');
  const lum=rgb=>.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];
  const sat=rgb=>{const hi=Math.max(...rgb),lo=Math.min(...rgb);return hi?((hi-lo)/hi):0};

  function notice(msg,kind=''){
    const el=$('detectNotice');if(!el)return;el.textContent=msg;el.className=`notice ${kind}`.trim();el.classList.remove('hidden');
  }
  function progress(text,pct){
    const box=$('progressBox');if(!box)return;box.classList.remove('hidden');$('progressText').textContent=text;$('progressPct').textContent=`${Math.round(pct)}%`;$('progressBar').style.width=`${clamp(pct,0,100)}%`;
  }
  function hideProgress(){$('progressBox')?.classList.add('hidden')}
  function toast(msg){const el=$('toast');if(!el)return;el.textContent=msg;el.classList.remove('hidden');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.add('hidden'),2200)}

  function normalizeCode(raw){
    let s=String(raw||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
    if(MARD.has(s))return s;
    const m=s.match(/^([A-Z]{1,2})([0-9OILSZGB]{1,3})$/);if(!m)return '';
    const n=m[2].replace(/O/g,'0').replace(/[IL]/g,'1').replace(/Z/g,'2').replace(/S/g,'5').replace(/G/g,'6').replace(/B/g,'8');
    s=m[1]+n;return MARD.has(s)?s:'';
  }

  function cropRectFromDOM(){
    const src=$('sourceCanvas'),ov=$('cropOverlay');if(!src||!src.width||!src.height)throw new Error('请先上传图纸');
    let x=parseFloat(ov?.style.left),y=parseFloat(ov?.style.top),w=parseFloat(ov?.style.width),h=parseFloat(ov?.style.height);
    if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(w)||!Number.isFinite(h)||w<2||h<2){x=0;y=0;w=src.width;h=src.height}
    x=clamp(x,0,src.width-1);y=clamp(y,0,src.height-1);w=clamp(w,1,src.width-x);h=clamp(h,1,src.height-y);return{x,y,w,h};
  }
  function makeCrop(src,rect){const c=document.createElement('canvas');c.width=Math.max(1,Math.round(rect.w));c.height=Math.max(1,Math.round(rect.h));c.getContext('2d',{willReadFrequently:true}).drawImage(src,rect.x,rect.y,rect.w,rect.h,0,0,c.width,c.height);return c}

  function projectionScores(ctx,vertical){
    const W=ctx.canvas.width,H=ctx.canvas.height,d=ctx.getImageData(0,0,W,H).data,n=vertical?W:H,m=vertical?H:W,out=new Float32Array(n),step=Math.max(1,Math.floor(m/450));
    for(let i=1;i<n-1;i++){let s=0,k=0;for(let j=0;j<m;j+=step){const p1=vertical?(j*W+i-1)*4:((i-1)*W+j)*4,p2=vertical?(j*W+i+1)*4:((i+1)*W+j)*4;const l1=.2126*d[p1]+.7152*d[p1+1]+.0722*d[p1+2],l2=.2126*d[p2]+.7152*d[p2+1]+.0722*d[p2+2];s+=Math.abs(l2-l1);k++}out[i]=s/Math.max(1,k)}return out;
  }
  function snapAxis(scores,length,count){
    const pitch=length/count,rad=Math.max(2,Math.min(24,pitch*.28)),lines=[];
    for(let i=0;i<=count;i++){
      if(i===0){lines.push(0);continue}if(i===count){lines.push(length);continue}
      const exp=i*pitch,lo=Math.max(1,Math.floor(exp-rad)),hi=Math.min(length-2,Math.ceil(exp+rad));let bx=Math.round(exp),best=-1;
      for(let x=lo;x<=hi;x++){const q=(scores[x]||0)+.45*(scores[x-1]||0)+.45*(scores[x+1]||0)-.10*Math.abs(x-exp);if(q>best){best=q;bx=x}}
      lines.push(bx);
    }
    // regularize: do not allow one strong internal edge to drag a grid line too far
    for(let i=1;i<count;i++){const exp=i*pitch;if(Math.abs(lines[i]-exp)>pitch*.22)lines[i]=exp}
    for(let i=1;i<lines.length;i++)lines[i]=Math.max(lines[i],lines[i-1]+1);lines[count]=length;return lines;
  }
  function snappedGrid(crop,rows,cols){
    const maxSide=1100,s=Math.min(1,maxSide/Math.max(crop.width,crop.height)),mini=document.createElement('canvas');mini.width=Math.max(2,Math.round(crop.width*s));mini.height=Math.max(2,Math.round(crop.height*s));const ctx=mini.getContext('2d',{willReadFrequently:true});ctx.drawImage(crop,0,0,mini.width,mini.height);
    return{xs:snapAxis(projectionScores(ctx,true),mini.width,cols).map(x=>x/s),ys:snapAxis(projectionScores(ctx,false),mini.height,rows).map(y=>y/s)};
  }

  function sampleCell(data,W,H,x,y,w,h){
    const mx=Math.max(1,w*.12),my=Math.max(1,h*.12),x0=clamp(Math.floor(x+mx),0,W-1),x1=clamp(Math.ceil(x+w-mx),x0+1,W),y0=clamp(Math.floor(y+my),0,H-1),y1=clamp(Math.ceil(y+h-my),y0+1,H),step=Math.max(1,Math.floor(Math.min(w,h)/16));
    const bins=new Map(),pixels=[];
    for(let yy=y0;yy<y1;yy+=step)for(let xx=x0;xx<x1;xx+=step){const p=(yy*W+xx)*4,r=data[p],g=data[p+1],b=data[p+2];pixels.push([r,g,b]);const k=`${Math.round(r/10)*10},${Math.round(g/10)*10},${Math.round(b/10)*10}`;bins.set(k,(bins.get(k)||0)+1)}
    let key='255,255,255',best=-1;for(const[k,n]of bins)if(n>best){best=n;key=k}
    const base=key.split(',').map(Number),close=pixels.filter(p=>Math.hypot(p[0]-base[0],p[1]-base[1],p[2]-base[2])<31),rgb=[0,1,2].map(i=>close.length?Math.round(mean(close.map(p=>p[i]))):base[i]);
    let ink=0;for(const p of pixels){const dist=Math.hypot(p[0]-rgb[0],p[1]-rgb[1],p[2]-rgb[2]);if(dist>38&&Math.abs(lum(p)-lum(rgb))>24)ink++}ink/=Math.max(1,pixels.length);
    const support=best/Math.max(1,pixels.length),colorful=sat(rgb)>.055,dark=lum(rgb)<235,hasText=ink>.022;
    // Blank transparent/checkerboard cells are near-neutral, bright and contain no text.
    const occupied=colorful||dark||hasText;
    return{rgb,ink,support,occupied,hex:rgbHex(rgb)};
  }
  function buildCells(crop,rows,cols,grid){
    const ctx=crop.getContext('2d',{willReadFrequently:true}),W=crop.width,H=crop.height,d=ctx.getImageData(0,0,W,H).data,cells=[];
    for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){const x=grid.xs[c],y=grid.ys[r],w=Math.max(1,grid.xs[c+1]-x),h=Math.max(1,grid.ys[r+1]-y),s=sampleCell(d,W,H,x,y,w,h);cells.push({r,c,x,y,w,h,...s,code:'',direct:false,cluster:-1})}return cells;
  }

  function srgb(v){v/=255;return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4)}
  function lab(rgb){const r=srgb(rgb[0]),g=srgb(rgb[1]),b=srgb(rgb[2]),x=(.4124*r+.3576*g+.1805*b)/.95047,y=(.2126*r+.7152*g+.0722*b),z=(.0193*r+.1192*g+.9505*b)/1.08883,f=t=>t>.008856?Math.cbrt(t):7.787*t+16/116,fx=f(x),fy=f(y),fz=f(z);return[116*fy-16,500*(fx-fy),200*(fy-fz)]}
  function de(a,b){const A=lab(a),B=lab(b);return Math.hypot(A[0]-B[0],A[1]-B[1],A[2]-B[2])}
  function clusterCells(cells){
    const clusters=[];
    for(const c of cells){if(!c.occupied)continue;let best=-1,bd=1e9;for(let i=0;i<clusters.length;i++){const d=de(c.rgb,clusters[i].rgb);if(d<bd){bd=d;best=i}}
      if(best>=0&&bd<4.8){const q=clusters[best],n=q.cells.length;q.cells.push(c);q.rgb=q.rgb.map((v,i)=>(v*n+c.rgb[i])/(n+1));c.cluster=best}else{c.cluster=clusters.length;clusters.push({rgb:[...c.rgb],cells:[c],votes:new Map(),code:''})}
    }
    return clusters;
  }

  function interval(lines,v){let lo=0,hi=lines.length-2;while(lo<=hi){const m=(lo+hi)>>1;if(v<lines[m])hi=m-1;else if(v>=lines[m+1])lo=m+1;else return m}return-1}
  async function getWorker(){
    if(S.worker)return S.worker;if(!window.Tesseract)throw new Error('OCR 组件未加载，请联网刷新页面');
    S.worker=await Tesseract.createWorker('eng',1,{logger:m=>{if(m.status==='recognizing text')progress('正在读取颜色编号…',28+(m.progress||0)*45)}});await S.worker.setParameters({tessedit_char_whitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',preserve_interword_spaces:'0'});return S.worker;
  }
  function parseCodes(data){const out=new Set();for(const w of data.words||[]){const c=normalizeCode(w.text);if(c)out.add(c)}const text=String(data.text||'').toUpperCase();for(const m of text.matchAll(/([A-Z]{1,2})\s*([0-9OILSZGB]{1,2})/g)){const c=normalizeCode(m[1]+m[2]);if(c)out.add(c)}return out}
  function mapGridOCR(data,cells,grid,cols){
    let n=0;for(const w of data.words||[]){const code=normalizeCode(w.text);if(!code||!w.bbox)continue;const cx=(w.bbox.x0+w.bbox.x1)/2,cy=(w.bbox.y0+w.bbox.y1)/2,c=interval(grid.xs,cx),r=interval(grid.ys,cy);if(c<0||r<0)continue;const cell=cells[r*cols+c];cell.code=code;cell.direct=true;cell.occupied=true;n++}return n;
  }
  function regionCanvas(src,x,y,w,h){if(w<20||h<20)return null;const scale=Math.min(4,2200/Math.max(w,h)),c=document.createElement('canvas');c.width=Math.max(1,Math.round(w*scale));c.height=Math.max(1,Math.round(h*scale));c.getContext('2d').drawImage(src,x,y,w,h,0,0,c.width,c.height);return c}
  async function readLegend(worker,src,rect){
    const regs=[];if(src.height-(rect.y+rect.h)>25)regs.push(regionCanvas(src,0,rect.y+rect.h,src.width,src.height-(rect.y+rect.h)));if(src.width-(rect.x+rect.w)>25)regs.push(regionCanvas(src,rect.x+rect.w,0,src.width-(rect.x+rect.w),src.height));if(rect.y>25)regs.push(regionCanvas(src,0,0,src.width,rect.y));const found=new Set();
    try{await worker.setParameters({tessedit_pageseg_mode:'6'});for(const c of regs.filter(Boolean).slice(0,3)){progress('正在读取图纸自带色卡…',18);const res=await worker.recognize(c);for(const code of parseCodes(res.data||{}))found.add(code)}}catch(_){}return found;
  }

  function buildClusterSheet(crop,clusters){
    const useful=clusters.filter(q=>q.cells.length>0).slice(0,72),tileW=120,tileH=84,ncol=6,nrow=Math.ceil(useful.length/ncol),sheet=document.createElement('canvas');sheet.width=ncol*tileW;sheet.height=Math.max(tileH,nrow*tileH);const ctx=sheet.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,sheet.width,sheet.height);const map=[];
    useful.forEach((q,i)=>{const cell=q.cells.sort((a,b)=>b.support-a.support)[0],col=i%ncol,row=Math.floor(i/ncol),pad=8;ctx.fillStyle='#fff';ctx.fillRect(col*tileW,row*tileH,tileW,tileH);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(crop,cell.x,cell.y,cell.w,cell.h,col*tileW+pad,row*tileH+pad,tileW-pad*2,tileH-pad*2);map.push({cluster:q,index:i,x:col*tileW,y:row*tileH,w:tileW,h:tileH})});return{sheet,map,tileW,tileH,ncol};
  }
  async function readClusterCodes(worker,crop,clusters){
    if(!clusters.length)return 0;const{sheet,map,tileW,tileH,ncol}=buildClusterSheet(crop,clusters);let hits=0;
    try{await worker.setParameters({tessedit_pageseg_mode:'6'});progress('正在放大每一种底色重新读编号…',58);const res=await worker.recognize(sheet);for(const w of res.data?.words||[]){const code=normalizeCode(w.text);if(!code||!w.bbox)continue;const cx=(w.bbox.x0+w.bbox.x1)/2,cy=(w.bbox.y0+w.bbox.y1)/2,col=Math.floor(cx/tileW),row=Math.floor(cy/tileH),idx=row*ncol+col,item=map[idx];if(!item)continue;item.cluster.votes.set(code,(item.cluster.votes.get(code)||0)+2);hits++}}catch(_){}return hits;
  }

  function addDirectVotes(clusters,cells){for(const c of cells){if(!c.direct||!c.code||c.cluster<0)continue;const q=clusters[c.cluster];q.votes.set(c.code,(q.votes.get(c.code)||0)+3}}
  function fitCalibration(cells){
    const byCode=new Map();for(const c of cells){if(!c.direct||!c.code)continue;if(!byCode.has(c.code))byCode.set(c.code,[]);byCode.get(c.code).push(c.rgb)}
    const pairs=[];for(const[code,arr]of byCode){const ref=MARD.get(code);if(!ref)continue;pairs.push({ref:[ref[1],ref[2],ref[3]],obs:[0,1,2].map(i=>median(arr.map(x=>x[i])))})}
    const out=[];for(let ch=0;ch<3;ch++){
      if(pairs.length<2){const b=pairs.length?median(pairs.map(p=>p.obs[ch]-p.ref[ch])):0;out.push({a:1,b:clamp(b,-65,65)});continue}
      const xs=pairs.map(p=>p.ref[ch]),ys=pairs.map(p=>p.obs[ch]),mx=mean(xs),my=mean(ys);let num=0,den=0;for(let i=0;i<xs.length;i++){num+=(xs[i]-mx)*(ys[i]-my);den+=(xs[i]-mx)*(xs[i]-mx)}let a=den?num/den:1,b=my-a*mx;a=clamp(a,.65,1.35);b=clamp(b,-70,70);out.push({a,b})
    }return out;
  }
  function predictedRGB(entry,cal){return[0,1,2].map(i=>clamp(entry[i+1]*cal[i].a+cal[i].b,0,255))}
  function chooseCode(rgb,preferred,cal){
    let allCode='',allD=1e9,prefCode='',prefD=1e9;
    for(const e of COLORS){const d=de(rgb,predictedRGB(e,cal));if(d<allD){allD=d;allCode=e[0]}if(preferred.has(e[0])&&d<prefD){prefD=d;prefCode=e[0]}}
    // Legend/direct codes are a prior, never an exclusive whitelist.
    if(prefCode&&prefD<=allD+5.5&&prefD<28)return{code:prefCode,d:prefD,source:'preferred'};
    if(allD<22)return{code:allCode,d:allD,source:'all'};return{code:'',d:allD,source:'none'};
  }
  function assignClusters(cells,clusters,legend){
    addDirectVotes(clusters,cells);const cal=fitCalibration(cells),preferred=new Set([...legend,...cells.filter(c=>c.direct&&c.code).map(c=>c.code)]);let filled=0,fromVote=0,fromColor=0;
    for(const q of clusters){let code='';if(q.votes.size){code=[...q.votes].sort((a,b)=>b[1]-a[1])[0][0];fromVote++}else{const pick=chooseCode(q.rgb,preferred,cal);code=pick.code;if(code)fromColor++}
      q.code=code;if(!code)continue;for(const c of q.cells){if(!c.code){c.code=code;c.hex=rgbHex(c.rgb);filled++}}
    }
    return{filled,fromVote,fromColor,preferred:preferred.size};
  }

  function groups(){const m=new Map();for(const c of S.cells){if(!c.code)continue;if(!m.has(c.code))m.set(c.code,{code:c.code,count:0,rgb:c.rgb});m.get(c.code).count++}return[...m.values()].sort((a,b)=>b.count-a.count||a.code.localeCompare(b.code))}
  function draw(){
    const canvas=$('gridCanvas'),size=+$('zoomRange').value||34;$('zoomValue').textContent=String(size);canvas.width=S.cols*size+1;canvas.height=S.rows*size+1;const ctx=canvas.getContext('2d');ctx.font=`${Math.max(7,Math.floor(size*.28))}px -apple-system,BlinkMacSystemFont,sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';
    for(const c of S.cells){const x=c.c*size,y=c.r*size,vis=!S.selectedCode||c.code===S.selectedCode;ctx.globalAlpha=c.code?(vis?1:.08):1;ctx.fillStyle=c.code?c.hex:'#fff';ctx.fillRect(x,y,size,size);if(c.code&&vis){ctx.fillStyle=lum(c.rgb)<130?'#fff':'#222';ctx.fillText(c.code,x+size/2,y+size/2)}if(S.done.has(`${c.r},${c.c}`)&&vis){ctx.strokeStyle='#111';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x+size*.24,y+size*.52);ctx.lineTo(x+size*.43,y+size*.7);ctx.lineTo(x+size*.77,y+size*.27);ctx.stroke()}ctx.globalAlpha=1;ctx.strokeStyle='rgba(0,0,0,.17)';ctx.lineWidth=1;ctx.strokeRect(x+.5,y+.5,size,size)}ctx.strokeStyle='#111';ctx.lineWidth=2.5;for(let x=5;x<S.cols;x+=5){ctx.beginPath();ctx.moveTo(x*size+.5,0);ctx.lineTo(x*size+.5,canvas.height);ctx.stroke()}for(let y=5;y<S.rows;y+=5){ctx.beginPath();ctx.moveTo(0,y*size+.5);ctx.lineTo(canvas.width,y*size+.5);ctx.stroke()}
  }
  function render(){const gs=groups(),recognized=S.cells.filter(c=>c.code).length;$('stats').innerHTML=`<div class="stat"><span>网格</span><b>${S.cols}×${S.rows}</b></div><div class="stat"><span>颜色</span><b>${gs.length}</b></div><div class="stat"><span>已识别</span><b>${recognized}</b></div><div class="stat"><span>已完成</span><b>${S.done.size}</b></div>`;const pal=$('palette');pal.innerHTML='';for(const g of gs){const b=document.createElement('button');b.type='button';b.className='chip'+(S.selectedCode===g.code?' active':'');b.dataset.v6code=g.code;b.innerHTML=`<div class="chip-color" style="background:${rgbHex(g.rgb)}"></div><strong>${g.code}</strong><span>${g.count} 颗</span>`;pal.appendChild(b)}$('activeCode').textContent=S.selectedCode||'全部';draw()}
  function showCell(c){S.selectedCell=c;const el=$('currentCell');el.classList.remove('hidden');el.innerHTML=`<b>${c.code||'未识别'}</b> · 总第 ${c.r+1} 行 / 第 ${c.c+1} 列<br>5×5 模块：第 ${Math.floor(c.r/5)+1} 行模块 × 第 ${Math.floor(c.c/5)+1} 列模块；模块内第 ${c.r%5+1} 行 / 第 ${c.c%5+1} 列`;$('editCodeInput').value=c.code||''}

  async function recognize(){
    const src=$('sourceCanvas');let cols=parseInt($('colsInput').value,10),rows=parseInt($('rowsInput').value,10);if(!src?.width)throw new Error('请先上传图纸');if(!cols||!rows||cols<1||rows<1||cols>160||rows>160)throw new Error('请先填写正确的列数和行数');const count=rows*cols;if(count>11000)throw new Error('网格超过 11000 格，请分区识别');
    $('recognizeBtn').disabled=true;progress('固定行列数，吸附真实格线…',5);const rect=cropRectFromDOM(),crop=makeCrop(src,rect),grid=snappedGrid(crop,rows,cols);progress('逐格读取底色，不再只靠 OCR…',10);const cells=buildCells(crop,rows,cols,grid),clusters=clusterCells(cells);const worker=await getWorker();const legend=await readLegend(worker,src,rect);$('colsInput').value=cols;$('rowsInput').value=rows;
    await worker.setParameters({tessedit_pageseg_mode:'6'});progress('整张图 OCR 读取明显编号…',30);const result=await worker.recognize(crop),direct=mapGridOCR(result.data||{},cells,grid,cols);addDirectVotes(clusters,cells);const clusterHits=await readClusterCodes(worker,crop,clusters);progress('用全部 291 色 + 图纸色卡补全中间颜色…',84);const info=assignClusters(cells,clusters,legend);
    S.active=true;S.rows=rows;S.cols=cols;S.cells=cells;S.done.clear();S.selectedCode=null;S.selectedCell=null;render();$('workSection').classList.remove('hidden');hideProgress();const rec=cells.filter(c=>c.code).length,colors=groups().length,occupied=cells.filter(c=>c.occupied).length,pct=occupied?Math.round(rec/occupied*100):0;notice(`V6：检测到 ${clusters.length} 个底色组；图纸色卡 ${legend.size} 种；整图 OCR ${direct} 格；放大同色格 OCR 命中 ${clusterHits} 次。最终 ${colors} 种颜色，已补全 ${rec}/${occupied} 个有内容格。`,pct>70?'ok':'warn');$('workSection').scrollIntoView({behavior:'smooth',block:'start'});
  }

  document.addEventListener('click',async e=>{
    const t=e.target.closest?.('button,[data-v6code],#gridCanvas');if(!t)return;
    if(t.id==='recognizeBtn'){
      e.preventDefault();e.stopImmediatePropagation();try{await recognize()}catch(err){hideProgress();notice(`识别失败：${err.message||err}`,'warn')}finally{$('recognizeBtn').disabled=false}return;
    }
    if(t.id==='resetBtn'){S.active=false;S.cells=[];S.done.clear();return}
    if(!S.active)return;
    if(t.dataset?.v6code){e.preventDefault();e.stopImmediatePropagation();S.selectedCode=S.selectedCode===t.dataset.v6code?null:t.dataset.v6code;render();return}
    if(t.id==='showAllBtn'){e.preventDefault();e.stopImmediatePropagation();S.selectedCode=null;render();return}
    if(t.id==='gridCanvas'){e.preventDefault();e.stopImmediatePropagation();const rect=t.getBoundingClientRect(),sx=t.width/rect.width,sy=t.height/rect.height,size=+$('zoomRange').value||34,c=Math.floor((e.clientX-rect.left)*sx/size),r=Math.floor((e.clientY-rect.top)*sy/size);if(c<0||c>=S.cols||r<0||r>=S.rows)return;const cell=S.cells[r*S.cols+c],key=`${r},${c}`;if(cell.code){S.done.has(key)?S.done.delete(key):S.done.add(key)}showCell(cell);render();return}
    if(t.id==='nextBtn'){e.preventDefault();e.stopImmediatePropagation();const a=S.cells.filter(c=>c.code&&(!S.selectedCode||c.code===S.selectedCode)&&!S.done.has(`${c.r},${c.c}`));if(!a.length){toast('当前颜色已经没有未完成格子了');return}const c=a[0];showCell(c);const size=+$('zoomRange').value||34,$s=$('gridScroller');$s.scrollTo({left:Math.max(0,c.c*size-$s.clientWidth/2),top:Math.max(0,c.r*size-$s.clientHeight/2),behavior:'smooth'});return}
    if(t.id==='saveCodeBtn'){e.preventDefault();e.stopImmediatePropagation();if(!S.selectedCell){toast('先点工作图里的一个格子');return}const code=normalizeCode($('editCodeInput').value);if($('editCodeInput').value.trim()&&!code){toast('这个不是有效的 MARD 色号');return}S.selectedCell.code=code;render();showCell(S.selectedCell);toast('已保存');return}
  },true);
  document.addEventListener('input',e=>{if(S.active&&e.target.id==='zoomRange'){e.stopImmediatePropagation();draw()}},true);
})();