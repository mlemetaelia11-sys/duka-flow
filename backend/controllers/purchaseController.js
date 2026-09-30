"use strict";

const pool = require("../db");

function businessIdFrom(req) {
    const value = Number(req.businessId || req.user?.businessId || req.user?.business_id);
    return Number.isInteger(value) && value > 0 ? value : null;
}

function error(message, status = 400) {
    const err = new Error(message);
    err.status = status;
    return err;
}

function normalizePaymentReference(value) {
    const text = String(value ?? "").trim();
    return text ? text.slice(0, 100) : null;
}

async function createPurchase(req, res) {
    const businessId = businessIdFrom(req);
    if (!businessId) return res.status(401).json({ message: "Business context is missing." });

    const client = await pool.connect();
    let transactionStarted = false;

    try {
        const {
            supplierId = null,
            items,
            discount = 0,
            amountPaid = 0,
            paymentMethod = "cash",
            paymentReference = null
        } = req.body || {};

        if (!Array.isArray(items) || items.length === 0) throw error("Purchase must contain at least one product.");
        if (!["cash", "mobile_money", "bank", "credit"].includes(paymentMethod)) throw error("Invalid payment method.");

        const discountAmount = Number(discount);
        let paidAmount = Number(amountPaid);
        if (!Number.isFinite(discountAmount) || discountAmount < 0) throw error("Invalid discount.");
        if (!Number.isFinite(paidAmount) || paidAmount < 0) throw error("Invalid amount paid.");

        let validSupplierId = null;
        if (supplierId !== null && supplierId !== "") {
            validSupplierId = Number(supplierId);
            if (!Number.isInteger(validSupplierId) || validSupplierId <= 0) throw error("Invalid supplier ID.");
        }

        await client.query("BEGIN");
        transactionStarted = true;

        if (validSupplierId !== null) {
            const supplier = await client.query(`
                SELECT id, name
                FROM suppliers
                WHERE id = $1 AND business_id = $2
                LIMIT 1
            `, [validSupplierId, businessId]);
            if (!supplier.rowCount) throw error("Supplier not found.", 404);
        }

        const referenceResult = await client.query(`
            SELECT 'PUR-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' ||
                LPAD(nextval('purchase_reference_seq')::text, 6, '0') AS reference_number
        `);
        const referenceNumber = referenceResult.rows[0].reference_number;

        const preparedItems = [];
        let subtotal = 0;

        for (const item of items) {
            const productId = Number(item.productId);
            const quantity = Number(item.quantity);
            const unitCost = Number(item.unitCost);

            if (!Number.isInteger(productId) || productId <= 0) throw error("Invalid product ID.");
            if (!Number.isInteger(quantity) || quantity <= 0) throw error("Quantity must be a positive whole number.");
            if (!Number.isFinite(unitCost) || unitCost < 0) throw error("Unit cost must be a valid non-negative number.");

            const productResult = await client.query(`
                SELECT id, name, buying_price, selling_price, stock_quantity
                FROM products
                WHERE id = $1 AND business_id = $2
                FOR UPDATE
            `, [productId, businessId]);
            if (!productResult.rowCount) throw error(`Product ${productId} not found.`, 404);

            const product = productResult.rows[0];
            const lineTotal = Math.round(unitCost * quantity * 100) / 100;
            subtotal = Math.round((subtotal + lineTotal) * 100) / 100;

            preparedItems.push({
                productId: product.id,
                productName: product.name,
                quantity,
                unitCost,
                currentSellingPrice: Number(product.selling_price),
                lineTotal
            });
        }

        if (discountAmount > subtotal) throw error("Discount cannot be greater than subtotal.");

        const totalAmount = Math.round((subtotal - discountAmount) * 100) / 100;
        let balance = Math.round((totalAmount - paidAmount) * 100) / 100;

        if (paymentMethod === "credit") {
            if (paidAmount > totalAmount) {
                paidAmount = totalAmount;
                balance = 0;
            }
        } else {
            if (paidAmount < totalAmount) throw error("Amount paid is less than purchase total.");
            balance = 0;
            paidAmount = Math.round(paidAmount * 100) / 100;
        }

        const status = balance === 0 ? "paid" : (paidAmount > 0 ? "partial" : "credit");
        const normalizedReference = normalizePaymentReference(paymentReference);

        const purchaseResult = await client.query(`
            INSERT INTO purchases (
                business_id, reference_number, supplier_id, subtotal, discount,
                total_amount, amount_paid, balance, payment_method, payment_reference, status, created_by
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING id, reference_number, supplier_id, subtotal, discount, total_amount,
                      amount_paid, balance, payment_method, payment_reference, status, created_at
        `, [
            businessId, referenceNumber, validSupplierId, subtotal, discountAmount,
            totalAmount, paidAmount, balance, paymentMethod, normalizedReference, status, req.user.id
        ]);

        const purchase = purchaseResult.rows[0];

        for (const item of preparedItems) {
            await client.query(`
                INSERT INTO purchase_items (
                    business_id, purchase_id, product_id, product_name, quantity, unit_cost, line_total
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7)
            `, [businessId, purchase.id, item.productId, item.productName, item.quantity, item.unitCost, item.lineTotal]);

            await client.query(`
                UPDATE products
                SET stock_quantity = stock_quantity + $1,
                    buying_price = $2,
                    updated_at = NOW()
                WHERE id = $3 AND business_id = $4
            `, [item.quantity, item.unitCost, item.productId, businessId]);

            await client.query(`
                INSERT INTO stock_movements (
                    business_id, product_id, movement_type, quantity_change,
                    reference_type, reference_id, notes, created_by
                )
                VALUES ($1, $2, 'purchase', $3, 'purchase', $4, $5, $6)
            `, [businessId, item.productId, item.quantity, purchase.id, `Stock in from ${referenceNumber}`, req.user.id]);
        }

        if (paymentMethod === "cash" && paidAmount > 0) {
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
                    )
                    VALUES ($1, $2, 'cash_out', $3, 'out', 'purchase', $4, $5, $6)
                `, [businessId, registerResult.rows[0].id, paidAmount, purchase.id, `Purchase ${referenceNumber}`, req.user.id]);
            }
        }

        await client.query("COMMIT");
        transactionStarted = false;

        return res.status(201).json({
            message: "Purchase completed successfully.",
            purchase
        });
    } catch (err) {
        if (transactionStarted) {
            try { await client.query("ROLLBACK"); } catch {}
        }
        console.error("CREATE PURCHASE ERROR:", err);
        return res.status(err.status || 400).json({ message: err.message || "Failed to create purchase." });
    } finally {
        client.release();
    }
}

async function getPurchases(req, res) {
    const businessId = businessIdFrom(req);
    if (!businessId) return res.status(401).json({ message: "Business context is missing." });

    try {
        const result = await pool.query(`
            SELECT
                p.id, p.reference_number, p.supplier_id, s.name AS supplier_name,
                p.subtotal, p.discount, p.total_amount, p.amount_paid, p.balance,
                p.payment_method, p.payment_reference, p.status, p.created_at,
                COALESCE(SUM(pi.quantity), 0) AS total_items
            FROM purchases p
            LEFT JOIN suppliers s ON s.id = p.supplier_id AND s.business_id = p.business_id
            LEFT JOIN purchase_items pi ON pi.purchase_id = p.id AND pi.business_id = p.business_id
            WHERE p.business_id = $1
            GROUP BY p.id, s.name
            ORDER BY p.created_at DESC
        `, [businessId]);

        return res.json({ purchases: result.rows });
    } catch (err) {
        console.error("GET PURCHASES ERROR:", err);
        return res.status(500).json({ message: "Failed to fetch purchases." });
    }
}

async function getPurchaseById(req, res) {
    const businessId = businessIdFrom(req);
    if (!businessId) return res.status(401).json({ message: "Business context is missing." });

    const purchaseId = Number(req.params.id);
    if (!Number.isInteger(purchaseId) || purchaseId <= 0) return res.status(400).json({ message: "Invalid purchase ID." });

    try {
        const purchaseResult = await pool.query(`
            SELECT
                p.id, p.reference_number, p.supplier_id, s.name AS supplier_name,
                p.subtotal, p.discount, p.total_amount, p.amount_paid, p.balance,
                p.payment_method, p.payment_reference, p.status, p.created_at
            FROM purchases p
            LEFT JOIN suppliers s ON s.id = p.supplier_id AND s.business_id = p.business_id
            WHERE p.id = $1 AND p.business_id = $2
            LIMIT 1
        `, [purchaseId, businessId]);
        if (!purchaseResult.rowCount) return res.status(404).json({ message: "Purchase not found." });

        const itemsResult = await pool.query(`
            SELECT
                pi.id,
                pi.product_id,
                pi.product_name,
                pi.quantity,
                pi.unit_cost,
                pi.line_total,
                COALESCE((
                    SELECT SUM(pri.quantity)
                    FROM purchase_return_items pri
                    INNER JOIN purchase_returns pr
                        ON pr.id = pri.return_id
                       AND pr.business_id = pri.business_id
                    WHERE pri.purchase_item_id = pi.id
                      AND pri.business_id = pi.business_id
                      AND pr.status = 'completed'
                ), 0) AS returned_quantity
            FROM purchase_items pi
            WHERE pi.purchase_id = $1
              AND pi.business_id = $2
            ORDER BY pi.id
        `, [purchaseId, businessId]);

        const items = itemsResult.rows.map((item) => ({
            ...item,
            returned_quantity: Number(item.returned_quantity || 0),
            remaining_quantity: Math.max(0, Number(item.quantity) - Number(item.returned_quantity || 0))
        }));

        return res.json({ purchase: purchaseResult.rows[0], items });
    } catch (err) {
        console.error("GET PURCHASE ERROR:", err);
        return res.status(500).json({ message: "Failed to fetch purchase." });
    }
}

module.exports = { createPurchase, getPurchases, getPurchaseById };
