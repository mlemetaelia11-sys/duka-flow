"use strict";

const { logAudit } = require("../utils/audit");
const pool = require("../db");
const { notifyLowStock } = require("../utils/notifications");

/* =========================================================
   CREATE SALE
   ========================================================= */

async function createSale(req, res) {
    const client = await pool.connect();
    let transactionStarted = false;

    try {
        const idempotencyKey = String(
            req.get("X-Idempotency-Key") || ""
        ).trim();

        if (
            idempotencyKey &&
            !/^[A-Za-z0-9._:-]{16,120}$/.test(idempotencyKey)
        ) {
            return res.status(400).json({
                message: "Invalid idempotency key."
            });
        }

        const {
            items,
            discount = 0,
            paymentMethod = "cash",
            amountPaid = 0,
            customerId = null,
            dueDate = null,
            paymentReference = null,
            mobileMoneyProvider = null
        } = req.body;

        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                message: "Sale must contain at least one product."
            });
        }

        const allowedPaymentMethods = [
            "cash",
            "mobile_money",
            "bank",
            "credit"
        ];

        if (!allowedPaymentMethods.includes(paymentMethod)) {
            return res.status(400).json({
                message: "Invalid payment method."
            });
        }

        if (paymentMethod === "credit") {
            if (!customerId) {
                return res.status(400).json({
                    message: "Customer is required for credit sales."
                });
            }

            const customerResult = await client.query(
                `
                SELECT id, name
                FROM customers
                WHERE id = $1
                  AND business_id = $2
                `,
                [Number(customerId), req.businessId]
            );

            if (customerResult.rows.length === 0) {
                return res.status(400).json({
                    message: "Customer not found."
                });
            }
        }

        const discountAmount = Number(discount);
        let paidAmount = Number(amountPaid);

        if (
            !Number.isFinite(discountAmount) ||
            discountAmount < 0
        ) {
            return res.status(400).json({
                message: "Invalid discount."
            });
        }

        if (
            !Number.isFinite(paidAmount) ||
            paidAmount < 0
        ) {
            return res.status(400).json({
                message: "Invalid amount paid."
            });
        }

        /* =================================================
           START TRANSACTION
           ================================================= */

        await client.query("BEGIN");
        transactionStarted = true;

        if (idempotencyKey) {
            const claim = await client.query(
                `
                INSERT INTO api_idempotency_keys (
                    business_id,
                    user_id,
                    idempotency_key,
                    route
                )
                VALUES ($1, $2, $3, '/api/sales')
                ON CONFLICT (
                    business_id,
                    idempotency_key,
                    route
                )
                DO NOTHING
                RETURNING id
                `,
                [
                    req.businessId,
                    req.user.id,
                    idempotencyKey
                ]
            );

            if (!claim.rowCount) {
                const existing = await client.query(
                    `
                    SELECT
                        status_code,
                        response_body
                    FROM api_idempotency_keys
                    WHERE business_id = $1
                      AND idempotency_key = $2
                      AND route = '/api/sales'
                    FOR UPDATE
                    `,
                    [
                        req.businessId,
                        idempotencyKey
                    ]
                );

                if (
                    existing.rowCount &&
                    existing.rows[0].status_code
                ) {
                    const cached = existing.rows[0];

                    await client.query("COMMIT");
                    transactionStarted = false;

                    return res
                        .status(Number(cached.status_code))
                        .json(cached.response_body);
                }

                throw new Error(
                    "A sale with this request key is already being processed. Please retry shortly."
                );
            }
        }

        /* =================================================
           GENERATE RECEIPT NUMBER
           ================================================= */

        const receiptResult = await client.query(
            `
            SELECT
                'DF-' ||
                TO_CHAR(NOW(), 'YYYYMMDD') ||
                '-' ||
                LPAD(
                    nextval('sales_receipt_seq')::text,
                    6,
                    '0'
                ) AS receipt_number
            `
        );

        const receiptNumber =
            receiptResult.rows[0].receipt_number;

        /* =================================================
           PREPARE SALE ITEMS
           ================================================= */

        const preparedItems = [];
        const lowStockProducts = [];

        let subtotal = 0;

        for (const item of items) {
            const productId = Number(item.productId);
            const quantity = Number(item.quantity);

            if (
                !Number.isInteger(productId) ||
                productId <= 0
            ) {
                throw new Error("Invalid product ID.");
            }

            if (
                !Number.isInteger(quantity) ||
                quantity <= 0
            ) {
                throw new Error(
                    "Quantity must be a positive whole number."
                );
            }

            /*
             * Lock product row while sale is being processed.
             */
            const productResult = await client.query(
                `
                SELECT
                    id,
                    name,
                    buying_price,
                    selling_price,
                    stock_quantity
                FROM products
                WHERE id = $1
                  AND business_id = $2
                FOR UPDATE
                `,
                [
                    productId,
                    req.businessId
                ]
            );

            if (productResult.rows.length === 0) {
                throw new Error(
                    `Product ${productId} not found.`
                );
            }

            const product = productResult.rows[0];

            const stock = Number(
                product.stock_quantity
            );

            if (stock < quantity) {
                throw new Error(
                    `Not enough stock for "${product.name}". Available stock: ${stock}.`
                );
            }

            const buyingPrice = Number(
                product.buying_price
            );

            const sellingPrice = Number(
                product.selling_price
            );

            const lineTotal =
                Math.round(
                    sellingPrice *
                        quantity *
                        100
                ) / 100;

            const profitAmount =
                Math.round(
                    (
                        sellingPrice -
                        buyingPrice
                    ) *
                        quantity *
                        100
                ) / 100;

            subtotal =
                Math.round(
                    (
                        subtotal +
                        lineTotal
                    ) *
                        100
                ) / 100;

            preparedItems.push({
                productId: product.id,
                productName: product.name,
                quantity,
                buyingPrice,
                sellingPrice,
                lineTotal,
                profitAmount
            });
        }

        /* =================================================
           DISCOUNT
           ================================================= */

        if (discountAmount > subtotal) {
            throw new Error(
                "Discount cannot be greater than subtotal."
            );
        }

        const totalAmount =
            Math.round(
                (
                    subtotal -
                    discountAmount
                ) *
                    100
            ) / 100;

        /* =================================================
           PAYMENT
           ================================================= */

        let changeAmount = 0;
        let status = "paid";

        if (paymentMethod === "credit") {
            if (paidAmount > totalAmount) {
                paidAmount = totalAmount;
            }

            if (paidAmount === totalAmount) {
                status = "paid";
            } else if (paidAmount > 0) {
                status = "partial";
            } else {
                status = "credit";
            }

            changeAmount = 0;
        } else {
            if (paidAmount < totalAmount) {
                throw new Error(
                    "Amount paid is less than total amount."
                );
            }

            changeAmount =
                Math.round(
                    (
                        paidAmount -
                        totalAmount
                    ) *
                        100
                ) / 100;

            status = "paid";
        }

        /* =================================================
           INSERT SALE
           ================================================= */

        const saleResult = await client.query(
            `
            INSERT INTO sales (
                receipt_number,
                business_id,
                customer_id,
                payment_reference,
                mobile_money_provider,
                created_by,
                subtotal,
                discount,
                total_amount,
                payment_method,
                amount_paid,
                change_amount,
                status
            )
            VALUES (
                $1,
                $2,
                $3,
                $4,
                $5,
                $6,
                $7,
                $8,
                $9,
                $10,
                $11,
                $12,
                $13
            )
            RETURNING
                id,
                receipt_number,
                customer_id,
                payment_reference,
                mobile_money_provider,
                created_by,
                subtotal,
                discount,
                total_amount,
                payment_method,
                amount_paid,
                change_amount,
                status,
                created_at
            `,
            [
                receiptNumber,
                req.businessId,
                paymentMethod === "credit"
                    ? Number(customerId)
                    : null,
                paymentReference
                    ? String(paymentReference)
                          .trim()
                          .slice(0, 100) || null
                    : null,
                mobileMoneyProvider
                    ? String(mobileMoneyProvider)
                          .trim()
                          .slice(0, 50) || null
                    : null,
                req.user.id,
                subtotal,
                discountAmount,
                totalAmount,
                paymentMethod,
                paidAmount,
                changeAmount,
                status
            ]
        );

        const sale = saleResult.rows[0];

        /* =================================================
           CREDIT / DEBT
           ================================================= */

        if (paymentMethod === "credit") {
            const balance =
                Math.round(
                    (
                        totalAmount -
                        paidAmount
                    ) *
                        100
                ) / 100;

            let debtStatus = "unpaid";

            if (balance === 0) {
                debtStatus = "paid";
            } else if (paidAmount > 0) {
                debtStatus = "partial";
            }

            await client.query(
                `
                INSERT INTO debts (
                    business_id,
                    sale_id,
                    customer_id,
                    total_amount,
                    amount_paid,
                    balance,
                    due_date,
                    status
                )
                VALUES (
                    $1,
                    $2,
                    $3,
                    $4,
                    $5,
                    $6,
                    $7,
                    $8
                )
                `,
                [
                    req.businessId,
                    sale.id,
                    Number(customerId),
                    totalAmount,
                    paidAmount,
                    balance,
                    dueDate || null,
                    debtStatus
                ]
            );
        }

        /* =================================================
           INSERT ITEMS + REDUCE STOCK
           ================================================= */

        for (const item of preparedItems) {
            await client.query(
                `
                INSERT INTO sale_items (
                    business_id,
                    sale_id,
                    product_id,
                    product_name,
                    quantity,
                    unit_price,
                    buying_price,
                    line_total,
                    profit_amount
                )
                VALUES (
                    $1,
                    $2,
                    $3,
                    $4,
                    $5,
                    $6,
                    $7,
                    $8,
                    $9
                )
                `,
                [
                    req.businessId,
                    sale.id,
                    item.productId,
                    item.productName,
                    item.quantity,
                    item.sellingPrice,
                    item.buyingPrice,
                    item.lineTotal,
                    item.profitAmount
                ]
            );

            const stockUpdate = await client.query(
                `
                UPDATE products
                SET
                    stock_quantity =
                        stock_quantity - $1,
                    updated_at = NOW()
                WHERE id = $2
                  AND business_id = $3
                  AND stock_quantity >= $1
                RETURNING
                    id,
                    name,
                    stock_quantity,
                    low_stock_threshold
                `,
                [
                    item.quantity,
                    item.productId,
                    req.businessId
                ]
            );

            if (!stockUpdate.rowCount) {
                throw new Error(
                    `Not enough stock for "${item.productName}".`
                );
            }

            const updatedProduct =
                stockUpdate.rows[0];

            lowStockProducts.push(
                updatedProduct
            );

            await client.query(
                `
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
                VALUES (
                    $1,
                    $2,
                    'sale',
                    $3,
                    'sale',
                    $4,
                    $5,
                    $6
                )
                `,
                [
                    req.businessId,
                    item.productId,
                    -item.quantity,
                    sale.id,
                    `Sale ${receiptNumber}`,
                    req.user.id
                ]
            );
        }

        /* =================================================
           CASH REGISTER
           ================================================= */

        if (
            paymentMethod === "cash" &&
            paidAmount > 0
        ) {
            const registerResult =
                await client.query(
                    `
                    SELECT id
                    FROM cash_registers
                    WHERE business_id = $1
                      AND status = 'open'
                    LIMIT 1
                    FOR UPDATE
                    `,
                    [req.businessId]
                );

            if (registerResult.rowCount) {
                await client.query(
                    `
                    INSERT INTO cash_movements (
                        business_id,
                        register_id,
                        movement_type,
                        amount,
                        direction,
                        reference_type,
                        reference_id,
                        note,
                        created_by
                    )
                    VALUES (
                        $1,
                        $2,
                        'sale',
                        $3,
                        'in',
                        'sale',
                        $4,
                        $5,
                        $6
                    )
                    `,
                    [
                        req.businessId,
                        registerResult.rows[0].id,
                        totalAmount,
                        sale.id,
                        `Sale ${receiptNumber}`,
                        req.user.id
                    ]
                );
            }
        }

        /* =================================================
           COMMIT
           ================================================= */

        const responsePayload = {
            message: "Sale completed successfully.",
            sale
        };

        if (idempotencyKey) {
            await client.query(
                `
                UPDATE api_idempotency_keys
                SET
                    status_code = 201,
                    response_body = $1,
                    expires_at =
                        NOW() + INTERVAL '24 hours'
                WHERE business_id = $2
                  AND idempotency_key = $3
                  AND route = '/api/sales'
                `,
                [
                    JSON.stringify(responsePayload),
                    req.businessId,
                    idempotencyKey
                ]
            );
        }

        await client.query("COMMIT");
        transactionStarted = false;

        for (const lowStockProduct of lowStockProducts) {
            await notifyLowStock(
                req.businessId,
                lowStockProduct,
                req.user.id
            );
        }

        await logAudit(
            req,
            "sale.created",
            "sale",
            sale.id,
            {
                receiptNumber,
                totalAmount,
                paymentMethod
            }
        );

        return res.status(201).json(
            responsePayload
        );
    } catch (error) {
        if (transactionStarted) {
            try {
                await client.query("ROLLBACK");
            } catch {}
        }

        console.error(
            "CREATE SALE ERROR:",
            error
        );

        const status =
            error.status ||
            (
                String(error.message || "")
                    .includes(
                        "already being processed"
                    )
                    ? 409
                    : 400
            );

        return res.status(status).json({
            message:
                error.message ||
                "Failed to complete sale."
        });
    } finally {
        client.release();
    }
}

