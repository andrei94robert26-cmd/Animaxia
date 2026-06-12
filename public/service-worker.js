/* ============================================
   Animaxia v6.1 - Service Worker
   Features: Push Notifications, Offline Cache,
   Background Sync, IndexedDB, PWA,
   SEO Support, Screenshot Cache
   ============================================ */

const CACHE_NAME = 'animaxia-v6_1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/status.html',
  '/css/style.css',
  '/js/app.js',
  '/js/data.js',
  '/js/player.js',
  '/js/discovery.js',
  '/js/interactive.js',
  '/js/parental.js',
  '/js/collections.js',
  '/js/watchparty.js',
  '/js/comingsoon.js',
  '/js/ratings.js',
  '/js/achievements.js',
  '/js/trending.js',
  '/js/mystats.js',
  '/js/timeline.js',
  '/manifest.json',
  '/sitemap.xml',
  '/robots.txt',
  '/icons/icon-192.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/search.svg',
  '/icons/bookmark.svg',
  '/apple-touch-icon.png',
  '/favicon.ico'
];

// ====== INSTALL ======
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => {
      return self.skipWaiting();
    })
  );
});

// ====== ACTIVATE ======
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME && name !== CACHE_NAME + '-api')
          .map((name) => caches.delete(name))
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// ====== OFFLINE INDEXEDDB HELPERS ======
function openOfflineDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('AnimaxiaOffline', 2);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('downloaded_videos')) {
        db.createObjectStore('downloaded_videos', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('downloaded_metadata')) {
        db.createObjectStore('downloaded_metadata', { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getOfflineItems() {
  return openOfflineDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('downloaded_metadata', 'readonly');
      const store = tx.objectStore('downloaded_metadata');
      const all = store.getAll();
      all.onsuccess = () => resolve(all.result || []);
      all.onerror = () => reject(all.error);
    });
  });
}

// ====== PUSH NOTIFICATIONS ======
self.addEventListener('push', (event) => {
  let data = { title: 'Animaxia', body: '', icon: '/icons/icon-192.png' };
  
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || '/icons/icon-192.png',
    badge: data.badge || '/icons/icon-192.png',
    vibrate: data.vibrate || [200, 100, 200],
    data: data.data || { url: '/' },
    actions: data.actions || [
      { action: 'open', title: 'Deschide' },
      { action: 'dismiss', title: 'Închide' }
    ],
    requireInteraction: data.requireInteraction !== false,
    tag: data.tag || 'animaxia-notification',
    renotify: true,
    silent: false
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// ====== NOTIFICATION CLICK ======
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const url = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(url) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

// ====== STRATEGY: Cache-First (Static Assets) ======
function cacheFirst(request) {
  return caches.match(request).then((cached) => {
    return cached || fetch(request).then((response) => {
      if (response.ok) {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
      }
      return response;
    });
  });
}

// ====== STRATEGY: Network-First (API) ======
function networkFirst(request) {
  return fetch(request).then((response) => {
    if (response.ok) {
      const clone = response.clone();
      caches.open(CACHE_NAME + '-api').then((cache) => {
        cache.put(request, clone);
        // Limit API cache to 50 entries
        cache.keys().then((keys) => {
          if (keys.length > 50) {
            cache.delete(keys[0]);
          }
        });
      });
    }
    return response;
  }).catch(async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    
    // Offline fallbacks for specific endpoints
    const url = new URL(request.url);
    if (url.pathname === '/api/content') {
      return new Response(
        JSON.stringify({ 
          success: true, 
          offline: true, 
          data: { 
            categories: [], 
            featured: [],
            channels: []
          } 
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (url.pathname.startsWith('/api/')) {
      return new Response(
        JSON.stringify({ error: 'Ești offline. Conectează-te la internet pentru a folosi această funcție.', offline: true }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response('Offline', { status: 503 });
  });
}

// ====== FETCH HANDLER ======
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // ===== API REQUESTS =====
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // ===== STATIC ASSETS =====
  if (url.pathname.match(/\.(css|js|json|svg|png|jpg|jpeg|webp|ico|woff2?|xml|txt)$/)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // ===== NAVIGATION REQUESTS =====
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => {
          return caches.match('/index.html').then((cached) => {
            if (cached) return cached;
            // Offline page fallback
            return new Response(
              '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Animaxia - Offline</title><style>body{background:#0a0a0f;color:#fff;font-family:Inter,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px;text-align:center}.offline-icon{font-size:64px;margin-bottom:16px;color:#6c5ce7}h1{font-size:24px;margin-bottom:8px}p{color:#a0a0b0;margin-bottom:20px;line-height:1.5}.btn{display:inline-block;padding:12px 28px;background:linear-gradient(135deg,#6c5ce7,#a29bfe);color:#fff;border-radius:12px;text-decoration:none;font-weight:600}</style></head><body><div><div class="offline-icon">✦</div><h1>Momentan ești offline</h1><p>Conținutul descărcat este disponibil. Pentru restul, revino când ai conexiune la internet.</p><a href="/" class="btn">Încearcă din nou</a></div></body></html>',
              { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
            );
          });
        })
    );
    return;
  }

  // ===== DEFAULT: Network-first with cache fallback =====
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});

// ====== BACKGROUND SYNC ======
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-downloads') {
    event.waitUntil(syncDownloads());
  }
  if (event.tag === 'sync-watch-history') {
    event.waitUntil(syncWatchHistory());
  }
});

async function syncDownloads() {
  try {
    const offlineItems = await getOfflineItems();
    for (const item of offlineItems) {
      if (!item.synced) {
        await fetch('/api/user/sync-offline', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item)
        });
      }
    }
  } catch (e) {
    console.log('Sync failed, will retry later:', e);
  }
}

async function syncWatchHistory() {
  try {
    const db = await openOfflineDB();
    const tx = db.transaction('downloaded_metadata', 'readonly');
    const store = tx.objectStore('downloaded_metadata');
  } catch (e) {
    console.log('History sync failed:', e);
  }
}

// ====== MESSAGE HANDLING ======
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CACHE_CONTENT') {
    const { url } = event.data;
    if (url) {
      caches.open(CACHE_NAME).then((cache) => {
        cache.add(url);
      });
    }
  }
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.delete(CACHE_NAME);
    caches.delete(CACHE_NAME + '-api');
  }
});

console.log('✅ Animaxia v6.1 Service Worker loaded');
