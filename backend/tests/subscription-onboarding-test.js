"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");
const { test } = require("node:test");
const pool = require("../db");
const authController = require("../controllers/authController");
const subscriptionController = require("../controllers/subscriptionController");
const productController = require("../controllers/productController");
const { COOKIE_NAME, requireAuth } = require("../middleware/authMiddleware");
const { requireActiveSubscription, requireLimit } = require("../middleware/subscriptionMiddleware");
const { runWithContext } = require("../requestContext");

const previousEnvironment = {
    jwtSecret: process.env.JWT_SECRET,
    requireEmailVerification: process.env.REQUIRE_EMAIL_VERIFICATION,
    googleClientId: process.env.GOOGLE_CLIENT_ID,
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
    googleCallbackUrl: process.env.GOOGLE_CALLBACK_URL
};

process.env.JWT_SECRET ||= crypto.randomBytes(32).toString("hex");
process.env.REQUIRE_EMAIL_VERIFICATION = "0";
process.env.GOOGLE_CLIENT_ID ||= "subscription-test-client";
process.env.GOOGLE_CLIENT_SECRET ||= "subscription-test-secret";
process.env.GOOGLE_CALLBACK_URL ||= "http://localhost/api/auth/google/callback";

function responseRecorder() {
    return {
        statusCode: 200,
        payload: null,
        cookies: {},
        status(code) { this.statusCode = code; return this; },
        json(value) { this.payload = value; return this; },
        cookie(name, value) { this.cookies[name] = value; return this; },
        clearCookie() {},
        redirect(path) { this.redirectPath = path; return this; }
    };
}

async function invokeAuthenticated(token, branchId, callback) {
    const req = {
        cookies: { [COOKIE_NAME]: token, dukaflow_branch: String(branchId) },
        headers: {},
        query: {},
        params: {},
        body: {}
    };
    const res = responseRecorder();
    await requireAuth(req, res, () => callback(req, res));
    return { req, res };
}

async function createProductDuringTrial(token, branchId, productName) {
    return invokeAuthenticated(token, branchId, async (req, res) => {
        req.body = {
            name: productName,
            buyingPrice: 500,
            sellingPrice: 1000,
            stockQuantity: 1,
            lowStockThreshold: 0
        };
        await requireActiveSubscription(req, res, async () => {
            await requireLimit({
                resource: "products",
                limitKey: "product_limit",
                label: "Product"
            })(req, res, async () => productController.createProduct(req, res));
        });
    });
}

