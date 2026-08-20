(() => {
'use strict';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function srgb(v){v/=255;return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4)}
function lab(a){const r=srgb(a[0]),g=srgb(a[1]),b=srgb(a[2]),x=(.4124*r+.3576*g+.1805*b)/.95047,y=.2126*r+.7152*g+.0722*b,z=(.0193*r+.1192*g+.9505*b)/1.08883,f=t=>t>.008856?Math.cbrt(t):7.787*t+16/116,fx=f(x),fy=f(y),fz=f(z);return[116*fy-16,500*(fx-fy),200*(fy-fz)]}
function de(a,b){const A=lab(a),B=lab(b);return Math.hypot(A[0]-B[0],A[1]-B[1],A[2]-B[2])}
function hex(a){return '#'+a.map(v=>clamp(Math.round(v),0,255).toString(16).padStart(2,'0')).join('')}
async function boot(){
  for(let i=0;i<150&&!window.__pindouV11;i++) await sleep(100);
  const S=window.__pindouV11;if(!S)return;
  const $=id=>document.getElementById(id), COLORS=window.PINDOU_MARD_COLORS||[], VALID=new Set(COLORS.map(x=>x[0]));
  const work=$('workSection'), grid=$('gridCanvas');if(!work||!grid)return;
  if($('manualFillV13'))return;
  const style=document.createElement('style');style.textContent=`
  #manualFillV13{margin:12px 0;padding:14px;border:2px solid #191714;border-radius:18px;background:#fffdf9}
  #manualFillV13 h3{margin:0 0 6px;font-size:17px}#manualFillV13 p{margin:0 0 10px;color:#716b65;font-size:12px;line-height:1.55}
  .mf13-row{display:grid;grid-template-columns:1fr 1fr;gap:8px}.mf13-row input{min-width:0;height:44px;border:1px solid #ddd1c6;border-radius:12px;padding:0 12px;font-size:17px;text-transform:uppercase}
  #mf13Mode.on{background:#191714;color:#fff}.mf13-info{margin:9px 0;padding:9px 10px;border-radius:12px;background:#f7f1ea;font-size:12px;line-height:1.5}
  .mf13-range{display:grid;grid-template-columns:auto 1fr auto;gap:8px;align-items:center;margin:9px 0;font-size:12px}.mf13-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}
  @media(max-width:430px){.mf13-actions{grid-template-columns:1fr}}
  `;document.head.appendChild(style);
  const box=document.createElement('div');box.id='manualFillV13';box.innerHTML=`<h3>🎯 漏色？点一颗豆子补整色</h3><p>识别后开启模式，点工作图里任意一颗参考豆，填正确 MARD 色号，再一键把相同底色的格子补出来。</p><button id="mf13Mode" class="secondary" type="button">开始选一颗参考豆</button><div id="mf13Info" class="mf13-info">尚未选择参考豆。</div><div class="mf13-row"><input id="mf13Code" placeholder="例如 A4 / E9 / D24" maxlength="4"><button id="mf13Preview" class="secondary" type="button">预览同色</button></div><div class="mf13-range"><span>严格</span><input id="mf13Tol" type="range" min="1.5" max="14" step="0.5" value="4"><b id="mf13TolVal">4.0</b></div><div class="mf13-actions"><button id="mf13FillMissing" class="secondary" type="button">只补漏掉的同色格</button><button id="mf13FillAll" class="primary" type="button">一键全部标成此色</button></div><button id="mf13Undo" class="ghost" type="button" disabled style="width:100%;margin-top:8px">撤销上一次</button>`;
  const sc=$('gridScroller');work.insertBefore(box,sc);
  let mode=false,selected=null,candidates=[],undo=[];
  const info=$('mf13Info'),code=$('mf13Code'),tol=$('mf13Tol');
  const render=()=>{try{$('showAllBtn')?.click()}catch(_){}};
  function toast(t){const e=$('toast');if(!e)return;e.textContent=t;e.classList.remove('hidden');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.add('hidden'),1800)}
  function update(){
    if(!selected){info.textContent='尚未选择参考豆。';return}
    const base=S.cells[selected];if(!base){info.textContent='参考豆无效。';return}
    const t=+tol.value||4;candidates=S.cells.map((s,i)=>({s,i,d:s?.rgb&&base.rgb?de(s.rgb,base.rgb):999})).filter(x=>x.d<=t);
    info.innerHTML=`参考豆：<b>第 ${base.r+1} 行 / 第 ${base.c+1} 列</b>，当前编号 <b>${base.code||'未识别'}</b><br>找到 <b>${candidates.length}</b> 个相近底色格，其中 <b>${candidates.filter(x=>!x.s.code).length}</b> 个目前漏识别。`;
    if(base.code&&!code.value)code.value=base.code;
  }
  function apply(all){
    if(selected===null)return toast('先点一颗参考豆');const k=code.value.trim().toUpperCase();if(!VALID.has(k))return toast('请输入有效 MARD 色号');update();const targets=candidates.filter(x=>all||!x.s.code);if(!targets.length)return toast('没有需要补的格子');undo=targets.map(x=>({i:x.i,code:x.s.code,rgb:[...x.s.rgb],hex:x.s.hex,occupied:x.s.occupied,confidence:x.s.confidence}));for(const x of targets){x.s.code=k;x.s.hex=hex(x.s.rgb);x.s.occupied=true;x.s.confidence='manual-fill-v13'}$('mf13Undo').disabled=false;S.selectedCode=null;render();toast(`已处理 ${targets.length} 格 → ${k}`);update();
  }
  $('mf13Mode').addEventListener('click',()=>{mode=!mode;$('mf13Mode').classList.toggle('on',mode);$('mf13Mode').textContent=mode?'✅ 现在点工作图中的参考豆':'开始选一颗参考豆';if(mode)toast('现在点工作图中的一颗参考豆')});
  grid.addEventListener('click',e=>{if(!mode||!S.active)return;e.preventDefault();e.stopImmediatePropagation();const r=grid.getBoundingClientRect(),x=(e.clientX-r.left)*grid.width/r.width,y=(e.clientY-r.top)*grid.height/r.height,size=+$('zoomRange').value||34,c=Math.floor(x/size),rr=Math.floor(y/size);if(c<0||rr<0||c>=S.cols||rr>=S.rows)return;selected=rr*S.cols+c;code.value=S.cells[selected]?.code||'';update();toast('参考豆已选中，填写正确色号后补整色')},true);
  tol.addEventListener('input',()=>{$('mf13TolVal').textContent=(+tol.value).toFixed(1);update()});$('mf13Preview').addEventListener('click',update);$('mf13FillMissing').addEventListener('click',()=>apply(false));$('mf13FillAll').addEventListener('click',()=>apply(true));$('mf13Undo').addEventListener('click',()=>{if(!undo.length)return;for(const u of undo){const s=S.cells[u.i];if(!s)continue;s.code=u.code;s.rgb=[...u.rgb];s.hex=u.hex;s.occupied=u.occupied;s.confidence=u.confidence}undo=[];$('mf13Undo').disabled=true;S.selectedCode=null;render();toast('已撤销')});code.addEventListener('input',()=>code.value=code.value.toUpperCase());
}
boot();
})();