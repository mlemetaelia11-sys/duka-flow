"use strict";

async function captureException(error, context = {}) {
    const raw = process.env.SENTRY_DSN;
    if (!raw) return false;
    try {
        const dsn = new URL(raw);
        const projectId = dsn.pathname.replace(/^\//, "");
        const host = dsn.host;
        const envelopeUrl = `https://${host}/api/${projectId}/envelope/?sentry_version=7&sentry_key=${encodeURIComponent(dsn.username)}`;
        const eventId = [...cryptoRandomBytes()].map(b => b.toString(16).padStart(2, "0")).join("");
        const now = Date.now() / 1000;
        const eventJson = JSON.stringify({ event_id: eventId, timestamp: now, platform: "node", level: "error", message: error?.message || String(error), exception: { values: [{ type: error?.name || "Error", value: error?.message || String(error) }] }, extra: context });
        const envelope = [
            JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString(), dsn: raw }),
            JSON.stringify({ type: "event", length: Buffer.byteLength(eventJson) }),
            eventJson
        ].join("\n");
        await fetch(envelopeUrl, { method: "POST", headers: { "Content-Type": "application/x-sentry-envelope" }, body: envelope });
        return true;
    } catch { return false; }
}
function cryptoRandomBytes() {
    const crypto = require("crypto");
    return crypto.randomBytes(16);
}
module.exports = { captureException };
