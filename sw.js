/**
 * Czernica Delivery — Service Worker
 * Strategy: Cache-first for assets, Network-first for Firebase/API calls
 * Provides offline fallback for the order form
 */

const CACHE_NAME = 'czernica-v2';
const OFFLINE_URL = '/';

const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
    'https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;800&display=swap',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

// INSTALL — cache core assets
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            console.log('[SW] Caching static assets');
            return cache.addAll(STATIC_ASSETS).catch(err => {
                console.warn('[SW] Some assets failed to cache:', err);
            });
        }).then(() => self.skipWaiting())
    );
});

// ACTIVATE — clean old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames
                    .filter(name => name !== CACHE_NAME)
                    .map(name => {
                        console.log('[SW] Deleting old cache:', name);
                        return caches.delete(name);
                    })
            );
        }).then(() => self.clients.claim())
    );
});

// FETCH — cache strategy
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Skip non-GET requests
    if (event.request.method !== 'GET') return;

    // Network-first for Firebase, APIs, and WhatsApp
    const networkFirstPatterns = [
        'firebasedatabase.app',
        'googleapis.com',
        'api.groq.com',
        'api.openweathermap.org',
        'wa.me',
        'firebase'
    ];

    const isNetworkFirst = networkFirstPatterns.some(p => url.href.includes(p));

    if (isNetworkFirst) {
        event.respondWith(
            fetch(event.request).catch(() => {
                // Return cached version or generic offline response
                return caches.match(event.request);
            })
        );
        return;
    }

    // Cache-first for static assets (fonts, icons, CSS)
    if (
        url.hostname.includes('fonts.googleapis.com') ||
        url.hostname.includes('cdnjs.cloudflare.com') ||
        url.pathname.match(/\.(css|js|woff2?|png|jpg|jpeg|svg|ico)$/i)
    ) {
        event.respondWith(
            caches.match(event.request).then(cached => {
                if (cached) return cached;
                return fetch(event.request).then(response => {
                    if (response && response.status === 200) {
                        const cloned = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(event.request, cloned));
                    }
                    return response;
                }).catch(() => caches.match(OFFLINE_URL));
            })
        );
        return;
    }

    // Network-first for HTML pages, fallback to cache
    event.respondWith(
        fetch(event.request)
            .then(response => {
                if (response && response.status === 200) {
                    const cloned = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, cloned));
                }
                return response;
            })
            .catch(() => {
                return caches.match(event.request)
                    .then(cached => cached || caches.match(OFFLINE_URL));
            })
    );
});

// BACKGROUND SYNC — retry failed orders when connection restored
self.addEventListener('sync', event => {
    if (event.tag === 'retry-orders') {
        event.waitUntil(retryPendingOrders());
    }
});

async function retryPendingOrders() {
    console.log('[SW] Retrying pending orders...');
    // Orders are handled by Firebase SDK which has its own offline persistence
}

// PUSH NOTIFICATIONS (future feature hook)
self.addEventListener('push', event => {
    if (!event.data) return;
    const data = event.data.json();
    event.waitUntil(
        self.registration.showNotification(data.title || 'Czernica Delivery', {
            body: data.body || 'Masz nową wiadomość',
            icon: '/icon-192.png',
            badge: '/icon-192.png',
            tag: 'czernica-notification',
            renotify: true,
            vibrate: [200, 100, 200]
        })
    );
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    event.waitUntil(clients.openWindow('/'));
});
