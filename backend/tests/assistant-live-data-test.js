"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");
const dotenv = require("dotenv");
const jwt = require("jsonwebtoken");
const pool = require("../db");
const { requireAuth } = require("../middleware/authMiddleware");
const { answerAssistant } = require("../controllers/assistantController");
const { getBusinessDateContext, readBusinessData, formatBusinessAnswer } = require("../services/assistantBusinessData");

dotenv.config({ path: path.join(__dirname, "..", ".env"), override: true, quiet: true });

const JWT_SECRET = process.env.JWT_SECRET;

test("authenticated local user receives real branch sales and conversation follow-up context", { skip: !JWT_SECRET }, async (t) => {
    const users = await pool.query(
        `SELECT u.id, u.business_id,
                (SELECT br.id FROM branches br
                 WHERE br.business_id = u.business_id AND br.is_active = TRUE
                 ORDER BY (br.code = 'MAIN') DESC, br.id LIMIT 1) AS branch_id
         FROM users u
         WHERE u.is_active = TRUE AND u.role = 'owner'
           AND EXISTS (SELECT 1 FROM branches br WHERE br.business_id = u.business_id AND br.is_active = TRUE)
         ORDER BY u.id LIMIT 1`
    );
    if (!users.rowCount) return t.skip("No active owner with an active branch is available in the configured database.");

    const user = users.rows[0];
    const token = jwt.sign({ sub: String(user.id), businessId: Number(user.business_id) }, JWT_SECRET, { expiresIn: "5m" });
    let conversationId = null;

    async function invoke(question, selectedConversationId = null) {
        const req = {
            headers: { cookie: `dukaflow_session=${token}; dukaflow_branch=${user.branch_id}; dukaflow_language=sw` },
            cookies: { dukaflow_session: token, dukaflow_branch: String(user.branch_id) },
            body: { question, ...(selectedConversationId ? { conversationId: selectedConversationId } : {}) },
            query: {},
            params: {}
        };
        const res = {
            statusCode: 200,
            payload: null,
            status(code) { this.statusCode = code; return this; },
            json(value) { this.payload = value; return this; }
        };
        await requireAuth(req, res, () => answerAssistant(req, res));
        return { req, res };
    }

    try {
        const schema = await pool.query(
            `SELECT table_name, column_name
             FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name IN ('ai_conversations', 'ai_messages')`
        );
        const memoryColumns = new Set(schema.rows.map((row) => `${row.table_name}.${row.column_name}`));
        assert.ok(memoryColumns.has("ai_conversations.summary"), "Assistant summary migration is not applied.");
        assert.ok(memoryColumns.has("ai_messages.metadata"), "Assistant message metadata migration is not applied.");

        const clock = await getBusinessDateContext(Number(user.business_id));
        const realSales = await readBusinessData("get_today_sales", { period: "today" }, Number(user.business_id), Number(user.branch_id), clock);
        const { req, res } = await invoke("Nimeuza kiasi gani leo?");

        assert.equal(res.statusCode, 200);
        assert.equal(res.payload.generatedBy, "DukaFlow PostgreSQL");
        assert.ok(res.payload.conversationId);
        conversationId = Number(res.payload.conversationId);
        assert.ok(res.payload.answer.length > 0);

        if (realSales.has_sales) {
            const expected = formatBusinessAnswer("get_today_sales", realSales, "sw");
            assert.match(res.payload.answer, /Mauzo leo/);
            assert.match(res.payload.answer, new RegExp(`${realSales.transactions} miamala`));
            assert.equal(res.payload.insights?.[0]?.value, `TSh ${Number(realSales.revenue).toLocaleString("en-TZ", { maximumFractionDigits: 2 })}`);
            assert.ok(expected.includes(res.payload.answer.slice(0, 40)) || res.payload.answer.includes("Jumla ya mauzo"));
        } else {
            assert.match(res.payload.answer, /Sijaona mauzo yaliyorekodiwa leo kwenye tawi hili\./);
            assert.doesNotMatch(res.payload.answer, /TSh 0/);
        }

        const followUp = await invoke("Na jana je?", conversationId);
        assert.equal(followUp.res.statusCode, 200);
        assert.match(followUp.res.payload.answer, /jana/);
        assert.equal(followUp.res.payload.conversationId, conversationId);

        const saved = await pool.query(
            `SELECT role, COUNT(*)::integer AS count
             FROM ai_messages
             WHERE business_id = $1 AND branch_id = $2 AND user_id = $3 AND conversation_id = $4
             GROUP BY role`,
            [Number(user.business_id), Number(user.branch_id), Number(user.id), conversationId]
        );
        assert.ok(saved.rows.some((row) => row.role === "user" && row.count >= 2));
        assert.ok(saved.rows.some((row) => row.role === "assistant" && row.count >= 2));
    } finally {
        if (conversationId) {
            await pool.query(
                `DELETE FROM ai_conversations WHERE id = $1 AND business_id = $2 AND branch_id = $3 AND user_id = $4`,
                [conversationId, Number(user.business_id), Number(user.branch_id), Number(user.id)]
            );
        }
        await pool.end();
    }
});
