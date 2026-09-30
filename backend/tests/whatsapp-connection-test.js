"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const names = ["META_APP_ID", "META_APP_SECRET", "META_CONFIG_ID", "META_GRAPH_API_VERSION", "WHATSAPP_TOKEN_ENCRYPTION_KEY"];
const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
process.env.META_APP_ID = "123456789";
process.env.META_APP_SECRET = "test-meta-app-secret";
process.env.META_CONFIG_ID = "987654321";
process.env.META_GRAPH_API_VERSION = "v23.0";
process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY = "ab".repeat(32);

const meta = require("../services/whatsappMeta");
const fs = require("node:fs");
const path = require("node:path");
const { createHmac } = require("node:crypto");
const pool = require("../db");
const agent = require("../services/whatsappAgent");
const agentPath = require.resolve("../services/whatsappAgent");
const originalAgentExports = require.cache[agentPath].exports;
const webhookCalls = [];
require.cache[agentPath].exports = { processIncoming: async (payload) => { webhookCalls.push(payload); } };
const controller = require("../controllers/whatsappController");
const controllerPath = path.resolve(__dirname, "../controllers/whatsappController.js");

function responseRecorder() {
    return {
        statusCode: 200,
        payload: null,
        status(code) { this.statusCode = code; return this; },
        json(value) { this.payload = value; return this; },
        sendStatus(code) { this.statusCode = code; return this; }
    };
}

test("WhatsApp access tokens are encrypted and authenticated at rest", () => {
    const token = "mock-meta-access-token-never-return-this";
    const encrypted = meta.encryptAccessToken(token);
    assert.notEqual(encrypted, token);
    assert.equal(encrypted.includes(token), false);
    assert.equal(meta.decryptAccessToken(encrypted), token);
    assert.throws(() => meta.decryptAccessToken(`${encrypted.slice(0, -2)}xx`));
});

test("Meta configuration exposes only public Embedded Signup settings", () => {
    assert.deepEqual(meta.metaConfiguration(), {
        ready: true,
        appId: "123456789",
        configId: "987654321",
        graphVersion: "v23.0"
    });
});

test("Embedded Signup exchanges and validates the selected WABA and phone", async () => {
    const calls = [];
    const originalFetch = global.fetch;
    global.fetch = async (url, options = {}) => {
        const parsed = new URL(url);
        calls.push({ url: parsed, method: options.method || "GET" });
        if (parsed.pathname.endsWith("/oauth/access_token")) {
            assert.equal(parsed.searchParams.get("code"), "mock-auth-code");
            return Response.json({ access_token: "secret-token" });
        }
        if (parsed.pathname.endsWith("/debug_token")) {
            return Response.json({ data: {
                app_id: "123456789",
                is_valid: true,
                scopes: ["whatsapp_business_management", "whatsapp_business_messaging"]
            } });
        }
        if (parsed.pathname.endsWith("/phone_numbers")) {
            return Response.json({ data: [{ id: "333333333", display_phone_number: "+255700000000", verified_name: "Duka QA" }] });
        }
        if (parsed.pathname.endsWith("/subscribed_apps")) return Response.json({ success: true });
        if (parsed.pathname.endsWith("/111111111")) return Response.json({ id: "111111111", name: "Duka QA Business" });
        throw new Error(`Unexpected mocked Graph request: ${parsed.pathname}`);
    };

    try {
        const result = await meta.exchangeEmbeddedSignupCode({ code: "mock-auth-code", wabaId: "111111111", phoneNumberId: "333333333" });
        assert.deepEqual(result, {
            accessToken: "secret-token",
            wabaId: "111111111",
            phoneNumberId: "333333333",
            displayPhoneNumber: "+255700000000",
            businessName: "Duka QA Business"
        });
        assert.equal(calls.some((call) => call.url.pathname.endsWith("/subscribed_apps") && call.method === "POST"), true);
        assert.equal(calls.some((call) => call.url.pathname.endsWith("/debug_token")), true);
    } finally {
        global.fetch = originalFetch;
    }
});

test("Embedded Signup rejects a phone number not owned by its selected WABA", async () => {
    const originalFetch = global.fetch;
    global.fetch = async (url) => {
        const parsed = new URL(url);
        if (parsed.pathname.endsWith("/oauth/access_token")) return Response.json({ access_token: "secret-token" });
        if (parsed.pathname.endsWith("/debug_token")) return Response.json({ data: { app_id: "123456789", is_valid: true, scopes: ["whatsapp_business_management", "whatsapp_business_messaging"] } });
        if (parsed.pathname.endsWith("/phone_numbers")) return Response.json({ data: [{ id: "444444444" }] });
        if (parsed.pathname.endsWith("/111111111")) return Response.json({ id: "111111111", name: "Duka QA Business" });
        throw new Error("Unexpected mocked Graph request.");
    };

    try {
        await assert.rejects(
            meta.exchangeEmbeddedSignupCode({ code: "mock-auth-code", wabaId: "111111111", phoneNumberId: "333333333" }),
            /selected phone number does not belong/
        );
    } finally {
        global.fetch = originalFetch;
    }
});

