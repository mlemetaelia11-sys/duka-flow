"use strict";
const crypto = require("crypto");

function b64url(input) {
    return Buffer.from(input).toString("base64url");
}

function privateKey() {
    return String(process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
}

async function accessToken() {
    const email = process.env.FIREBASE_CLIENT_EMAIL;
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const key = privateKey();
    if (!email || !projectId || !key) throw new Error("Firebase is not configured.");
    const now = Math.floor(Date.now() / 1000);
    const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const claim = b64url(JSON.stringify({
        iss: email,
        scope: "https://www.googleapis.com/auth/firebase.messaging",
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 3600
    }));
    const unsigned = `${header}.${claim}`;
    const signature = crypto.createSign("RSA-SHA256").update(unsigned).sign(key, "base64url");
    const assertion = `${unsigned}.${signature}`;
    const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.access_token) throw new Error(payload.error_description || "Firebase token request failed.");
    return payload.access_token;
}

async function sendToToken(token, notification, data = {}) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const bearer = await accessToken();
    const response = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
        body: JSON.stringify({
            message: {
                token,
                notification,
                data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)]))
            }
        })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error?.message || "FCM send failed.");
    return payload;
}

module.exports = { sendToToken };
