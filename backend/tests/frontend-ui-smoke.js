"use strict";

const fs = require("fs");
const path = require("path");

const BASE_URL = String(
    process.env.DUKAFLOW_BASE_URL || "http://localhost:3000"
).replace(/\/$/, "");

const FRONTEND_ROOT = path.resolve(__dirname, "../../frontend");

const PAGES = [
    "/",
    "/login/",
    "/register/",
    "/dashboard-settings/",
    "/products/",
    "/inventory/",
    "/sales/",
    "/customers/",
    "/customer-profile/",
    "/debts/",
    "/expenses/",
    "/suppliers/",
    "/purchases/",
    "/purchase-returns/",
    "/returns/",
    "/supplier-payments/",
    "/cash-register/",
    "/reports/",
    "/users/",
    "/subscriptions/",
    "/assistant/",
    "/whatsapp/",
    "/insights/",
    "/notifications/",
    "/approvals/",
    "/customer-display/",
    "/search/",
    "/account/",
    "/business/",
    "/audit-logs/",
    "/password-reset/",
    "/verify-email/"
];

const PUBLIC = new Set([
    "/login/",
    "/register/",
    "/password-reset/",
    "/verify-email/",
    "/customer-display/"
]);

const seen = new Set();

function fail(message) {
    throw new Error(message);
}

async function get(pathname) {
    const response = await fetch(`${BASE_URL}${pathname}`, {
        headers: { accept: "text/html,application/xhtml+xml" }
    });
    const text = await response.text();
    return { response, text };
}

function pageFile(pathname) {
    if (pathname === "/") return path.join(FRONTEND_ROOT, "index.html");
    return path.join(FRONTEND_ROOT, pathname.replace(/^\//, ""), "index.html");
}

function extractRefs(html) {
    const refs = [];
    const re = /(?:src|href)=["']([^"']+)["']/gi;
    let match;
    while ((match = re.exec(html))) refs.push(match[1]);
    return refs;
}

async function main() {
    let checked = 0;

    for (const pathname of PAGES) {
        const file = pageFile(pathname);
        if (!fs.existsSync(file)) fail(`Missing frontend page file: ${file}`);

        const source = fs.readFileSync(file, "utf8");
        if (!/<html\b/i.test(source)) fail(`${pathname} is missing <html>.`);
        if (!/<meta[^>]+viewport/i.test(source)) fail(`${pathname} is missing viewport meta.`);
        if (!/<title>.*<\/title>/is.test(source)) fail(`${pathname} is missing <title>.`);

        const { response, text } = await get(pathname);
        if (response.status !== 200) fail(`${pathname} returned HTTP ${response.status}.`);
        if (!text.includes("<html")) fail(`${pathname} did not return an HTML document.`);

        const hasAuth = /(?:^|["'\/])(?:\.\/)?js\/auth\.js["']|["']\/js\/auth\.js["']/i.test(text);
        if (!PUBLIC.has(pathname) && !hasAuth) fail(`${pathname} is not wired to frontend auth.js.`);

        for (const ref of extractRefs(text)) {
            if (!ref || ref.startsWith("#") || /^(data:|blob:|mailto:|tel:|javascript:)/i.test(ref)) continue;
            if (/^https?:\/\//i.test(ref)) continue;
            if (seen.has(ref)) continue;
            seen.add(ref);

            let assetUrl;
            try {
                assetUrl = new URL(ref, `${BASE_URL}${pathname}`).toString();
            } catch {
                fail(`Invalid local asset reference on ${pathname}: ${ref}`);
            }

            const assetPath = new URL(assetUrl).pathname;
            const asset = await fetch(assetUrl, { headers: { accept: "*/*" } });
            if (asset.status !== 200) {
                fail(`Asset ${assetPath} referenced by ${pathname} returned HTTP ${asset.status}.`);
            }
        }

        checked += 1;
    }

    console.log(`PASS frontend UI smoke (${checked} HTML pages and ${seen.size} referenced assets served successfully).`);
}

main().catch((error) => {
    console.error(`FAIL frontend UI smoke — ${error.message}`);
    process.exitCode = 1;
});
