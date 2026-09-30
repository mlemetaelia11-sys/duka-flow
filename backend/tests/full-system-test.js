"use strict";

const { spawnSync } = require("child_process");
const bcrypt = require("bcryptjs");
const pool = require("../db");

const BASE_URL = String(
    process.env.DUKAFLOW_BASE_URL || "http://localhost:3000"
).replace(/\/$/, "");
const QA_EMAIL = String(process.env.DUKAFLOW_QA_EMAIL || "").trim().toLowerCase();
const QA_PASSWORD = String(process.env.DUKAFLOW_QA_PASSWORD || "");
const TEST_EMAIL = process.env.PROVIDER_TEST_EMAIL || "";
const FCM_TOKEN = process.env.PROVIDER_TEST_FCM_TOKEN || "";
const RUN_PESAPAL_ORDER = process.env.DUKAFLOW_RUN_PESAPAL_ORDER === "1";

const results = [];

function record(name, status, detail = "") {
    results.push({ name, status, detail });
    const tag = status === "PASS" ? "PASS" : status === "SKIP" ? "SKIP" : "FAIL";
    console.log(`${tag.padEnd(5)} ${name}${detail ? ` — ${detail}` : ""}`);
}

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

class QaSkipError extends Error {
    constructor(message) {
        super(message);
        this.qaSkip = true;
    }
}

class CookieJar {
    constructor() {
        this.cookies = new Map();
    }

    absorb(response) {
        const raw = typeof response.headers.getSetCookie === "function"
            ? response.headers.getSetCookie()
            : (response.headers.get("set-cookie") || "").split(/,(?=[^;]+=)/);

        for (const line of raw || []) {
            const first = String(line).split(";", 1)[0];
            const idx = first.indexOf("=");
            if (idx <= 0) continue;
            const name = first.slice(0, idx).trim();
            const value = first.slice(idx + 1).trim();
            if (!value) this.cookies.delete(name);
            else this.cookies.set(name, value);
        }
    }

    header() {
        return Array.from(this.cookies.entries())
            .map(([k, v]) => `${k}=${v}`)
            .join("; ");
    }
}

async function http(jar, path, options = {}) {
    const headers = new Headers(options.headers || {});
    const cookie = jar?.header();
    if (cookie) headers.set("cookie", cookie);

    let body = options.body;
    if (body !== undefined && body !== null && typeof body !== "string") {
        headers.set("content-type", "application/json");
        body = JSON.stringify(body);
    }

    const response = await fetch(`${BASE_URL}${path}`, {
        ...options,
        headers,
        body
    });

    jar?.absorb(response);

    const contentType = response.headers.get("content-type") || "";
    let data;
    if (contentType.includes("application/json")) {
        data = await response.json().catch(() => ({}));
    } else {
        data = await response.text();
    }

    return { response, data };
}

async function expect(jar, method, path, expected, body, options = {}) {
    const { response, data } = await http(jar, path, {
        method,
        body,
        headers: options.headers,
        redirect: options.redirect
    });

    if (!expected.includes(response.status)) {
        const printable = typeof data === "string" ? data : JSON.stringify(data);
        throw new Error(`${method} ${path} returned ${response.status}: ${printable?.slice(0, 500)}`);
    }

    return { response, data };
}

function runNodeTest(testFile) {
    const backendRoot = __dirname + "/..";
    const testPath = require("path").resolve(backendRoot, testFile);
    const r = spawnSync(process.execPath, [testPath], {
        cwd: backendRoot,
        stdio: "inherit",
        shell: false,
        env: process.env
    });

    if (r.error) throw r.error;

    return {
        passed: r.status === 0,
        status: r.status
    };
}

