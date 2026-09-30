"use strict";

const pool = require("../db");

async function logAudit(req, action, entityType = null, entityId = null, details = null) {
    const businessId = Number(req.businessId || req.user?.businessId || req.user?.business_id);
    const userId = Number(req.user?.id);

    if (!Number.isInteger(businessId) || businessId <= 0) return;

    try {
        await pool.query(`
            INSERT INTO audit_logs (
                business_id, user_id, action, entity_type, entity_id,
                details, ip_address, user_agent
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
            businessId,
            Number.isInteger(userId) && userId > 0 ? userId : null,
            String(action).slice(0, 80),
            entityType ? String(entityType).slice(0, 80) : null,
            entityId ? Number(entityId) : null,
            details,
            req.ip ? String(req.ip).slice(0, 64) : null,
            req.get("user-agent") ? String(req.get("user-agent")).slice(0, 500) : null
        ]);
    } catch (error) {
        console.error("AUDIT LOG ERROR:", error.message);
    }
}

module.exports = { logAudit };
