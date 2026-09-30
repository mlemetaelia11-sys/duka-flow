"use strict";

const pool = require("../db");
const { logAudit } = require("../utils/audit");

const WIDGETS = [
    "summary_sales",
    "summary_profit",
    "summary_sales_count",
    "summary_debt",
    "summary_products",
    "summary_inventory",
    "sales_chart",
    "low_stock",
    "recent_transactions"
];

function businessIdFrom(req) {
    const value = Number(req.businessId || req.user?.businessId || req.user?.business_id);
    return Number.isInteger(value) && value > 0 ? value : null;
}

function defaults() {
    return WIDGETS.map((widgetKey, position) => ({
        widget_key: widgetKey,
        position,
        is_visible: true
    }));
}

async function getWidgetPreferences(req, res) {
    const businessId = businessIdFrom(req);
    if (!businessId) return res.status(401).json({ message: "Business context is missing." });

    try {
        const result = await pool.query(`
            SELECT widget_key, position, is_visible
            FROM dashboard_widget_preferences
            WHERE business_id = $1
              AND user_id = $2
            ORDER BY position, widget_key
        `, [businessId, req.user.id]);

        const existing = new Map(result.rows.map((row) => [row.widget_key, row]));
        const preferences = defaults().map((item) => existing.get(item.widget_key) || item);

        return res.json({ preferences });
    } catch (error) {
        console.error("GET DASHBOARD WIDGETS ERROR:", error);
        return res.status(500).json({ message: "Failed to load dashboard preferences." });
    }
}

async function updateWidgetPreferences(req, res) {
    const businessId = businessIdFrom(req);
    if (!businessId) return res.status(401).json({ message: "Business context is missing." });

    const input = Array.isArray(req.body?.preferences) ? req.body.preferences : [];

    if (!input.length || input.length > WIDGETS.length) {
        return res.status(400).json({ message: "Invalid dashboard preferences." });
    }

    const seen = new Set();
    const normalized = [];

    for (let index = 0; index < input.length; index += 1) {
        const item = input[index] || {};
        const widgetKey = String(item.widgetKey || item.widget_key || "").trim();
        const isVisible = item.isVisible ?? item.is_visible;

        if (!WIDGETS.includes(widgetKey)) {
            return res.status(400).json({ message: `Unknown dashboard widget: ${widgetKey}` });
        }

        if (seen.has(widgetKey)) {
            return res.status(400).json({ message: "Duplicate dashboard widget." });
        }
        seen.add(widgetKey);

        if (typeof isVisible !== "boolean") {
            return res.status(400).json({ message: "Widget visibility must be true or false." });
        }

        normalized.push({
            widgetKey,
            position: Number.isInteger(Number(item.position)) ? Number(item.position) : index,
            isVisible
        });
    }

    const client = await pool.connect();
    let begun = false;

    try {
        await client.query("BEGIN");
        begun = true;

        for (const item of normalized) {
            await client.query(`
                INSERT INTO dashboard_widget_preferences (
                    business_id, user_id, widget_key, position, is_visible
                )
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (business_id, user_id, widget_key)
                DO UPDATE SET
                    position = EXCLUDED.position,
                    is_visible = EXCLUDED.is_visible
            `, [businessId, req.user.id, item.widgetKey, item.position, item.isVisible]);
        }

        const result = await client.query(`
            SELECT widget_key, position, is_visible
            FROM dashboard_widget_preferences
            WHERE business_id = $1
              AND user_id = $2
            ORDER BY position, widget_key
        `, [businessId, req.user.id]);

        await client.query("COMMIT");
        begun = false;

        await logAudit(req, "dashboard.preferences_updated", "dashboard", null, {
            changed: normalized.length
        });

        return res.json({ message: "Dashboard preferences saved.", preferences: result.rows });
    } catch (error) {
        if (begun) {
            try { await client.query("ROLLBACK"); } catch {}
        }
        console.error("UPDATE DASHBOARD WIDGETS ERROR:", error);
        return res.status(500).json({ message: "Failed to save dashboard preferences." });
    } finally {
        client.release();
    }
}

module.exports = {
    getWidgetPreferences,
    updateWidgetPreferences
};