async function main() {
    console.log("\n================ DUKAFLOW FULL SYSTEM QA ================\n");

    // Automated suites already in the project.
    for (const [label, testFile] of [
        ["Frontend UI smoke", "tests/frontend-ui-smoke.js"],
        ["Static + tenant regression", "tests/smoke-test.js"],
        ["Tenant static regression", "tests/tenant-static-test.js"],
        ["WhatsApp connection security", "tests/whatsapp-connection-test.js"],
        ["Production QA", "tests/production-qa.js"],
        ["Database tenant QA", "tests/tenant-db-test.js"],
        ["Provider integrations", "tests/provider-integration-test.js"]
    ]) {
        try {
            const run = runNodeTest(testFile);
            if (run.passed) record(label, "PASS");
            else record(label, "FAIL", `Test exited with code ${String(run.status)}.`);
        } catch (e) {
            record(label, "FAIL", e.message);
        }
    }

    if (!QA_EMAIL || !QA_PASSWORD) {
        record("Authenticated business-flow QA", "FAIL", "Set DUKAFLOW_QA_EMAIL and DUKAFLOW_QA_PASSWORD in the test shell.");
        printSummary();
        process.exitCode = 1;
        return;
    }

    const jar = new CookieJar();
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    let businessId = null;
    let productId = null;
    let customerId = null;
    let supplierId = null;
    let debtId = null;
    let managerId = null;
    let cashierId = null;

    async function test(name, fn) {
        try {
            await fn();
            record(name, "PASS");
        } catch (e) {
            if (e?.qaSkip) record(name, "SKIP", e.message);
            else record(name, "FAIL", e.message);
        }
    }

    await test("API health", async () => {
        const { data } = await expect(new CookieJar(), "GET", "/api/health", [200]);
        assert(data.status === "ok", "API health is not ok.");
        assert(data.database === "connected", "Database is not connected.");
    });

    await test("Owner login + session cookie", async () => {
        const out = await expect(jar, "POST", "/api/auth/login", [200], {
            email: QA_EMAIL,
            password: QA_PASSWORD
        });
        assert(out.data?.user?.role === "owner", "QA account is not owner role.");
        assert(jar.cookies.has("dukaflow_session"), "Session cookie was not set.");
    });

    await test("/api/auth/me", async () => {
        const out = await expect(jar, "GET", "/api/auth/me", [200]);
        businessId = Number(out.data?.user?.businessId || out.data?.user?.business_id);
        assert(businessId > 0, "Business context missing from /me.");
    });

    await test("Current branch", async () => {
        const out = await expect(jar, "GET", "/api/branches/current", [200]);
        assert(out.data?.branch?.id, "No current branch returned.");
        assert(out.data?.branch?.is_active === true, "Current branch is not active.");
    });

    await test("Dashboard summary", async () => {
        const out = await expect(jar, "GET", "/api/dashboard/summary", [200]);
        assert(out.data && typeof out.data === "object", "Dashboard summary is not an object.");
    });

    await test("Dashboard sales overview", async () => {
        const out = await expect(jar, "GET", "/api/dashboard/sales-overview", [200]);
        assert(out.data && typeof out.data === "object", "Sales overview is not an object.");
    });

    await test("Products list", async () => {
        const out = await expect(jar, "GET", "/api/products", [200]);
        assert(Array.isArray(out.data?.products), "Products response shape is invalid.");
    });

    await test("Create product", async () => {
        const out = await expect(jar, "POST", "/api/products", [201], {
            name: `DukaFlow Full QA ${suffix}`,
            buyingPrice: 650,
            sellingPrice: 1000,
            stockQuantity: 20,
            lowStockThreshold: 5,
            sku: `FULLQA-${suffix}`,
            barcode: `FULLQA-BAR-${suffix}`,
            category: "QA",
            unit: "pcs"
        });
        productId = Number(out.data?.product?.id);
        assert(productId > 0, "Product ID missing.");
        assert(Number(out.data.product.stock_quantity) === 20, "Initial stock is wrong.");
    });

    await test("Get product", async () => {
        const out = await expect(jar, "GET", `/api/products/${productId}`, [200]);
        assert(Number(out.data?.product?.id) === productId, "Wrong product returned.");
    });

    await test("Update product + stock movement", async () => {
        const out = await expect(jar, "PUT", `/api/products/${productId}`, [200], {
            name: `DukaFlow Full QA ${suffix} Updated`,
            buyingPrice: 700,
            sellingPrice: 1050,
            stockQuantity: 19,
            lowStockThreshold: 5,
            sku: `FULLQA-${suffix}`,
            barcode: `FULLQA-BAR-${suffix}`,
            category: "QA",
            unit: "pcs"
        });
        assert(Number(out.data?.product?.stock_quantity) === 19, "Updated stock is wrong.");
    });

    let cashSaleId = null;
    await test("Cash sale + stock deduction", async () => {
        const key = `FULLQA-SALE-${suffix}`;
        const out = await expect(jar, "POST", "/api/sales", [201], {
            items: [{ productId, quantity: 1 }],
            discount: 0,
            paymentMethod: "cash",
            amountPaid: 1050
        }, { headers: { "X-Idempotency-Key": key } });
        cashSaleId = Number(out.data?.sale?.id);
        assert(cashSaleId > 0, "Sale ID missing.");
        assert(Number(out.data.sale.total_amount) === 1050, "Sale total is wrong.");
    });

    await test("Verify stock after sale", async () => {
        const out = await expect(jar, "GET", `/api/products/${productId}`, [200]);
        assert(Number(out.data?.product?.stock_quantity) === 18, "Stock did not decrease to 18.");
    });

    await test("Sale history + detail", async () => {
        const list = await expect(jar, "GET", "/api/sales?limit=25", [200]);
        assert(Array.isArray(list.data?.sales), "Sales list shape is invalid.");
        const detail = await expect(jar, "GET", `/api/sales/${cashSaleId}`, [200]);
        assert(Array.isArray(detail.data?.items) && detail.data.items.length === 1, "Sale items missing.");
    });

    await test("Idempotent duplicate sale", async () => {
        const key = `FULLQA-SALE-${suffix}`;
        const out = await expect(jar, "POST", "/api/sales", [201], {
            items: [{ productId, quantity: 1 }],
            discount: 0,
            paymentMethod: "cash",
            amountPaid: 1050
        }, { headers: { "X-Idempotency-Key": key } });
        assert(Number(out.data?.sale?.id) === cashSaleId, "Duplicate request created a second sale.");
    });

    await test("Create customer", async () => {
        const out = await expect(jar, "POST", "/api/customers", [201], {
            name: `Full QA Customer ${suffix}`,
            phone: `0712${String(Date.now()).slice(-6)}`,
            email: `fullqa-${suffix}@dukaflow.test`,
            address: "Arusha"
        });
        customerId = Number(out.data?.customer?.id);
        assert(customerId > 0, "Customer ID missing.");
    });

    await test("Customer history before credit sale", async () => {
        const out = await expect(jar, "GET", `/api/customers/${customerId}/history`, [200]);
        assert(Array.isArray(out.data?.sales), "Customer history sales missing.");
        assert(Array.isArray(out.data?.debts), "Customer history debts missing.");
    });

    await test("Credit sale + debt creation", async () => {
        const key = `FULLQA-CREDIT-${suffix}`;
        const out = await expect(jar, "POST", "/api/sales", [201], {
            items: [{ productId, quantity: 1 }],
            discount: 0,
            paymentMethod: "credit",
            amountPaid: 0,
            customerId
        }, { headers: { "X-Idempotency-Key": key } });
        assert(Number(out.data?.sale?.total_amount) === 1050, "Credit sale total is wrong.");
    });

    await test("Debt list", async () => {
        const out = await expect(jar, "GET", `/api/debts/customer/${customerId}`, [200]);
        assert(Array.isArray(out.data?.debts), "Debt list shape is invalid.");
        debtId = Number(out.data.debts[0]?.id);
        assert(debtId > 0, "Debt ID missing.");
        assert(Number(out.data.debts[0].balance) === 1050, "Initial debt balance is wrong.");
    });

    await test("Debt payment partial", async () => {
        const out = await expect(jar, "POST", `/api/debts/${debtId}/payments`, [201], {
            amount: 400,
            paymentMethod: "cash",
            notes: "Full QA partial payment",
            reference: `FULLQA-PAY-${suffix}`
        });
        assert(Number(out.data?.debt?.balance) === 650, "Partial balance should be 650.");
        assert(out.data?.debt?.status === "partial", "Debt should be partial.");
    });

    await test("Debt payment completion", async () => {
        const out = await expect(jar, "POST", `/api/debts/${debtId}/payments`, [201], {
            amount: 650,
            paymentMethod: "cash",
            notes: "Full QA final payment",
            reference: `FULLQA-PAY-FINAL-${suffix}`
        });
        assert(Number(out.data?.debt?.balance) === 0, "Debt balance should be zero.");
        assert(out.data?.debt?.status === "paid", "Debt should be paid.");
    });

    await test("Debt payment history", async () => {
        const out = await expect(jar, "GET", `/api/debts/${debtId}/payments`, [200]);
        assert(Array.isArray(out.data?.payments), "Payment history shape is invalid.");
        assert(out.data.payments.length >= 2, "Expected two debt payments.");
    });

    let expenseId = null;
    await test("Create expense", async () => {
        const out = await expect(jar, "POST", "/api/expenses", [201], {
            category: "QA",
            description: `Full QA expense ${suffix}`,
            amount: 12500,
            paymentMethod: "cash"
        });
        expenseId = Number(out.data?.expense?.id);
        assert(expenseId > 0, "Expense ID missing.");
    });

    await test("Expenses list", async () => {
        const out = await expect(jar, "GET", "/api/expenses?days=30", [200]);
        assert(Array.isArray(out.data?.expenses), "Expenses list shape is invalid.");
        assert(Number(out.data.total) >= 12500, "Expense total did not include QA expense.");
    });

    await test("Create supplier", async () => {
        const out = await expect(jar, "POST", "/api/suppliers", [201], {
            name: `Full QA Supplier ${suffix}`,
            phone: "0712345000",
            email: `supplier-${suffix}@dukaflow.test`,
            address: "Arusha"
        });
        supplierId = Number(out.data?.supplier?.id);
        assert(supplierId > 0, "Supplier ID missing.");
    });

    await test("Supplier list", async () => {
        const out = await expect(jar, "GET", "/api/suppliers", [200]);
        assert(Array.isArray(out.data?.suppliers), "Supplier list shape is invalid.");
    });

    await test("Create purchase + stock increase", async () => {
        const out = await expect(jar, "POST", "/api/purchases", [201], {
            supplierId,
            items: [{ productId, quantity: 5, unitCost: 650 }],
            discount: 0,
            amountPaid: 3250,
            paymentMethod: "cash"
        });
        assert(Number(out.data?.purchase?.total_amount) === 3250, "Purchase total is wrong.");
    });

    await test("Verify stock after purchase", async () => {
        const out = await expect(jar, "GET", `/api/products/${productId}`, [200]);
        assert(Number(out.data?.product?.stock_quantity) === 22, "Stock should be 22 after purchase.");
    });

    await test("Inventory summary", async () => {
        const out = await expect(jar, "GET", "/api/inventory/summary", [200]);
        assert(out.data && typeof out.data === "object", "Inventory summary is invalid.");
    });

    await test("Report summary reflects sales + expenses", async () => {
        const out = await expect(jar, "GET", "/api/reports/summary", [200]);
        assert(Number(out.data?.summary?.salesCount) >= 2, "Report did not count QA sales.");
        assert(Number(out.data?.summary?.expenses) >= 12500, "Report did not include QA expense.");
    });

    await test("Owner user management", async () => {
        const out = await expect(jar, "GET", "/api/users", [200]);
        assert(Array.isArray(out.data), "Users endpoint should return an array.");
    });

    let freeUserLimitObserved = false;

    async function seedRoleFixture({ name, email, password, role }) {
        assert(businessId > 0, "Business ID is required before seeding role fixtures.");

        const existing = await pool.query(
            `SELECT id FROM users WHERE business_id = $1 AND email = $2 LIMIT 1`,
            [businessId, email]
        );

        if (existing.rowCount) return Number(existing.rows[0].id);

        const passwordHash = await bcrypt.hash(password, 12);
        const result = await pool.query(
            `
            INSERT INTO users (business_id, name, email, password_hash, role, is_active)
            VALUES ($1, $2, $3, $4, $5, TRUE)
            RETURNING id
            `,
            [businessId, name, email, passwordHash, role]
        );

        return Number(result.rows[0].id);
    }

    async function createRoleUserOrSeed({ label, name, email, password, role }) {
        const { response, data } = await http(jar, "/api/users", {
            method: "POST",
            body: { name, email, password, role }
        });

        if (response.status === 201) {
            const id = Number(data?.id);
            assert(id > 0, `${label} ID missing.`);
            return { id, apiCreated: true };
        }

        const message = String(data?.message || "");
        if (response.status === 403 && /user limit reached/i.test(message)) {
            freeUserLimitObserved = true;
            const id = await seedRoleFixture({ name, email, password, role });
            return {
                id,
                apiCreated: false,
                limited: true
            };
        }

        const printable = typeof data === "string" ? data : JSON.stringify(data);
        throw new Error(`POST /api/users returned ${response.status}: ${printable?.slice(0, 500)}`);
    }

    await test("Create manager", async () => {
        const created = await createRoleUserOrSeed({
            label: "Manager",
            name: `Full QA Manager ${suffix}`,
            email: `manager-${suffix}@dukaflow.test`,
            password: "FullQAmanager!2026",
            role: "manager"
        });
        managerId = created.id;

        if (!created.apiCreated) {
            throw new QaSkipError(
                "Free plan user limit blocked API creation; seeded an isolated QA manager fixture for role tests."
            );
        }
    });

    await test("Create cashier", async () => {
        const created = await createRoleUserOrSeed({
            label: "Cashier",
            name: `Full QA Cashier ${suffix}`,
            email: `cashier-${suffix}@dukaflow.test`,
            password: "FullQAcashier!2026",
            role: "cashier"
        });
        cashierId = created.id;

        if (!created.apiCreated) {
            throw new QaSkipError(
                "Free plan user limit blocked API creation; seeded an isolated QA cashier fixture for role tests."
            );
        }
    });

    if (freeUserLimitObserved) {
        record(
            "Free-plan user-limit enforcement",
            "PASS",
            "API correctly blocked additional users at the configured Free-plan limit."
        );
    }

    async function roleAccessTest(userEmail, userPassword, label) {
        const roleJar = new CookieJar();
        await expect(roleJar, "POST", "/api/auth/login", [200], {
            email: userEmail,
            password: userPassword
        });
        await expect(roleJar, "GET", "/api/products", [200]);
        await expect(roleJar, "GET", "/api/sales?limit=25", [200]);
        try {
            await expect(roleJar, "GET", "/api/users", [403]);
        } catch (e) {
            throw new Error(`${label} incorrectly accessed user management: ${e.message}`);
        }
    }

    await test("Manager role restrictions", async () => {
        await roleAccessTest(`manager-${suffix}@dukaflow.test`, "FullQAmanager!2026", "Manager");
    });

    await test("Cashier role restrictions", async () => {
        await roleAccessTest(`cashier-${suffix}@dukaflow.test`, "FullQAcashier!2026", "Cashier");
    });

    await test("Integration status", async () => {
        const out = await expect(jar, "GET", "/api/integrations/status", [200]);
        assert(out.data?.providers, "Provider status missing.");
    });

    await test("Subscription plans", async () => {
        const out = await expect(new CookieJar(), "GET", "/api/subscriptions/plans", [200]);
        assert(Array.isArray(out.data?.plans), "Subscription plans shape is invalid.");
    });

    await test("Current subscription", async () => {
        const out = await expect(jar, "GET", "/api/subscriptions/current", [200]);
        assert(out.data && typeof out.data === "object", "Current subscription response is invalid.");
    });

    await test("Google OAuth configuration/start", async () => {
        const out = await expect(new CookieJar(), "GET", "/api/auth/google?mode=login", [302], undefined, { redirect: "manual" });
        assert(String(out.response.headers.get("location") || "").startsWith("https://accounts.google.com/"), "Google OAuth redirect missing.");
    });

    await test("R2 presigned upload", async () => {
        const out = await expect(jar, "POST", "/api/integrations/storage/presign", [200], {
            filename: `qa-${suffix}.txt`,
            contentType: "text/plain",
            folder: "products"
        });
        assert(out.data?.key?.startsWith("businesses/"), "R2 key was not tenant scoped.");
        assert(out.data?.uploadUrl, "R2 upload URL missing.");
    });

    await test("DukaFlow Copilot (Groq)", async () => {
        const out = await expect(jar, "POST", "/api/assistant", [200], {
            question: "Nimeuza kiasi gani leo?"
        });
        assert(out.data?.answer, "Copilot returned no answer.");
        assert(String(out.data?.generatedBy || "").toLowerCase().includes("groq"), "Copilot did not report Groq/tool mode.");
    });

    if (TEST_EMAIL) {
        await test("Resend delivery", async () => {
            const out = await expect(jar, "POST", "/api/integrations/email/test", [200], { to: TEST_EMAIL });
            assert(out.data?.ok === true, "Resend test did not return ok=true.");
        });
    } else {
        record("Resend delivery", "SKIP", "Set PROVIDER_TEST_EMAIL to intentionally send a live test email.");
    }

    if (FCM_TOKEN) {
        await test("Firebase FCM delivery", async () => {
            const out = await expect(jar, "POST", "/api/integrations/notifications/test", [200], { token: FCM_TOKEN });
            assert(out.data?.ok === true, "FCM test did not return ok=true.");
        });
    } else {
        record("Firebase FCM delivery", "SKIP", "Set PROVIDER_TEST_FCM_TOKEN to intentionally send a live push.");
    }

    if (RUN_PESAPAL_ORDER) {
        await test("Pesapal subscription order", async () => {
            const out = await expect(jar, "POST", "/api/integrations/pesapal/order", [200], {
                planCode: process.env.DUKAFLOW_PESAPAL_PLAN_CODE || "starter",
                billing: "monthly"
            });
            assert(out.data?.payment?.redirectUrl, "Pesapal redirect URL missing.");
        });
    } else {
        record("Pesapal subscription order", "SKIP", "Set DUKAFLOW_RUN_PESAPAL_ORDER=1 to create a live/sandbox subscription order.");
    }

    await test("Delete QA manager", async () => {
        await expect(jar, "DELETE", `/api/users/${managerId}`, [200]);
    });

    await test("Delete QA cashier", async () => {
        await expect(jar, "DELETE", `/api/users/${cashierId}`, [200]);
    });

    await test("Unauthenticated protected API", async () => {
        await expect(new CookieJar(), "GET", "/api/products", [401]);
        await expect(new CookieJar(), "GET", "/api/dashboard/summary", [401]);
        await expect(new CookieJar(), "GET", "/api/users", [401]);
    });

    await test("Logout + session invalidation", async () => {
        await expect(jar, "POST", "/api/auth/logout", [200]);
        await expect(jar, "GET", "/api/auth/me", [401]);
    });

    try {
        await pool.end();
    } catch (_) {
        // Do not turn an already-completed QA suite into a failure because of pool cleanup.
    }

    printSummary();

    const failed = results.filter((r) => r.status === "FAIL").length;
    process.exitCode = failed ? 1 : 0;
}

function printSummary() {
    const counts = results.reduce((acc, item) => {
        acc[item.status] = (acc[item.status] || 0) + 1;
        return acc;
    }, {});

    console.log("\n================ DUKAFLOW FULL QA SUMMARY ================");
    console.log(`PASS: ${counts.PASS || 0}`);
    console.log(`SKIP: ${counts.SKIP || 0}`);
    console.log(`FAIL: ${counts.FAIL || 0}`);
    console.log("===========================================================\n");
}

main().catch((error) => {
    console.error("FULL QA FATAL ERROR:", error);
    process.exitCode = 1;
});
