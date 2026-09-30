"use strict";
const crypto = require("crypto");
const pool = require("../db");
const { registerIpn, submitOrder, transactionStatus } = require("../services/pesapal");
const { sendEmail } = require("../services/email");
const { presignPut, presignGet, publicUrl } = require("../services/r2");
const { sendToToken } = require("../services/fcm");

function businessId(req) {
    const value = Number(req.user?.businessId || req.user?.business_id);
    return Number.isInteger(value) && value > 0 ? value : null;
}

function providerReady(name) {
    if (name === "pesapal") return !!(process.env.PESAPAL_CONSUMER_KEY && process.env.PESAPAL_CONSUMER_SECRET);
    if (name === "email") return !!(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
    if (name === "r2") return !!(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET);
    if (name === "fcm") return !!(process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY);
    return false;
}

async function registerPesapalIpn(req, res) {
    if (!providerReady("pesapal")) return res.status(503).json({ message: "Pesapal is not configured." });
    const url = String(req.body?.url || process.env.PESAPAL_IPN_URL || `${process.env.APP_URL || "http://localhost:3000"}/api/integrations/pesapal/ipn`).trim();
    if (!/^https:\/\//i.test(url) && process.env.NODE_ENV === "production") return res.status(400).json({ message: "Production IPN URL must use HTTPS." });
    try {
        const result = await registerIpn(url, "GET");
        if (result.ipn_id) {
            await pool.query(`INSERT INTO integration_settings(provider,setting_key,setting_value) VALUES('pesapal','notification_id',$1) ON CONFLICT(provider,setting_key) DO UPDATE SET setting_value=EXCLUDED.setting_value,updated_at=NOW()`, [result.ipn_id]);
        }
        return res.json({ ...result, registeredUrl: url, next: result.ipn_id ? "IPN ID saved in DukaFlow." : "Register an IPN URL before taking payments." });
    } catch (error) {
        console.error("PESAPAL IPN REGISTER ERROR:", error);
        return res.status(502).json({ message: error.message });
    }
}

async function createPesapalOrder(req, res) {
    const bid = businessId(req);
    if (!bid) return res.status(401).json({ message: "Business context is missing." });
    if (!providerReady("pesapal")) return res.status(503).json({ message: "Pesapal is not configured." });
    const planCode = String(req.body?.planCode || "").trim();
    const billing = req.body?.billing === "yearly" ? "yearly" : "monthly";
    if (!planCode) return res.status(400).json({ message: "Plan is required." });
    try {
        const result = await pool.query(
            `SELECT p.*, b.name AS business_name, b.email AS business_email, b.phone AS business_phone
             FROM subscription_plans p CROSS JOIN businesses b
             WHERE p.code=$1 AND p.is_active=TRUE AND b.id=$2 LIMIT 1`,
            [planCode, bid]
        );
        if (!result.rowCount) return res.status(404).json({ message: "Plan not found." });
        const plan = result.rows[0];
        const amount = Number(billing === "yearly" ? plan.price_yearly : plan.price_monthly);
        if (!(amount > 0)) return res.status(400).json({ message: "This plan does not require payment." });
        const reference = `DF-${bid}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`.slice(0, 50);
        const appUrl = String(process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
        const setting = await pool.query(`SELECT setting_value FROM integration_settings WHERE provider='pesapal' AND setting_key='notification_id' LIMIT 1`);
        const notificationId = process.env.PESAPAL_NOTIFICATION_ID || setting.rows[0]?.setting_value;
        if (!notificationId) return res.status(503).json({ message: "Pesapal IPN is not registered yet. Register the IPN URL first." });

        const order = await pool.query(
            `INSERT INTO payment_transactions (business_id, provider, merchant_reference, amount, currency, status, plan_code, billing_cycle)
             VALUES ($1,'pesapal',$2,$3,'TZS','pending',$4,$5) RETURNING id`,
            [bid, reference, amount, planCode, billing]
        );
        const nameParts = String(req.user?.name || "DukaFlow customer").trim().split(/\s+/);
        const pesapal = await submitOrder({
            id: reference,
            currency: "TZS",
            amount,
            description: `DukaFlow ${plan.name} ${billing} subscription`,
            callback_url: `${appUrl}/api/integrations/pesapal/callback`,
            cancellation_url: `${appUrl}/subscriptions/`,
            notification_id: notificationId,
            redirect_mode: "TOP_WINDOW",
            billing_address: {
                email_address: req.user?.email || plan.business_email || "billing@dukaflow.com",
                phone_number: plan.business_phone || "",
                country_code: "TZ",
                first_name: nameParts[0] || "DukaFlow",
                last_name: nameParts.slice(1).join(" ") || "Customer",
                line_1: plan.business_name || "DukaFlow business",
                city: "Tanzania"
            }
        });
        await pool.query(
            `UPDATE payment_transactions SET provider_tracking_id=$1, redirect_url=$2, provider_payload=$3, updated_at=NOW() WHERE id=$4`,
            [pesapal.order_tracking_id || null, pesapal.redirect_url || null, pesapal, order.rows[0].id]
        );
        return res.json({ payment: { id: order.rows[0].id, merchantReference: reference, trackingId: pesapal.order_tracking_id, redirectUrl: pesapal.redirect_url } });
    } catch (error) {
        console.error("PESAPAL ORDER ERROR:", error);
        return res.status(502).json({ message: error.message });
    }
}

async function syncPesapalTransaction(trackingId, merchantReference) {
    if (!trackingId) return null;
    const status = await transactionStatus(trackingId);
    const normalized = String(status.payment_status_description || "").toLowerCase();
    const completed = normalized === "completed" || Number(status.status_code) === 1;
    const failed = ["failed", "reversed", "invalid"].includes(normalized) || [0,2,3].includes(Number(status.status_code));
    const state = completed ? "completed" : failed ? "failed" : "pending";
    const existing = await pool.query(`SELECT * FROM payment_transactions WHERE merchant_reference=$1 OR provider_tracking_id=$2 ORDER BY id DESC LIMIT 1`, [merchantReference || "__none__", trackingId || "__none__"]);
    const wasCompleted = existing.rows[0]?.status === "completed";
    const result = await pool.query(
        `UPDATE payment_transactions
         SET status=$1, provider_status=$2, confirmation_code=$3, payment_method=$4, provider_payload=$5, updated_at=NOW()
         WHERE merchant_reference=$6 OR provider_tracking_id=$7
         RETURNING *`,
        [state, status.payment_status_description || null, status.confirmation_code || null, status.payment_method || null, status, merchantReference || null, trackingId]
    );
    if (completed && result.rowCount && !wasCompleted) {
        const tx = result.rows[0];
        const plan = await pool.query("SELECT id FROM subscription_plans WHERE code=$1", [tx.plan_code]);
        if (plan.rowCount) {
            const months = tx.billing_cycle === "yearly" ? 12 : 1;
            await pool.query(
                `UPDATE subscriptions SET status='expired', updated_at=NOW() WHERE business_id=$1 AND status IN ('trial','active','past_due')`,
                [tx.business_id]
            );
            await pool.query(
                `INSERT INTO subscriptions (business_id, plan_id, status, starts_at, ends_at, external_reference)
                 VALUES ($1,$2,'active',NOW(),NOW() + ($3 || ' months')::interval,$4)`,
                [tx.business_id, plan.rows[0].id, months, tx.merchant_reference]
            );
        }
    }
    return status;
}

async function pesapalCallback(req, res) {
    const tracking = String(req.query?.OrderTrackingId || "");
    const reference = String(req.query?.OrderMerchantReference || "");
    try {
        await syncPesapalTransaction(tracking, reference);
    } catch (error) {
        console.error("PESAPAL CALLBACK SYNC ERROR:", error.message);
    }
    return res.redirect(`/subscriptions/?payment=${encodeURIComponent(reference || tracking || "unknown")}`);
}

async function pesapalIpn(req, res) {
    const body = req.body || {};
    const tracking = String(req.query?.OrderTrackingId || body.OrderTrackingId || "");
    const reference = String(req.query?.OrderMerchantReference || body.OrderMerchantReference || "");
    try {
        await syncPesapalTransaction(tracking, reference);
        return res.json({ orderNotificationType: "IPNCHANGE", orderTrackingId: tracking, orderMerchantReference: reference, status: 200 });
    } catch (error) {
        console.error("PESAPAL IPN ERROR:", error.message);
        return res.status(500).json({ orderNotificationType: "IPNCHANGE", orderTrackingId: tracking, orderMerchantReference: reference, status: 500 });
    }
}

async function viewStorageObject(req, res) {
    const bid = businessId(req);
    if (!bid) return res.status(401).json({ message: "Business context is missing." });
    if (!providerReady("r2")) return res.status(503).json({ message: "Cloudflare R2 is not configured." });
    const key = String(req.query?.key || "").trim();
    if (!key || !key.startsWith(`businesses/${bid}/`) || key.length > 1000) return res.status(400).json({ message: "Invalid storage object." });
    try {
        return res.redirect(302, presignGet(key, 300));
    } catch (error) {
        return res.status(502).json({ message: error.message });
    }
}

async function presignUpload(req, res) {
    const bid = businessId(req);
    if (!bid) return res.status(401).json({ message: "Business context is missing." });
    if (!providerReady("r2")) return res.status(503).json({ message: "Cloudflare R2 is not configured." });
    const filename = String(req.body?.filename || "file").replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 120);
    const contentType = String(req.body?.contentType || "application/octet-stream").slice(0, 100);
    const folder = String(req.body?.folder || "uploads").replace(/[^a-zA-Z0-9/_-]/g, "").replace(/^\/+|\/+$/g, "") || "uploads";
    const key = `businesses/${bid}/${folder}/${crypto.randomUUID()}-${filename}`;
    try {
        const uploadUrl = presignPut(key, contentType);
        return res.json({ key, uploadUrl, publicUrl: publicUrl(key), expiresIn: 900 });
    } catch (error) { return res.status(502).json({ message: error.message }); }
}

async function testEmail(req, res) {
    const to = String(req.body?.to || req.user?.email || "").trim();
    if (!to) return res.status(400).json({ message: "Recipient email is required." });
    try {
        const result = await sendEmail({ to, subject: "DukaFlow integration test", html: "<h2>DukaFlow is connected.</h2><p>Your email provider is working.</p>", text: "DukaFlow is connected. Your email provider is working." });
        return res.json({ ok: true, result });
    } catch (error) { return res.status(502).json({ message: error.message }); }
}

async function sendPushTest(req, res) {
    const token = String(req.body?.token || "").trim();
    if (!token) return res.status(400).json({ message: "FCM device token is required." });
    try {
        const result = await sendToToken(token, { title: "DukaFlow", body: "Push notifications are connected." }, { type: "integration_test" });
        return res.json({ ok: true, result });
    } catch (error) { return res.status(502).json({ message: error.message }); }
}

async function registerPushToken(req, res) {
    const bid = businessId(req);
    const token = String(req.body?.token || "").trim();
    if (!bid || !token || token.length < 20) return res.status(400).json({ message: "A valid FCM token is required." });
    try {
        await pool.query(`UPDATE users SET fcm_token=$1, updated_at=NOW() WHERE id=$2 AND business_id=$3`, [token, req.user.id, bid]);
        return res.json({ ok: true });
    } catch (error) {
        console.error("FCM TOKEN ERROR:", error);
        return res.status(500).json({ message: "Failed to register device." });
    }
}

module.exports = { registerPesapalIpn, createPesapalOrder, pesapalCallback, pesapalIpn, presignUpload, viewStorageObject, testEmail, sendPushTest, registerPushToken };