test("WhatsApp Meta failures never surface raw provider details", async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => Response.json({ error: { message: "secret-token leaked by Graph" } }, { status: 400 });
    try {
        await assert.rejects(
            meta.exchangeEmbeddedSignupCode({ code: "mock-auth-code", wabaId: "111111111", phoneNumberId: "333333333" }),
            (error) => error.message === "Meta authorization could not be verified." && !error.message.includes("secret-token")
        );
    } finally {
        global.fetch = originalFetch;
    }
});

test("authenticated connection stores credentials for the session tenant and never returns them", async (t) => {
    const originalFetch = global.fetch;
    const originalConnect = pool.connect;
    const statements = [];
    global.fetch = async (url) => {
        const parsed = new URL(url);
        if (parsed.pathname.endsWith("/oauth/access_token")) return Response.json({ access_token: "never-return-this-token" });
        if (parsed.pathname.endsWith("/debug_token")) return Response.json({ data: { app_id: "123456789", is_valid: true, scopes: ["whatsapp_business_management", "whatsapp_business_messaging"] } });
        if (parsed.pathname.endsWith("/phone_numbers")) return Response.json({ data: [{ id: "333333333", display_phone_number: "+255700000000" }] });
        if (parsed.pathname.endsWith("/subscribed_apps")) return Response.json({ success: true });
        if (parsed.pathname.endsWith("/111111111")) return Response.json({ id: "111111111", name: "Business A" });
        throw new Error("Unexpected mocked Meta request.");
    };
    pool.connect = async () => ({
        query: async (sql, values) => {
            statements.push({ sql, values });
            if (/INSERT INTO whatsapp_accounts/.test(sql)) return { rowCount: 1, rows: [{ id: 8, phone_number_id: values[2], business_account_id: values[4], business_name: values[5], status: "connected", is_enabled: true, ai_enabled: false }] };
            return { rowCount: 1, rows: [] };
        },
        release() {}
    });
    t.after(() => { global.fetch = originalFetch; pool.connect = originalConnect; });

    const res = responseRecorder();
    await controller.connect({ user: { businessId: 101, default_branch_id: 12 }, body: { businessId: 202, code: "mock-auth-code", wabaId: "111111111", phoneNumberId: "333333333" } }, res);
    const insert = statements.find((statement) => /INSERT INTO whatsapp_accounts/.test(statement.sql));
    assert.equal(insert.values[0], 101);
    assert.equal(insert.values[1], 12);
    assert.equal(insert.values[6].includes("never-return-this-token"), false);
    assert.equal(res.payload.connected, true);
    assert.equal(JSON.stringify(res.payload).includes("never-return-this-token"), false);
    assert.equal(JSON.stringify(res.payload).includes("access_token"), false);
});

test("settings API never returns encrypted or legacy access tokens", async (t) => {
    const originalQuery = pool.query;
    const encrypted = meta.encryptAccessToken("private-token");
    pool.query = async () => ({ rowCount: 1, rows: [{ id: 5, business_id: 101, phone_number_id: "333333333", access_token_encrypted: encrypted, access_token: null, status: "connected", is_enabled: true, ai_enabled: false }] });
    t.after(() => { pool.query = originalQuery; });
    const res = responseRecorder();
    await controller.settings({ user: { businessId: 101 } }, res);
    assert.equal(res.payload.account.status, "connected");
    assert.equal(Object.hasOwn(res.payload.account, "access_token"), false);
    assert.equal(Object.hasOwn(res.payload.account, "access_token_encrypted"), false);
    assert.equal(JSON.stringify(res.payload).includes("private-token"), false);
});

