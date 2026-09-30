"use strict";

const pool = require("../db");

function businessIdFrom(req) {
    const value = Number(
        req.businessId ||
        req.user?.businessId ||
        req.user?.business_id
    );
    return Number.isInteger(value) && value > 0 ? value : null;
}

function pctChange(current, previous) {
    const c = Number(current || 0);
    const p = Number(previous || 0);
    if (p === 0) return c > 0 ? 100 : 0;
    return ((c - p) / Math.abs(p)) * 100;
}

async function getDashboardSummary(req, res) {
    const businessId = businessIdFrom(req);
    if (!businessId) {
        return res.status(401).json({
            message: "Business context is missing."
        });
    }

    try {
        const [
            salesResult,
            profitResult,
            yesterdayResult,
            debtResult,
            inventoryResult,
            customerResult,
            lowStockResult,
            recentSalesResult,
            recentPaymentsResult,
            paymentMethodsResult,
            topProductsResult,
            expensesResult
        ] = await Promise.all([
            pool.query(`
                SELECT
                    COALESCE((
                        SELECT SUM(total_amount)
                        FROM sales
                        WHERE business_id = $1
                          AND created_at >= CURRENT_DATE
                          AND created_at < CURRENT_DATE + INTERVAL '1 day'
                    ), 0)
                    -
                    COALESCE((
                        SELECT SUM(total_amount)
                        FROM sale_returns
                        WHERE business_id = $1
                          AND status = 'completed'
                          AND created_at >= CURRENT_DATE
                          AND created_at < CURRENT_DATE + INTERVAL '1 day'
                    ), 0) AS today_sales,
                    (
                        SELECT COUNT(*)
                        FROM sales
                        WHERE business_id = $1
                          AND created_at >= CURRENT_DATE
                          AND created_at < CURRENT_DATE + INTERVAL '1 day'
                    ) AS sales_count
            `, [businessId]),

            pool.query(`
                SELECT
                    COALESCE((
                        SELECT SUM(si.profit_amount)
                        FROM sale_items si
                        INNER JOIN sales s
                            ON s.id = si.sale_id
                           AND s.business_id = si.business_id
                        WHERE si.business_id = $1
                          AND s.created_at >= CURRENT_DATE
                          AND s.created_at < CURRENT_DATE + INTERVAL '1 day'
                    ), 0)
                    -
                    COALESCE((
                        SELECT SUM((sri.unit_price - si.buying_price) * sri.quantity)
                        FROM sale_return_items sri
                        INNER JOIN sale_returns sr
                            ON sr.id = sri.return_id
                           AND sr.business_id = sri.business_id
                           AND sr.status = 'completed'
                        INNER JOIN sale_items si
                            ON si.id = sri.sale_item_id
                           AND si.business_id = sri.business_id
                        WHERE sri.business_id = $1
                          AND sr.created_at >= CURRENT_DATE
                          AND sr.created_at < CURRENT_DATE + INTERVAL '1 day'
                    ), 0)
                    - COALESCE((
                        SELECT SUM(amount) FROM expenses
                        WHERE business_id = $1 AND expense_date = CURRENT_DATE
                    ), 0) AS today_profit
            `, [businessId]),

            pool.query(`
                SELECT
                    COALESCE((
                        SELECT SUM(total_amount)
                        FROM sales
                        WHERE business_id = $1
                          AND created_at >= CURRENT_DATE - INTERVAL '1 day'
                          AND created_at < CURRENT_DATE
                    ), 0)
                    -
                    COALESCE((
                        SELECT SUM(total_amount)
                        FROM sale_returns
                        WHERE business_id = $1
                          AND status = 'completed'
                          AND created_at >= CURRENT_DATE - INTERVAL '1 day'
                          AND created_at < CURRENT_DATE
                    ), 0) AS yesterday_sales,

                    COALESCE((
                        SELECT SUM(si.profit_amount)
                        FROM sale_items si
                        INNER JOIN sales s
                            ON s.id = si.sale_id
                           AND s.business_id = si.business_id
                        WHERE si.business_id = $1
                          AND s.created_at >= CURRENT_DATE - INTERVAL '1 day'
                          AND s.created_at < CURRENT_DATE
                    ), 0)
                    -
                    COALESCE((
                        SELECT SUM((sri.unit_price - si.buying_price) * sri.quantity)
                        FROM sale_return_items sri
                        INNER JOIN sale_returns sr
                            ON sr.id = sri.return_id
                           AND sr.business_id = sri.business_id
                           AND sr.status = 'completed'
                        INNER JOIN sale_items si
                            ON si.id = sri.sale_item_id
                           AND si.business_id = sri.business_id
                        WHERE sri.business_id = $1
                          AND sr.created_at >= CURRENT_DATE - INTERVAL '1 day'
                          AND sr.created_at < CURRENT_DATE
                    ), 0)
                    - COALESCE((
                        SELECT SUM(amount) FROM expenses
                        WHERE business_id = $1 AND expense_date = CURRENT_DATE - INTERVAL '1 day'
                    ), 0) AS yesterday_profit,

                    (
                        SELECT COUNT(*)
                        FROM sales
                        WHERE business_id = $1
                          AND created_at >= CURRENT_DATE - INTERVAL '1 day'
                          AND created_at < CURRENT_DATE
                    ) AS yesterday_sales_count
            `, [businessId]),

            pool.query(`
                SELECT
                    COALESCE(SUM(balance), 0) AS outstanding_debt,
                    COUNT(*) FILTER (WHERE balance > 0) AS debt_count
                FROM debts
                WHERE business_id = $1
            `, [businessId]),

            pool.query(`
                SELECT
                    COUNT(*) AS total_products,
                    COALESCE(SUM(stock_quantity), 0) AS total_stock,
                    COALESCE(SUM(buying_price * stock_quantity), 0) AS inventory_value,
                    COUNT(*) FILTER (
                        WHERE stock_quantity <= low_stock_threshold
                    ) AS low_stock_count
                FROM products
                WHERE business_id = $1
            `, [businessId]),

            pool.query(`
                SELECT COUNT(*) AS total_customers
                FROM customers
                WHERE business_id = $1
            `, [businessId]),

            pool.query(`
                SELECT
                    id,
                    name,
                    sku,
                    stock_quantity,
                    low_stock_threshold,
                    selling_price,
                    image_key,
                    image_url
                FROM products
                WHERE business_id = $1
                  AND stock_quantity <= low_stock_threshold
                ORDER BY stock_quantity ASC, name ASC
                LIMIT 6
            `, [businessId]),

            pool.query(`
                SELECT
                    id,
                    receipt_number,
                    total_amount,
                    payment_method,
                    status,
                    created_at
                FROM sales
                WHERE business_id = $1
                ORDER BY created_at DESC
                LIMIT 8
            `, [businessId]),

            pool.query(`
                SELECT
                    dp.id,
                    dp.amount,
                    dp.payment_method,
                    dp.paid_at,
                    c.name AS customer_name
                FROM debt_payments dp
                INNER JOIN debts d
                    ON d.id = dp.debt_id
                   AND d.business_id = dp.business_id
                INNER JOIN customers c
                    ON c.id = d.customer_id
                   AND c.business_id = dp.business_id
                WHERE dp.business_id = $1
                ORDER BY dp.paid_at DESC
                LIMIT 5
            `, [businessId]),

            pool.query(`
                SELECT
                    payment_method,
                    COUNT(*) AS transaction_count,
                    COALESCE(SUM(total_amount), 0) AS amount
                FROM sales
                WHERE business_id = $1
                  AND created_at >= CURRENT_DATE
                  AND created_at < CURRENT_DATE + INTERVAL '1 day'
                GROUP BY payment_method
                ORDER BY amount DESC
            `, [businessId]),

            pool.query(`
                WITH sold AS (
                    SELECT
                        si.product_id,
                        si.product_name,
                        MAX(p.image_url) AS image_url,
                        SUM(si.quantity) AS quantity_sold,
                        SUM(si.line_total) AS revenue,
                        SUM(si.profit_amount) AS profit
                    FROM sale_items si
                    INNER JOIN products p ON p.id=si.product_id AND p.business_id=si.business_id
                    INNER JOIN sales s
                        ON s.id = si.sale_id
                       AND s.business_id = si.business_id
                    WHERE si.business_id = $1
                      AND s.created_at >= CURRENT_DATE - INTERVAL '6 days'
                      AND s.created_at < CURRENT_DATE + INTERVAL '1 day'
                    GROUP BY si.product_id, si.product_name
                )
                SELECT
                    product_id,
                    product_name,
                    image_url,
                    quantity_sold,
                    revenue,
                    profit
                FROM sold
                ORDER BY quantity_sold DESC, revenue DESC
                LIMIT 5
            `, [businessId]),

            pool.query(`
                SELECT
                    COALESCE(SUM(amount), 0) AS amount,
                    COUNT(*) AS count
                FROM expenses
                WHERE business_id = $1
                  AND expense_date >= CURRENT_DATE - INTERVAL '6 days'
                  AND expense_date < CURRENT_DATE + INTERVAL '1 day'
            `, [businessId])
        ]);

        const summaryRow = salesResult.rows[0] || {};
        const profitRow = profitResult.rows[0] || {};
        const yesterdayRow = yesterdayResult.rows[0] || {};
        const inventoryRow = inventoryResult.rows[0] || {};
        const debtRow = debtResult.rows[0] || {};

        const todaySales = Number(summaryRow.today_sales || 0);
        const todayProfit = Number(profitRow.today_profit || 0);
        const yesterdaySales = Number(yesterdayRow.yesterday_sales || 0);
        const yesterdayProfit = Number(yesterdayRow.yesterday_profit || 0);
        const salesCount = Number(summaryRow.sales_count || 0);
        const yesterdaySalesCount = Number(yesterdayRow.yesterday_sales_count || 0);

        const recentTransactions = [
            ...recentSalesResult.rows.map((sale) => ({
                type: "sale",
                description: `Receipt #${sale.receipt_number || sale.id}`,
                amount: Number(sale.total_amount || 0),
                paymentMethod: sale.payment_method || "other",
                status: sale.status || "completed",
                createdAt: sale.created_at
            })),
            ...recentPaymentsResult.rows.map((payment) => ({
                type: "payment",
                description: `Customer: ${payment.customer_name || "Customer"}`,
                amount: Number(payment.amount || 0),
                paymentMethod: payment.payment_method || "other",
                status: "paid",
                createdAt: payment.paid_at
            }))
        ]
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, 10);

        return res.json({
            summary: {
                todaySales,
                todayProfit,
                salesCount,
                outstandingDebt: Number(debtRow.outstanding_debt || 0),
                debtCount: Number(debtRow.debt_count || 0),
                totalProducts: Number(inventoryRow.total_products || 0),
                totalStock: Number(inventoryRow.total_stock || 0),
                inventoryValue: Number(inventoryRow.inventory_value || 0),
                lowStockCount: Number(inventoryRow.low_stock_count || 0),
                totalCustomers: Number(customerResult.rows[0]?.total_customers || 0),
                trends: {
                    sales: pctChange(todaySales, yesterdaySales),
                    profit: pctChange(todayProfit, yesterdayProfit),
                    salesCount: pctChange(salesCount, yesterdaySalesCount)
                }
            },
            lowStock: lowStockResult.rows,
            recentTransactions,
            paymentMethodsToday: paymentMethodsResult.rows,
            topProducts7d: topProductsResult.rows,
            expenses7d: {
                amount: Number(expensesResult.rows[0]?.amount || 0),
                count: Number(expensesResult.rows[0]?.count || 0)
            }
        });
    } catch (error) {
        console.error("DASHBOARD SUMMARY ERROR:", error);
        return res.status(500).json({
            message: "Failed to load dashboard data."
        });
    }
}

