const CACHE='pente-fino-b534acc1bc24';
const SHELL=["./","./index.html","./assets/app-V2A7V3TH.js","./assets/app-B36LWG6N.css","./icons/icon-192.png","./icons/icon-512.png","./manifest.webmanifest"];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL))));
// A new worker activates only after the previous app windows close. That avoids
// interrupting a photo draft and mixing JavaScript versions during an upload.
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('pente-fino-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url),scope=new URL(self.registration.scope);
  if(url.search||url.pathname.endsWith('/auth.html'))return;
  if(event.request.method!=='GET'||url.origin!==scope.origin||!url.pathname.startsWith(scope.pathname))return;
  // Only explicitly listed public shell files are cached. Auth, API, photos,
  // signed URLs, reports and config never enter this cache.
  const relative='./'+url.pathname.slice(scope.pathname.length);
  if(!SHELL.includes(relative))return;
  event.respondWith(fetch(event.request).then(response=>{if(response.ok){const clone=response.clone();event.waitUntil(caches.open(CACHE).then(c=>c.put(event.request,clone)));}return response;}).catch(()=>caches.match(event.request)));
});
