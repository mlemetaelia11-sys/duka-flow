"use strict";
require("dotenv").config();
const pool = require("../db");
const { registerIpn } = require("../services/pesapal");

(async () => {
    const url = process.env.PESAPAL_IPN_URL || `${String(process.env.APP_URL || "").replace(/\/$/, "")}/api/integrations/pesapal/ipn`;
    if (!url || url.includes("localhost")) throw new Error("Set a public PESAPAL_IPN_URL before registering the production IPN.");
    const result = await registerIpn(url, "GET");
    if (!result.ipn_id) throw new Error(result.message || "Pesapal did not return an IPN ID.");
    await pool.query(`INSERT INTO integration_settings(provider,setting_key,setting_value) VALUES('pesapal','notification_id',$1) ON CONFLICT(provider,setting_key) DO UPDATE SET setting_value=EXCLUDED.setting_value,updated_at=NOW()`, [result.ipn_id]);
    console.log(JSON.stringify({ ipnId: result.ipn_id, url, environment: process.env.PESAPAL_ENVIRONMENT || "sandbox" }, null, 2));
    await pool.end();
})().catch(async error => { console.error(error.message); try { await pool.end(); } catch {} process.exit(1); });
