"use strict";

const pool = require("../db");
const { logAudit } = require("../utils/audit");

function businessIdFrom(req) {
    const value = Number(req.businessId || req.user?.businessId || req.user?.business_id);
    return Number.isInteger(value) && value > 0 ? value : null;
}

function fail(message, status = 400) {
    const err = new Error(message);
    err.status = status;
    return err;
}

async function getReturns(req, res) {
    const businessId = businessIdFrom(req);
    if (!businessId) return res.status(401).json({ message: "Business context is missing." });

    try {
        const result = await pool.query(`
            SELECT
                r.id, r.return_number, r.sale_id, r.customer_id,
                c.name AS customer_name,
                s.receipt_number,
                r.total_amount, r.reason, r.refund_method,
                r.refund_reference, r.status, r.created_at,
                u.name AS created_by_name
            FROM sale_returns r
            INNER JOIN sales s ON s.id = r.sale_id AND s.business_id = r.business_id
            LEFT JOIN customers c ON c.id = r.customer_id AND c.business_id = r.business_id
            LEFT JOIN users u ON u.id = r.created_by AND u.business_id = r.business_id
            WHERE r.business_id = $1
            ORDER BY r.created_at DESC
        `, [businessId]);
        return res.json({ returns: result.rows });
    } catch (error) {
        console.error("GET RETURNS ERROR:", error);
        return res.status(500).json({ message: "Failed to load returns." });
    }
}

async function getReturnById(req, res) {
    const businessId = businessIdFrom(req);
    if (!businessId) return res.status(401).json({ message: "Business context is missing." });
    const returnId = Number(req.params.id);
    if (!Number.isInteger(returnId) || returnId <= 0) return res.status(400).json({ message: "Invalid return ID." });

    try {
        const header = await pool.query(`
            SELECT
                r.id, r.return_number, r.sale_id, r.customer_id,
                c.name AS customer_name, s.receipt_number,
                r.total_amount, r.reason, r.refund_method,
                r.refund_reference, r.status, r.created_at
            FROM sale_returns r
            INNER JOIN sales s ON s.id = r.sale_id AND s.business_id = r.business_id
            LEFT JOIN customers c ON c.id = r.customer_id AND c.business_id = r.business_id
            WHERE r.id = $1 AND r.business_id = $2
            LIMIT 1
        `, [returnId, businessId]);
        if (!header.rowCount) return res.status(404).json({ message: "Return not found." });

        const items = await pool.query(`
            SELECT id, sale_item_id, product_id, product_name, quantity, unit_price, line_total
            FROM sale_return_items
            WHERE return_id = $1 AND business_id = $2
            ORDER BY id
        `, [returnId, businessId]);
        return res.json({ return: header.rows[0], items: items.rows });
    } catch (error) {
        console.error("GET RETURN ERROR:", error);
        return res.status(500).json({ message: "Failed to load return." });
    }
}

