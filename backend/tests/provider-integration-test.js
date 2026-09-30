"use strict";
const fs = require("fs");
const path = require("path");
const envFile = path.join(__dirname, "..", ".env");
if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
        if (!match || process.env[match[1]]) continue;
        let value = match[2];
        if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
        process.env[match[1]] = value.replace(/\\n/g, "\n");
    }
}
const { getProviderStatus } = require("../config/providers");
const { pesapalToken } = require("../services/pesapal");
const { chat } = require("../services/groq");
const { sendEmail } = require("../services/email");
const { sendToToken } = require("../services/fcm");
const { presignPut } = require("../services/r2");

async function check(name, fn) {
    try {
        await fn();
        console.log(`PASS ${name}`);
        return true;
    } catch (error) {
        console.error(`FAIL ${name}: ${error.message}`);
        return false;
    }
}

(async () => {
    const status = getProviderStatus();
    console.log("Provider configuration:", JSON.stringify(Object.fromEntries(Object.entries(status).map(([k,v]) => [k, { configured: v.configured, mode: v.mode }])), null, 2));

    let failed = false;
    if (status.payments.configured) { if (!(await check("Pesapal authentication", async () => { await pesapalToken(); }))) failed = true; }
    else console.log("SKIP Pesapal authentication (credentials not configured)");

    if (status.ai.configured) { if (!(await check("Groq API", async () => { await chat({ messages: [{ role: "user", content: "Reply with OK only." }], tools: [], toolChoice: "none", temperature: 0 }); }))) failed = true; }
    else console.log("SKIP Groq API (credentials not configured)");

    if (status.email.configured) {
        const to = process.env.PROVIDER_TEST_EMAIL;
        if (to) { if (!(await check("Resend email", async () => { await sendEmail({ to, subject: "DukaFlow provider test", html: "<p>DukaFlow provider test passed.</p>", text: "DukaFlow provider test passed." }); }))) failed = true; }
        else console.log("SKIP Resend delivery (set PROVIDER_TEST_EMAIL to intentionally send a test email)");
    } else console.log("SKIP Resend (credentials not configured)");

    if (status.storage.configured) { if (!(await check("Cloudflare R2 presign", async () => { const url = presignPut("provider-tests/health.txt", "text/plain", 60); if (!/^https:\/\//.test(url)) throw new Error("Invalid R2 presigned URL"); }))) failed = true; }
    else console.log("SKIP Cloudflare R2 (credentials not configured)");

    if (status.notifications.configured) {
        const token = process.env.PROVIDER_TEST_FCM_TOKEN;
        if (token) { if (!(await check("Firebase FCM", async () => { await sendToToken(token, { title: "DukaFlow", body: "Provider test" }, { type: "provider_test" }); }))) failed = true; }
        else console.log("SKIP Firebase FCM delivery (set PROVIDER_TEST_FCM_TOKEN to intentionally send a test push)");
    } else console.log("SKIP Firebase FCM (credentials not configured)");

    if (process.env.SENTRY_DSN) { if (!(await check("Sentry DSN format", async () => { const u = new URL(process.env.SENTRY_DSN); if (!u.username || !u.pathname) throw new Error("Invalid Sentry DSN"); }))) failed = true; }
    else console.log("SKIP Sentry (DSN not configured)");

    if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_CALLBACK_URL) {
        if (!(await check("Google OAuth configuration", async () => { if (!/^https?:\/\//.test(process.env.GOOGLE_CALLBACK_URL)) throw new Error("Invalid callback URL"); }))) failed = true;
    } else console.log("SKIP Google OAuth configuration (credentials not configured)");

    process.exitCode = failed ? 1 : 0;
})().catch(error => { console.error(error); process.exitCode = 1; });