test("signed webhook resolves its tenant only by Meta phone-number ID", async (t) => {
    const originalQuery = pool.query;
    const originalWebhookQuery = pool.webhookQuery;
    const phoneNumberId = "333333333";
    const rawBody = Buffer.from(JSON.stringify({ business_id: 202, entry: [{ changes: [{ value: { metadata: { phone_number_id: phoneNumberId }, contacts: [{ wa_id: "255700000099", profile: { name: "Customer" } }], messages: [{ id: "wamid.test.1", from: "255700000099", type: "text", text: { body: "Hello" } }] } }] }] }));
    pool.webhookQuery = async (sql, values, scopedPhoneId) => {
        assert.match(sql, /phone_number_id=\$1/);
        assert.equal(values[0], phoneNumberId);
        assert.equal(scopedPhoneId, phoneNumberId);
        return { rowCount: 1, rows: [{ id: 8, business_id: 101, branch_id: 12, phone_number_id: phoneNumberId, access_token_encrypted: meta.encryptAccessToken("mock-token"), status: "connected", is_enabled: true, ai_enabled: true }] };
    };
    pool.query = async (sql) => {
        if (/SELECT \* FROM whatsapp_contacts/.test(sql) || /SELECT id FROM customers/.test(sql) || /SELECT \* FROM whatsapp_conversations/.test(sql) || /SELECT id FROM whatsapp_messages/.test(sql)) return { rowCount: 0, rows: [] };
        if (/INSERT INTO whatsapp_contacts/.test(sql)) return { rowCount: 1, rows: [{ id: 31, business_id: 101, account_id: 8, wa_id: "255700000099" }] };
        if (/INSERT INTO whatsapp_conversations/.test(sql)) return { rowCount: 1, rows: [{ id: 41, business_id: 101, account_id: 8, contact_id: 31, status: "open", ai_enabled: true }] };
        return { rowCount: 1, rows: [] };
    };
    t.after(() => { pool.query = originalQuery; pool.webhookQuery = originalWebhookQuery; });
    webhookCalls.length = 0;
    const signature = `sha256=${createHmac("sha256", process.env.META_APP_SECRET).update(rawBody).digest("hex")}`;
    const res = responseRecorder();
    await controller.webhook({ rawBody, body: JSON.parse(rawBody.toString()), get: () => signature }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(webhookCalls.length, 1);
    assert.equal(webhookCalls[0].account.business_id, 101);
    assert.equal(webhookCalls[0].account.access_token, "mock-token");
});

test("AI-off and human takeover gates prevent automatic replies", async (t) => {
    const originalQuery = pool.query;
    pool.query = async () => { throw new Error("AI gate queried business data unexpectedly."); };
    t.after(() => { pool.query = originalQuery; });
    const enabled = { business_id: 101, is_enabled: true, status: "connected", ai_enabled: true, phone_number_id: "333333333" };
    const conversation = { id: 41, status: "open", ai_enabled: true };
    assert.equal(await agent.processIncoming({ account: { ...enabled, ai_enabled: false }, contact: {}, conversation, body: "hello" }), null);
    assert.equal(await agent.processIncoming({ account: enabled, contact: { human_takeover: true }, conversation, body: "hello" }), null);
    assert.equal(await agent.processIncoming({ account: enabled, contact: {}, conversation: { ...conversation, status: "human" }, body: "hello" }), null);
    assert.equal(await agent.processIncoming({ account: { ...enabled, is_enabled: false }, contact: {}, conversation, body: "hello" }), null);
});

test("disconnect clears only credentials and keeps historical orders and conversations", async (t) => {
    const originalQuery = pool.query;
    const statements = [];
    pool.query = async (sql, values) => {
        statements.push({ sql, values });
        if (/SELECT id,business_id/.test(sql)) return { rowCount: 1, rows: [{ id: 8, business_id: 101, status: "connected", is_enabled: true }] };
        return { rowCount: 1, rows: [] };
    };
    t.after(() => { pool.query = originalQuery; });
    const res = responseRecorder();
    await controller.disconnect({ user: { businessId: 101 } }, res);
    const update = statements.find((statement) => /UPDATE whatsapp_accounts/.test(statement.sql));
    assert.match(update.sql, /access_token_encrypted=NULL/);
    assert.match(update.sql, /ai_enabled=FALSE/);
    assert.equal(update.values[1], 101);
    assert.doesNotMatch(update.sql, /DELETE FROM/);
    assert.doesNotMatch(update.sql, /whatsapp_(messages|conversations|orders)/);
    assert.equal(res.payload.disconnected, true);
});

test("connection-changing routes require authenticated owner or manager roles", () => {
    const routes = fs.readFileSync(path.resolve(__dirname, "../routes/whatsappRoutes.js"), "utf8");
    for (const route of ["/connect/start", "/connect", "/connection/test", "/connection"]) {
        assert.match(routes, new RegExp(`requireAuth,authorizeRoles\\("owner","manager"\\),c\\.${route === "/connect/start" ? "startConnection" : route === "/connect" ? "connect" : route === "/connection/test" ? "testConnection" : "disconnect"}`));
    }
    const controllerSource = fs.readFileSync(controllerPath, "utf8");
    assert.doesNotMatch(controllerSource, /console\.(?:log|error)\([^\n]*access_token/);
});

test.after(() => {
    for (const name of names) {
        if (previous[name] === undefined) delete process.env[name];
        else process.env[name] = previous[name];
    }
});
