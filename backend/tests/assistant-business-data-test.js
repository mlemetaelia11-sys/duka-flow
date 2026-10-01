"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const pool = require("../db");
const dataService = require("../services/assistantBusinessData");
const controller = require("../controllers/assistantController");

const BUSINESS_ID = 42;
const BRANCH_ID = 7;
const USER_ID = 91;
const CLOCK = { timezone: "Africa/Dar_es_Salaam", localDate: "2026-10-01" };

function createResponse() {
    return {
        statusCode: 200,
        payload: null,
        status(code) { this.statusCode = code; return this; },
        json(value) { this.payload = value; return this; }
    };
}

function makeRequest(question, language = "sw", conversationId = null) {
    return {
        businessId: BUSINESS_ID,
        branchId: BRANCH_ID,
        user: { id: USER_ID, businessId: BUSINESS_ID, default_branch_id: BRANCH_ID, name: "Test user", role: "owner" },
        headers: { cookie: `dukaflow_language=${language}` },
        body: { question, ...(conversationId ? { conversationId } : {}) }
    };
}

function makeDatabaseStub() {
    const messages = [];
    const conversations = new Map();
    const queries = [];
    let nextConversationId = 300;
    let zeroSales = false;
    let missingCosts = false;
    let failSales = false;

    const query = async (sql, values = []) => {
        const statement = String(sql).replace(/\s+/g, " ").trim();
        queries.push({ sql: statement, values });

        if (statement.includes("TO_CHAR((CURRENT_TIMESTAMP AT TIME ZONE timezone)::date")) {
            return { rowCount: 1, rows: [{ timezone: CLOCK.timezone, local_date: CLOCK.localDate }] };
        }
        if (failSales && statement.includes("FROM sales s")) throw Object.assign(new Error("query failed"), { code: "TEST_QUERY_ERROR" });
        if (statement.startsWith("SELECT id, summary FROM ai_conversations")) {
            const row = conversations.get(Number(values[3]));
            return { rowCount: row ? 1 : 0, rows: row ? [{ id: row.id, summary: row.summary }] : [] };
        }
        if (statement.startsWith("INSERT INTO ai_conversations")) {
            const id = nextConversationId++;
            conversations.set(id, { id, businessId: values[0], branchId: values[1], userId: values[2], summary: null });
            return { rowCount: 1, rows: [{ id, summary: null }] };
        }
        if (statement.startsWith("SELECT m.role, m.content, m.metadata")) {
            const found = messages.filter((row) => row.businessId === values[0]
                && row.branchId === values[1] && row.userId === values[2] && row.conversationId === values[3]);
            return { rowCount: Math.min(found.length, 12), rows: found.slice(-12).reverse().map(({ role, content, metadata }) => ({ role, content, metadata })) };
        }
        if (statement.startsWith("SELECT COUNT(*) AS total FROM ai_messages")) {
            const found = messages.filter((row) => row.businessId === values[0]
                && row.branchId === values[1] && row.userId === values[2] && row.conversationId === values[3]);
            return { rowCount: 1, rows: [{ total: found.length }] };
        }
        if (statement.startsWith("INSERT INTO ai_messages")) {
            const role = statement.includes("'user'") ? "user" : statement.includes("'assistant'") ? "assistant" : "tool";
            messages.push({ businessId: values[0], branchId: values[1], conversationId: values[2], userId: values[3], role, content: values[4], metadata: JSON.parse(values[5]) });
            return { rowCount: 1, rows: [] };
        }
        if (statement.startsWith("UPDATE ai_conversations")) return { rowCount: 1, rows: [] };
        if (statement.includes("SELECT COUNT(*)::integer AS transactions") && statement.includes("FROM sales s")) {
            const isYesterday = values[2] === "2026-09-30";
            const empty = zeroSales && !isYesterday;
            return { rowCount: 1, rows: [{ transactions: empty ? 0 : isYesterday ? 2 : 3, revenue: empty ? 0 : isYesterday ? "9000" : "12500" }] };
        }
        if (statement.includes("COUNT(si.id)::integer AS sale_lines")) {
            const isYesterday = values[2] === "2026-09-30";
            const empty = zeroSales && !isYesterday;
            return { rowCount: 1, rows: [{ sale_lines: empty ? 0 : isYesterday ? 2 : 4, items_sold: empty ? 0 : isYesterday ? 3 : 9, gross_profit: empty ? 0 : isYesterday ? "1700" : "3600", missing_cost_rows: missingCosts && !empty ? 1 : 0 }] };
        }
        if (statement.includes("GROUP BY si.product_id, si.product_name")) {
            const empty = zeroSales && values[2] === "2026-10-01";
            return { rowCount: empty ? 0 : 1, rows: empty ? [] : [{ product_id: 18, name: "Maziwa", quantity: 5, revenue: "7500", profit: "2100" }] };
        }
        if (statement.includes("FROM debts d") && statement.includes("JOIN customers c")) {
            return { rowCount: 1, rows: [{ id: 5, customer_name: "Test customer", balance: "2400", total_amount: "5000", status: "partial" }] };
        }
        if (statement.includes("AS debt_count")) return { rowCount: 1, rows: [{ debt_count: 1, outstanding_debt: "2400" }] };
        if (statement.includes("FROM products") && statement.includes("stock_quantity <= low_stock_threshold")) {
            return { rowCount: 1, rows: [{ id: 18, name: "Maziwa", stock_quantity: 2, low_stock_threshold: 5, selling_price: "1500" }] };
        }
        if (statement.includes("FROM expenses") && statement.includes("expense_date >= $3::date")) {
            return { rowCount: 1, rows: [{ expense_count: 2, expenses: "800" }] };
        }
        if (statement.includes("FROM customers c") && statement.includes("purchase_total")) {
            return { rowCount: 1, rows: [{ id: 8, name: "Test customer", transactions: 2, purchase_total: "7600", last_purchase: "2026-09-30" }] };
        }
        if (statement.includes("FROM expenses") && statement.includes("GROUP BY category")) {
            return { rowCount: 1, rows: [{ category: "Transport", total: "800", entries: 2 }] };
        }
        if (statement.includes("FROM sales") && statement.includes("GROUP BY created_by")) {
            return { rowCount: 0, rows: [] };
        }
        if (statement.includes("receipt_number")) return { rowCount: 0, rows: [] };
        if (statement.includes("AS inflow")) return { rowCount: 1, rows: [{ inflow: "12500", outflow: "800" }] };
        if (statement.includes("FROM products") && statement.includes("LOWER(name) LIKE")) return { rowCount: 1, rows: [{ id: 18, name: "Maziwa", stock_quantity: 2, low_stock_threshold: 5, buying_price: "900", selling_price: "1500" }] };
        throw new Error(`Unstubbed assistant SQL in test: ${statement.slice(0, 100)}`);
    };

    return {
        query,
        messages,
        conversations,
        queries,
        setZeroSales(value) { zeroSales = value; },
        setMissingCosts(value) { missingCosts = value; },
        setFailSales(value) { failSales = value; }
    };
}

