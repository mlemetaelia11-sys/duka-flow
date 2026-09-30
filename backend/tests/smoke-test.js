"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "../..");

function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const output = [];
    for (const entry of entries) {
        if (["node_modules", ".git"].includes(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) output.push(...walk(full));
        else if (entry.isFile() && full.endsWith(".js")) output.push(full);
    }
    return output;
}

const jsFiles = walk(root).filter((file) => !file.includes(`${path.sep}frontend${path.sep}`));
const frontendJs = walk(path.join(root, "frontend", "js"));
const all = [...jsFiles, ...frontendJs];
let failed = false;

for (const file of all) {
    const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
    if (result.status !== 0) {
        failed = true;
        console.error(`FAIL ${path.relative(root, file)}\n${result.stderr}`);
    }
}

const requiredFiles = [
    "backend/server.js",
    "backend/db.js",
    "backend/middleware/authMiddleware.js",
    "backend/middleware/subscriptionMiddleware.js",
    "backend/controllers/businessController.js",
    "backend/controllers/authController.js",
    "backend/controllers/userController.js",
    "backend/controllers/customerController.js",
    "backend/controllers/saleController.js",
    "backend/controllers/debtController.js",
    "backend/controllers/supplierController.js",
    "backend/controllers/purchaseController.js",
    "backend/controllers/reportController.js",
    "backend/controllers/purchaseReturnController.js",
    "backend/controllers/dashboardWidgetController.js",
    "backend/controllers/approvalController.js",
    "backend/controllers/businessInsightsController.js",
    "backend/controllers/assistantController.js",
    "backend/routes/businessRoutes.js",
    "backend/routes/purchaseReturnRoutes.js",
    "backend/routes/dashboardWidgetRoutes.js",
    "backend/routes/approvalRoutes.js",
    "backend/routes/businessInsightsRoutes.js",
    "backend/routes/assistantRoutes.js",
    "backend/migrations/001_business_tenancy.sql",
    "backend/migrations/002_platform_features.sql",
    "backend/migrations/003_completion_features.sql",
    "frontend/js/auth.js",
    "frontend/js/dashboard.js",
    "frontend/js/sales.js",
    "frontend/business/index.html",
    "frontend/dashboard-settings/index.html",
    "frontend/purchase-returns/index.html",
    "frontend/approvals/index.html",
    "frontend/insights/index.html",
    "frontend/assistant/index.html",
    "frontend/customer-display/index.html",
    "frontend/manifest.json",
    "frontend/sw.js"
];

for (const relative of requiredFiles) {
    if (!fs.existsSync(path.join(root, relative))) {
        failed = true;
        console.error(`FAIL missing ${relative}`);
    }
}

const frontendPages = walk(path.join(root, "frontend"))
    .filter((file) => file.endsWith(`${path.sep}index.html`));
for (const file of frontendPages) {
    const relative = path.relative(root, file).replaceAll(path.sep, "/");
    const html = fs.readFileSync(file, "utf8");
    if (!html.includes("<title>")) {
        failed = true;
        console.error(`FAIL missing title ${relative}`);
    }
    const publicPage = ["frontend/login/index.html", "frontend/register/index.html", "frontend/password-reset/index.html", "frontend/customer-display/index.html"].includes(relative);
    if (!publicPage && !html.includes("auth.js")) {
        failed = true;
        console.error(`FAIL protected page missing auth.js ${relative}`);
    }
}

for (const file of [...walk(path.join(root, "frontend")), ...walk(path.join(root, "backend"))]) {
    if (!file.endsWith(".js") || file === __filename || file.includes(`${path.sep}backend${path.sep}tests${path.sep}`)) continue;
    const content = fs.readFileSync(file, "utf8");
    if (/\b(localStorage|sessionStorage)\b/.test(content)) {
        failed = true;
        console.error(`FAIL browser storage reference found in ${path.relative(root, file)}`);
    }
}

const migrationDir = path.join(root, "backend", "migrations");
const migrationNames = fs.readdirSync(migrationDir).filter((name) => /^\d+_.+\.sql$/i.test(name)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
for (let index = 0; index < migrationNames.length; index += 1) {
    const expected = String(index + 1).padStart(3, "0");
    if (!migrationNames[index].startsWith(expected + "_")) {
        failed = true;
        console.error(`FAIL migration numbering/order near ${migrationNames[index]}`);
    }
}

if (failed) {
    process.exit(1);
}

console.log(`PASS: syntax and required-file checks (${all.length} JavaScript files scanned).`);
