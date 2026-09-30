"use strict";

const crypto = require("crypto");

const GRAPH_VERSION = String(process.env.META_GRAPH_API_VERSION || process.env.WHATSAPP_GRAPH_VERSION || "v23.0").replace(/^v?/,"v");
const graphBase = () => `https://graph.facebook.com/${GRAPH_VERSION}`;

function normalizePhone(value) {
    return String(value || "").replace(/[^\d+]/g, "").replace(/^00/, "+");
}
function hash(value) {
    return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}
function verifySignature(rawBody, signature, appSecret) {
    if (!appSecret || !signature || !rawBody) return false;
    const expected = "sha256=" + crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
    try { return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(signature))); } catch { return false; }
}
async function graphRequest(path, token, options={}) {
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const response = await fetch(`${graphBase()}${path}`, {
                ...options,
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(options.headers || {}) }
            });
            const data = await response.json().catch(()=>({}));
            if (response.ok) return data;
            const retryable = response.status === 429 || response.status >= 500;
            lastError = new Error(data?.error?.message || `WhatsApp Graph API error (${response.status}).`);
            if (!retryable || attempt === 2) throw lastError;
        } catch (error) {
            lastError = error;
            if (attempt === 2) throw error;
        }
        await new Promise(resolve => setTimeout(resolve, 400 * (attempt + 1)));
    }
    throw lastError || new Error("WhatsApp Graph API request failed.");
}
async function sendText({phoneNumberId, accessToken, to, body}) {
    return graphRequest(`/${encodeURIComponent(phoneNumberId)}/messages`, accessToken, {
        method:"POST",
        body: JSON.stringify({ messaging_product:"whatsapp", recipient_type:"individual", to:normalizePhone(to).replace("+",""), type:"text", text:{preview_url:false, body:String(body).slice(0,4096)} })
    });
}
module.exports = { GRAPH_VERSION, hash, verifySignature, sendText, normalizePhone };
