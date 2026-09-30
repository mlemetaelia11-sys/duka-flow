"use strict";

const esc = (v) => String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
const money = (v) => `TSh ${Number(v || 0).toLocaleString("en-TZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const meta = {
    product: ["Product", "/products/"],
    customer: ["Customer", "/customers/"],
    supplier: ["Supplier", "/suppliers/"],
    sale: ["Sale", "/sales/"],
    purchase: ["Purchase", "/purchases/"]
};

async function search(query) {
    const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { credentials: "include", headers: { Accept: "application/json" } });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || "Search failed.");
    return payload.results || [];
}

function render(results) {
    const container = document.querySelector("#search-results");
    if (!results.length) {
        container.innerHTML = `<article class="card"><div class="empty-state-content"><h3>No results</h3><p>Try another name, phone number, barcode, SKU or reference.</p></div></article>`;
        return;
    }

    const groups = new Map();
    for (const result of results) {
        if (!groups.has(result.type)) groups.set(result.type, []);
        groups.get(result.type).push(result);
    }

    container.innerHTML = [...groups.entries()].map(([type, items]) => {
        const [label, base] = meta[type] || [type, "/"];
        return `<article class="card"><div class="card-header"><div><p class="section-label">${esc(label)}</p><h2>${items.length} result(s)</h2></div></div><div class="search-results-list">${items.map((item) => {
            const title = item.name || item.receipt_number || item.reference_number || `#${item.id}`;
            const subtitle = type === "sale" ? `${money(item.total_amount)} · ${new Date(item.created_at).toLocaleString("en-GB")}`
                : type === "purchase" ? `${money(item.total_amount)} · ${new Date(item.created_at).toLocaleString("en-GB")}`
                : type === "product" ? `${item.sku || "No SKU"} · ${item.barcode || "No barcode"}`
                : (item.phone || "");
            const href = type === "sale" ? `${base}?id=${item.id}` : type === "purchase" ? `${base}?id=${item.id}` : `${base}?id=${item.id}`;
            return `<a class="search-result-item" href="${href}"><strong>${esc(title)}</strong><span>${esc(subtitle)}</span></a>`;
        }).join("")}</div></article>`;
    }).join("");
}

document.querySelector("#global-search-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const query = document.querySelector("#global-search-input").value.trim();
    if (query.length < 2) return;
    const container = document.querySelector("#search-results");
    container.innerHTML = `<article class="card"><p>Searching...</p></article>`;
    try {
        render(await search(query));
    } catch (error) {
        container.innerHTML = `<article class="card"><p class="form-message error">${esc(error.message)}</p></article>`;
    }
});
