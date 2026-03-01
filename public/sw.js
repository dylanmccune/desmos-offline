const CACHE_NAME = 'desmos-offline-v28';

// URLs we want to cache explicitly
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/src/main.js',
    '/src/style.css',
    '/src/CalculatorManager.js',
    '/src/db.js',
    '/src/clipboard.js',
    '/vite.svg',
    '/manifest.json'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('Opened cache, adding static assets');
            return cache.addAll(STATIC_ASSETS);
        }).catch(err => console.error('Cache addAll error:', err))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((name) => {
                    if (name !== CACHE_NAME) {
                        console.log('Deleting old cache', name);
                        return caches.delete(name);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    // Only intercept GET requests
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);

    // Bypass chrome extensions or other weird schemes
    if (!url.protocol.startsWith('http')) return;

    event.respondWith(
        caches.match(event.request, { ignoreSearch: true, ignoreVary: true }).then((cachedResponse) => {
            if (cachedResponse) {
                // Return from cache, but update it in background
                fetch(event.request).then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, networkResponse.clone());
                        });
                    }
                }).catch(() => { });
                return cachedResponse;
            }

            // Not in cache, go to network
            return fetch(event.request).then((networkResponse) => {
                if (!networkResponse || networkResponse.status !== 200 || networkResponse.type === 'error') {
                    return networkResponse;
                }

                // Cache the response dynamically
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, responseToCache);
                });

                return networkResponse;
            }).catch(async () => {
                // Network failed
                console.warn('Network request failed and no cache match for:', event.request.url);

                // If requesting an HTML page, return the index.html shell
                if (event.request.mode === 'navigate' || event.request.headers.get('accept').includes('text/html')) {
                    const cache = await caches.open(CACHE_NAME);
                    const shellMatch = await cache.match('/index.html', { ignoreSearch: true, ignoreVary: true });
                    if (shellMatch) return shellMatch;
                }

                // Generic fallback response to prevent hard rejection
                return new Response('', {
                    status: 503,
                    statusText: 'Service Unavailable'
                });
            });
        })
    );
});
