"use strict";

const pool = require("../db");

function businessIdFrom(req) {
    const value = Number(req.businessId || req.user?.businessId || req.user?.business_id);
    return Number.isInteger(value) && value > 0 ? value : null;
}

function pctChange(current, previous) {
    if (!previous) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
}

async function getBusinessInsights(req, res) {
    const businessId = businessIdFrom(req);
    if (!businessId) return res.status(401).json({ message: "Business context is missing." });

    try {
        const [current, previous, inventory, debts, topProduct] = await Promise.all([
            pool.query(`
                SELECT
                    COALESCE(SUM(s.total_amount),0)
                    - COALESCE((SELECT SUM(sr.total_amount) FROM sale_returns sr
                        WHERE sr.business_id=$1 AND sr.status='completed'
                          AND sr.created_at >= CURRENT_DATE - INTERVAL '6 days'
                          AND sr.created_at < CURRENT_DATE + INTERVAL '1 day'),0) AS sales,
                    COALESCE(SUM(s.total_amount - s.discount),0) AS net_sales,
                    COUNT(*) AS sales_count
                FROM sales s
                WHERE s.business_id=$1
                  AND s.created_at >= CURRENT_DATE - INTERVAL '6 days'
                  AND s.created_at < CURRENT_DATE + INTERVAL '1 day'
            `, [businessId]),
            pool.query(`
                SELECT
                    COALESCE(SUM(s.total_amount),0)
                    - COALESCE((SELECT SUM(sr.total_amount) FROM sale_returns sr
                        WHERE sr.business_id=$1 AND sr.status='completed'
                          AND sr.created_at >= CURRENT_DATE - INTERVAL '13 days'
                          AND sr.created_at < CURRENT_DATE - INTERVAL '6 days'),0) AS sales
                FROM sales s
                WHERE s.business_id=$1
                  AND s.created_at >= CURRENT_DATE - INTERVAL '13 days'
                  AND s.created_at < CURRENT_DATE - INTERVAL '6 days'
            `, [businessId]),
            pool.query(`
                SELECT
                    COUNT(*) FILTER (WHERE stock_quantity <= low_stock_threshold) AS low_stock,
                    COUNT(*) FILTER (WHERE stock_quantity = 0) AS out_of_stock,
                    COUNT(*) AS products,
                    COALESCE(SUM(selling_price * stock_quantity),0) AS retail_value
                FROM products
                WHERE business_id=$1
            `, [businessId]),
            pool.query(`
                SELECT
                    COALESCE(SUM(balance),0) AS outstanding,
                    COUNT(*) FILTER (WHERE balance > 0 AND due_date < CURRENT_DATE) AS overdue_count,
                    COALESCE(SUM(balance) FILTER (WHERE balance > 0 AND due_date < CURRENT_DATE),0) AS overdue_amount
                FROM debts
                WHERE business_id=$1
            `, [businessId]),
            pool.query(`
                SELECT
                    si.product_id,
                    si.product_name,
                    SUM(si.quantity)::numeric AS units,
                    SUM(si.line_total)::numeric AS revenue
                FROM sale_items si
                INNER JOIN sales s
                    ON s.id=si.sale_id
                   AND s.business_id=si.business_id
                WHERE si.business_id=$1
                  AND s.created_at >= CURRENT_DATE - INTERVAL '29 days'
                GROUP BY si.product_id, si.product_name
                ORDER BY revenue DESC
                LIMIT 1
            `, [businessId])
        ]);

        const sales = Number(current.rows[0].sales || 0);
        const previousSales = Number(previous.rows[0].sales || 0);
        const salesChange = pctChange(sales, previousSales);
        const lowStock = Number(inventory.rows[0].low_stock || 0);
        const outOfStock = Number(inventory.rows[0].out_of_stock || 0);
        const outstanding = Number(debts.rows[0].outstanding || 0);
        const overdueAmount = Number(debts.rows[0].overdue_amount || 0);
        const overdueCount = Number(debts.rows[0].overdue_count || 0);

        const insights = [];

        if (outOfStock > 0) {
            insights.push({
                type: "critical",
                title: "Replenish out-of-stock products",
                message: `${outOfStock} product(s) currently have zero stock. Review Inventory before the next busy selling period.`,
                actionUrl: "/inventory/"
            });
        } else if (lowStock > 0) {
            insights.push({
                type: "warning",
                title: "Review low-stock products",
                message: `${lowStock} product(s) are at or below their low-stock threshold. Consider creating a purchase order.`,
                actionUrl: "/inventory/"
            });
        }

        if (overdueCount > 0) {
            insights.push({
                type: "warning",
                title: "Follow up overdue debts",
                message: `${overdueCount} debt(s) are overdue, totaling ${overdueAmount.toLocaleString("en-TZ")} TSh.`,
                actionUrl: "/debts/"
            });
        }

        if (salesChange <= -10) {
            insights.push({
                type: "info",
                title: "Sales are below the previous 7-day period",
                message: `Sales are ${Math.abs(salesChange).toFixed(1)}% lower than the preceding seven-day period. Review daily sales and top products.`,
                actionUrl: "/reports/"
            });
        } else if (salesChange >= 10) {
            insights.push({
                type: "positive",
                title: "Sales are trending upward",
                message: `Sales are ${salesChange.toFixed(1)}% higher than the preceding seven-day period. Keep an eye on stock availability for fast-moving items.`,
                actionUrl: "/reports/"
            });
        }

        if (topProduct.rowCount) {
            const product = topProduct.rows[0];
            insights.push({
                type: "info",
                title: "Top product over the last 30 days",
                message: `${product.product_name} generated ${Number(product.units).toLocaleString("en-TZ")} unit(s) and ${Number(product.revenue).toLocaleString("en-TZ")} TSh in sales.`,
                actionUrl: "/reports/"
            });
        }

        if (!insights.length) {
            insights.push({
                type: "positive",
                title: "No urgent issues detected",
                message: "Your current sales, debt, and inventory signals do not show an urgent operational alert.",
                actionUrl: "/"
            });
        }

        return res.json({
            snapshot: {
                sales_7_days: sales,
                previous_sales_7_days: previousSales,
                sales_change_percent: Math.round(salesChange * 10) / 10,
                low_stock: lowStock,
                out_of_stock: outOfStock,
                products: Number(inventory.rows[0].products || 0),
                inventory_retail_value: Number(inventory.rows[0].retail_value || 0),
                outstanding_debt: outstanding,
                overdue_debt: overdueAmount,
                overdue_count: overdueCount
            },
            insights
        });
    } catch (error) {
        console.error("BUSINESS INSIGHTS ERROR:", error);
        return res.status(500).json({ message: "Failed to generate business insights." });
    }
}

module.exports = { getBusinessInsights };
