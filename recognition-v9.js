// V10 loader. Previous recognition layers are disabled to avoid cascading mutations.
(() => {
  const s=document.createElement('script');
  s.src='./recognition-v10.js?v=10';
  s.defer=true;
  document.head.appendChild(s);
})();