/* =========================================================
   GET SALES
   ========================================================= */

async function getSales(req, res) {
    try {
        const search = String(
            req.query?.search || ""
        ).trim();

        const paymentMethod = String(
            req.query?.paymentMethod || ""
        ).trim();

        const status = String(
            req.query?.status || ""
        ).trim();

        const page = Math.max(
            1,
            Number(req.query?.page) || 1
        );

        const limit = Math.min(
            100,
            Math.max(
                10,
                Number(req.query?.limit) || 25
            )
        );

        const offset = (page - 1) * limit;

        const values = [req.businessId];
        const filters = [
            "s.business_id = $1"
        ];

        if (search) {
            values.push(`%${search}%`);

            filters.push(`
                (
                    s.receipt_number ILIKE $${values.length}
                    OR COALESCE(c.name, '') ILIKE $${values.length}
                    OR COALESCE(c.phone, '') ILIKE $${values.length}
                )
            `);
        }

        if (paymentMethod) {
            values.push(paymentMethod);

            filters.push(
                `s.payment_method = $${values.length}`
            );
        }

        if (status) {
            values.push(status);

            filters.push(
                `s.status = $${values.length}`
            );
        }

        const whereClause =
            filters.join(" AND ");

        const countResult = await pool.query(
            `
            SELECT COUNT(*)::int AS total
            FROM sales s
            LEFT JOIN customers c
                ON c.id = s.customer_id
               AND c.business_id = s.business_id
            WHERE ${whereClause}
            `,
            values
        );

        values.push(limit);
        values.push(offset);

        const result = await pool.query(
            `
            SELECT
                s.id,
                s.receipt_number,
                s.customer_id,
                COALESCE(
                    c.name,
                    'Walk-in customer'
                ) AS customer_name,
                COALESCE(
                    c.phone,
                    ''
                ) AS customer_phone,
                s.created_by,
                COALESCE(
                    u.name,
                    'System'
                ) AS staff_name,
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
            LEFT JOIN customers c
                ON c.id = s.customer_id
               AND c.business_id = s.business_id
            LEFT JOIN users u
                ON u.id = s.created_by
               AND u.business_id = s.business_id
            LEFT JOIN sale_items si
                ON si.sale_id = s.id
               AND si.business_id = s.business_id
            WHERE ${whereClause}
            GROUP BY
                s.id,
                c.name,
                c.phone,
                u.name
            ORDER BY s.created_at DESC
            LIMIT $${values.length - 1}
            OFFSET $${values.length}
            `,
            values
        );

        const total = Number(
            countResult.rows[0]?.total || 0
        );

        return res.json({
            sales: result.rows,
            pagination: {
                page,
                limit,
                total,
                pages: Math.max(
                    1,
                    Math.ceil(total / limit)
                )
            }
        });
    } catch (error) {
        console.error(
            "GET SALES ERROR:",
            error
        );

        return res.status(500).json({
            message: "Failed to fetch sales."
        });
    }
}