async function getSalesOverview(req, res) {
    const businessId = businessIdFrom(req);
    if (!businessId) {
        return res.status(401).json({
            message: "Business context is missing."
        });
    }

    const requestedDays = Number(req.query.days);
    const days = [7, 30, 90].includes(requestedDays) ? requestedDays : 7;

    try {
        const result = await pool.query(`
            WITH date_series AS (
                SELECT generate_series(
                    CURRENT_DATE - (($2 - 1) * INTERVAL '1 day'),
                    CURRENT_DATE,
                    INTERVAL '1 day'
                )::date AS sale_date
            ),
            daily_sales AS (
                SELECT
                    created_at::date AS sale_date,
                    SUM(total_amount) AS sales,
                    COUNT(*) AS transaction_count
                FROM sales
                WHERE business_id = $1
                  AND created_at >= CURRENT_DATE - (($2 - 1) * INTERVAL '1 day')
                  AND created_at < CURRENT_DATE + INTERVAL '1 day'
                GROUP BY created_at::date
            ),
            daily_returns AS (
                SELECT
                    created_at::date AS sale_date,
                    SUM(total_amount) AS returns
                FROM sale_returns
                WHERE business_id = $1
                  AND status = 'completed'
                  AND created_at >= CURRENT_DATE - (($2 - 1) * INTERVAL '1 day')
                  AND created_at < CURRENT_DATE + INTERVAL '1 day'
                GROUP BY created_at::date
            ),
            daily_profit AS (
                SELECT
                    s.created_at::date AS sale_date,
                    SUM(si.profit_amount) AS profit
                FROM sales s
                INNER JOIN sale_items si
                    ON si.sale_id = s.id
                   AND si.business_id = s.business_id
                WHERE s.business_id = $1
                  AND s.created_at >= CURRENT_DATE - (($2 - 1) * INTERVAL '1 day')
                  AND s.created_at < CURRENT_DATE + INTERVAL '1 day'
                GROUP BY s.created_at::date
            ),
            daily_return_profit AS (
                SELECT
                    sr.created_at::date AS sale_date,
                    SUM((si.unit_price - si.buying_price) * sri.quantity) AS return_profit
                FROM sale_returns sr
                INNER JOIN sale_return_items sri
                    ON sri.return_id = sr.id
                   AND sri.business_id = sr.business_id
                INNER JOIN sale_items si
                    ON si.id = sri.sale_item_id
                   AND si.business_id = sri.business_id
                WHERE sr.business_id = $1
                  AND sr.status = 'completed'
                  AND sr.created_at >= CURRENT_DATE - (($2 - 1) * INTERVAL '1 day')
                  AND sr.created_at < CURRENT_DATE + INTERVAL '1 day'
                GROUP BY sr.created_at::date
            )
            SELECT
                d.sale_date,
                GREATEST(
                    COALESCE(ds.sales, 0) - COALESCE(dr.returns, 0),
                    0
                ) AS sales,
                GREATEST(
                    COALESCE(dp.profit, 0) - COALESCE(drp.return_profit, 0),
                    0
                ) AS profit,
                COALESCE(ds.transaction_count, 0) AS transaction_count
            FROM date_series d
            LEFT JOIN daily_sales ds ON ds.sale_date = d.sale_date
            LEFT JOIN daily_returns dr ON dr.sale_date = d.sale_date
            LEFT JOIN daily_profit dp ON dp.sale_date = d.sale_date
            LEFT JOIN daily_return_profit drp ON drp.sale_date = d.sale_date
            ORDER BY d.sale_date ASC
        `, [businessId, days]);

        return res.json({
            days,
            overview: result.rows
        });
    } catch (error) {
        console.error("SALES OVERVIEW ERROR:", error);
        return res.status(500).json({
            message: "Failed to load sales overview."
        });
    }
}

module.exports = {
    getDashboardSummary,
    getSalesOverview
};
