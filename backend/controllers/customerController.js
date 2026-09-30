"use strict";

const pool = require("../db");
const { logAudit } = require("../utils/audit");

function businessIdFrom(req) {
    const value = Number(
        req.businessId ||
        req.user?.businessId ||
        req.user?.business_id
    );

    return Number.isInteger(value) && value > 0 ? value : null;
}

function customerIdFrom(req) {
    const value = Number(req.params.id);
    return Number.isInteger(value) && value > 0 ? value : null;
}

function clean(value, maxLength) {
    const text = String(value ?? "").trim();
    return text ? text.slice(0, maxLength) : null;
}

function requireValidCustomerName(value) {
    const name = String(value ?? "").trim();

    if (name.length < 2) {
        return "Customer name must be at least 2 characters.";
    }

    if (name.length > 150) {
        return "Customer name cannot exceed 150 characters.";
    }

    return null;
}

/* =========================================================
   GET CUSTOMERS
   ========================================================= */

async function getCustomers(req, res) {
    const businessId = businessIdFrom(req);

    if (!businessId) {
        return res.status(401).json({
            message: "Business context is missing."
        });
    }

    try {
        const result = await pool.query(
            `
            SELECT
                c.id,
                c.name,
                c.phone,
                c.email,
                c.address,
                c.created_at,
                c.updated_at,
                COALESCE(sales.total_purchases, 0) AS total_purchases,
                COALESCE(debts.outstanding_debt, 0) AS outstanding_debt
            FROM customers c
            LEFT JOIN (
                SELECT
                    customer_id,
                    SUM(total_amount) AS total_purchases
                FROM sales
                WHERE business_id = $1
                  AND customer_id IS NOT NULL
                GROUP BY customer_id
            ) sales
                ON sales.customer_id = c.id
            LEFT JOIN (
                SELECT
                    customer_id,
                    SUM(balance) AS outstanding_debt
                FROM debts
                WHERE business_id = $1
                  AND balance > 0
                GROUP BY customer_id
            ) debts
                ON debts.customer_id = c.id
            WHERE c.business_id = $1
            ORDER BY c.id DESC
            `,
            [businessId]
        );

        return res.json({
            customers: result.rows
        });
    } catch (error) {
        console.error("GET CUSTOMERS ERROR:", error);

        return res.status(500).json({
            message: "Failed to fetch customers."
        });
    }
}

/* =========================================================
   GET CUSTOMER BY ID
   ========================================================= */

async function getCustomerById(req, res) {
    const businessId = businessIdFrom(req);
    const customerId = customerIdFrom(req);

    if (!businessId) {
        return res.status(401).json({
            message: "Business context is missing."
        });
    }

    if (!customerId) {
        return res.status(400).json({
            message: "Invalid customer ID."
        });
    }

    try {
        const result = await pool.query(
            `
            SELECT
                id,
                name,
                phone,
                email,
                address,
                created_at,
                updated_at
            FROM customers
            WHERE id = $1
              AND business_id = $2
            LIMIT 1
            `,
            [customerId, businessId]
        );

        if (!result.rowCount) {
            return res.status(404).json({
                message: "Customer not found."
            });
        }

        return res.json({
            customer: result.rows[0]
        });
    } catch (error) {
        console.error("GET CUSTOMER ERROR:", error);

        return res.status(500).json({
            message: "Failed to fetch customer."
        });
    }
}

/* =========================================================
   CREATE CUSTOMER
   ========================================================= */

async function createCustomer(req, res) {
    const businessId = businessIdFrom(req);

    if (!businessId) {
        return res.status(401).json({
            message: "Business context is missing."
        });
    }

    const name = String(
        req.body?.name ?? ""
    ).trim();

    const validationError =
        requireValidCustomerName(name);

    if (validationError) {
        return res.status(400).json({
            message: validationError
        });
    }

    const phone = clean(
        req.body?.phone,
        30
    );

    const email =
        clean(req.body?.email, 150)
            ?.toLowerCase() || null;

    const address = clean(
        req.body?.address,
        255
    );

    if (
        email &&
        !/^\S+@\S+\.\S+$/.test(email)
    ) {
        return res.status(400).json({
            message: "Invalid customer email."
        });
    }

    try {
        const result = await pool.query(
            `
            INSERT INTO customers (
                business_id,
                name,
                phone,
                email,
                address
            )
            VALUES ($1, $2, $3, $4, $5)
            RETURNING
                id,
                name,
                phone,
                email,
                address,
                created_at,
                updated_at
            `,
            [
                businessId,
                name,
                phone,
                email,
                address
            ]
        );

        const customer = result.rows[0];

        await logAudit(
            req,
            "customer.created",
            "customer",
            customer.id,
            {
                name: customer.name
            }
        );

        return res.status(201).json({
            message: "Customer created successfully.",
            customer
        });
    } catch (error) {
        console.error(
            "CREATE CUSTOMER ERROR:",
            error
        );

        return res.status(500).json({
            message: "Failed to create customer."
        });
    }
}

/* =========================================================
   UPDATE CUSTOMER
   ========================================================= */

