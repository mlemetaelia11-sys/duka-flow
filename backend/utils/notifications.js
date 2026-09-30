"use strict";

const pool = require("../db");
const { sendToToken } = require("../services/fcm");

async function createNotification({ businessId, userId = null, title, message, type = "info", priority = "normal", actionUrl = null }) {
    try {
        await pool.query(`
            INSERT INTO notifications (
                business_id, user_id, title, message,
                notification_type, priority, action_url
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [businessId, userId, title, message, type, priority, actionUrl]);
    } catch (error) {
        console.error("NOTIFICATION ERROR:", error.message);
    }
    if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
        try {
            const recipients = await pool.query(`SELECT fcm_token FROM users WHERE business_id=$1 AND is_active=TRUE AND fcm_token IS NOT NULL`, [businessId]);
            await Promise.allSettled(recipients.rows.map(row => sendToToken(row.fcm_token, { title, body: message }, { type, actionUrl: actionUrl || "" })));
        } catch (error) {
            console.error("PUSH NOTIFICATION ERROR:", error.message);
        }
    }
}

async function notifyLowStock(businessId, product, userId = null) {
    const stock = Number(product.stock_quantity);
    const threshold = Number(product.low_stock_threshold);
    if (stock > threshold) return;

    const title = stock === 0 ? "Product out of stock" : "Low stock alert";
    const message = stock === 0
        ? `${product.name} is out of stock.`
        : `${product.name} has only ${stock} unit(s) remaining.`;

    await createNotification({
        businessId,
        userId,
        title,
        message,
        type: "low_stock",
        priority: stock === 0 ? "critical" : "high",
        actionUrl: "/inventory/"
    });
}

module.exports = { createNotification, notifyLowStock };
