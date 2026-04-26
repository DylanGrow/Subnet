/* SubnetMaster Service Worker */
/* Network-first with cache fallback, offline support */

const CACHE_NAME = 'subnetmaster-v1.0.0';
const ASSETS_TO_CACHE = [
  '/subnet-master/',
  '/subnet-master/index.html',
  '/subnet-master/styles.css',
  '/subnet-master/app.js',
  '/subnet-master/manifest.json',
  '/subnet-master/icons/subnet-icon.svg',
  '/subnet-master/icons/subnet-icon-192.png',
  '/subnet-master/icons/subnet-icon-512.png'
];

// Install event - cache all shell assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Caching shell assets');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => {
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('Cache installation failed:', error);
      })
  );
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => {
              return name !== CACHE_NAME;
            })
            .map((name) => {
              console.log('Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        return self.clients.claim();
      })
  );
});

// Fetch event - network-first strategy
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Skip browser-sync and hot-reload requests
  if (event.request.url.includes('browser-sync') || 
      event.request.url.includes('hot-reload') ||
      event.request.url.includes('__webpack')) {
    return;
  }

  event.respondWith(
    // Try network first
    fetch(event.request)
      .then((networkResponse) => {
        // Check if we received a valid response
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }

        // Clone the response for caching
        const responseToCache = networkResponse.clone();

        // Cache the new version
        caches.open(CACHE_NAME)
          .then((cache) => {
            cache.put(event.request, responseToCache);
          })
          .catch((error) => {
            console.warn('Failed to cache response:', error);
          });

        return networkResponse;
      })
      .catch((networkError) => {
        // Network failed, try cache
        console.log('Network request failed, trying cache:', event.request.url);
        
        return caches.match(event.request)
          .then((cachedResponse) => {
            if (cachedResponse) {
              // Return cached version
              return cachedResponse;
            }

            // If it's an API request to Workers, we can't cache it
            if (event.request.url.includes('workers.dev')) {
              return new Response(
                JSON.stringify({ error: 'You are offline and this question is not cached.' }),
                {
                  status: 503,
                  headers: { 'Content-Type': 'application/json' }
                }
              );
            }

            // For navigation requests, return index.html
            if (event.request.mode === 'navigate') {
              return caches.match('/subnet-master/index.html');
            }

            // Otherwise return a simple offline response
            return new Response(
              'You are offline. This content is not cached.',
              {
                status: 503,
                statusText: 'Service Unavailable'
              }
            );
          });
      })
  );
});

// Handle messages from the client
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
