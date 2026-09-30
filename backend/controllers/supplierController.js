"use strict";

const pool = require("../db");
const { logAudit } = require("../utils/audit");

function businessIdFrom(req) {
    const value = Number(req.businessId || req.user?.businessId || req.user?.business_id);
    return Number.isInteger(value) && value > 0 ? value : null;
}

function supplierPayload(body) {
    return {
        name: String(body?.name ?? "").trim(),
        phone: String(body?.phone ?? "").trim() || null,
        email: String(body?.email ?? "").trim().toLowerCase() || null,
        address: String(body?.address ?? "").trim() || null
    };
}

function validateSupplier(payload) {
    if (payload.name.length < 2) return "Supplier name must be at least 2 characters.";
    if (payload.name.length > 150) return "Supplier name cannot exceed 150 characters.";
    if (payload.email && !/^\S+@\S+\.\S+$/.test(payload.email)) return "Invalid supplier email.";
    return null;
}

async function getSuppliers(req, res) {
    const businessId = businessIdFrom(req);
    if (!businessId) return res.status(401).json({ message: "Business context is missing." });

    try {
        const result = await pool.query(`
            SELECT
                s.id, s.name, s.phone, s.email, s.address, s.created_at, s.updated_at,
                COUNT(p.id) AS total_purchases,
                COALESCE(SUM(p.total_amount), 0) AS total_purchase_value,
                COALESCE(SUM(p.balance), 0) AS outstanding_balance
            FROM suppliers s
            LEFT JOIN purchases p ON p.supplier_id = s.id AND p.business_id = s.business_id
            WHERE s.business_id = $1
            GROUP BY s.id
            ORDER BY s.id DESC
        `, [businessId]);

        return res.json({ suppliers: result.rows });
    } catch (error) {
        console.error("GET SUPPLIERS ERROR:", error);
        return res.status(500).json({ message: "Failed to fetch suppliers." });
    }
}

async function getSupplierById(req, res) {
    const businessId = businessIdFrom(req);
    if (!businessId) return res.status(401).json({ message: "Business context is missing." });
    const supplierId = Number(req.params.id);
    if (!Number.isInteger(supplierId) || supplierId <= 0) return res.status(400).json({ message: "Invalid supplier ID." });

    try {
        const result = await pool.query(`
            SELECT id, name, phone, email, address, created_at, updated_at
            FROM suppliers
            WHERE id = $1 AND business_id = $2
            LIMIT 1
        `, [supplierId, businessId]);

        if (!result.rowCount) return res.status(404).json({ message: "Supplier not found." });
        return res.json({ supplier: result.rows[0] });
    } catch (error) {
        console.error("GET SUPPLIER ERROR:", error);
        return res.status(500).json({ message: "Failed to fetch supplier." });
    }
}

async function createSupplier(req, res) {
    const businessId = businessIdFrom(req);
    if (!businessId) return res.status(401).json({ message: "Business context is missing." });
    const payload = supplierPayload(req.body);
    const errorMessage = validateSupplier(payload);
    if (errorMessage) return res.status(400).json({ message: errorMessage });

    try {
        const result = await pool.query(`
            INSERT INTO suppliers (business_id, name, phone, email, address)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id, name, phone, email, address, created_at, updated_at
        `, [businessId, payload.name, payload.phone, payload.email, payload.address]);

        await logAudit(req, "supplier.created", "supplier", result.rows[0].id, { name: result.rows[0].name });
        return res.status(201).json({ message: "Supplier created successfully.", supplier: result.rows[0] });
    } catch (error) {
        console.error("CREATE SUPPLIER ERROR:", error);
        return res.status(500).json({ message: "Failed to create supplier." });
    }
}

async function updateSupplier(req, res) {
    const businessId = businessIdFrom(req);
    if (!businessId) return res.status(401).json({ message: "Business context is missing." });
    const supplierId = Number(req.params.id);
    if (!Number.isInteger(supplierId) || supplierId <= 0) return res.status(400).json({ message: "Invalid supplier ID." });
    const payload = supplierPayload(req.body);
    const errorMessage = validateSupplier(payload);
    if (errorMessage) return res.status(400).json({ message: errorMessage });

    try {
        const result = await pool.query(`
            UPDATE suppliers
            SET name = $1, phone = $2, email = $3, address = $4, updated_at = NOW()
            WHERE id = $5 AND business_id = $6
            RETURNING id, name, phone, email, address, created_at, updated_at
        `, [payload.name, payload.phone, payload.email, payload.address, supplierId, businessId]);

        if (!result.rowCount) return res.status(404).json({ message: "Supplier not found." });
        await logAudit(req, "supplier.updated", "supplier", supplierId, { name: result.rows[0].name });
        return res.json({ message: "Supplier updated successfully.", supplier: result.rows[0] });
    } catch (error) {
        console.error("UPDATE SUPPLIER ERROR:", error);
        return res.status(500).json({ message: "Failed to update supplier." });
    }
}

async function deleteSupplier(req, res) {
    const businessId = businessIdFrom(req);
    if (!businessId) return res.status(401).json({ message: "Business context is missing." });
    const supplierId = Number(req.params.id);
    if (!Number.isInteger(supplierId) || supplierId <= 0) return res.status(400).json({ message: "Invalid supplier ID." });

    try {
        const result = await pool.query(`
            DELETE FROM suppliers
            WHERE id = $1 AND business_id = $2
            RETURNING id, name
        `, [supplierId, businessId]);

        if (!result.rowCount) return res.status(404).json({ message: "Supplier not found." });
        await logAudit(req, "supplier.deleted", "supplier", supplierId, { name: result.rows[0].name });
        return res.json({ message: "Supplier deleted successfully.", supplier: result.rows[0] });
    } catch (error) {
        if (error.code === "23503") return res.status(409).json({ message: "This supplier cannot be deleted because it has existing purchases." });
        console.error("DELETE SUPPLIER ERROR:", error);
        return res.status(500).json({ message: "Failed to delete supplier." });
    }
}

module.exports = {
    getSuppliers,
    getSupplierById,
    createSupplier,
    updateSupplier,
    deleteSupplier
};
