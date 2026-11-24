// Momentum on the web: opens offline, shows notifications. Bump VERSION when publishing.
const VERSION='momentum-20261124163441',SHELL=['./','index.html','manifest.json','icon-192.png','icon-512.png','apple-touch-icon.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(VERSION).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==VERSION&&x.startsWith('momentum-')).map(x=>caches.delete(x)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{const r=e.request,u=new URL(r.url);if(r.method!=='GET'||u.origin!==location.origin||!u.pathname.includes('/momentum/'))return;
 if(r.mode==='navigate'){e.respondWith(fetch(r.url,{cache:'no-store',credentials:'same-origin'}).then(res=>{if(!res.ok)return caches.match('index.html').then(h=>h||res);const c=res.clone();caches.open(VERSION).then(x=>x.put('index.html',c));return res}).catch(()=>caches.match('index.html')));return}
 e.respondWith(caches.match(r).then(h=>h||fetch(r)))});
self.addEventListener('push',e=>{let d={title:'Momentum',body:''};try{d=e.data.json()}catch(x){}
 e.waitUntil(self.registration.showNotification(d.title||'Momentum',{body:d.body||'',icon:'icon-192.png',badge:'icon-192.png',tag:(d.title||'')+(d.body||'').slice(0,20)}))});
self.addEventListener('notificationclick',e=>{e.notification.close();e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(cs=>{for(const c of cs)if('focus' in c)return c.focus();return self.clients.openWindow(self.registration.scope)}))});
