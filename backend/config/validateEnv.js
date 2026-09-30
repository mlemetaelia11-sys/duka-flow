"use strict";

function hasDatabaseConfig() {
    const hasUrl =
        Boolean(process.env.DATABASE_URL) ||
        Boolean(process.env.DATABASE_URL_UNPOOLED);

    const hasLegacyConfig =
        Boolean(process.env.DATABASE_HOST) &&
        Boolean(process.env.DATABASE_NAME) &&
        Boolean(process.env.DATABASE_USER) &&
        Boolean(process.env.DATABASE_PASSWORD);

    return hasUrl || hasLegacyConfig;
}

function ensureVercelAppUrl() {
    if (process.env.APP_URL) {
        return;
    }

    /*
     * Vercel supplies a deployment URL at runtime.
     * Use it only as a fallback so existing production validation
     * continues to work before the project has a custom domain.
     */
    const vercelUrl =
        process.env.VERCEL_PROJECT_PRODUCTION_URL ||
        process.env.VERCEL_URL;

    if (vercelUrl) {
        process.env.APP_URL = /^https?:\/\//i.test(vercelUrl)
            ? vercelUrl
            : `https://${vercelUrl}`;
    }
}

function validateProductionEnv() {
    if (process.env.NODE_ENV !== "production") {
        return;
    }

    ensureVercelAppUrl();

    const missing = [];

    if (!hasDatabaseConfig()) {
        missing.push(
            "DATABASE_URL (or DATABASE_HOST/DATABASE_NAME/DATABASE_USER/DATABASE_PASSWORD)"
        );
    }

    if (!process.env.JWT_SECRET) {
        missing.push("JWT_SECRET");
    }

    if (!process.env.APP_URL) {
        missing.push("APP_URL(public URL)");
    }

    if ((process.env.APP_URL || "").includes("localhost")) {
        missing.push("APP_URL(public URL)");
    }

    if ((process.env.APP_URL || "").startsWith("http://")) {
        missing.push("APP_URL(HTTPS)");
    }

    if ((process.env.JWT_SECRET || "").length < 32) {
        missing.push("JWT_SECRET(32+ chars)");
    }

    if (process.env.REQUIRE_EMAIL_VERIFICATION === "1") {
        for (const key of [
            "RESEND_API_KEY",
            "RESEND_FROM_EMAIL"
        ]) {
            if (!process.env[key]) {
                missing.push(key);
            }
        }
    }

    if (
        process.env.ENABLE_AI === "1" ||
        process.env.AI_MODE === "live"
    ) {
        if (!process.env.GROQ_API_KEY) {
            missing.push("GROQ_API_KEY");
        }
    }

    if (
        process.env.ENABLE_STORAGE === "1" ||
        process.env.STORAGE_MODE === "live"
    ) {
        for (const key of [
            "R2_ACCOUNT_ID",
            "R2_ACCESS_KEY_ID",
            "R2_SECRET_ACCESS_KEY",
            "R2_BUCKET"
        ]) {
            if (!process.env[key]) {
                missing.push(key);
            }
        }
    }

    if (
        process.env.ENABLE_PAYMENTS === "1" ||
        process.env.PAYMENTS_MODE === "production"
    ) {
        for (const key of [
            "PESAPAL_CONSUMER_KEY",
            "PESAPAL_CONSUMER_SECRET"
        ]) {
            if (!process.env[key]) {
                missing.push(key);
            }
        }

        if (
            !/^https:\/\//i.test(
                process.env.PESAPAL_IPN_URL || ""
            )
        ) {
            missing.push("PESAPAL_IPN_URL(HTTPS)");
        }

        if (
            String(
                process.env.PESAPAL_ENVIRONMENT || "sandbox"
            ).toLowerCase() === "production" &&
            String(
                process.env.PAYMENTS_MODE || ""
            ).toLowerCase() !== "production"
        ) {
            missing.push(
                "PAYMENTS_MODE=production when PESAPAL_ENVIRONMENT=production"
            );
        }
    }

    if (
        process.env.ENABLE_NOTIFICATIONS === "1" ||
        process.env.NOTIFICATIONS_MODE === "live"
    ) {
        for (const key of [
            "FIREBASE_PROJECT_ID",
            "FIREBASE_CLIENT_EMAIL",
            "FIREBASE_PRIVATE_KEY"
        ]) {
            if (!process.env[key]) {
                missing.push(key);
            }
        }
    }

    if (
        process.env.GOOGLE_CLIENT_ID ||
        process.env.GOOGLE_CLIENT_SECRET
    ) {
        for (const key of [
            "GOOGLE_CLIENT_ID",
            "GOOGLE_CLIENT_SECRET",
            "GOOGLE_CALLBACK_URL"
        ]) {
            if (!process.env[key]) {
                missing.push(key);
            }
        }

        if (
            process.env.GOOGLE_CALLBACK_URL &&
            !/^https:\/\//i.test(
                process.env.GOOGLE_CALLBACK_URL
            )
        ) {
            missing.push("GOOGLE_CALLBACK_URL(HTTPS)");
        }
    }

    if (missing.length) {
        throw new Error(
            "Production environment is incomplete: " +
            [...new Set(missing)].join(", ")
        );
    }
}

module.exports = {
    validateProductionEnv
};