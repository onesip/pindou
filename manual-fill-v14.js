// V17 entrypoint. Keep legacy filename so existing iPhone tabs upgrade in place.
(() => {
  'use strict';
  const core=document.createElement('script');
  core.src='./app-v16.js?v=17';
  core.onload=()=>{
    const addon=document.createElement('script');
    addon.src='./app-v17-addon.js?v=17';
    document.head.appendChild(addon);
  };
  document.head.appendChild(core);
})();