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

async function getPurchaseReturns(req, res) {
    const businessId = businessIdFrom(req);
    if (!businessId) return res.status(401).json({ message: "Business context is missing." });

    try {
        const result = await pool.query(`
            SELECT
                r.id,
                r.return_number,
                r.purchase_id,
                r.supplier_id,
                s.name AS supplier_name,
                p.reference_number,
                r.total_amount,
                r.reason,
                r.status,
                r.created_at,
                u.name AS created_by_name
            FROM purchase_returns r
            INNER JOIN purchases p
                ON p.id = r.purchase_id
               AND p.business_id = r.business_id
            LEFT JOIN suppliers s
                ON s.id = r.supplier_id
               AND s.business_id = r.business_id
            LEFT JOIN users u
                ON u.id = r.created_by
               AND u.business_id = r.business_id
            WHERE r.business_id = $1
            ORDER BY r.created_at DESC
            LIMIT 200
        `, [businessId]);

        return res.json({ returns: result.rows });
    } catch (error) {
        console.error("GET PURCHASE RETURNS ERROR:", error);
        return res.status(500).json({ message: "Failed to load purchase returns." });
    }
}

async function getPurchaseReturnById(req, res) {
    const businessId = businessIdFrom(req);
    const returnId = Number(req.params.id);

    if (!businessId) return res.status(401).json({ message: "Business context is missing." });
    if (!Number.isInteger(returnId) || returnId <= 0) {
        return res.status(400).json({ message: "Invalid purchase return ID." });
    }

    try {
        const header = await pool.query(`
            SELECT
                r.id,
                r.return_number,
                r.purchase_id,
                r.supplier_id,
                s.name AS supplier_name,
                p.reference_number,
                r.total_amount,
                r.reason,
                r.status,
                r.created_at,
                u.name AS created_by_name
            FROM purchase_returns r
            INNER JOIN purchases p
                ON p.id = r.purchase_id
               AND p.business_id = r.business_id
            LEFT JOIN suppliers s
                ON s.id = r.supplier_id
               AND s.business_id = r.business_id
            LEFT JOIN users u
                ON u.id = r.created_by
               AND u.business_id = r.business_id
            WHERE r.id = $1
              AND r.business_id = $2
            LIMIT 1
        `, [returnId, businessId]);

        if (!header.rowCount) return res.status(404).json({ message: "Purchase return not found." });

        const items = await pool.query(`
            SELECT
                id,
                purchase_item_id,
                product_id,
                product_name,
                quantity,
                unit_cost,
                line_total
            FROM purchase_return_items
            WHERE return_id = $1
              AND business_id = $2
            ORDER BY id
        `, [returnId, businessId]);

        return res.json({ return: header.rows[0], items: items.rows });
    } catch (error) {
        console.error("GET PURCHASE RETURN ERROR:", error);
        return res.status(500).json({ message: "Failed to load purchase return." });
    }
}

