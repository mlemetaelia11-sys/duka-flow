"use strict";

/* Handle notification clicks before importing Firebase Messaging. */
self.addEventListener("notificationclick", (event) => {
    event.notification.close();

    const actionUrl =
        event.notification?.data?.actionUrl ||
        event.notification?.data?.link ||
        "/notifications/";

    event.waitUntil((async () => {
        const target = new URL(actionUrl, self.location.origin).href;
        const clients = await self.clients.matchAll({
            type: "window",
            includeUncontrolled: true
        });

        for (const client of clients) {
            if ("focus" in client && client.url.startsWith(self.location.origin)) {
                try {
                    if ("navigate" in client) await client.navigate(target);
                    return client.focus();
                } catch {
                    return client.focus();
                }
            }
        }

        if (self.clients.openWindow) return self.clients.openWindow(target);
        return undefined;
    })());
});

/* Firebase Cloud Messaging background support. */
importScripts("https://www.gstatic.com/firebasejs/12.19.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.19.0/firebase-messaging-compat.js");

firebase.initializeApp({
    apiKey: "AIzaSyB4afSVRmjXyIUzBn47h6U0e6y4UN1UbdU",
    authDomain: "dukaflow-70937.firebaseapp.com",
    projectId: "dukaflow-70937",
    storageBucket: "dukaflow-70937.firebasestorage.app",
    messagingSenderId: "241579477171",
    appId: "1:241579477171:web:f5b983d15fd8dd9761c8c6"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
    console.log("[DukaFlow FCM] Background message received.");

    const title =
        payload.notification?.title ||
        payload.data?.title ||
        "DukaFlow";

    const body =
        payload.notification?.body ||
        payload.data?.body ||
        "You have a new DukaFlow notification.";

    const actionUrl =
        payload.data?.actionUrl ||
        payload.fcmOptions?.link ||
        "/notifications/";

    const options = {
        body,
        icon: "/assets/dukaflow-icon.png",
        badge: "/assets/dukaflow-icon.png",
        data: { actionUrl },
        tag: `dukaflow-${payload.data?.type || "notification"}`,
        renotify: true
    };

    /* Notification payloads are normally displayed automatically by FCM. */
    if (!payload.notification) {
        return self.registration.showNotification(title, options);
    }

    return undefined;
});

/* Existing DukaFlow application shell caching. */
const CACHE_NAME = "dukaflow-shell-v3";
const SHELL = [
    "/",
    "/manifest.json",
    "/css/style.css",
    "/js/auth.js",
    "/login/",
    "/register/",
    "/icons/icon.svg",
    "/js/dashboard.js",
    "/js/sales.js"
];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys
                    .filter((key) => key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", (event) => {
    const request = event.request;
    if (request.method !== "GET") return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

    event.respondWith(
        fetch(request)
            .then((response) => {
                const copy = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
                return response;
            })
            .catch(() =>
                caches.match(request).then((cached) => cached || caches.match("/"))
            )
    );
});