/* =========================================================
   GET ONE SALE
   ========================================================= */

async function getSaleById(req, res) {
    try {
        const saleId =
            Number(req.params.id);

        if (
            !Number.isInteger(saleId) ||
            saleId <= 0
        ) {
            return res.status(400).json({
                message: "Invalid sale ID."
            });
        }

        const saleResult =
            await pool.query(
                `
                SELECT
                    id,
                    receipt_number,
                    payment_reference,
                    mobile_money_provider,
                    created_by,
                    subtotal,
                    discount,
                    total_amount,
                    payment_method,
                    amount_paid,
                    change_amount,
                    status,
                    created_at
                FROM sales
                WHERE id = $1
                  AND business_id = $2
                `,
                [
                    saleId,
                    req.businessId
                ]
            );

        if (saleResult.rows.length === 0) {
            return res.status(404).json({
                message: "Sale not found."
            });
        }

        const itemsResult =
            await pool.query(
                `
                SELECT
                    id,
                    product_id,
                    product_name,
                    quantity,
                    unit_price,
                    buying_price,
                    line_total,
                    profit_amount
                FROM sale_items
                WHERE sale_id = $1
                  AND business_id = $2
                ORDER BY id
                `,
                [
                    saleId,
                    req.businessId
                ]
            );

        return res.json({
            sale: saleResult.rows[0],
            items: itemsResult.rows
        });
    } catch (error) {
        console.error(
            "GET SALE ERROR:",
            error
        );

        return res.status(500).json({
            message: "Failed to fetch sale."
        });
    }
}

/* =========================================================
   EXPORT
   ========================================================= */

module.exports = {
    createSale,
    getSales,
    getSaleById
};