const CACHE_NAME = 'desmos-offline-v32';

const DESMOS_API_URL = 'https://www.desmos.com/api/v1.12/calculator.js?apiKey=dcb31709b452b1cf9dc26972add0fda6';

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);

        // Cache the app shell (index.html served at /)
        await cache.add('/').catch(e => console.warn('Failed to cache /:', e));

        // Pre-cache Desmos API with no-cors (response will be opaque, best-effort)
        try {
            const resp = await fetch(DESMOS_API_URL, { mode: 'no-cors' });
            await cache.put(DESMOS_API_URL, resp);
            console.log('Desmos API pre-cached');
        } catch (e) {
            console.warn('Could not pre-cache Desmos API (offline during install?):', e);
        }
    })());
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
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);
    if (!url.protocol.startsWith('http')) return;

    event.respondWith(
        caches.match(event.request, { ignoreSearch: true, ignoreVary: true }).then((cachedResponse) => {
            if (cachedResponse) {
                // Serve from cache, refresh in background (stale-while-revalidate)
                fetch(event.request).then((networkResponse) => {
                    if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, networkResponse.clone());
                        });
                    }
                }).catch(() => {});
                return cachedResponse;
            }

            // Not in cache — fetch from network and cache dynamically
            return fetch(event.request).then((networkResponse) => {
                if (!networkResponse || networkResponse.type === 'error') {
                    return new Response('', { status: 503, statusText: 'Service Unavailable' });
                }

                if (networkResponse.status === 200 || networkResponse.type === 'opaque') {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                }

                return networkResponse;
            }).catch(async () => {
                console.warn('Network failed, no cache match:', event.request.url);

                // For HTML navigation, serve the cached app shell
                const acceptHeader = event.request.headers.get('accept') || '';
                if (event.request.mode === 'navigate' || acceptHeader.includes('text/html')) {
                    const cache = await caches.open(CACHE_NAME);
                    const shell = await cache.match('/', { ignoreSearch: true });
                    if (shell) return shell;
                }

                return new Response('', { status: 503, statusText: 'Service Unavailable' });
            });
        })
    );
});