test("Starter trial onboarding covers email signup, Google signup, limits, and expiry", async (t) => {
    const createdBusinessIds = [];
    const email = `trial-${crypto.randomUUID()}@dukaflow.test`;
    const businessName = `Trial Test ${crypto.randomUUID().slice(0, 8)}`;
    let savedFetch;

    try {
        await t.test("email signup receives Starter trial and can create a product", async () => {
            const res = responseRecorder();
            await authController.register({
                body: {
                    name: "Trial Owner",
                    businessName,
                    email,
                    password: "TrialPassword!2026"
                }
            }, res);

            assert.equal(res.statusCode, 201);
            const user = res.payload.user;
            assert.ok(user?.business_id);
            createdBusinessIds.push(Number(user.business_id));

            const branchResult = await pool.query(
                `SELECT id FROM branches WHERE business_id = $1 AND code = 'MAIN' AND is_active = TRUE LIMIT 1`,
                [user.business_id]
            );
            assert.equal(branchResult.rowCount, 1);
            const branchId = Number(branchResult.rows[0].id);
            const token = res.cookies[COOKIE_NAME];
            assert.ok(token);

            const current = await invokeAuthenticated(token, branchId, (req, response) =>
                subscriptionController.getCurrent(req, response)
            );
            const subscription = current.res.payload?.subscription;
            assert.equal(subscription?.code, "starter");
            assert.equal(subscription?.status, "trial");
            assert.ok(new Date(subscription.starts_at).getTime() <= Date.now());
            const trialLengthDays = (new Date(subscription.trial_ends_at).getTime() - new Date(subscription.starts_at).getTime()) / 86400000;
            assert.ok(trialLengthDays > 13.99 && trialLengthDays < 14.01);
            assert.ok(subscription.product_limit > 0, "Starter must allow products during the trial.");

            const created = await createProductDuringTrial(token, branchId, `Trial Product ${crypto.randomUUID().slice(0, 8)}`);
            assert.equal(created.res.statusCode, 201);
            assert.ok(created.res.payload?.product?.id);

            const limit = Number(subscription.product_limit);
            if (Number.isInteger(limit) && limit <= 1000) {
                const count = await pool.query(
                    `SELECT COUNT(*)::integer AS total FROM products WHERE business_id = $1`,
                    [user.business_id]
                );
                const remaining = Math.max(0, limit - Number(count.rows[0].total));
                if (remaining) {
                    await runWithContext({ businessId: Number(user.business_id), branchId, userId: Number(user.id) }, () =>
                        pool.query(
                            `INSERT INTO products (business_id, branch_id, name, buying_price, selling_price)
                             SELECT $1, $2, 'Trial limit seed ' || seed_no, 1, 2
                             FROM generate_series(1, $3::integer) AS seed_no`,
                            [user.business_id, branchId, remaining]
                        )
                    );
                }
                const limited = await createProductDuringTrial(token, branchId, `Over Limit ${crypto.randomUUID().slice(0, 8)}`);
                assert.equal(limited.res.statusCode, 403);
                assert.equal(limited.res.payload?.code, "PLAN_LIMIT_REACHED");
            }

            await runWithContext({ businessId: Number(user.business_id), branchId, userId: Number(user.id) }, () =>
                pool.query(
                    `UPDATE subscriptions SET trial_ends_at = NOW() - INTERVAL '1 second'
                     WHERE business_id = $1 AND status = 'trial'`,
                    [user.business_id]
                )
            );
            const expired = await createProductDuringTrial(token, branchId, `Expired Trial ${crypto.randomUUID().slice(0, 8)}`);
            assert.equal(expired.res.statusCode, 403);
            assert.equal(expired.res.payload?.code, "SUBSCRIPTION_REQUIRED");
        });

        await t.test("Google signup business creation receives the same Starter trial", async () => {
            const googleEmail = `google-trial-${crypto.randomUUID()}@dukaflow.test`;
            const googleBusinessName = `Google Trial ${crypto.randomUUID().slice(0, 8)}`;
            const state = jwt.sign({
                mode: "signup",
                businessName: googleBusinessName,
                nonce: crypto.randomBytes(18).toString("hex")
            }, process.env.JWT_SECRET, { expiresIn: "5m" });
            const req = {
                query: { state, code: "test-code" },
                cookies: { dukaflow_google_oauth_state: state }
            };
            const res = responseRecorder();
            savedFetch = global.fetch;
            global.fetch = async (url) => {
                if (String(url).includes("oauth2.googleapis.com/token")) {
                    return { ok: true, json: async () => ({ access_token: "test-access-token" }) };
                }
                if (String(url).includes("openidconnect.googleapis.com/v1/userinfo")) {
                    return { ok: true, json: async () => ({ email: googleEmail, email_verified: true, name: "Google Trial Owner" }) };
                }
                throw new Error("Unexpected external request in Google signup test.");
            };

            try {
                await authController.googleCallback(req, res);
            } finally {
                global.fetch = savedFetch;
                savedFetch = null;
            }

            assert.equal(res.redirectPath, "/");
            const userResult = await pool.query(
                `SELECT business_id FROM users WHERE email = $1`,
                [googleEmail]
            );
            assert.equal(userResult.rowCount, 1);
            const businessId = Number(userResult.rows[0].business_id);
            createdBusinessIds.push(businessId);

            const subscriptionResult = await pool.query(
                `SELECT p.code, s.status, s.starts_at, s.trial_ends_at
                 FROM subscriptions s JOIN subscription_plans p ON p.id = s.plan_id
                 WHERE s.business_id = $1 AND s.status IN ('trial', 'active', 'past_due')`,
                [businessId]
            );
            assert.equal(subscriptionResult.rowCount, 1);
            assert.equal(subscriptionResult.rows[0].code, "starter");
            assert.equal(subscriptionResult.rows[0].status, "trial");
            assert.ok(new Date(subscriptionResult.rows[0].trial_ends_at) > new Date(subscriptionResult.rows[0].starts_at));
        });
    } finally {
        if (savedFetch) global.fetch = savedFetch;
        for (const businessId of createdBusinessIds) {
            await pool.query(`DELETE FROM businesses WHERE id = $1`, [businessId]).catch(() => {});
        }
        await pool.end();
        for (const [key, value] of Object.entries(previousEnvironment)) {
            const envName = {
                jwtSecret: "JWT_SECRET",
                requireEmailVerification: "REQUIRE_EMAIL_VERIFICATION",
                googleClientId: "GOOGLE_CLIENT_ID",
                googleClientSecret: "GOOGLE_CLIENT_SECRET",
                googleCallbackUrl: "GOOGLE_CALLBACK_URL"
            }[key];
            if (value === undefined) delete process.env[envName];
            else process.env[envName] = value;
        }
    }
});
