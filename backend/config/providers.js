"use strict";
function bool(value, fallback = false) { if (value === undefined || value === null || value === "") return fallback; return ["1","true","yes","on"].includes(String(value).toLowerCase()); }
function providerStatus(name, configured, mode) { return { name, configured: Boolean(configured), mode: mode || (configured ? "live" : "disabled") }; }
function configuredProviders() {
    return {
        payments: !!(process.env.PESAPAL_CONSUMER_KEY && process.env.PESAPAL_CONSUMER_SECRET),
        email: !!(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL),
        storage: !!(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET),
        ai: !!process.env.GROQ_API_KEY,
        notifications: !!(process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY),
        google: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
    };
}
function getProviderStatus() {
    const c = configuredProviders();
    return {
        payments: providerStatus("Pesapal", c.payments, process.env.PAYMENTS_MODE || undefined),
        email: providerStatus("Resend", c.email, process.env.EMAIL_MODE || undefined),
        storage: providerStatus("Cloudflare R2", c.storage, process.env.STORAGE_MODE || undefined),
        ai: providerStatus("Groq", c.ai, process.env.AI_MODE || undefined),
        notifications: providerStatus("Firebase", c.notifications, process.env.NOTIFICATIONS_MODE || undefined),
        google: providerStatus("Google OAuth", c.google, process.env.GOOGLE_MODE || undefined),
        sentry: providerStatus("Sentry", !!process.env.SENTRY_DSN, process.env.SENTRY_DSN ? "live" : "disabled")
    };
}
function getRuntimeConfig() {
    const c = configuredProviders();
    return {
        appUrl: process.env.APP_URL || null,
        currency: process.env.DEFAULT_CURRENCY || "TZS",
        timezone: process.env.DEFAULT_TIMEZONE || "Africa/Dar_es_Salaam",
        providers: getProviderStatus(),
        features: {
            payments: bool(process.env.ENABLE_PAYMENTS, c.payments),
            email: bool(process.env.ENABLE_EMAIL, c.email),
            storage: bool(process.env.ENABLE_STORAGE, c.storage),
            ai: bool(process.env.ENABLE_AI, c.ai),
            notifications: bool(process.env.ENABLE_NOTIFICATIONS, c.notifications),
            googleOAuth: c.google
        }
    };
}
module.exports = { getProviderStatus, getRuntimeConfig };
