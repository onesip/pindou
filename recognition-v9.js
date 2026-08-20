// V12 loader + manual same-color teaching helper. Previous recognition layers remain disabled.
(() => {
  const APP_VERSION='V12';
  const showVersion=()=>{
    if(document.getElementById('pindouVersionBadge')) return;
    const host=document.querySelector('.topbar > div');
    if(!host) return;
    const badge=document.createElement('div');
    badge.id='pindouVersionBadge';
    badge.textContent=`${APP_VERSION} · 人工补色版`;
    badge.style.cssText='display:inline-flex;align-items:center;margin-top:6px;padding:4px 9px;border-radius:999px;background:#191714;color:#fff;font-size:11px;font-weight:800;letter-spacing:.03em;line-height:1.2;';
    host.appendChild(badge);
  };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',showVersion,{once:true}); else showVersion();

  const s=document.createElement('script');
  s.src='./recognition-v11.js?v=12';
  s.onload=()=>{
    const h=document.createElement('script');
    h.src='./smart-fill.js?v=12';
    document.head.appendChild(h);
  };
  document.head.appendChild(s);
})();
