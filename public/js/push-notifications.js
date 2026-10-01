"use strict";

(() => {
    const FIREBASE_SDK_VERSION = "12.19.0";
    let firebaseApp = null;
    let messaging = null;
    let serviceWorkerRegistration = null;
    let vapidKey = "";
    let initialized = false;

    function setStatus(message, kind = "info") {
        const status = document.querySelector("[data-push-status]");
        if (!status) return;
        status.textContent = message;
        status.dataset.kind = kind;
    }

    function getButton() {
        return document.querySelector("[data-enable-push]");
    }

    async function loadScript(src) {
        if (document.querySelector(`script[data-firebase-src="${src}"]`)) return;

        await new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = src;
            script.async = true;
            script.dataset.firebaseSrc = src;
            script.onload = resolve;
            script.onerror = () => reject(new Error(`Failed to load Firebase SDK: ${src}`));
            document.head.appendChild(script);
        });
    }

    async function loadSdk() {
        if (window.firebase?.messaging) return;

        await loadScript(
            `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app-compat.js`
        );
        await loadScript(
            `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-messaging-compat.js`
        );
    }

    async function loadWebConfig() {
        const response = await fetch("/api/integrations/firebase/config", {
            credentials: "include",
            headers: { Accept: "application/json" }
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.message || "Firebase push notifications are not configured.");
        }

        vapidKey = String(data.vapidKey || "").trim();
        if (!data.config || !vapidKey) {
            throw new Error("Firebase Web Push configuration is incomplete.");
        }

        return data.config;
    }

    async function getServiceWorker() {
        if (!("serviceWorker" in navigator)) {
            throw new Error("This browser does not support service workers.");
        }

        serviceWorkerRegistration =
            await navigator.serviceWorker.getRegistration("/") ||
            await navigator.serviceWorker.register("/sw.js", { scope: "/" });

        await navigator.serviceWorker.ready;
        return serviceWorkerRegistration;
    }

    async function registerToken(token) {
        const response = await fetch("/api/integrations/notifications/register-token", {
            method: "POST",
            credentials: "include",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ token })
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || "Failed to register this device.");
        return data;
    }

    async function initializeMessaging() {
        if (initialized) return;

        await loadSdk();
        const config = await loadWebConfig();

        firebaseApp = window.firebase.apps?.length
            ? window.firebase.app()
            : window.firebase.initializeApp(config);

        messaging = window.firebase.messaging(firebaseApp);
        await getServiceWorker();
        initialized = true;

        messaging.onMessage((payload) => {
            const title = payload.notification?.title || payload.data?.title || "DukaFlow";
            const body = payload.notification?.body || payload.data?.body || "You have a new notification.";
            const actionUrl = payload.data?.actionUrl || "/notifications/";

            document.dispatchEvent(new CustomEvent("dukaflow:push", {
                detail: { title, body, actionUrl, payload }
            }));

            if (Notification.permission === "granted" && serviceWorkerRegistration) {
                serviceWorkerRegistration.showNotification(title, {
                    body,
                    icon: "/assets/dukaflow-icon.png",
                    badge: "/assets/dukaflow-icon.png",
                    data: { actionUrl }
                }).catch(() => {});
            }
        });
    }

    async function enablePush() {
        const button = getButton();
        if (button) button.disabled = true;

        try {
            if (!("Notification" in window)) {
                throw new Error("This browser does not support push notifications.");
            }

            if (!window.isSecureContext) {
                throw new Error("Push notifications require a secure HTTPS connection.");
            }

            const permission = await Notification.requestPermission();
            if (permission !== "granted") {
                setStatus(
                    permission === "denied"
                        ? "Notifications are blocked in this browser. Allow them in browser settings."
                        : "Notification permission was not granted.",
                    "warning"
                );
                return false;
            }

            await initializeMessaging();

            const token = await window.firebase.messaging(firebaseApp).getToken({
                vapidKey,
                serviceWorkerRegistration
            });

            if (!token) throw new Error("Firebase did not return a device token.");

            await registerToken(token);

            setStatus("Push notifications are enabled on this device.", "success");
            if (button) {
                button.textContent = "Notifications enabled";
                button.classList.add("is-enabled");
            }

            return true;
        } catch (error) {
            console.error("DUKAFLOW PUSH ERROR:", error);
            setStatus(error.message || "Unable to enable push notifications.", "error");
            return false;
        } finally {
            if (button) button.disabled = false;
        }
    }

    async function refreshTokenIfGranted() {
        try {
            if (!("Notification" in window) || Notification.permission !== "granted") return false;
            await initializeMessaging();
            const token = await window.firebase.messaging(firebaseApp).getToken({
                vapidKey,
                serviceWorkerRegistration
            });
            if (!token) return false;
            await registerToken(token);
            setStatus("Push notifications are enabled on this device.", "success");
            const button = getButton();
            if (button) {
                button.textContent = "Notifications enabled";
                button.classList.add("is-enabled");
            }
            return true;
        } catch (error) {
            console.warn("DUKAFLOW PUSH REFRESH:", error.message);
            return false;
        }
    }

    async function sendTest() {
        const response = await fetch("/api/integrations/notifications/test", {
            method: "POST",
            credentials: "include",
            headers: { Accept: "application/json", "Content-Type": "application/json" },
            body: JSON.stringify({})
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || "Test notification failed.");
        return data;
    }

    function mountUi() {
        const card = document.querySelector("[data-push-card]");
        if (!card) return;

        const button = getButton();
        const testButton = document.querySelector("[data-test-push]");

        if (button) button.addEventListener("click", () => enablePush());
        if (testButton) {
            testButton.addEventListener("click", async () => {
                testButton.disabled = true;
                setStatus("Sending a test notification…", "info");
                try {
                    await sendTest();
                    setStatus("Test notification sent. Put the app in the background to see the browser notification.", "success");
                } catch (error) {
                    setStatus(error.message, "error");
                } finally {
                    testButton.disabled = false;
                }
            });
        }

        refreshTokenIfGranted();
    }

    window.DukaPush = {
        enable: enablePush,
        refresh: refreshTokenIfGranted,
        test: sendTest
    };

    document.addEventListener("DOMContentLoaded", mountUi, { once: true });
})();
