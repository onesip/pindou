// V14 loader. Keep recognition and manual-fill UI separated so the manual panel cannot disappear because of recognizer boot timing.
(() => {
  'use strict';
  const s=document.createElement('script');
  s.src='./recognition-v11.js?v=14';
  document.head.appendChild(s);
})();
