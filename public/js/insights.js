"use strict";

const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
const money = (value) => `TSh ${Number(value || 0).toLocaleString("en-TZ", { maximumFractionDigits: 2 })}`;

async function loadInsights() {
    const list = $("#insights-list");
    try {
        const response = await fetch("/api/business-insights", { credentials: "include", headers: { Accept: "application/json" } });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || "Failed to load insights.");

        const snapshot = data.snapshot || {};
        $("#insight-sales").textContent = money(snapshot.sales_7_days);
        const change = Number(snapshot.sales_change_percent || 0);
        $("#insight-change").textContent = `${change > 0 ? "+" : ""}${change}%`;
        $("#insight-stock").textContent = `${Number(snapshot.low_stock || 0)} / ${Number(snapshot.out_of_stock || 0)}`;
        $("#insight-debt").textContent = money(snapshot.outstanding_debt);

        const insights = data.insights || [];
        if (!insights.length) {
            list.innerHTML = '<div class="empty-state">No insights available.</div>';
            return;
        }

        list.innerHTML = insights.map((item) => `
            <article class="insight-card insight-${esc(item.type || "info")}">
                <div>
                    <span class="status-badge">${esc(item.type || "info")}</span>
                    <h3>${esc(item.title)}</h3>
                    <p>${esc(item.message)}</p>
                </div>
                <a class="secondary-button" href="${esc(item.actionUrl || "/")}">Open</a>
            </article>
        `).join("");
    } catch (error) {
        list.innerHTML = `<div class="empty-state">${esc(error.message)}</div>`;
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    await DukaAuth.ready;
    $("#refresh-insights")?.addEventListener("click", loadInsights);
    await loadInsights();
});
