"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "../..");
let failed = false;

function read(relative) {
    return fs.readFileSync(path.join(root, relative), "utf8");
}

function fail(message) {
    failed = true;
    console.error(`FAIL ${message}`);
}

function pass(message) {
    console.log(`PASS ${message}`);
}

const businessControllers = [
    "customerController.js",
    "saleController.js",
    "debtController.js",
    "supplierController.js",
    "purchaseController.js",
    "purchaseReturnController.js",
    "dashboardController.js",
    "reportController.js",
    "inventoryController.js",
    "returnController.js",
    "cashRegisterController.js",
    "supplierPaymentController.js",
    "notificationController.js",
    "loyaltyController.js",
    "searchController.js",
    "exportController.js",
    "customerEngagementController.js",
    "businessInsightsController.js",
    "assistantController.js"
];

for (const filename of businessControllers) {
    const relative = `backend/controllers/${filename}`;
    const content = read(relative);
    if (!/businessId|business_id/.test(content)) {
        fail(`${relative} has no tenant context/business_id reference`);
    }
}

const ownerRoutes = [
    "backend/routes/userRoutes.js",
    "backend/routes/businessRoutes.js"
];

for (const relative of ownerRoutes) {
    const content = read(relative);
    if (!/requireAuth/.test(content)) fail(`${relative} is missing requireAuth`);
    if (!/authorizeRoles\("owner"\)/.test(content)) fail(`${relative} is missing owner authorization`);
}

const protectedRoutes = [
    "backend/routes/productRoutes.js",
    "backend/routes/saleRoutes.js",
    "backend/routes/debtRoutes.js",
    "backend/routes/customerRoutes.js",
    "backend/routes/supplierRoutes.js",
    "backend/routes/purchaseRoutes.js",
    "backend/routes/dashboardRoutes.js",
    "backend/routes/reportRoutes.js"
];

for (const relative of protectedRoutes) {
    const content = read(relative);
    if (!/requireAuth/.test(content)) fail(`${relative} is missing requireAuth`);
}

const migrationFiles = fs.readdirSync(path.join(root, "backend/migrations"))
    .filter((name) => /^\d+_.+\.sql$/i.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

if (!migrationFiles.some((name) => name.startsWith("004_"))) {
    fail("business integrity hardening migration 004 is missing");
} else {
    pass("business integrity hardening migration is present");
}

const migration004 = read("backend/migrations/004_integrity_hardening.sql");
if (/ON DELETE SET NULL/.test(migration004)) {
    fail("migration 004 still contains composite ON DELETE SET NULL constraints");
} else {
    pass("migration 004 avoids nullable-tenant composite FK actions");
}

for (const filename of businessControllers) {
    const relative = `backend/controllers/${filename}`;
    const content = read(relative);
    const queries = [...content.matchAll(/(?:pool|client)\.query\(\s*`([\s\S]*?)`/g)].map((m) => m[1]);

    for (const sql of queries) {
        const tables = [...sql.matchAll(/\b(?:FROM|JOIN|UPDATE|INTO|DELETE FROM)\s+([a-z_]+)/gi)]
            .map((m) => m[1].toLowerCase());
        const businessTables = tables.filter((table) => [
            "products", "sales", "sale_items", "customers", "debts", "debt_payments",
            "suppliers", "purchases", "purchase_items", "stock_movements", "sale_returns",
            "sale_return_items", "purchase_returns", "purchase_return_items", "cash_registers",
            "cash_movements", "supplier_payments", "notifications", "loyalty_accounts",
            "loyalty_transactions", "customer_notes", "audit_logs", "subscriptions",
            "dashboard_widget_preferences", "api_idempotency_keys", "approval_requests"
        ].includes(table));

        if (businessTables.length && !/\bbusiness_id\b/i.test(sql)) {
            fail(`${relative} contains an unscoped business query: ${tables.join(", ")}`);
        }
    }
}

const protectedPages = [];
function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.isFile() && entry.name === "index.html") protectedPages.push(full);
    }
}
walk(path.join(root, "frontend"));

for (const file of protectedPages) {
    const relative = path.relative(root, file).replaceAll(path.sep, "/");
    const html = fs.readFileSync(file, "utf8");
    const publicPage = [
        "frontend/login/index.html",
        "frontend/register/index.html",
        "frontend/password-reset/index.html",
        "frontend/customer-display/index.html",
        "frontend/verify-email/index.html"
    ].includes(relative);
    if (!publicPage && !html.includes("auth.js")) {
        fail(`protected page missing auth.js: ${relative}`);
    }
}

const auth = read("frontend/js/auth.js");
for (const required of ["/api/auth/me", "credentials", "/login/", "logout"]) {
    if (!auth.includes(required)) fail(`frontend/js/auth.js missing ${required}`);
}

const forbiddenStorageFiles = [];
function scanForStorage(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (["node_modules", ".git"].includes(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === "tests") continue;
            scanForStorage(full);
        }
        else if (entry.isFile() && /\.(js|html)$/.test(entry.name)) {
            const content = fs.readFileSync(full, "utf8");
            if (/\b(localStorage|sessionStorage)\b/.test(content)) forbiddenStorageFiles.push(path.relative(root, full));
        }
    }
}
scanForStorage(root);
if (forbiddenStorageFiles.length) {
    forbiddenStorageFiles.forEach((file) => fail(`browser storage reference found in ${file}`));
}

if (!failed) {
    pass("static tenant-isolation and auth-guard checks passed");
    process.exit(0);
}

process.exit(1);
