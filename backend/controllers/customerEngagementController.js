"use strict";

const pool = require("../db");
const { logAudit } = require("../utils/audit");

function businessIdFrom(req) {
    const value = Number(req.businessId || req.user?.businessId || req.user?.business_id);
    return Number.isInteger(value) && value > 0 ? value : null;
}

function customerIdFrom(req) {
    const value = Number(req.params.id);
    return Number.isInteger(value) && value > 0 ? value : null;
}

async function getCustomerNotes(req, res) {
    const businessId = businessIdFrom(req);
    const customerId = customerIdFrom(req);
    if (!businessId) return res.status(401).json({ message: "Business context is missing." });
    if (!customerId) return res.status(400).json({ message: "Invalid customer ID." });

    try {
        const customer = await pool.query(
            `SELECT id, name FROM customers WHERE id = $1 AND business_id = $2`,
            [customerId, businessId]
        );
        if (!customer.rowCount) return res.status(404).json({ message: "Customer not found." });

        const result = await pool.query(
            `SELECT n.id, n.note, n.created_at, u.name AS created_by_name
             FROM customer_notes n
             LEFT JOIN users u ON u.id = n.created_by AND u.business_id = n.business_id
             WHERE n.customer_id = $1 AND n.business_id = $2
             ORDER BY n.created_at DESC
             LIMIT 100`,
            [customerId, businessId]
        );

        return res.json({ customer: customer.rows[0], notes: result.rows });
    } catch (error) {
        console.error("GET CUSTOMER NOTES ERROR:", error.message);
        return res.status(500).json({ message: "Failed to load customer notes." });
    }
}

async function createCustomerNote(req, res) {
    const businessId = businessIdFrom(req);
    const customerId = customerIdFrom(req);
    const note = String(req.body?.note || "").trim();
    if (!businessId) return res.status(401).json({ message: "Business context is missing." });
    if (!customerId) return res.status(400).json({ message: "Invalid customer ID." });
    if (note.length < 2 || note.length > 1000) return res.status(400).json({ message: "Note must be between 2 and 1000 characters." });

    try {
        const customer = await pool.query(
            `SELECT id FROM customers WHERE id = $1 AND business_id = $2`,
            [customerId, businessId]
        );
        if (!customer.rowCount) return res.status(404).json({ message: "Customer not found." });

        const result = await pool.query(
            `INSERT INTO customer_notes (business_id, customer_id, note, created_by)
             VALUES ($1, $2, $3, $4)
             RETURNING id, note, created_at`,
            [businessId, customerId, note, req.user.id]
        );

        await logAudit(req, "customer.note_added", "customer", customerId, { noteId: result.rows[0].id });
        return res.status(201).json({ message: "Customer note added.", note: result.rows[0] });
    } catch (error) {
        console.error("CREATE CUSTOMER NOTE ERROR:", error.message);
        return res.status(500).json({ message: "Failed to add customer note." });
    }
}

async function deleteCustomerNote(req, res) {
    const businessId = businessIdFrom(req);
    const customerId = customerIdFrom(req);
    const noteId = Number(req.params.noteId);
    if (!businessId) return res.status(401).json({ message: "Business context is missing." });
    if (!customerId || !Number.isInteger(noteId) || noteId <= 0) return res.status(400).json({ message: "Invalid note." });

    try {
        const result = await pool.query(
            `DELETE FROM customer_notes
             WHERE id = $1 AND customer_id = $2 AND business_id = $3
             RETURNING id`,
            [noteId, customerId, businessId]
        );
        if (!result.rowCount) return res.status(404).json({ message: "Note not found." });
        await logAudit(req, "customer.note_deleted", "customer_note", noteId, { customerId });
        return res.json({ message: "Customer note deleted." });
    } catch (error) {
        console.error("DELETE CUSTOMER NOTE ERROR:", error.message);
        return res.status(500).json({ message: "Failed to delete customer note." });
    }
}

module.exports = { getCustomerNotes, createCustomerNote, deleteCustomerNote };
