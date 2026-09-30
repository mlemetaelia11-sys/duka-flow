"use strict";

const pool = require("../db");

function businessIdFrom(req) {
    const value = Number(req.businessId || req.user?.businessId || req.user?.business_id);
    return Number.isInteger(value) && value > 0 ? value : null;
}

function validDate(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function localDateForTimezone(date, timeZone) {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).formatToParts(date);

    const values = Object.fromEntries(
        parts
            .filter((part) => part.type !== "literal")
            .map((part) => [part.type, part.value])
    );

    return `${values.year}-${values.month}-${values.day}`;
}

function shiftDate(dateString, days) {
    const date = new Date(`${dateString}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}

async function getDateRange(req, businessId) {
    const requestedStart = String(req.query.startDate || "").trim();
    const requestedEnd = String(req.query.endDate || "").trim();

    let defaultEnd = null;

    if (!requestedStart || !requestedEnd) {
        // Expenses default to PostgreSQL CURRENT_DATE on insert, so the default
        // report period must use the same database date to avoid a midnight
        // timezone mismatch between the expense list and the report summary.
        const dateResult = await pool.query(
            `SELECT CURRENT_DATE::text AS today FROM businesses WHERE id = $1 LIMIT 1`,
            [businessId]
        );
        defaultEnd = String(dateResult.rows[0]?.today || "").trim();

        if (!defaultEnd) {
            const fallback = await pool.query(`SELECT CURRENT_DATE::text AS today`);
            defaultEnd = String(fallback.rows[0]?.today || "").trim();
        }
    }

    const endDate = requestedEnd || defaultEnd;
    const startDate = requestedStart || shiftDate(endDate, -29);

    if (!validDate(startDate) || !validDate(endDate)) {
        throw new Error("Dates must use YYYY-MM-DD format.");
    }

    if (startDate > endDate) {
        throw new Error("Start date cannot be after end date.");
    }

    return { startDate, endDate };
}

async function getReportSummary(req, res) {
    const businessId = businessIdFrom(req);

    if (!businessId) {
        return res.status(401).json({ message: "Business context is missing." });
    }

    try {
        const { startDate, endDate } = await getDateRange(req, businessId);

        const summaryResult = await pool.query(`
            SELECT
                COALESCE((
                    SELECT SUM(total_amount)
                    FROM sales
                    WHERE business_id = $1
                      AND created_at >= $2::date
                      AND created_at < ($3::date + INTERVAL '1 day')
                ), 0) AS gross_revenue,
                COALESCE((
                    SELECT SUM(total_amount)
                    FROM sale_returns
                    WHERE business_id = $1
                      AND status = 'completed'
                      AND created_at >= $2::date
                      AND created_at < ($3::date + INTERVAL '1 day')
                ), 0) AS returns_value,
                COALESCE((
                    SELECT SUM(discount)
                    FROM sales
                    WHERE business_id = $1
                      AND created_at >= $2::date
                      AND created_at < ($3::date + INTERVAL '1 day')
                ), 0) AS discount,
                (
                    SELECT COUNT(*)
                    FROM sales
                    WHERE business_id = $1
                      AND created_at >= $2::date
                      AND created_at < ($3::date + INTERVAL '1 day')
                ) AS sales_count,
                (
                    SELECT COUNT(*)
                    FROM sale_returns
                    WHERE business_id = $1
                      AND status = 'completed'
                      AND created_at >= $2::date
                      AND created_at < ($3::date + INTERVAL '1 day')
                ) AS returns_count
        `, [businessId, startDate, endDate]);

        const profitResult = await pool.query(`
            SELECT
                COALESCE((
                    SELECT SUM(si.profit_amount)
                    FROM sale_items si
                    INNER JOIN sales s
                        ON s.id = si.sale_id
                       AND s.business_id = si.business_id
                    WHERE si.business_id = $1
                      AND s.created_at >= $2::date
                      AND s.created_at < ($3::date + INTERVAL '1 day')
                ), 0) AS gross_profit,
                COALESCE((
                    SELECT SUM((si.unit_price - si.buying_price) * sri.quantity)
                    FROM sale_return_items sri
                    INNER JOIN sale_returns sr
                        ON sr.id = sri.return_id
                       AND sr.business_id = sri.business_id
                       AND sr.status = 'completed'
                    INNER JOIN sale_items si
                        ON si.id = sri.sale_item_id
                       AND si.business_id = sri.business_id
                    WHERE sri.business_id = $1
                      AND sr.created_at >= $2::date
                      AND sr.created_at < ($3::date + INTERVAL '1 day')
                ), 0) AS return_profit,
                COALESCE((
                    SELECT SUM(si.quantity)
                    FROM sale_items si
                    INNER JOIN sales s
                        ON s.id = si.sale_id
                       AND s.business_id = si.business_id
                    WHERE si.business_id = $1
                      AND s.created_at >= $2::date
                      AND s.created_at < ($3::date + INTERVAL '1 day')
                ), 0) AS gross_items_sold,
                COALESCE((
                    SELECT SUM(sri.quantity)
                    FROM sale_return_items sri
                    INNER JOIN sale_returns sr
                        ON sr.id = sri.return_id
                       AND sr.business_id = sri.business_id
                       AND sr.status = 'completed'
                    WHERE sri.business_id = $1
                      AND sr.created_at >= $2::date
                      AND sr.created_at < ($3::date + INTERVAL '1 day')
                ), 0) AS returned_items,
                COALESCE((
                    SELECT SUM(amount) FROM expenses
                    WHERE business_id = $1
                      AND expense_date >= $2::date
                      AND expense_date <= $3::date
                ), 0) AS expenses_total
        `, [businessId, startDate, endDate]);

        const paymentResult = await pool.query(`
            SELECT
                payment_method,
                COUNT(*) AS transaction_count,
                COALESCE(SUM(total_amount), 0) AS amount
            FROM sales
            WHERE business_id = $1
              AND created_at >= $2::date
              AND created_at < ($3::date + INTERVAL '1 day')
            GROUP BY payment_method
            ORDER BY amount DESC
        `, [businessId, startDate, endDate]);

        const refundsResult = await pool.query(`
            SELECT
                refund_method,
                COUNT(*) AS return_count,
                COALESCE(SUM(total_amount), 0) AS amount
            FROM sale_returns
            WHERE business_id = $1
              AND status = 'completed'
              AND created_at >= $2::date
              AND created_at < ($3::date + INTERVAL '1 day')
            GROUP BY refund_method
            ORDER BY amount DESC
        `, [businessId, startDate, endDate]);

        const dailyResult = await pool.query(`
            WITH dates AS (
                SELECT generate_series($2::date, $3::date, INTERVAL '1 day')::date AS report_date
            ),
            daily_sales AS (
                SELECT
                    created_at::date AS report_date,
                    SUM(total_amount) AS revenue,
                    COUNT(*) AS sales_count
                FROM sales
                WHERE business_id = $1
                  AND created_at >= $2::date
                  AND created_at < ($3::date + INTERVAL '1 day')
                GROUP BY created_at::date
            ),
            daily_returns AS (
                SELECT
                    created_at::date AS report_date,
                    SUM(total_amount) AS returns_value
                FROM sale_returns
                WHERE business_id = $1
                  AND status = 'completed'
                  AND created_at >= $2::date
                  AND created_at < ($3::date + INTERVAL '1 day')
                GROUP BY created_at::date
            ),
            daily_profit AS (
                SELECT
                    s.created_at::date AS report_date,
                    SUM(si.profit_amount) AS profit
                FROM sales s
                INNER JOIN sale_items si
                    ON si.sale_id = s.id
                   AND si.business_id = s.business_id
                WHERE s.business_id = $1
                  AND s.created_at >= $2::date
                  AND s.created_at < ($3::date + INTERVAL '1 day')
                GROUP BY s.created_at::date
            ),
            daily_return_profit AS (
                SELECT
                    sr.created_at::date AS report_date,
                    SUM((si.unit_price - si.buying_price) * sri.quantity) AS return_profit
                FROM sale_returns sr
                INNER JOIN sale_return_items sri
                    ON sri.return_id = sr.id
                   AND sri.business_id = sr.business_id
                INNER JOIN sale_items si
                    ON si.id = sri.sale_item_id
                   AND si.business_id = sr.business_id
                WHERE sr.business_id = $1
                  AND sr.status = 'completed'
                  AND sr.created_at >= $2::date
                  AND sr.created_at < ($3::date + INTERVAL '1 day')
                GROUP BY sr.created_at::date
            )
            SELECT
                d.report_date,
                COALESCE(ds.revenue, 0) - COALESCE(dr.returns_value, 0) AS revenue,
                COALESCE(dp.profit, 0) - COALESCE(drp.return_profit, 0) - COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.business_id=$1 AND e.expense_date=d.report_date),0) AS profit,
                COALESCE(ds.sales_count, 0) AS sales_count
            FROM dates d
            LEFT JOIN daily_sales ds ON ds.report_date = d.report_date
            LEFT JOIN daily_returns dr ON dr.report_date = d.report_date
            LEFT JOIN daily_profit dp ON dp.report_date = d.report_date
            LEFT JOIN daily_return_profit drp ON drp.report_date = d.report_date
            ORDER BY d.report_date
        `, [businessId, startDate, endDate]);

        const topProductsResult = await pool.query(`
            WITH sold AS (
                SELECT
                    si.product_id,
                    si.product_name,
                    SUM(si.quantity) AS quantity_sold,
                    SUM(si.line_total) AS revenue,
                    SUM(si.profit_amount) AS profit
                FROM sale_items si
                INNER JOIN sales s
                    ON s.id = si.sale_id
                   AND s.business_id = si.business_id
                WHERE si.business_id = $1
                  AND s.created_at >= $2::date
                  AND s.created_at < ($3::date + INTERVAL '1 day')
                GROUP BY si.product_id, si.product_name
            ),
            returned AS (
                SELECT
                    sri.product_id,
                    SUM(sri.quantity) AS quantity_returned,
                    SUM(sri.line_total) AS return_revenue,
                    SUM((si.unit_price - si.buying_price) * sri.quantity) AS return_profit
                FROM sale_return_items sri
                INNER JOIN sale_returns sr
                    ON sr.id = sri.return_id
                   AND sr.business_id = sri.business_id
                   AND sr.status = 'completed'
                INNER JOIN sale_items si
                    ON si.id = sri.sale_item_id
                   AND si.business_id = sri.business_id
                WHERE sri.business_id = $1
                  AND sr.created_at >= $2::date
                  AND sr.created_at < ($3::date + INTERVAL '1 day')
                GROUP BY sri.product_id
            )
            SELECT
                s.product_id,
                s.product_name,
                GREATEST(0, s.quantity_sold - COALESCE(r.quantity_returned, 0)) AS quantity_sold,
                GREATEST(0, s.revenue - COALESCE(r.return_revenue, 0)) AS revenue,
                s.profit - COALESCE(r.return_profit, 0) AS profit
            FROM sold s
            LEFT JOIN returned r ON r.product_id = s.product_id
            ORDER BY quantity_sold DESC, revenue DESC
            LIMIT 10
        `, [businessId, startDate, endDate]);

        const debtResult = await pool.query(`
            SELECT
                COALESCE(SUM(balance), 0) AS outstanding_debt,
                COUNT(*) AS debt_count
            FROM debts
            WHERE business_id = $1
              AND balance > 0
        `, [businessId]);

        const inventoryResult = await pool.query(`
            SELECT
                COUNT(*) AS products,
                COALESCE(SUM(stock_quantity), 0) AS total_stock,
                COALESCE(SUM(buying_price * stock_quantity), 0) AS inventory_value
            FROM products
            WHERE business_id = $1
        `, [businessId]);

        const lowStockResult = await pool.query(`
            SELECT id, name, stock_quantity, low_stock_threshold
            FROM products
            WHERE business_id = $1
              AND stock_quantity <= low_stock_threshold
            ORDER BY stock_quantity ASC
        `, [businessId]);

        const grossRevenue = Number(summaryResult.rows[0].gross_revenue);
        const returnsValue = Number(summaryResult.rows[0].returns_value);
        const revenue = Math.round((grossRevenue - returnsValue) * 100) / 100;
        const salesCount = Number(summaryResult.rows[0].sales_count);
        const grossProfit = Number(profitResult.rows[0].gross_profit);
        const returnProfit = Number(profitResult.rows[0].return_profit);
        const expensesTotal = Number(profitResult.rows[0].expenses_total || 0);
        const grossProfitAfterReturns = grossProfit - returnProfit;
        const profit = Math.round((grossProfitAfterReturns - expensesTotal) * 100) / 100;
        const itemsSold = Math.max(
            0,
            Number(profitResult.rows[0].gross_items_sold) - Number(profitResult.rows[0].returned_items)
        );

        return res.json({
            period: { startDate, endDate },
            summary: {
                revenue,
                grossRevenue,
                returnsValue,
                profit,
                grossProfit,
                returnProfit,
                expenses: expensesTotal,
                grossProfitAfterReturns,
                discount: Number(summaryResult.rows[0].discount),
                salesCount,
                returnsCount: Number(summaryResult.rows[0].returns_count),
                itemsSold,
                averageSale: salesCount ? revenue / salesCount : 0
            },
            paymentMethods: paymentResult.rows,
            refunds: refundsResult.rows,
            daily: dailyResult.rows,
            topProducts: topProductsResult.rows,
            debts: {
                outstanding: Number(debtResult.rows[0].outstanding_debt),
                count: Number(debtResult.rows[0].debt_count)
            },
            inventory: {
                products: Number(inventoryResult.rows[0].products),
                totalStock: Number(inventoryResult.rows[0].total_stock),
                value: Number(inventoryResult.rows[0].inventory_value)
            },
            lowStock: lowStockResult.rows
        });
    } catch (error) {
        console.error("REPORT SUMMARY ERROR:", error);
        return res.status(400).json({ message: error.message || "Failed to generate report." });
    }
}

async function getStaffPerformance(req, res) {
    const businessId = businessIdFrom(req);
    if (!businessId) return res.status(401).json({ message: "Business context is missing." });

    try {
        const { startDate, endDate } = await getDateRange(req, businessId);
        const result = await pool.query(`
            WITH staff_sales AS (
                SELECT
                    s.created_by AS user_id,
                    COUNT(*) AS sales_count,
                    SUM(s.total_amount) AS revenue
                FROM sales s
                WHERE s.business_id = $1
                  AND s.created_at >= $2::date
                  AND s.created_at < ($3::date + INTERVAL '1 day')
                  AND s.created_by IS NOT NULL
                GROUP BY s.created_by
            ),
            staff_profit AS (
                SELECT
                    s.created_by AS user_id,
                    COALESCE(SUM(si.profit_amount), 0) AS profit
                FROM sales s
                INNER JOIN sale_items si
                    ON si.sale_id = s.id
                   AND si.business_id = s.business_id
                WHERE s.business_id = $1
                  AND s.created_at >= $2::date
                  AND s.created_at < ($3::date + INTERVAL '1 day')
                  AND s.created_by IS NOT NULL
                GROUP BY s.created_by
            ),
            staff_returns AS (
                SELECT
                    sr.created_by AS user_id,
                    COALESCE(SUM(sr.total_amount), 0) AS return_value
                FROM sale_returns sr
                WHERE sr.business_id = $1
                  AND sr.status = 'completed'
                  AND sr.created_at >= $2::date
                  AND sr.created_at < ($3::date + INTERVAL '1 day')
                  AND sr.created_by IS NOT NULL
                GROUP BY sr.created_by
            )
            SELECT
                u.id,
                u.name,
                u.email,
                u.role,
                COALESCE(ss.sales_count, 0) AS sales_count,
                COALESCE(ss.revenue, 0) - COALESCE(sr.return_value, 0) AS revenue,
                COALESCE(sp.profit, 0) AS gross_profit,
                COALESCE(sr.return_value, 0) AS return_value,
                COALESCE(sp.profit, 0) AS profit
            FROM users u
            LEFT JOIN staff_sales ss ON ss.user_id = u.id
            LEFT JOIN staff_profit sp ON sp.user_id = u.id
            LEFT JOIN staff_returns sr ON sr.user_id = u.id
            WHERE u.business_id = $1
            ORDER BY revenue DESC, sales_count DESC, u.name ASC
        `, [businessId, startDate, endDate]);

        return res.json({ period: { startDate, endDate }, staff: result.rows });
    } catch (error) {
        console.error("STAFF PERFORMANCE ERROR:", error);
        return res.status(400).json({ message: error.message || "Failed to load staff performance." });
    }
}

async function exportSalesCsv(req, res) {
    const businessId = businessIdFrom(req);
    if (!businessId) return res.status(401).json({ message: "Business context is missing." });

    try {
        const { startDate, endDate } = await getDateRange(req, businessId);
        const result = await pool.query(`
            SELECT
                s.receipt_number,
                s.created_at,
                s.total_amount,
                s.discount,
                s.payment_method,
                s.amount_paid,
                s.status,
                COALESCE(SUM(si.quantity), 0) AS items
            FROM sales s
            LEFT JOIN sale_items si
                ON si.sale_id = s.id
               AND si.business_id = s.business_id
            WHERE s.business_id = $1
              AND s.created_at >= $2::date
              AND s.created_at < ($3::date + INTERVAL '1 day')
            GROUP BY s.id
            ORDER BY s.created_at DESC
        `, [businessId, startDate, endDate]);

        const escapeCsv = (value) => {
            const text = String(value ?? "").replace(/"/g, '""');
            return `"${text}"`;
        };

        const lines = [
            [
                "Receipt",
                "Date",
                "Total",
                "Discount",
                "Payment Method",
                "Amount Paid",
                "Status",
                "Items"
            ].map(escapeCsv).join(",")
        ];

        for (const row of result.rows) {
            lines.push([
                row.receipt_number,
                row.created_at,
                row.total_amount,
                row.discount,
                row.payment_method,
                row.amount_paid,
                row.status,
                row.items
            ].map(escapeCsv).join(","));
        }

        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader(
            "Content-Disposition",
            `attachment; filename="dukaflow-sales-${startDate}-to-${endDate}.csv"`
        );

        return res.send("\uFEFF" + lines.join("\n"));
    } catch (error) {
        console.error("SALES CSV ERROR:", error);
        return res.status(400).json({ message: error.message || "Failed to export sales." });
    }
}

module.exports = {
    getReportSummary,
    getStaffPerformance,
    exportSalesCsv
};
