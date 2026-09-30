"use strict";

const pool = require("../db");
const { logAudit } = require("../utils/audit");

function businessIdFrom(req) {
    const value = Number(req.businessId || req.user?.businessId || req.user?.business_id);
    return Number.isInteger(value) && value > 0 ? value : null;
}

function clean(value, maxLength) {
    if (value === undefined || value === null) return null;
    const text = String(value).trim();
    return text ? text.slice(0, maxLength) : null;
}

function validateEmail(value) {
    return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function getBusiness(req, res) {
    const businessId = businessIdFrom(req);
    if (!businessId) {
        return res.status(401).json({ message: "Business context is missing." });
    }

    try {
        const result = await pool.query(`
            SELECT
                id, name, slug, phone, email, address, city, country,
                currency, timezone, is_active, created_at, updated_at
            FROM businesses
            WHERE id = $1
            LIMIT 1
        `, [businessId]);

        if (!result.rowCount) {
            return res.status(404).json({ message: "Business not found." });
        }

        return res.json({ business: result.rows[0] });
    } catch (error) {
        console.error("GET BUSINESS ERROR:", error);
        return res.status(500).json({ message: "Failed to load business." });
    }
}

async function updateBusiness(req, res) {
    const businessId = businessIdFrom(req);
    if (!businessId) {
        return res.status(401).json({ message: "Business context is missing." });
    }

    const name = clean(req.body?.name, 150);
    const phone = clean(req.body?.phone, 30);
    const email = clean(req.body?.email, 255);
    const address = clean(req.body?.address, 255);
    const city = clean(req.body?.city, 100);
    const country = clean(req.body?.country, 100) || "Tanzania";
    const currency = clean(req.body?.currency, 10) || "TZS";
    const timezone = clean(req.body?.timezone, 80) || "Africa/Dar_es_Salaam";

    if (!name || name.length < 2) {
        return res.status(400).json({ message: "Business name is required." });
    }

    if (!validateEmail(email)) {
        return res.status(400).json({ message: "Invalid business email." });
    }

    try {
        const result = await pool.query(`
            UPDATE businesses
            SET
                name = $1,
                phone = $2,
                email = $3,
                address = $4,
                city = $5,
                country = $6,
                currency = $7,
                timezone = $8,
                updated_at = NOW()
            WHERE id = $9
            RETURNING
                id, name, slug, phone, email, address, city, country,
                currency, timezone, is_active, created_at, updated_at
        `, [name, phone, email, address, city, country, currency, timezone, businessId]);

        if (!result.rowCount) {
            return res.status(404).json({ message: "Business not found." });
        }

        await logAudit(req, "business.updated", "business", businessId, { name: result.rows[0].name });
        return res.json({
            message: "Business settings updated successfully.",
            business: result.rows[0]
        });
    } catch (error) {
        console.error("UPDATE BUSINESS ERROR:", error);
        return res.status(500).json({ message: "Failed to update business settings." });
    }
}

module.exports = {
    getBusiness,
    updateBusiness
};