async function createReturn(req, res) {
    const businessId = businessIdFrom(req);
    if (!businessId) return res.status(401).json({ message: "Business context is missing." });

    const saleId = Number(req.body?.saleId);
    const items = req.body?.items;
    const reason = String(req.body?.reason || "").trim().slice(0, 255) || null;
    const refundMethod = String(req.body?.refundMethod || "cash").trim();
    const refundReference = String(req.body?.refundReference || "").trim().slice(0, 100) || null;

    if (!Number.isInteger(saleId) || saleId <= 0) return res.status(400).json({ message: "Invalid sale ID." });
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ message: "Select at least one item to return." });
    if (!["cash", "mobile_money", "bank", "credit_balance"].includes(refundMethod)) return res.status(400).json({ message: "Invalid refund method." });

    const client = await pool.connect();
    let begun = false;
    try {
        await client.query("BEGIN");
        begun = true;

        const saleResult = await client.query(`
            SELECT id, customer_id, payment_method, receipt_number
            FROM sales
            WHERE id = $1 AND business_id = $2
            FOR UPDATE
        `, [saleId, businessId]);
        if (!saleResult.rowCount) throw fail("Sale not found.", 404);
        const sale = saleResult.rows[0];

        if (refundMethod === "credit_balance" && sale.payment_method !== "credit") {
            throw fail("Credit balance refund is only available for credit sales.", 400);
        }

        const saleItemIds = items.map((item) => Number(item.saleItemId));
        if (saleItemIds.some((id) => !Number.isInteger(id) || id <= 0)) throw fail("Invalid sale item ID.");

        const saleItemsResult = await client.query(`
            SELECT id, product_id, product_name, quantity, unit_price, line_total
            FROM sale_items
            WHERE sale_id = $1 AND business_id = $2
            ORDER BY id
            FOR UPDATE
        `, [saleId, businessId]);
        const saleItems = new Map(saleItemsResult.rows.map((row) => [Number(row.id), row]));

        const returnedResult = await client.query(`
            SELECT sri.sale_item_id, COALESCE(SUM(sri.quantity), 0) AS returned_quantity
            FROM sale_return_items sri
            INNER JOIN sale_returns sr ON sr.id = sri.return_id AND sr.business_id = sri.business_id
            WHERE sr.sale_id = $1 AND sr.business_id = $2 AND sr.status = 'completed'
            GROUP BY sri.sale_item_id
        `, [saleId, businessId]);
        const returnedMap = new Map(returnedResult.rows.map((row) => [Number(row.sale_item_id), Number(row.returned_quantity)]));

        const prepared = [];
        let total = 0;
        const seen = new Set();
        for (const input of items) {
            const saleItemId = Number(input.saleItemId);
            const quantity = Number(input.quantity);
            if (seen.has(saleItemId)) throw fail("The same sale item cannot be returned twice in one request.");
            seen.add(saleItemId);
            if (!Number.isInteger(quantity) || quantity <= 0) throw fail("Return quantity must be a positive whole number.");

            const saleItem = saleItems.get(saleItemId);
            if (!saleItem) throw fail(`Sale item ${saleItemId} does not belong to this sale.`);

            const alreadyReturned = returnedMap.get(saleItemId) || 0;
            const remaining = Number(saleItem.quantity) - alreadyReturned;
            if (quantity > remaining) throw fail(`Only ${remaining} unit(s) of ${saleItem.product_name} remain available for return.`);

            const lineTotal = Math.round(Number(saleItem.unit_price) * quantity * 100) / 100;
            total = Math.round((total + lineTotal) * 100) / 100;
            prepared.push({ ...saleItem, saleItemId, quantity, lineTotal });
        }

        let debtId = null;
        if (sale.payment_method === "credit" && refundMethod === "credit_balance") {
            const debtResult = await client.query(`
                SELECT id, total_amount, amount_paid, balance
                FROM debts
                WHERE sale_id = $1 AND business_id = $2
                FOR UPDATE
            `, [saleId, businessId]);
            if (!debtResult.rowCount) throw fail("Credit sale debt record was not found.", 409);
            const debt = debtResult.rows[0];
            const balance = Number(debt.balance);
            if (total > balance) throw fail("This return is larger than the customer's outstanding credit balance. Use another refund method.");
            const newTotal = Math.max(0, Number(debt.total_amount) - total);
            const newBalance = Math.max(0, balance - total);
            const status = newBalance === 0 ? "paid" : (Number(debt.amount_paid) > 0 ? "partial" : "unpaid");
            await client.query(`
                UPDATE debts
                SET total_amount = $1, balance = $2, status = $3, updated_at = NOW()
                WHERE id = $4 AND business_id = $5
            `, [newTotal, newBalance, status, debt.id, businessId]);
            debtId = debt.id;
        }

        const returnNumberResult = await client.query(`
            SELECT 'RET-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(nextval('sale_return_seq')::text, 6, '0') AS return_number
        `);
        const returnNumber = returnNumberResult.rows[0].return_number;

        const returnResult = await client.query(`
            INSERT INTO sale_returns (
                business_id, sale_id, customer_id, return_number, total_amount,
                reason, refund_method, refund_reference, status, created_by
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'completed', $9)
            RETURNING id, return_number, sale_id, customer_id, total_amount, reason,
                      refund_method, refund_reference, status, created_at
        `, [businessId, saleId, sale.customer_id, returnNumber, total, reason, refundMethod, refundReference, req.user.id]);

        const returnRecord = returnResult.rows[0];
        for (const item of prepared) {
            await client.query(`
                INSERT INTO sale_return_items (
                    business_id, return_id, sale_item_id, product_id,
                    product_name, quantity, unit_price, line_total
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `, [businessId, returnRecord.id, item.saleItemId, item.product_id, item.product_name, item.quantity, item.unit_price, item.lineTotal]);

            await client.query(`
                UPDATE products
                SET stock_quantity = stock_quantity + $1, updated_at = NOW()
                WHERE id = $2 AND business_id = $3
            `, [item.quantity, item.product_id, businessId]);

            await client.query(`
                INSERT INTO stock_movements (
                    business_id, product_id, movement_type, quantity_change,
                    reference_type, reference_id, notes, created_by
                )
                VALUES ($1, $2, 'sale_return', $3, 'sale_return', $4, $5, $6)
            `, [businessId, item.product_id, item.quantity, returnRecord.id, `Return ${returnNumber} from ${sale.receipt_number}`, req.user.id]);
        }

        if (refundMethod === "cash") {
            const registerResult = await client.query(`
                SELECT id
                FROM cash_registers
                WHERE business_id = $1 AND status = 'open'
                LIMIT 1
                FOR UPDATE
            `, [businessId]);
            if (registerResult.rowCount) {
                await client.query(`
                    INSERT INTO cash_movements (
                        business_id, register_id, movement_type, amount, direction,
                        reference_type, reference_id, note, created_by
                    ) VALUES ($1, $2, 'refund', $3, 'out', 'sale_return', $4, $5, $6)
                `, [businessId, registerResult.rows[0].id, total, returnRecord.id, `Refund ${returnNumber}`, req.user.id]);
            }
        }

        await client.query("COMMIT");
        begun = false;
        await logAudit(req, "sale.returned", "sale_return", returnRecord.id, { saleId, total, refundMethod, debtId });

        return res.status(201).json({ message: "Return completed successfully.", return: returnRecord });
    } catch (error) {
        if (begun) { try { await client.query("ROLLBACK"); } catch {} }
        console.error("CREATE RETURN ERROR:", error);
        return res.status(error.status || 400).json({ message: error.message || "Failed to complete return." });
    } finally {
        client.release();
    }
}

module.exports = { getReturns, getReturnById, createReturn };
