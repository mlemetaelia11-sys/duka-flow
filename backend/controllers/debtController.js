"use strict";

const pool = require("../db");

function businessIdFrom(req) {
    const value = Number(req.businessId || req.user?.businessId || req.user?.business_id);
    return Number.isInteger(value) && value > 0 ? value : null;
}

function httpError(message, status = 400) {
    const error = new Error(message);
    error.status = status;
    return error;
}

async function getAllDebts(req, res) {
    const businessId = businessIdFrom(req);
    if (!businessId) return res.status(401).json({ message: "Business context is missing." });

    try {
        const result = await pool.query(`
            SELECT
                d.id, d.sale_id, d.customer_id,
                c.name AS customer_name, c.phone AS customer_phone,
                d.total_amount, d.amount_paid, d.balance, d.due_date,
                CASE
                    WHEN d.balance = 0 THEN 'paid'
                    WHEN d.due_date IS NOT NULL AND d.due_date < CURRENT_DATE THEN 'overdue'
                    WHEN d.amount_paid > 0 THEN 'partial'
                    ELSE 'unpaid'
                END AS status,
                s.receipt_number,
                d.created_at, d.updated_at
            FROM debts d
            INNER JOIN customers c ON c.id = d.customer_id AND c.business_id = d.business_id
            INNER JOIN sales s ON s.id = d.sale_id AND s.business_id = d.business_id
            WHERE d.business_id = $1
            ORDER BY CASE WHEN d.balance > 0 THEN 0 ELSE 1 END, d.created_at DESC
        `, [businessId]);

        return res.json({ debts: result.rows });
    } catch (error) {
        console.error("GET ALL DEBTS ERROR:", error);
        return res.status(500).json({ message: "Failed to fetch debts." });
    }
}

async function recordDebtPayment(req, res) {
    const businessId = businessIdFrom(req);
    if (!businessId) return res.status(401).json({ message: "Business context is missing." });

    const client = await pool.connect();
    let transactionStarted = false;

    try {
        const debtId = Number(req.params.id);
        const amount = Number(req.body?.amount);
        const paymentMethod = String(req.body?.paymentMethod || "").trim();
        const notes = req.body?.notes ? String(req.body.notes).trim().slice(0, 255) : null;
        const reference = req.body?.reference ? String(req.body.reference).trim().slice(0, 100) : null;

        if (!Number.isInteger(debtId) || debtId <= 0) throw httpError("Invalid debt ID.");
        if (!Number.isFinite(amount) || amount <= 0) throw httpError("Payment amount must be greater than zero.");
        if (!["cash", "mobile_money", "bank"].includes(paymentMethod)) {
            throw httpError("Invalid payment method.");
        }

        await client.query("BEGIN");
        transactionStarted = true;

        const debtResult = await client.query(`
            SELECT id, customer_id, total_amount, amount_paid, balance, due_date, status
            FROM debts
            WHERE id = $1 AND business_id = $2
            FOR UPDATE
        `, [debtId, businessId]);

        if (!debtResult.rowCount) throw httpError("Debt not found.", 404);

        const debt = debtResult.rows[0];
        const balance = Number(debt.balance);
        if (balance <= 0) throw httpError("This debt has already been fully paid.");
        if (amount > balance) throw httpError(`Payment cannot exceed the remaining balance of TSh ${balance.toLocaleString()}.`);

        const newAmountPaid = Math.round((Number(debt.amount_paid) + amount) * 100) / 100;
        const newBalance = Math.round((balance - amount) * 100) / 100;
        const newStatus = newBalance === 0 ? "paid" : "partial";

        const paymentResult = await client.query(`
            INSERT INTO debt_payments (
                business_id, debt_id, amount, payment_method, notes, payment_reference, created_by
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id, debt_id, amount, payment_method, notes, payment_reference, paid_at
        `, [businessId, debtId, amount, paymentMethod, notes, reference, req.user.id]);

        const updatedDebt = await client.query(`
            UPDATE debts
            SET amount_paid = $1, balance = $2, status = $3, updated_at = NOW()
            WHERE id = $4 AND business_id = $5
            RETURNING id, sale_id, customer_id, total_amount, amount_paid, balance, due_date, status, updated_at
        `, [newAmountPaid, newBalance, newStatus, debtId, businessId]);

        if (paymentMethod === "cash") {
            const registerResult = await client.query(`
                SELECT id FROM cash_registers
                WHERE business_id = $1 AND status = 'open'
                LIMIT 1 FOR UPDATE
            `, [businessId]);
            if (registerResult.rowCount) {
                await client.query(`
                    INSERT INTO cash_movements (
                        business_id, register_id, movement_type, amount, direction,
                        reference_type, reference_id, note, created_by
                    ) VALUES ($1, $2, 'cash_in', $3, 'in', 'debt_payment', $4, $5, $6)
                `, [businessId, registerResult.rows[0].id, amount, debtId, 'Customer debt payment', req.user.id]);
            }
        }

        await client.query("COMMIT");
        transactionStarted = false;

        return res.status(201).json({
            message: "Debt payment recorded successfully.",
            payment: paymentResult.rows[0],
            debt: updatedDebt.rows[0]
        });
    } catch (error) {
        if (transactionStarted) {
            try { await client.query("ROLLBACK"); } catch {}
        }
        console.error("RECORD DEBT PAYMENT ERROR:", error);
        return res.status(error.status || 400).json({
            message: error.message || "Failed to record debt payment."
        });
    } finally {
        client.release();
    }
}

