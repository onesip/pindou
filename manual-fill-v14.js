// V19 entrypoint. Keep legacy filename so existing phone/tablet/desktop tabs upgrade in place.
(() => {
  'use strict';
  const core=document.createElement('script');
  core.src='./app-v16.js?v=19';
  core.onload=()=>{
    const addon=document.createElement('script');
    addon.src='./app-v17-addon.js?v=19';
    addon.onload=()=>{
      const fix=document.createElement('script');
      fix.src='./resume-fix-v18.js?v=19';
      fix.onload=()=>{
        const responsive=document.createElement('script');
        responsive.src='./responsive-v19.js?v=19';
        document.head.appendChild(responsive);
      };
      document.head.appendChild(fix);
    };
    document.head.appendChild(addon);
  };
  document.head.appendChild(core);
})();