async function updateCustomer(req, res) {
    const businessId = businessIdFrom(req);
    const customerId = customerIdFrom(req);

    if (!businessId) {
        return res.status(401).json({
            message: "Business context is missing."
        });
    }

    if (!customerId) {
        return res.status(400).json({
            message: "Invalid customer ID."
        });
    }

    const name = String(
        req.body?.name ?? ""
    ).trim();

    const validationError =
        requireValidCustomerName(name);

    if (validationError) {
        return res.status(400).json({
            message: validationError
        });
    }

    const phone = clean(
        req.body?.phone,
        30
    );

    const email =
        clean(req.body?.email, 150)
            ?.toLowerCase() || null;

    const address = clean(
        req.body?.address,
        255
    );

    if (
        email &&
        !/^\S+@\S+\.\S+$/.test(email)
    ) {
        return res.status(400).json({
            message: "Invalid customer email."
        });
    }

    try {
        const result = await pool.query(
            `
            UPDATE customers
            SET
                name = $1,
                phone = $2,
                email = $3,
                address = $4,
                updated_at = NOW()
            WHERE id = $5
              AND business_id = $6
            RETURNING
                id,
                name,
                phone,
                email,
                address,
                created_at,
                updated_at
            `,
            [
                name,
                phone,
                email,
                address,
                customerId,
                businessId
            ]
        );

        if (!result.rowCount) {
            return res.status(404).json({
                message: "Customer not found."
            });
        }

        await logAudit(
            req,
            "customer.updated",
            "customer",
            customerId,
            {
                name
            }
        );

        return res.json({
            message: "Customer updated successfully.",
            customer: result.rows[0]
        });
    } catch (error) {
        console.error(
            "UPDATE CUSTOMER ERROR:",
            error
        );

        return res.status(500).json({
            message: "Failed to update customer."
        });
    }
}

/* =========================================================
   DELETE CUSTOMER
   ========================================================= */

async function deleteCustomer(req, res) {
    const businessId = businessIdFrom(req);
    const customerId = customerIdFrom(req);

    if (!businessId) {
        return res.status(401).json({
            message: "Business context is missing."
        });
    }

    if (!customerId) {
        return res.status(400).json({
            message: "Invalid customer ID."
        });
    }

    try {
        const result = await pool.query(
            `
            DELETE FROM customers
            WHERE id = $1
              AND business_id = $2
            RETURNING id, name
            `,
            [
                customerId,
                businessId
            ]
        );

        if (!result.rowCount) {
            return res.status(404).json({
                message: "Customer not found."
            });
        }

        await logAudit(
            req,
            "customer.deleted",
            "customer",
            customerId,
            {
                name: result.rows[0].name
            }
        );

        return res.json({
            message: "Customer deleted successfully.",
            customer: result.rows[0]
        });
    } catch (error) {
        if (error.code === "23503") {
            return res.status(409).json({
                message:
                    "This customer cannot be deleted because they have existing sales or debts."
            });
        }

        console.error(
            "DELETE CUSTOMER ERROR:",
            error
        );

        return res.status(500).json({
            message: "Failed to delete customer."
        });
    }
}

/* =========================================================
   GET CUSTOMER HISTORY
   ========================================================= */

async function getCustomerHistory(req, res) {
    const businessId = businessIdFrom(req);
    const customerId = customerIdFrom(req);

    if (!businessId) {
        return res.status(401).json({
            message: "Business context is missing."
        });
    }

    if (!customerId) {
        return res.status(400).json({
            message: "Invalid customer ID."
        });
    }

    try {
        const customerResult = await pool.query(
            `
            SELECT
                id,
                name,
                phone,
                email,
                address
            FROM customers
            WHERE id = $1
              AND business_id = $2
            LIMIT 1
            `,
            [
                customerId,
                businessId
            ]
        );

        if (!customerResult.rowCount) {
            return res.status(404).json({
                message: "Customer not found."
            });
        }

        const [
            salesResult,
            debtResult,
            summaryResult
        ] = await Promise.all([
            pool.query(
                `
                SELECT
                    s.id,
                    s.receipt_number,
                    s.subtotal,
                    s.discount,
                    s.total_amount,
                    s.payment_method,
                    s.amount_paid,
                    s.change_amount,
                    s.status,
                    s.created_at,
                    COALESCE(
                        SUM(si.quantity),
                        0
                    ) AS total_items,
                    COALESCE(
                        SUM(si.profit_amount),
                        0
                    ) AS profit
                FROM sales s
                LEFT JOIN sale_items si
                    ON si.sale_id = s.id
                   AND si.business_id = s.business_id
                WHERE s.customer_id = $1
                  AND s.business_id = $2
                GROUP BY s.id
                ORDER BY s.created_at DESC
                `,
                [
                    customerId,
                    businessId
                ]
            ),

            pool.query(
                `
                SELECT
                    id,
                    sale_id,
                    total_amount,
                    amount_paid,
                    balance,
                    due_date,
                    status,
                    created_at
                FROM debts
                WHERE customer_id = $1
                  AND business_id = $2
                ORDER BY created_at DESC
                `,
                [
                    customerId,
                    businessId
                ]
            ),

            pool.query(
                `
                SELECT
                    COALESCE(
                        SUM(total_amount),
                        0
                    ) AS total_purchases,
                    COUNT(*) AS total_sales
                FROM sales
                WHERE customer_id = $1
                  AND business_id = $2
                `,
                [
                    customerId,
                    businessId
                ]
            )
        ]);

        return res.json({
            customer: customerResult.rows[0],
            summary: {
                totalPurchases:
                    summaryResult.rows[0]
                        .total_purchases,
                totalSales:
                    Number(
                        summaryResult.rows[0]
                            .total_sales
                    )
            },
            sales: salesResult.rows,
            debts: debtResult.rows
        });
    } catch (error) {
        console.error(
            "CUSTOMER HISTORY ERROR:",
            error
        );

        return res.status(500).json({
            message:
                "Failed to fetch customer history."
        });
    }
}

module.exports = {
    getCustomers,
    getCustomerById,
    getCustomerHistory,
    createCustomer,
    updateCustomer,
    deleteCustomer
};