async function createPurchaseReturn(req, res) {
    const businessId = businessIdFrom(req);
    if (!businessId) return res.status(401).json({ message: "Business context is missing." });

    const purchaseId = Number(req.body?.purchaseId);
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const reason = String(req.body?.reason || "").trim().slice(0, 255) || null;

    if (!Number.isInteger(purchaseId) || purchaseId <= 0) {
        return res.status(400).json({ message: "Invalid purchase ID." });
    }

    if (!items.length) {
        return res.status(400).json({ message: "Select at least one item to return." });
    }

    const client = await pool.connect();
    let begun = false;

    try {
        await client.query("BEGIN");
        begun = true;

        const purchaseResult = await client.query(`
            SELECT
                id,
                supplier_id,
                reference_number,
                total_amount,
                amount_paid,
                balance
            FROM purchases
            WHERE id = $1
              AND business_id = $2
            FOR UPDATE
        `, [purchaseId, businessId]);

        if (!purchaseResult.rowCount) throw fail("Purchase not found.", 404);
        const purchase = purchaseResult.rows[0];

        const purchaseItemsResult = await client.query(`
            SELECT
                id,
                product_id,
                product_name,
                quantity,
                unit_cost,
                line_total
            FROM purchase_items
            WHERE purchase_id = $1
              AND business_id = $2
            ORDER BY id
            FOR UPDATE
        `, [purchaseId, businessId]);

        const purchaseItems = new Map(
            purchaseItemsResult.rows.map((row) => [Number(row.id), row])
        );

        const returnedResult = await client.query(`
            SELECT
                pri.purchase_item_id,
                COALESCE(SUM(pri.quantity), 0) AS returned_quantity
            FROM purchase_return_items pri
            INNER JOIN purchase_returns pr
                ON pr.id = pri.return_id
               AND pr.business_id = pri.business_id
            WHERE pr.purchase_id = $1
              AND pr.business_id = $2
              AND pr.status = 'completed'
            GROUP BY pri.purchase_item_id
        `, [purchaseId, businessId]);

        const returnedMap = new Map(
            returnedResult.rows.map((row) => [
                Number(row.purchase_item_id),
                Number(row.returned_quantity)
            ])
        );

        const prepared = [];
        const lowStockProducts = [];
        let total = 0;
        const seen = new Set();

        for (const input of items) {
            const purchaseItemId = Number(input.purchaseItemId);
            const quantity = Number(input.quantity);

            if (!Number.isInteger(purchaseItemId) || purchaseItemId <= 0) {
                throw fail("Invalid purchase item ID.");
            }

            if (seen.has(purchaseItemId)) {
                throw fail("The same purchase item cannot be returned twice in one request.");
            }
            seen.add(purchaseItemId);

            if (!Number.isInteger(quantity) || quantity <= 0) {
                throw fail("Return quantity must be a positive whole number.");
            }

            const purchaseItem = purchaseItems.get(purchaseItemId);
            if (!purchaseItem) {
                throw fail("Selected purchase item does not belong to this purchase.");
            }

            const alreadyReturned = returnedMap.get(purchaseItemId) || 0;
            const remaining = Number(purchaseItem.quantity) - alreadyReturned;

            if (quantity > remaining) {
                throw fail(`Only ${remaining} unit(s) of ${purchaseItem.product_name} remain available for return.`);
            }

            const lineTotal = Math.round(Number(purchaseItem.unit_cost) * quantity * 100) / 100;
            total = Math.round((total + lineTotal) * 100) / 100;

            prepared.push({
                ...purchaseItem,
                purchaseItemId,
                quantity,
                lineTotal
            });
        }

        if (total > Number(purchase.total_amount)) {
            throw fail("Return value cannot exceed the original purchase amount.");
        }

        const returnNumberResult = await client.query(`
            SELECT
                'PRT-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' ||
                LPAD(nextval('purchase_return_seq')::text, 6, '0') AS return_number
        `);
        const returnNumber = returnNumberResult.rows[0].return_number;

        const newTotal = Math.max(0, Math.round((Number(purchase.total_amount) - total) * 100) / 100);
        const newAmountPaid = Math.min(Number(purchase.amount_paid), newTotal);
        const newBalance = Math.max(0, Math.round((newTotal - newAmountPaid) * 100) / 100);
        const newStatus = newBalance <= 0 ? "paid" : (newAmountPaid > 0 ? "partial" : "credit");

        const returnResult = await client.query(`
            INSERT INTO purchase_returns (
                business_id,
                purchase_id,
                supplier_id,
                return_number,
                total_amount,
                reason,
                status,
                created_by
            )
            VALUES ($1, $2, $3, $4, $5, $6, 'completed', $7)
            RETURNING
                id,
                return_number,
                purchase_id,
                supplier_id,
                total_amount,
                reason,
                status,
                created_at
        `, [
            businessId,
            purchaseId,
            purchase.supplier_id,
            returnNumber,
            total,
            reason,
            req.user.id
        ]);

        const returnRecord = returnResult.rows[0];

        for (const item of prepared) {
            await client.query(`
                INSERT INTO purchase_return_items (
                    business_id,
                    return_id,
                    purchase_item_id,
                    product_id,
                    product_name,
                    quantity,
                    unit_cost,
                    line_total
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `, [
                businessId,
                returnRecord.id,
                item.purchaseItemId,
                item.product_id,
                item.product_name,
                item.quantity,
                item.unit_cost,
                item.lineTotal
            ]);

            const stockUpdate = await client.query(`
                UPDATE products
                SET
                    stock_quantity = stock_quantity - $1,
                    updated_at = NOW()
                WHERE id = $2
                  AND business_id = $3
                  AND stock_quantity >= $1
            `, [item.quantity, item.product_id, businessId]);

            if (!stockUpdate.rowCount) {
                throw fail(`Insufficient stock to return ${item.product_name}.`, 409);
            }

            const stockResult = await client.query(`
                SELECT id, name, stock_quantity, low_stock_threshold
                FROM products
                WHERE id = $1
                  AND business_id = $2
            `, [item.product_id, businessId]);

            if (!stockResult.rowCount || Number(stockResult.rows[0].stock_quantity) < 0) {
                throw fail(`Insufficient stock to return ${item.product_name}.`, 409);
            }

            lowStockProducts.push(stockResult.rows[0]);

            await client.query(`
                INSERT INTO stock_movements (
                    business_id,
                    product_id,
                    movement_type,
                    quantity_change,
                    reference_type,
                    reference_id,
                    notes,
                    created_by
                )
                VALUES ($1, $2, 'purchase_return', $3, 'purchase_return', $4, $5, $6)
            `, [
                businessId,
                item.product_id,
                -item.quantity,
                returnRecord.id,
                reason || `Purchase return ${returnNumber}`,
                req.user.id
            ]);
        }

        await client.query(`
            UPDATE purchases
            SET
                total_amount = $1,
                amount_paid = $2,
                balance = $3,
                status = $4,
                updated_at = NOW()
            WHERE id = $5
              AND business_id = $6
        `, [
            newTotal,
            newAmountPaid,
            newBalance,
            newStatus,
            purchaseId,
            businessId
        ]);

        await client.query("COMMIT");
        begun = false;

        for (const lowStockProduct of lowStockProducts) {
            await notifyLowStock(businessId, lowStockProduct, req.user.id);
        }

        await logAudit(req, "purchase.return_created", "purchase_return", returnRecord.id, {
            purchaseId,
            total,
            itemCount: prepared.length
        });

        return res.status(201).json({
            message: "Purchase return completed successfully.",
            return: returnRecord,
            purchase: {
                id: purchaseId,
                total_amount: newTotal,
                amount_paid: newAmountPaid,
                balance: newBalance,
                status: newStatus
            }
        });
    } catch (error) {
        if (begun) {
            try {
                await client.query("ROLLBACK");
            } catch {
                // Ignore rollback errors.
            }
        }

        console.error("CREATE PURCHASE RETURN ERROR:", error);
        return res.status(error.status || 500).json({
            message: error.message || "Failed to create purchase return."
        });
    } finally {
        client.release();
    }
}

module.exports = {
    getPurchaseReturns,
    getPurchaseReturnById,
    createPurchaseReturn
};
