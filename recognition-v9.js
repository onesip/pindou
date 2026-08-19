// V11 loader. Previous recognition layers remain disabled to avoid cascading mutations.
(() => {
  const s=document.createElement('script');
  s.src='./recognition-v11.js?v=11';
  s.defer=true;
  document.head.appendChild(s);
})();
