const CACHE='pindou-v8';
const SHELL=['./','./index.html','./styles.css','./app.js','./ocr-patch.js','./mard-colors.js','./recognition-v6.js','./recognition-v5.js','./recognition-v8.js','./manifest.webmanifest','./icon.svg'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const url=new URL(e.request.url);
  if(url.origin===location.origin&&(url.pathname.endsWith('.html')||url.pathname.endsWith('.js')||url.pathname.endsWith('.css')||url.pathname.endsWith('/'))){
    e.respondWith(fetch(e.request).then(res=>{const copy=res.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return res;}).catch(()=>caches.match(e.request).then(hit=>hit||caches.match('./index.html'))));
    return;
  }
  e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request).then(res=>{const copy=res.clone();if(url.origin===location.origin)caches.open(CACHE).then(c=>c.put(e.request,copy));return res;})));
});
