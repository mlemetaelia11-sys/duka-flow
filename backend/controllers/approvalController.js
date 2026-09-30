"use strict";

const pool = require("../db");
const { logAudit } = require("../utils/audit");

function bid(req) {
    const value = Number(req.businessId || req.user?.businessId || req.user?.business_id);
    return Number.isInteger(value) && value > 0 ? value : null;
}

async function listApprovals(req, res) {
    const businessId = bid(req);
    if (!businessId) return res.status(401).json({ message: "Business context is missing." });

    try {
        const isOwnerOrManager = ["owner", "manager"].includes(req.user.role);
        const result = await pool.query(`
            SELECT
                a.id,
                a.action_type,
                a.entity_type,
                a.entity_id,
                a.amount,
                a.status,
                a.notes,
                a.review_notes,
                a.created_at,
                a.reviewed_at,
                requester.name AS requested_by_name,
                reviewer.name AS reviewed_by_name
            FROM approval_requests a
            INNER JOIN users requester
                ON requester.id = a.requested_by
               AND requester.business_id = a.business_id
            LEFT JOIN users reviewer
                ON reviewer.id = a.reviewed_by
               AND reviewer.business_id = a.business_id
            WHERE a.business_id = $1
              AND ($2 = TRUE OR a.requested_by = $3)
            ORDER BY CASE WHEN a.status = 'pending' THEN 0 ELSE 1 END, a.created_at DESC
            LIMIT 200
        `, [businessId, isOwnerOrManager, req.user.id]);

        return res.json({ approvals: result.rows });
    } catch (error) {
        console.error("LIST APPROVALS ERROR:", error);
        return res.status(500).json({ message: "Failed to load approvals." });
    }
}

async function createApproval(req, res) {
    const businessId = bid(req);
    if (!businessId) return res.status(401).json({ message: "Business context is missing." });

    const actionType = String(req.body?.actionType || "").trim().slice(0, 50);
    const entityType = String(req.body?.entityType || "").trim().slice(0, 50);
    const entityId = req.body?.entityId === null || req.body?.entityId === undefined || req.body?.entityId === ""
        ? null
        : Number(req.body.entityId);
    const amount = req.body?.amount === null || req.body?.amount === undefined || req.body?.amount === ""
        ? null
        : Number(req.body.amount);
    const notes = String(req.body?.notes || "").trim().slice(0, 500) || null;

    if (actionType.length < 2) return res.status(400).json({ message: "Action type is required." });
    if (entityType.length < 2) return res.status(400).json({ message: "Entity type is required." });
    if (entityId !== null && (!Number.isInteger(entityId) || entityId <= 0)) return res.status(400).json({ message: "Invalid entity ID." });
    if (amount !== null && (!Number.isFinite(amount) || amount < 0)) return res.status(400).json({ message: "Invalid amount." });

    try {
        const result = await pool.query(`
            INSERT INTO approval_requests (
                business_id, requested_by, action_type, entity_type, entity_id, amount, notes
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id, action_type, entity_type, entity_id, amount, status, notes, created_at
        `, [businessId, req.user.id, actionType, entityType, entityId, amount, notes]);

        await logAudit(req, "approval.requested", "approval_request", result.rows[0].id, {
            actionType,
            entityType,
            entityId,
            amount
        });

        return res.status(201).json({ message: "Approval request created.", approval: result.rows[0] });
    } catch (error) {
        console.error("CREATE APPROVAL ERROR:", error);
        return res.status(500).json({ message: "Failed to create approval request." });
    }
}

async function reviewApproval(req, res) {
    const businessId = bid(req);
    const approvalId = Number(req.params.id);
    const status = String(req.body?.status || "").trim().toLowerCase();
    const reviewNotes = String(req.body?.reviewNotes || "").trim().slice(0, 500) || null;

    if (!businessId) return res.status(401).json({ message: "Business context is missing." });
    if (!Number.isInteger(approvalId) || approvalId <= 0) return res.status(400).json({ message: "Invalid approval ID." });
    if (!['approved', 'rejected', 'cancelled'].includes(status)) return res.status(400).json({ message: "Invalid approval status." });

    try {
        const existing = await pool.query(`
            SELECT id, status
            FROM approval_requests
            WHERE id = $1 AND business_id = $2
            LIMIT 1
        `, [approvalId, businessId]);
        if (!existing.rowCount) return res.status(404).json({ message: "Approval request not found." });
        if (existing.rows[0].status !== "pending") return res.status(409).json({ message: "This approval request has already been reviewed." });

        const result = await pool.query(`
            UPDATE approval_requests
            SET
                status = $1,
                reviewed_by = $2,
                review_notes = $3,
                reviewed_at = NOW()
            WHERE id = $4
              AND business_id = $5
              AND status = 'pending'
            RETURNING id, action_type, entity_type, entity_id, amount, status, notes, review_notes, created_at, reviewed_at
        `, [status, req.user.id, reviewNotes, approvalId, businessId]);

        await logAudit(req, `approval.${status}`, "approval_request", approvalId, { reviewNotes });
        return res.json({ message: `Approval ${status}.`, approval: result.rows[0] });
    } catch (error) {
        console.error("REVIEW APPROVAL ERROR:", error);
        return res.status(500).json({ message: "Failed to review approval request." });
    }
}

module.exports = { listApprovals, createApproval, reviewApproval };
