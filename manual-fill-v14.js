// V18 entrypoint. Keep legacy filename so existing iPhone tabs upgrade in place.
(() => {
  'use strict';
  const core=document.createElement('script');
  core.src='./app-v16.js?v=18';
  core.onload=()=>{
    const addon=document.createElement('script');
    addon.src='./app-v17-addon.js?v=18';
    addon.onload=()=>{
      const fix=document.createElement('script');
      fix.src='./resume-fix-v18.js?v=18';
      document.head.appendChild(fix);
    };
    document.head.appendChild(addon);
  };
  document.head.appendChild(core);
})();