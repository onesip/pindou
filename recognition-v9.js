// V11 loader + manual same-color teaching helper. Previous recognition layers remain disabled.
(() => {
  const s=document.createElement('script');
  s.src='./recognition-v11.js?v=11';
  s.onload=()=>{
    const h=document.createElement('script');
    h.src='./smart-fill.js?v=1';
    document.head.appendChild(h);
  };
  document.head.appendChild(s);
})();
