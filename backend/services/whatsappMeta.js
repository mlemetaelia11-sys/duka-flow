"use strict";

const crypto = require("crypto");

const graphVersion = () => String(process.env.META_GRAPH_API_VERSION || process.env.WHATSAPP_GRAPH_VERSION || "v23.0").replace(/^v?/, "v");
const graphBase = () => `https://graph.facebook.com/${graphVersion()}`;
const appSecret = () => process.env.META_APP_SECRET || process.env.WHATSAPP_APP_SECRET || "";

function encryptionKey() {
    const value = String(process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY || "").trim();
    if (!/^[a-f\d]{64}$/i.test(value)) throw new Error("WhatsApp token encryption is not configured.");
    return Buffer.from(value, "hex");
}

function encryptAccessToken(token) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(String(token), "utf8"), cipher.final()]);
    return `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}

function decryptAccessToken(value) {
    const [version, iv, tag, encrypted] = String(value || "").split(".");
    if (version !== "v1" || !iv || !tag || !encrypted) throw new Error("WhatsApp credential is invalid.");
    const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}

async function getAccessToken(pool, account) {
    if (account?.access_token_encrypted) return decryptAccessToken(account.access_token_encrypted);
    const legacy = String(account?.access_token || "");
    if (!legacy) return "";
    const encrypted = encryptAccessToken(legacy);
    await pool.query("UPDATE whatsapp_accounts SET access_token_encrypted=$1,access_token=NULL,updated_at=NOW() WHERE id=$2 AND business_id=$3 AND access_token=$4", [encrypted, account.id, account.business_id, legacy]);
    account.access_token_encrypted = encrypted;
    account.access_token = null;
    return legacy;
}

function metaConfiguration() {
    const appId = String(process.env.META_APP_ID || "").trim();
    const configId = String(process.env.META_CONFIG_ID || "").trim();
    const ready = Boolean(appId && configId && appSecret() && /^[a-f\d]{64}$/i.test(process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY || ""));
    return { ready, appId: ready ? appId : "", configId: ready ? configId : "", graphVersion: graphVersion() };
}

async function graphRequest(path, token, options = {}) {
    const response = await fetch(`${graphBase()}${path}`, {
        ...options,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error("Meta WhatsApp request failed.");
    return data;
}

async function exchangeEmbeddedSignupCode({ code, wabaId, phoneNumberId }) {
    const config = metaConfiguration();
    if (!config.ready) throw new Error("Meta WhatsApp configuration required.");
    if (!String(code || "").trim() || !/^\d{5,30}$/.test(String(wabaId || "")) || !/^\d{5,30}$/.test(String(phoneNumberId || ""))) {
        throw new Error("Meta authorization result is incomplete.");
    }

    const exchange = new URLSearchParams({
        client_id: config.appId,
        client_secret: appSecret(),
        code: String(code)
    });
    const tokenResponse = await fetch(`${graphBase()}/oauth/access_token?${exchange.toString()}`, { headers: { Accept: "application/json" } });
    const tokenData = await tokenResponse.json().catch(() => ({}));
    const accessToken = String(tokenData.access_token || "");
    if (!tokenResponse.ok || !accessToken) throw new Error("Meta authorization could not be verified.");

    const debugParams = new URLSearchParams({
        input_token: accessToken,
        access_token: `${config.appId}|${appSecret()}`
    });
    const debugResponse = await fetch(`${graphBase()}/debug_token?${debugParams.toString()}`, { headers: { Accept: "application/json" } });
    const debugData = await debugResponse.json().catch(() => ({}));
    const tokenInfo = debugData.data || {};
    const scopes = new Set(tokenInfo.scopes || []);
    if (!debugResponse.ok || !tokenInfo.is_valid || String(tokenInfo.app_id) !== config.appId
        || !scopes.has("whatsapp_business_management") || !scopes.has("whatsapp_business_messaging")) {
        throw new Error("Meta authorization is missing required WhatsApp permissions.");
    }

    const waba = await graphRequest(`/${encodeURIComponent(wabaId)}?fields=id,name`, accessToken);
    const phones = await graphRequest(`/${encodeURIComponent(wabaId)}/phone_numbers?fields=id,display_phone_number,verified_name`, accessToken);
    const phone = (phones.data || []).find((item) => String(item.id) === String(phoneNumberId));
    if (!phone || String(waba.id) !== String(wabaId)) throw new Error("The selected phone number does not belong to the authorized business.");
    await graphRequest(`/${encodeURIComponent(wabaId)}/subscribed_apps`, accessToken, { method: "POST", body: "{}" });

    return {
        accessToken,
        wabaId: String(waba.id),
        phoneNumberId: String(phone.id),
        displayPhoneNumber: String(phone.display_phone_number || "").slice(0, 40) || null,
        businessName: String(waba.name || phone.verified_name || "").slice(0, 160) || null
    };
}

async function verifyConnection(account) {
    const token = decryptAccessToken(account.access_token_encrypted);
    const waba = await graphRequest(`/${encodeURIComponent(account.business_account_id)}?fields=id,name`, token);
    const phone = await graphRequest(`/${encodeURIComponent(account.phone_number_id)}?fields=id,display_phone_number,verified_name`, token);
    const phones = await graphRequest(`/${encodeURIComponent(account.business_account_id)}/phone_numbers?fields=id`, token);
    if (String(waba.id) !== String(account.business_account_id)
        || String(phone.id) !== String(account.phone_number_id)
        || !(phones.data || []).some((item) => String(item.id) === String(account.phone_number_id))) {
        throw new Error("WhatsApp account verification failed.");
    }
    return { businessName: waba.name || account.business_name, displayPhoneNumber: phone.display_phone_number || account.display_phone_number };
}

module.exports = { graphVersion, metaConfiguration, encryptAccessToken, decryptAccessToken, getAccessToken, exchangeEmbeddedSignupCode, verifyConnection };
