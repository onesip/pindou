// V16 entrypoint. The HTML still references this legacy filename so old iPhone tabs can upgrade in place.
(() => {
  'use strict';
  const s=document.createElement('script');
  s.src='./app-v16.js?v=16';
  document.head.appendChild(s);
})();
