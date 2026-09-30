"use strict";

async function sendEmail({ to, subject, html, text = "" }) {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL;
    if (!apiKey || !from) throw new Error("Email provider is not configured.");

    const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            Accept: "application/json"
        },
        body: JSON.stringify({ from, to: Array.isArray(to) ? to : [to], subject, html, text })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || "Email delivery failed.");
    return payload;
}

module.exports = { sendEmail };
