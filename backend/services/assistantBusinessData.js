"use strict";

const pool = require("../db");

const RESPONSE_GUIDANCE = "Answer in the selected application language. Ground every business fact and number only in the supplied PostgreSQL results. Never invent or infer missing numbers. Explain empty periods explicitly, distinguish unavailable metrics from zero, state the business-local date range checked, and ask a short clarification when the period or branch is ambiguous. Give a direct answer, concise interpretation, and one useful next action.";

function numeric(value) {
    const result = Number(value);
    return Number.isFinite(result) ? result : 0;
}

function addDays(dateText, days) {
    const [year, month, day] = String(dateText).split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

async function getBusinessDateContext(businessId) {
    const result = await pool.query(
        `SELECT timezone,
                TO_CHAR((CURRENT_TIMESTAMP AT TIME ZONE timezone)::date, 'YYYY-MM-DD') AS local_date
         FROM businesses
         WHERE id = $1`,
        [businessId]
    );
    if (!result.rowCount) throw new Error("Business timezone was not found.");
    return { timezone: result.rows[0].timezone, localDate: result.rows[0].local_date };
}

function dateRange(clock, period = "today", days = 30) {
    const boundedDays = Math.min(Math.max(Number(days) || 30, 1), 365);
    const today = clock.localDate;
    let startDate = today;
    let endDate = addDays(today, 1);
    let normalizedPeriod = period;

    if (period === "yesterday") {
        startDate = addDays(today, -1);
        endDate = today;
    } else if (period === "week") {
        const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
        startDate = addDays(today, -((weekday + 6) % 7));
        normalizedPeriod = "week";
    } else if (period === "days") {
        startDate = addDays(today, 1 - boundedDays);
        normalizedPeriod = "days";
    }

    return { timezone: clock.timezone, startDate, endDate, period: normalizedPeriod, days: boundedDays };
}

function timestampRange(column) {
    return `${column} >= ($3::date::timestamp AT TIME ZONE $5)
       AND ${column} < ($4::date::timestamp AT TIME ZONE $5)`;
}

function dateRangeParams(businessId, branchId, range) {
    return [businessId, branchId, range.startDate, range.endDate, range.timezone];
}

function logQuery(tool, businessId, branchId, range, result) {
    if (process.env.NODE_ENV !== "development") return;
    const returnedRows = Array.isArray(result?.items) ? result.items.length
        : Array.isArray(result?.top_products) ? result.top_products.length
            : Number(result?.transactions || result?.count || 0);
    console.info("COPILOT_DATA_QUERY", JSON.stringify({
        tool,
        businessId,
        branchId,
        dateRange: range ? { timezone: range.timezone, startDate: range.startDate, endDateExclusive: range.endDate } : null,
        returnedRows,
        transactionCount: Number(result?.transactions || 0),
        itemCount: Number(result?.items_sold || 0)
    }));
}

async function querySalesMetrics(businessId, branchId, range, limit = 5) {
    const values = dateRangeParams(businessId, branchId, range);
    const salesSql = `SELECT COUNT(*)::integer AS transactions,
                             COALESCE(SUM(s.total_amount), 0)::numeric AS revenue
                      FROM sales s
                      WHERE s.business_id = $1 AND s.branch_id = $2
                        AND ${timestampRange("s.created_at")}`;
    const itemsSql = `SELECT COUNT(si.id)::integer AS sale_lines,
                             COALESCE(SUM(si.quantity), 0)::bigint AS items_sold,
                             COALESCE(SUM(si.profit_amount), 0)::numeric AS gross_profit,
                             COUNT(*) FILTER (WHERE si.buying_price IS NULL)::integer AS missing_cost_rows
                      FROM sale_items si
                      JOIN sales s ON s.id = si.sale_id
                                  AND s.business_id = si.business_id
                                  AND s.branch_id = si.branch_id
                      WHERE si.business_id = $1 AND si.branch_id = $2
                        AND ${timestampRange("s.created_at")}`;
    const topSql = `SELECT si.product_id,
                           si.product_name AS name,
                           SUM(si.quantity)::bigint AS quantity,
                           SUM(si.line_total)::numeric AS revenue,
                           SUM(si.profit_amount)::numeric AS profit
                    FROM sale_items si
                    JOIN sales s ON s.id = si.sale_id
                                AND s.business_id = si.business_id
                                AND s.branch_id = si.branch_id
                    WHERE si.business_id = $1 AND si.branch_id = $2
                      AND ${timestampRange("s.created_at")}
                    GROUP BY si.product_id, si.product_name
                    ORDER BY quantity DESC, revenue DESC
                    LIMIT $6`;

    const [salesResult, itemsResult, topResult] = await Promise.all([
        pool.query(salesSql, values),
        pool.query(itemsSql, values),
        pool.query(topSql, [...values, limit])
    ]);
    const sales = salesResult.rows[0] || {};
    const items = itemsResult.rows[0] || {};
    const transactions = numeric(sales.transactions);
    const saleLines = numeric(items.sale_lines);
    const missingCostRows = numeric(items.missing_cost_rows);
    return {
        range,
        transactions,
        revenue: numeric(sales.revenue),
        saleLines,
        items_sold: numeric(items.items_sold),
        gross_profit: numeric(items.gross_profit),
        profit_available: saleLines > 0 && missingCostRows === 0,
        top_products: topResult.rows,
        has_sales: transactions > 0
    };
}

function normalizeQuestion(question) {
    return String(question || "")
        .toLocaleLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function isActionQuestion(text) {
    return /\b(ongeza|tengeneza|create|rekodi|andika|rekebisha|badilisha|adjust|record|add|make)\b/.test(text)
        && /\b(bidhaa|product|mteja|customer|matumizi|expense|stock|hisa|malipo|payment|deni|debt)\b/.test(text);
}

function selectBusinessQuery(question, history = []) {
    const text = normalizeQuestion(question);
    if (/\b(all branches|across branches|compare branches|which branch|tawi gani|matawi yote|kwa matawi yote)\b/.test(text)) {
        return { name: "clarify_branch" };
    }
    if (isActionQuestion(text)) return null;

    const previousUser = [...history].reverse().find((message) => message.role === "user")?.content || "";
    const context = /^(na\s|vipi\s|what about\b|and\s)/.test(text)
        ? `${normalizeQuestion(previousUser)} ${text}`
        : text;
    const daysMatch = context.match(/\b(?:(\d{1,3})\s*(?:siku|day|days)|(siku|days?)\s*(\d{1,3}))\b/);
    const days = daysMatch ? Math.min(Math.max(Number(daysMatch[1] || daysMatch[3]), 1), 365) : 30;
    const period = /\b(jana|yesterday)\b/.test(context) ? "yesterday"
        : /\b(wiki hii|this week|wiki)\b/.test(context) ? "week"
            : daysMatch ? "days" : "today";

    if (/\b(muhtasari|summary|muhtasari wa biashara|overview)\b/.test(context)) {
        return { name: "get_business_summary", args: { period, days } };
    }
    if (/\b(karibia kuisha|zinazokaribia kuisha|zinakaribia kuisha|low stock|stock ndogo|hisa ndogo|kuisha hivi karibuni)\b/.test(context)) {
        return { name: "get_low_stock_products", args: { limit: 20 } };
    }
    if (/\b(madeni|deni|debt|debts|wana deni|wenye madeni)\b/.test(context)) {
        return { name: "get_customer_debts", args: { limit: 20 } };
    }
    if (/\b(faida|profit)\b/.test(context)) {
        return { name: "get_profit", args: { period, days } };
    }
    if (/\b(matumi[zs]i|gharama|expenses?)\b/.test(context)) {
        return { name: "get_expenses", args: { period, days, limit: 20 } };
    }
    if (/\b(cash ?flow|mtiririko wa fedha)\b/.test(context)) {
        return { name: "get_cashflow", args: { period, days } };
    }
    if (/\b(historia ya mauzo|sales history|miamala ya hivi karibuni)\b/.test(context)) {
        return { name: "get_sales_history", args: { period, days, limit: 20 } };
    }
    if (/\b(historia ya manunuzi|historia ya ununuzi|customer purchase|mteja amenunua|manunuzi ya mteja)\b/.test(context)) {
        const match = context.match(/(?:historia ya manunuzi|historia ya ununuzi|customer purchase|mteja amenunua|manunuzi ya mteja)\s*(?:ya|wa)?\s*(.*)$/);
        return { name: "get_customer", args: { query: match?.[1]?.trim() || "" } };
    }
    if (/\b(bidhaa gani|top products?|most|zaidi|zaidi kuuzwa|zilizouza zaidi|imeuza zaidi|zilizouzwa zaidi)\b/.test(context)) {
        return { name: "get_top_products", args: { period, days, limit: 10 } };
    }
    if (/\b(stock|inventory|bidhaa zilizopo|bidhaa zote)\b/.test(context)) {
        return { name: "get_inventory", args: { query: "", limit: 20 } };
    }
    if (/\b(mauzo|nimeuza|miamala|transactions?|sales|sell|sold|revenue)\b/.test(context)) {
        return { name: period === "today" || period === "yesterday" ? "get_today_sales" : "get_sales_report", args: { period, days } };
    }
    return { name: "get_business_summary", args: { period, days: daysMatch ? days : 30 } };
}

async function readBusinessData(name, args, businessId, branchId, clock) {
    const limit = Math.min(Math.max(Number(args?.limit || 10), 1), 30);
    const days = Math.min(Math.max(Number(args?.days || 30), 1), 365);
    const period = args?.period || "today";
    const range = dateRange(clock, period, days);
    let result;

    if (["get_today_sales", "get_sales_report", "get_top_products", "get_profit", "get_business_summary"].includes(name)) {
        const salesRange = name === "get_today_sales" && period === "today"
            ? dateRange(clock, "today")
            : range;
        const sales = await querySalesMetrics(businessId, branchId, salesRange, name === "get_top_products" ? limit : 5);

        if (name === "get_today_sales" && period === "today") {
            const previousRange = dateRange(clock, "yesterday");
            sales.previous = await querySalesMetrics(businessId, branchId, previousRange, 5);
        }
        if (name === "get_top_products") result = { ...sales, items: sales.top_products };
        else if (name === "get_profit") {
            const expenseResult = await pool.query(
                `SELECT COUNT(*)::integer AS expense_count, COALESCE(SUM(amount), 0)::numeric AS expenses
                 FROM expenses
                 WHERE business_id = $1 AND branch_id = $2
                   AND expense_date >= $3::date AND expense_date < $4::date`,
                [businessId, branchId, range.startDate, range.endDate]
            );
            const expense = expenseResult.rows[0] || {};
            result = {
                ...sales,
                expenses: numeric(expense.expenses),
                expense_count: numeric(expense.expense_count),
                net_profit: sales.profit_available ? sales.gross_profit - numeric(expense.expenses) : null
            };
        } else if (name === "get_business_summary") {
            const [debtResult, lowStockResult] = await Promise.all([
                pool.query(
                    `SELECT COUNT(*)::integer AS debt_count, COALESCE(SUM(balance), 0)::numeric AS outstanding_debt
                     FROM debts
                     WHERE business_id = $1 AND branch_id = $2 AND balance > 0`,
                    [businessId, branchId]
                ),
                pool.query(
                    `SELECT id, name, stock_quantity, low_stock_threshold
                     FROM products
                     WHERE business_id = $1 AND branch_id = $2 AND stock_quantity <= low_stock_threshold
                     ORDER BY stock_quantity ASC, name ASC LIMIT 10`,
                    [businessId, branchId]
                )
            ]);
            result = {
                ...sales,
                debt_count: numeric(debtResult.rows[0]?.debt_count),
                outstanding_debt: numeric(debtResult.rows[0]?.outstanding_debt),
                low_stock_products: lowStockResult.rows
            };
        } else result = sales;
    } else if (name === "get_low_stock_products") {
        const query = await pool.query(
            `SELECT id, name, stock_quantity, low_stock_threshold, selling_price
             FROM products
             WHERE business_id = $1 AND branch_id = $2 AND stock_quantity <= low_stock_threshold
             ORDER BY stock_quantity ASC, selling_price DESC LIMIT $3`,
            [businessId, branchId, limit]
        );
        result = { items: query.rows, count: query.rowCount };
    } else if (name === "get_inventory") {
        const queryText = String(args?.query || "").trim();
        const query = await pool.query(
            `SELECT id, name, stock_quantity, low_stock_threshold, selling_price, buying_price
             FROM products
             WHERE business_id = $1 AND branch_id = $2
               AND ($3 = '' OR LOWER(name) LIKE '%' || LOWER($3) || '%')
             ORDER BY name ASC LIMIT $4`,
            [businessId, branchId, queryText, limit]
        );
        result = { items: query.rows, count: query.rowCount };
    } else if (name === "get_customer") {
        const queryText = String(args?.query || "").trim();
        const query = await pool.query(
            `SELECT c.id, c.name,
                    COUNT(s.id)::integer AS transactions,
                    COALESCE(SUM(s.total_amount), 0)::numeric AS purchase_total,
                    MAX(s.created_at) AS last_purchase
             FROM customers c
             LEFT JOIN sales s ON s.customer_id = c.id
                              AND s.business_id = c.business_id
                              AND s.branch_id = c.branch_id
             WHERE c.business_id = $1 AND c.branch_id = $2
               AND ($3 = '' OR LOWER(c.name) LIKE '%' || LOWER($3) || '%')
             GROUP BY c.id, c.name
             ORDER BY purchase_total DESC, c.name ASC LIMIT 10`,
            [businessId, branchId, queryText]
        );
        result = { items: query.rows, count: query.rowCount };
    } else if (name === "get_customer_debts") {
        const query = await pool.query(
            `SELECT c.name AS customer_name, d.id, d.balance, d.total_amount, d.status
             FROM debts d
             JOIN customers c ON c.id = d.customer_id
                            AND c.business_id = d.business_id
                            AND c.branch_id = d.branch_id
             WHERE d.business_id = $1 AND d.branch_id = $2 AND d.balance > 0
             ORDER BY d.balance DESC LIMIT $3`,
            [businessId, branchId, limit]
        );
        result = { items: query.rows, count: query.rowCount };
    } else if (name === "get_expenses") {
        const query = await pool.query(
            `SELECT category, SUM(amount)::numeric AS total, COUNT(*)::integer AS entries
             FROM expenses
             WHERE business_id = $1 AND branch_id = $2
               AND expense_date >= $3::date AND expense_date < $4::date
             GROUP BY category ORDER BY total DESC LIMIT $5`,
            [businessId, branchId, range.startDate, range.endDate, limit]
        );
        result = { items: query.rows, count: query.rowCount };
    } else if (name === "get_cashflow") {
        const query = await pool.query(
            `SELECT
                (SELECT COALESCE(SUM(s.total_amount), 0)::numeric FROM sales s
                 WHERE s.business_id = $1 AND s.branch_id = $2 AND ${timestampRange("s.created_at")}) AS inflow,
                (SELECT COALESCE(SUM(e.amount), 0)::numeric FROM expenses e
                 WHERE e.business_id = $1 AND e.branch_id = $2
                   AND e.expense_date >= $3::date AND e.expense_date < $4::date) AS outflow`,
            dateRangeParams(businessId, branchId, range)
        );
        result = { ...(query.rows[0] || {}), range };
    } else if (name === "get_staff_activity") {
        const query = await pool.query(
            `SELECT created_by, COUNT(*)::integer AS sales_count, COALESCE(SUM(total_amount), 0)::numeric AS sales_value
             FROM sales
             WHERE business_id = $1 AND branch_id = $2 AND ${timestampRange("created_at")}
             GROUP BY created_by ORDER BY sales_value DESC LIMIT $6`,
            [...dateRangeParams(businessId, branchId, range), limit]
        );
        result = { items: query.rows, count: query.rowCount, range };
    } else if (name === "get_sales_history") {
        const query = await pool.query(
            `SELECT s.id, s.receipt_number, s.total_amount, s.status, s.created_at,
                    COALESCE(SUM(si.quantity), 0)::bigint AS items_sold
             FROM sales s
             LEFT JOIN sale_items si ON si.sale_id = s.id
                                   AND si.business_id = s.business_id
                                   AND si.branch_id = s.branch_id
             WHERE s.business_id = $1 AND s.branch_id = $2
               AND ${timestampRange("s.created_at")}
             GROUP BY s.id
             ORDER BY s.created_at DESC LIMIT $6`,
            [...dateRangeParams(businessId, branchId, range), limit]
        );
        result = { items: query.rows, count: query.rowCount, range };
    } else {
        result = {};
    }

    logQuery(name, businessId, branchId, result?.range || range, result);
    return result;
}

const money = (value) => `TSh ${numeric(value).toLocaleString("en-TZ", { maximumFractionDigits: 2 })}`;

function rangeLabel(range, language) {
    if (range.period === "yesterday") return language === "en" ? "yesterday" : "jana";
    if (range.period === "week") return language === "en" ? "this week" : "wiki hii";
    if (range.period === "days") return language === "en" ? `the last ${range.days} days` : `siku ${range.days} zilizopita`;
    return language === "en" ? "today" : "leo";
}

function emptySalesMessage(range, language) {
    const period = rangeLabel(range, language);
    if (language === "en") return `No sales were recorded ${period} for this branch. I checked ${range.startDate} through (but not including) ${range.endDate}, using the business timezone ${range.timezone}.`;
    if (range.period === "today") return `Sijaona mauzo yaliyorekodiwa leo kwenye tawi hili. Nimeangalia rekodi za ${range.startDate} hadi kabla ya ${range.endDate} kwa saa za biashara (${range.timezone}).`;
    if (range.period === "yesterday") return `Sijaona mauzo yaliyorekodiwa jana kwenye tawi hili. Nimeangalia rekodi za ${range.startDate} hadi kabla ya ${range.endDate} kwa saa za biashara (${range.timezone}).`;
    return `Sijaona mauzo yaliyorekodiwa kwa ${period} kwenye tawi hili. Nimeangalia rekodi za ${range.startDate} hadi kabla ya ${range.endDate} kwa saa za biashara (${range.timezone}).`;
}

function businessInsights(name, data, language = "sw") {
    const cards = [];
    if (["get_today_sales", "get_sales_report", "get_business_summary"].includes(name) && data.has_sales) {
        cards.push(
            { label: language === "en" ? "Sales" : "Mauzo", value: money(data.revenue), detail: `${data.transactions} ${language === "en" ? "transactions" : "miamala"}` },
            { label: language === "en" ? "Items sold" : "Bidhaa zilizouzwa", value: String(data.items_sold), detail: language === "en" ? "recorded in this period" : "zilirekodiwa katika kipindi hiki" }
        );
        if (data.top_products?.[0]) cards.push({
            label: language === "en" ? "Top product" : "Bidhaa iliyoongoza",
            value: String(data.top_products[0].name),
            detail: `${numeric(data.top_products[0].quantity)} ${language === "en" ? "items sold" : "ziliuzwa"}`
        });
        if (data.profit_available) cards.push({ label: language === "en" ? "Gross profit" : "Faida ghafi", value: money(data.gross_profit), detail: language === "en" ? "from stored sale-item costs" : "kutoka gharama zilizohifadhiwa" });
    } else if (name === "get_profit" && data.profit_available) {
        cards.push(
            { label: language === "en" ? "Revenue" : "Mauzo", value: money(data.revenue), detail: `${data.transactions} ${language === "en" ? "transactions" : "miamala"}` },
            { label: language === "en" ? "Gross profit" : "Faida ghafi", value: money(data.gross_profit), detail: language === "en" ? "stored sale-item costs" : "gharama zilizohifadhiwa" },
            { label: language === "en" ? "Expenses" : "Matumizi", value: money(data.expenses), detail: `${data.expense_count} ${language === "en" ? "entries" : "rekodi"}` },
            { label: language === "en" ? "Estimated net" : "Faida halisi", value: money(data.net_profit), detail: rangeLabel(data.range, language) }
        );
    } else if (name === "get_low_stock_products") {
        return (data.items || []).slice(0, 4).map((item) => ({
            label: String(item.name),
            value: String(item.stock_quantity),
            detail: `${language === "en" ? "remaining · threshold" : "zimebaki · kiwango"} ${item.low_stock_threshold}`
        }));
    } else if (name === "get_customer_debts") {
        return (data.items || []).slice(0, 4).map((item) => ({ label: String(item.customer_name), value: money(item.balance), detail: String(item.status) }));
    }
    return cards;
}

function formatSalesAnswer(data, language) {
    if (!data.has_sales) return `${emptySalesMessage(data.range, language)}\n\n${language === "en" ? "Next: confirm that the transactions were recorded in this branch." : "Hatua inayofuata: hakiki kuwa miamala iliingizwa kwenye tawi hili."}`;

    const title = rangeLabel(data.range, language);
    const lines = [
        `## ${language === "en" ? `Sales ${title}` : `Mauzo ${title}`}`,
        `- ${language === "en" ? "Revenue" : "Jumla ya mauzo"}: **${money(data.revenue)}**`,
        `- ${language === "en" ? "Transactions" : "Miamala"}: **${data.transactions}**`
    ];
    if (data.saleLines > 0) lines.push(`- ${language === "en" ? "Items sold" : "Idadi ya bidhaa zilizouzwa"}: **${numeric(data.items_sold)}**`);
    if (data.top_products?.length) {
        const top = data.top_products[0];
        lines.push(`- ${language === "en" ? "Top product" : "Bidhaa iliyoongoza"}: **${top.name}** (${numeric(top.quantity)} ${language === "en" ? "items" : "bidhaa"})`);
    }
    if (data.profit_available) lines.push(`- ${language === "en" ? "Recorded gross profit" : "Faida ghafi iliyorekodiwa"}: **${money(data.gross_profit)}**`);
    else lines.push(language === "en"
        ? "- Profit cannot be calculated accurately because product costs are missing from stored sale items."
        : "- Faida haiwezi kuhesabiwa kwa usahihi kwa sababu hakuna gharama za bidhaa zilizohifadhiwa.");

    if (data.previous) {
        if (data.previous.has_sales) {
            const change = data.revenue - data.previous.revenue;
            const direction = change > 0 ? (language === "en" ? "increased" : "yameongezeka")
                : change < 0 ? (language === "en" ? "decreased" : "yamepungua")
                    : (language === "en" ? "were unchanged" : "hayajabadilika");
            const percent = data.previous.revenue ? ` (${Math.abs(change / data.previous.revenue * 100).toFixed(1)}%)` : "";
            lines.push(`- ${language === "en" ? "Vs yesterday" : "Ikilinganishwa na jana"}: ${direction} ${money(Math.abs(change))}${percent}.`);
        } else {
            lines.push(language === "en" ? "- No sales were recorded yesterday for comparison." : "- Hakuna mauzo yaliyorekodiwa jana kwa ulinganisho.");
        }
    }
    lines.push(`\n${language === "en" ? "Next: would you like the transaction list or a comparison by product?" : "Hatua inayofuata: ungependa kuona orodha ya miamala au ulinganisho kwa bidhaa?"}`);
    return lines.join("\n");
}

function formatBusinessAnswer(name, data, language = "sw") {
    if (name === "clarify_branch") {
        return language === "en"
            ? "I can only report on the currently selected branch. Which branch should I use?"
            : "Kwa sasa naweza kuripoti tawi lililochaguliwa pekee. Ungependa nichunguze tawi gani?";
    }
    if (["get_today_sales", "get_sales_report"].includes(name)) return formatSalesAnswer(data, language);
    if (name === "get_top_products") {
        if (!data.items?.length) return language === "en" ? `No product sales were recorded for ${rangeLabel(data.range, language)} in this branch.` : `Sijaona bidhaa zilizouzwa kwa ${rangeLabel(data.range, language)} kwenye tawi hili.`;
        const rows = data.items.map((item, index) => `${index + 1}. **${item.name}** — ${numeric(item.quantity)} ${language === "en" ? "items" : "bidhaa"}, ${money(item.revenue)}`);
        return `## ${language === "en" ? "Top products" : "Bidhaa zilizouza zaidi"}\n${rows.join("\n")}\n\n${language === "en" ? "Next: compare another period or review stock for these products." : "Hatua inayofuata: linganisha kipindi kingine au kagua stock ya bidhaa hizi."}`;
    }
    if (name === "get_low_stock_products") {
        if (!data.items?.length) return language === "en" ? "No products are at or below their recorded low-stock threshold in this branch." : "Hakuna bidhaa zilizo chini au sawa na kiwango cha tahadhari ya stock kwenye tawi hili.";
        return `## ${language === "en" ? "Low stock" : "Bidhaa zinazokaribia kuisha"}\n${data.items.map((item) => `- **${item.name}**: ${item.stock_quantity} ${language === "en" ? "left" : "zimebaki"} (threshold ${item.low_stock_threshold})`).join("\n")}\n\n${language === "en" ? "Next: review these products before placing a restock order." : "Hatua inayofuata: kagua bidhaa hizi kabla ya kuandaa oda ya kuongeza stock."}`;
    }
    if (name === "get_customer_debts") {
        if (!data.items?.length) return language === "en" ? "No outstanding customer debts were found for this branch." : "Sijaona madeni ya wateja yanayosalia kwenye tawi hili.";
        return `## ${language === "en" ? "Outstanding customer debts" : "Madeni ya wateja yanayosalia"}\n${data.items.map((item) => `- **${item.customer_name}**: ${money(item.balance)} (${item.status})`).join("\n")}\n\n${language === "en" ? "Next: open a customer account to review payment history." : "Hatua inayofuata: fungua akaunti ya mteja ili kukagua historia ya malipo."}`;
    }
    if (name === "get_profit") {
        if (!data.has_sales) return `${emptySalesMessage(data.range, language)}\n\n${language === "en" ? "Profit was not reported because there are no recorded sales in this period." : "Faida haijaonyeshwa kwa sababu hakuna mauzo yaliyorekodiwa katika kipindi hiki."}`;
        if (!data.profit_available) return language === "en"
            ? `Revenue was ${money(data.revenue)}. Profit cannot be calculated accurately because stored product costs are missing.`
            : `Mauzo yalikuwa ${money(data.revenue)}.\n\nFaida haiwezi kuhesabiwa kwa usahihi kwa sababu hakuna gharama za bidhaa zilizohifadhiwa.`;
        return `## ${language === "en" ? "Profit" : "Faida"} — ${rangeLabel(data.range, language)}\n- ${language === "en" ? "Revenue" : "Mauzo"}: **${money(data.revenue)}**\n- ${language === "en" ? "Gross profit from stored sale-item costs" : "Faida ghafi kutoka gharama zilizohifadhiwa za bidhaa"}: **${money(data.gross_profit)}**\n- ${language === "en" ? "Recorded expenses" : "Matumizi yaliyorekodiwa"}: **${money(data.expenses)}**\n- ${language === "en" ? "Estimated net profit" : "Faida halisi iliyokadiriwa"}: **${money(data.net_profit)}**\n\n${language === "en" ? "This estimate uses the cost snapshots stored on sale items and expenses dated in the selected period." : "Makadirio haya yanatumia gharama zilizohifadhiwa kwenye bidhaa za mauzo na matumizi yaliyoandikwa katika kipindi hiki."}\n\n${language === "en" ? "Next: compare this period with the previous one." : "Hatua inayofuata: linganisha kipindi hiki na kipindi kilichotangulia."}`;
    }
    if (name === "get_expenses") {
        if (!data.items?.length) return language === "en" ? `No expenses were recorded for ${rangeLabel(data.range, language)} in this branch.` : `Sijaona matumizi yaliyorekodiwa kwa ${rangeLabel(data.range, language)} kwenye tawi hili.`;
        return `## ${language === "en" ? "Expenses" : "Matumizi"} — ${rangeLabel(data.range, language)}\n${data.items.map((item) => `- **${item.category}**: ${money(item.total)} (${item.entries} ${language === "en" ? "entries" : "rekodi"})`).join("\n")}\n\n${language === "en" ? "Next: review the largest category." : "Hatua inayofuata: kagua kundi lenye matumizi makubwa zaidi."}`;
    }
    if (name === "get_cashflow") {
        return `## ${language === "en" ? "Cash flow" : "Mtiririko wa fedha"} — ${rangeLabel(data.range, language)}\n- ${language === "en" ? "Sales inflow" : "Mapato ya mauzo"}: **${money(data.inflow)}**\n- ${language === "en" ? "Expense outflow" : "Matumizi"}: **${money(data.outflow)}**`;
    }
    if (name === "get_sales_history") {
        if (!data.items?.length) return emptySalesMessage(data.range, language);
        return `## ${language === "en" ? "Recent sales" : "Mauzo ya hivi karibuni"}\n${data.items.map((item) => `- **${item.receipt_number}**: ${money(item.total_amount)}, ${item.items_sold} ${language === "en" ? "items" : "bidhaa"} (${item.status})`).join("\n")}`;
    }
    if (name === "get_customer") {
        if (!data.items?.length) return language === "en" ? "No matching customer purchase history was found in this branch." : "Sijaona historia ya manunuzi ya mteja anayelingana kwenye tawi hili.";
        return `## ${language === "en" ? "Customer purchase history" : "Historia ya manunuzi ya wateja"}\n${data.items.map((item) => `- **${item.name}**: ${item.transactions} ${language === "en" ? "transactions" : "miamala"}, ${money(item.purchase_total)}`).join("\n")}`;
    }
    if (name === "get_inventory") {
        if (!data.items?.length) return language === "en" ? "No matching products were found in this branch." : "Sijaona bidhaa zinazolingana kwenye tawi hili.";
        return `## ${language === "en" ? "Inventory" : "Bidhaa zilizopo"}\n${data.items.map((item) => `- **${item.name}**: ${item.stock_quantity} ${language === "en" ? "in stock" : "kwenye stock"}`).join("\n")}`;
    }
    const sales = data.has_sales
        ? `${money(data.revenue)} ${language === "en" ? "sales" : "za mauzo"} from ${data.transactions} ${language === "en" ? "transactions" : "miamala"}`
        : null;
    const top = data.top_products?.[0];
    const details = [
        sales ? `- ${language === "en" ? "Sales" : "Mauzo"} (${rangeLabel(data.range, language)}): **${sales}**` : "",
        data.saleLines ? `- ${language === "en" ? "Items sold" : "Bidhaa zilizouzwa"}: **${data.items_sold}**` : "",
        top ? `- ${language === "en" ? "Top product" : "Bidhaa iliyoongoza"}: **${top.name}** (${top.quantity})` : "",
        data.profit_available ? `- ${language === "en" ? "Gross profit" : "Faida ghafi"}: **${money(data.gross_profit)}**` : "",
        data.has_sales && !data.profit_available ? (language === "en" ? "- Profit cannot be calculated accurately because stored product costs are unavailable." : "- Faida haiwezi kuhesabiwa kwa usahihi kwa sababu hakuna gharama za bidhaa zilizohifadhiwa.") : "",
        data.low_stock_products?.length ? `- ${language === "en" ? "Low-stock products" : "Bidhaa zenye stock ndogo"}: **${data.low_stock_products.length}**` : "",
        data.debt_count ? `- ${language === "en" ? "Outstanding debts" : "Madeni yanayosalia"}: **${data.debt_count} (${money(data.outstanding_debt)})**` : ""
    ].filter(Boolean);
    const emptyPeriod = data.has_sales ? "" : `${emptySalesMessage(data.range, language)}\n\n`;
    return `${emptyPeriod}## ${language === "en" ? "Business summary" : "Muhtasari wa biashara"}\n${details.join("\n")}\n\n${language === "en" ? "Next: choose a metric to compare or inspect in detail." : "Hatua inayofuata: chagua kipimo cha kulinganisha au kuchunguza kwa kina."}`;
}

module.exports = {
    RESPONSE_GUIDANCE,
    getBusinessDateContext,
    dateRange,
    selectBusinessQuery,
    readBusinessData,
    businessInsights,
    formatBusinessAnswer
};
