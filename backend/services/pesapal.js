"use strict";

function baseUrl() {
    return String(process.env.PESAPAL_ENVIRONMENT || "sandbox").toLowerCase() === "production"
        ? "https://pay.pesapal.com/v3/api"
        : "https://cybqa.pesapal.com/pesapalv3/api";
}

let tokenCache = { token: null, expiresAt: 0 };

async function pesapalToken() {
    if (tokenCache.token && Date.now() < tokenCache.expiresAt - 30000) return tokenCache.token;
    const key = process.env.PESAPAL_CONSUMER_KEY;
    const secret = process.env.PESAPAL_CONSUMER_SECRET;
    if (!key || !secret) throw new Error("Pesapal credentials are not configured.");

    const response = await fetch(`${baseUrl()}/Auth/RequestToken`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ consumer_key: key, consumer_secret: secret })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.token) throw new Error(payload.message || "Pesapal authentication failed.");
    tokenCache = { token: payload.token, expiresAt: Date.now() + 4.5 * 60 * 1000 };
    return payload.token;
}

async function pesapalRequest(path, options = {}) {
    const token = await pesapalToken();
    const response = await fetch(`${baseUrl()}${path}`, {
        ...options,
        headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            ...(options.headers || {})
        }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || `Pesapal request failed (${response.status}).`);
    return payload;
}

async function registerIpn(url, method = "GET") {
    return pesapalRequest("/URLSetup/RegisterIPN", {
        method: "POST",
        body: JSON.stringify({ url, ipn_notification_type: method })
    });
}

async function submitOrder(order) {
    return pesapalRequest("/Transactions/SubmitOrderRequest", {
        method: "POST",
        body: JSON.stringify(order)
    });
}

async function transactionStatus(orderTrackingId) {
    return pesapalRequest(`/Transactions/GetTransactionStatus?orderTrackingId=${encodeURIComponent(orderTrackingId)}`, {
        method: "GET"
    });
}

module.exports = { pesapalToken, registerIpn, submitOrder, transactionStatus, baseUrl };
