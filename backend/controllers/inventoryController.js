"use strict";

const pool = require("../db");
const { logAudit } = require("../utils/audit");
const { notifyLowStock } = require("../utils/notifications");

function businessIdFrom(req) {
    const value = Number(req.businessId || req.user?.businessId || req.user?.business_id);
    return Number.isInteger(value) && value > 0 ? value : null;
}

function fail(message, status = 400) {
    const error = new Error(message);
    error.status = status;
    return error;
}

async function getInventorySummary(req, res) {
    const businessId = businessIdFrom(req);
    if (!businessId) return res.status(401).json({ message: "Business context is missing." });

    try {
        const result = await pool.query(`
            SELECT
                COUNT(*) AS products,
                COALESCE(SUM(stock_quantity), 0) AS total_stock,
                COALESCE(SUM(buying_price * stock_quantity), 0) AS cost_value,
                COALESCE(SUM(selling_price * stock_quantity), 0) AS retail_value,
                COUNT(*) FILTER (WHERE stock_quantity <= low_stock_threshold) AS low_stock_count,
                COUNT(*) FILTER (WHERE stock_quantity = 0) AS out_of_stock_count
            FROM products
            WHERE business_id = $1
        `, [businessId]);

        return res.json({ summary: result.rows[0] });
    } catch (error) {
        console.error("INVENTORY SUMMARY ERROR:", error);
        return res.status(500).json({ message: "Failed to load inventory summary." });
    }
}

async function getStockMovements(req, res) {
    const businessId = businessIdFrom(req);
    if (!businessId) return res.status(401).json({ message: "Business context is missing." });

    const productId = req.query.productId ? Number(req.query.productId) : null;
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);

    if (productId !== null && (!Number.isInteger(productId) || productId <= 0)) {
        return res.status(400).json({ message: "Invalid product ID." });
    }

    try {
        const result = await pool.query(`
            SELECT
                sm.id,
                sm.product_id,
                sm.movement_type,
                sm.quantity_change,
                sm.reference_type,
                sm.reference_id,
                sm.notes,
                sm.created_at,
                p.name AS product_name,
                u.name AS created_by_name
            FROM stock_movements sm
            INNER JOIN products p
                ON p.id = sm.product_id
               AND p.business_id = sm.business_id
            LEFT JOIN users u
                ON u.id = sm.created_by
               AND u.business_id = sm.business_id
            WHERE sm.business_id = $1
              AND ($2::integer IS NULL OR sm.product_id = $2)
            ORDER BY sm.created_at DESC
            LIMIT $3
        `, [businessId, productId, limit]);

        return res.json({ movements: result.rows });
    } catch (error) {
        console.error("STOCK MOVEMENTS ERROR:", error);
        return res.status(500).json({ message: "Failed to load stock movements." });
    }
}

async function adjustStock(req, res) {
    const businessId = businessIdFrom(req);
    if (!businessId) return res.status(401).json({ message: "Business context is missing." });

    const productId = Number(req.body?.productId);
    const quantityChange = Number(req.body?.quantityChange);
    const movementType = String(req.body?.movementType || "adjustment").trim();
    const notes = String(req.body?.notes || "").trim().slice(0, 255) || null;

    if (!Number.isInteger(productId) || productId <= 0) return res.status(400).json({ message: "Invalid product ID." });
    if (!Number.isInteger(quantityChange) || quantityChange === 0) return res.status(400).json({ message: "Quantity change must be a non-zero whole number." });
    if (!["adjustment", "damaged", "opening"].includes(movementType)) return res.status(400).json({ message: "Invalid stock movement type." });

    const client = await pool.connect();
    let transactionStarted = false;
    try {
        await client.query("BEGIN");
        transactionStarted = true;

        const productResult = await client.query(`
            SELECT id, name, stock_quantity, low_stock_threshold
            FROM products
            WHERE id = $1 AND business_id = $2
            FOR UPDATE
        `, [productId, businessId]);
        if (!productResult.rowCount) throw fail("Product not found.", 404);

        const product = productResult.rows[0];
        const newStock = Number(product.stock_quantity) + quantityChange;
        if (newStock < 0) throw fail("Stock cannot become negative.");

        await client.query(`
            UPDATE products
            SET stock_quantity = $1, updated_at = NOW()
            WHERE id = $2 AND business_id = $3
        `, [newStock, productId, businessId]);

        const movement = await client.query(`
            INSERT INTO stock_movements (
                business_id, product_id, movement_type, quantity_change,
                notes, created_by
            )
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id, product_id, movement_type, quantity_change, notes, created_at
        `, [businessId, productId, movementType, quantityChange, notes, req.user.id]);

        await client.query("COMMIT");
        transactionStarted = false;

        await logAudit(req, "inventory.adjusted", "product", productId, {
            quantityChange,
            newStock,
            movementType
        });
        await notifyLowStock(businessId, { ...product, stock_quantity: newStock }, req.user.id);

        return res.status(201).json({
            message: "Stock adjusted successfully.",
            stock: newStock,
            movement: movement.rows[0]
        });
    } catch (error) {
        if (transactionStarted) {
            try { await client.query("ROLLBACK"); } catch {}
        }
        console.error("ADJUST STOCK ERROR:", error);
        return res.status(error.status || 400).json({ message: error.message || "Failed to adjust stock." });
    } finally {
        client.release();
    }
}

async function getProductMovements(req, res) {
    req.query.productId = req.params.id;
    return getStockMovements(req, res);
}

module.exports = {
    getInventorySummary,
    getStockMovements,
    adjustStock,
    getProductMovements
};
