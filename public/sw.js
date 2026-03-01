const CACHE_NAME = 'desmos-offline-v31';

const DESMOS_API_URL = 'https://www.desmos.com/api/v1.12/calculator.js?apiKey=dcb31709b452b1cf9dc26972add0fda6';

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
        caches.open(CACHE_NAME).then(async (cache) => {
            await cache.addAll(STATIC_ASSETS).catch(err => console.warn('Static asset cache failed:', err));
            // Pre-cache Desmos API — must use no-cors since it's cross-origin; response is opaque
            try {
                const resp = await fetch(DESMOS_API_URL, { mode: 'no-cors' });
                await cache.put(DESMOS_API_URL, resp);
                console.log('Desmos API pre-cached');
            } catch (e) {
                console.warn('Could not pre-cache Desmos API (offline during install?):', e);
            }
        }).catch(err => console.error('Cache install error:', err))
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
                // Return from cache, but update it in background (stale-while-revalidate)
                fetch(event.request).then((networkResponse) => {
                    if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, networkResponse.clone());
                        });
                    }
                }).catch(() => { });
                return cachedResponse;
            }

            // Not in cache — go to network
            return fetch(event.request).then((networkResponse) => {
                if (!networkResponse || networkResponse.type === 'error') {
                    return networkResponse;
                }

                // Cache successful responses and opaque cross-origin responses
                if (networkResponse.status === 200 || networkResponse.type === 'opaque') {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                }

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