async function getCustomerDebts(req, res) {
    const businessId = businessIdFrom(req);
    if (!businessId) return res.status(401).json({ message: "Business context is missing." });

    const customerId = Number(req.params.customerId);
    if (!Number.isInteger(customerId) || customerId <= 0) {
        return res.status(400).json({ message: "Invalid customer ID." });
    }

    try {
        const result = await pool.query(`
            SELECT
                d.id, d.sale_id, d.customer_id, d.total_amount,
                d.amount_paid, d.balance, d.due_date,
                CASE
                    WHEN d.balance = 0 THEN 'paid'
                    WHEN d.due_date IS NOT NULL AND d.due_date < CURRENT_DATE THEN 'overdue'
                    WHEN d.amount_paid > 0 THEN 'partial'
                    ELSE 'unpaid'
                END AS status,
                d.created_at, d.updated_at, s.receipt_number
            FROM debts d
            INNER JOIN sales s ON s.id = d.sale_id AND s.business_id = d.business_id
            INNER JOIN customers c ON c.id = d.customer_id AND c.business_id = d.business_id
            WHERE d.customer_id = $1 AND d.business_id = $2
            ORDER BY d.created_at DESC
        `, [customerId, businessId]);

        return res.json({ debts: result.rows });
    } catch (error) {
        console.error("GET CUSTOMER DEBTS ERROR:", error);
        return res.status(500).json({ message: "Failed to fetch customer debts." });
    }
}

async function getDebtPayments(req, res) {
    const businessId = businessIdFrom(req);
    if (!businessId) return res.status(401).json({ message: "Business context is missing." });

    const debtId = Number(req.params.id);
    if (!Number.isInteger(debtId) || debtId <= 0) {
        return res.status(400).json({ message: "Invalid debt ID." });
    }

    try {
        const result = await pool.query(`
            SELECT
                dp.id, dp.debt_id, dp.amount, dp.payment_method,
                dp.notes, dp.payment_reference, dp.paid_at
            FROM debt_payments dp
            INNER JOIN debts d ON d.id = dp.debt_id AND d.business_id = dp.business_id
            WHERE dp.debt_id = $1 AND dp.business_id = $2
            ORDER BY dp.paid_at DESC
        `, [debtId, businessId]);

        return res.json({ payments: result.rows });
    } catch (error) {
        console.error("GET DEBT PAYMENTS ERROR:", error);
        return res.status(500).json({ message: "Failed to fetch payment history." });
    }
}

module.exports = {
    getAllDebts,
    recordDebtPayment,
    getCustomerDebts,
    getDebtPayments
};