test("Copilot business data is scoped, local-time aware, grounded, remembered and localized", async (t) => {
    const previousQuery = pool.query;
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "test";
    const database = makeDatabaseStub();
    pool.query = database.query;

    try {
        await t.test("routes all requested questions to the relevant database tool", () => {
            const cases = [
                ["Nimeuza kiasi gani leo?", "get_today_sales", "today"],
                ["Nimefanya miamala mingapi leo?", "get_today_sales", "today"],
                ["Ni bidhaa gani imeuza zaidi leo?", "get_top_products", "today"],
                ["Nina bidhaa gani zinazokaribia kuisha?", "get_low_stock_products", null],
                ["Ni wateja gani wana madeni?", "get_customer_debts", null],
                ["Faida ya wiki hii ni kiasi gani?", "get_profit", "week"],
                ["Na jana je?", "get_today_sales", "yesterday"],
                ["Nionyeshe muhtasari wa siku 30", "get_business_summary", "days"],
                ["Show sales across branches", "clarify_branch", null],
                ["How much did I sell today?", "get_today_sales", "today"],
                ["Which product sold most today?", "get_top_products", "today"]
            ];
            for (const [question, name, period] of cases) {
                const route = dataService.selectBusinessQuery(question, [{ role: "user", content: "Nimeuza kiasi gani leo?" }]);
                assert.equal(route.name, name, question);
                if (period) assert.equal(route.args.period, period, question);
            }
        });

        await t.test("uses the business timezone and exact local-day boundaries", async () => {
            const clock = await dataService.getBusinessDateContext(BUSINESS_ID);
            const range = dataService.dateRange(clock, "today");
            assert.deepEqual(range, { timezone: "Africa/Dar_es_Salaam", startDate: "2026-10-01", endDate: "2026-10-02", period: "today", days: 30 });

            const sales = await dataService.readBusinessData("get_today_sales", { period: "today" }, BUSINESS_ID, BRANCH_ID, clock);
            assert.equal(sales.revenue, 12500);
            assert.equal(sales.transactions, 3);
            assert.equal(sales.items_sold, 9);
            assert.equal(sales.top_products[0].name, "Maziwa");
            assert.equal(sales.gross_profit, 3600);
            const salesQueries = database.queries.filter(({ sql }) => sql.includes("FROM sales s") || sql.includes("FROM sale_items si"));
            for (const query of salesQueries) {
                assert.match(query.sql, /business_id = \$1/);
                assert.match(query.sql, /branch_id = \$2/);
                assert.equal(query.values[0], BUSINESS_ID);
                assert.equal(query.values[1], BRANCH_ID);
            }
            assert.ok(salesQueries.some(({ values }) => values[2] === "2026-10-01" && values[3] === "2026-10-02" && values[4] === CLOCK.timezone));
        });

        await t.test("uses business and branch scope for inventory, debt, customer, expense and history reads", async () => {
            const clock = await dataService.getBusinessDateContext(BUSINESS_ID);
            const tools = [
                ["get_low_stock_products", { limit: 10 }],
                ["get_customer_debts", { limit: 10 }],
                ["get_customer", { query: "Test" }],
                ["get_expenses", { period: "today", days: 30 }],
                ["get_sales_history", { period: "today", limit: 10 }],
                ["get_top_products", { period: "today", limit: 10 }]
            ];
            for (const [name, args] of tools) {
                const before = database.queries.length;
                await dataService.readBusinessData(name, args, BUSINESS_ID, BRANCH_ID, clock);
                const statements = database.queries.slice(before);
                assert.ok(statements.length, `${name} must execute SQL`);
                for (const statement of statements) {
                    assert.match(statement.sql, /business_id = \$1/);
                    assert.match(statement.sql, /branch_id = \$2/);
                    assert.equal(statement.values[0], BUSINESS_ID);
                    assert.equal(statement.values[1], BRANCH_ID);
                }
            }
        });

        await t.test("returns an explicit empty-period explanation without unsupported zero totals", async () => {
            database.setZeroSales(true);
            const response = createResponse();
            await controller.answerAssistant(makeRequest("Nimeuza kiasi gani leo?"), response);
            assert.equal(response.statusCode, 200);
            assert.match(response.payload.answer, /Sijaona mauzo yaliyorekodiwa leo kwenye tawi hili\./);
            assert.doesNotMatch(response.payload.answer, /TSh 0/);
            database.setZeroSales(false);
        });

        await t.test("persists branch/user-scoped history and understands yesterday follow-up", async () => {
            const first = createResponse();
            await controller.answerAssistant(makeRequest("Nimeuza kiasi gani leo?"), first);
            const firstId = first.payload.conversationId;
            assert.ok(firstId);

            const second = createResponse();
            await controller.answerAssistant(makeRequest("Na jana je?", "sw", firstId), second);
            assert.equal(second.statusCode, 200);
            assert.match(second.payload.answer, /jana/);
            assert.match(second.payload.answer, /9,000/);

            const historyQuery = database.queries.find(({ sql }) => sql.startsWith("SELECT m.role, m.content, m.metadata"));
            assert.match(historyQuery.sql, /m\.business_id = \$1 AND m\.branch_id = \$2 AND m\.user_id = \$3/);
            assert.deepEqual(historyQuery.values.slice(0, 3), [BUSINESS_ID, BRANCH_ID, USER_ID]);
            const yesterdayQuery = database.queries.find(({ sql, values }) => sql.includes("FROM sales s") && values[2] === "2026-09-30");
            assert.ok(yesterdayQuery, "follow-up must query yesterday in the business timezone");
            assert.ok(database.messages.filter((row) => row.conversationId === firstId).some((row) => row.role === "user" && row.branchId === BRANCH_ID && row.userId === USER_ID));
            assert.ok(database.messages.filter((row) => row.conversationId === firstId).some((row) => row.role === "assistant" && row.businessId === BUSINESS_ID && row.branchId === BRANCH_ID));
        });

        await t.test("asks for branch clarification and saves localized assistant errors", async () => {
            const clarification = createResponse();
            await controller.answerAssistant(makeRequest("Show sales across branches", "en"), clarification);
            assert.equal(clarification.statusCode, 200);
            assert.match(clarification.payload.answer, /currently selected branch/);

            const initial = createResponse();
            await controller.answerAssistant(makeRequest("Nimeuza kiasi gani leo?"), initial);
            const conversation = initial.payload.conversationId;
            database.setFailSales(true);
            const failed = createResponse();
            await controller.answerAssistant(makeRequest("Nimeuza kiasi gani leo?", "sw", conversation), failed);
            database.setFailSales(false);
            assert.equal(failed.statusCode, 500);
            assert.ok(database.messages.some((row) => row.conversationId === conversation
                && row.role === "assistant" && row.content.includes("Sikuweza kuthibitisha data uliyoomba")));
        });

        await t.test("formats the same PostgreSQL result in the selected application language", async () => {
            const sw = createResponse();
            await controller.answerAssistant(makeRequest("Nimeuza kiasi gani leo?", "sw"), sw);
            assert.match(sw.payload.answer, /Mauzo leo/);
            assert.doesNotMatch(sw.payload.answer, /Sales today/);

            const en = createResponse();
            await controller.answerAssistant(makeRequest("How much did I sell today?", "en"), en);
            assert.match(en.payload.answer, /Sales today/);
            assert.doesNotMatch(en.payload.answer, /Mauzo leo/);
        });

        await t.test("does not report profit when stored cost rows are unavailable", async () => {
            database.setMissingCosts(true);
            const clock = await dataService.getBusinessDateContext(BUSINESS_ID);
            const profit = await dataService.readBusinessData("get_profit", { period: "week" }, BUSINESS_ID, BRANCH_ID, clock);
            assert.equal(profit.profit_available, false);
            assert.equal(profit.net_profit, null);
            const answer = dataService.formatBusinessAnswer("get_profit", profit, "sw");
            database.setMissingCosts(false);
            assert.match(answer, /Faida haiwezi kuhesabiwa kwa usahihi kwa sababu hakuna gharama za bidhaa zilizohifadhiwa\./);
            assert.doesNotMatch(answer, /Faida halisi iliyokadiriwa/);
        });

        await t.test("uses correct scoped columns and non-multiplying profit queries", async () => {
            const clock = await dataService.getBusinessDateContext(BUSINESS_ID);
            const profit = await dataService.readBusinessData("get_profit", { period: "week" }, BUSINESS_ID, BRANCH_ID, clock);
            assert.equal(profit.revenue, 12500);
            assert.equal(profit.gross_profit, 3600);
            assert.equal(profit.expenses, 800);
            assert.equal(profit.net_profit, 2800);
            const profitQueries = database.queries.slice(-4);
            assert.ok(profitQueries.some(({ sql }) => sql.includes("FROM expenses") && sql.includes("expense_date >= $3::date")));
            assert.ok(profitQueries.every(({ sql, values }) => !sql.includes("JOIN expenses") && values[0] === BUSINESS_ID && values[1] === BRANCH_ID));

            await dataService.readBusinessData("get_customer", { query: "Test" }, BUSINESS_ID, BRANCH_ID, clock);
            const customerQuery = database.queries.at(-1);
            assert.match(customerQuery.sql, /purchase_total/);
            assert.doesNotMatch(customerQuery.sql, /c\.balance/);
            assert.match(customerQuery.sql, /c\.business_id = \$1 AND c\.branch_id = \$2/);

            await dataService.readBusinessData("get_cashflow", { period: "today" }, BUSINESS_ID, BRANCH_ID, clock);
            assert.match(database.queries.at(-1).sql, /SUM\(s\.total_amount\)/);
        });
    } finally {
        pool.query = previousQuery;
        if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = previousNodeEnv;
    }
});
