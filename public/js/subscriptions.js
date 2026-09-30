"use strict";

const money = (value) => `TSh ${Number(value || 0).toLocaleString("en-TZ", { maximumFractionDigits: 0 })}`;
const esc = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
async function api(url, options = {}) {
    const response = await fetch(url, { credentials: "include", ...options, headers: { Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) } });
    const text = await response.text(); let payload = {}; try { payload = text ? JSON.parse(text) : {}; } catch {}
    if (!response.ok) throw new Error(payload.message || `Request failed (${response.status}).`); return payload;
}
const FEATURE_LABELS = { advanced_reports: "Advanced reports", multiple_users: "Multiple users", audit_logs: "Audit logs", data_export: "Data export", multiple_branches: "Multiple branches", automatic_backups: "Automatic backups" };

function renderPlan(plan, current) {
    const featureRows = Object.entries(FEATURE_LABELS).map(([key,label]) => `<li class="plan-feature ${plan.features?.[key] ? "is-included" : "is-muted"}"><span class="plan-check">${plan.features?.[key] ? "✓" : "—"}</span><span>${label}</span></li>`).join("");
    const isCurrent = current && String(current.code) === String(plan.code);
    const paid = Number(plan.price_monthly) > 0;
    return `<article class="card plan-card ${isCurrent ? "is-current" : ""}">
        <p class="section-label">Plan</p><h2>${esc(plan.name)}</h2>
        <div class="plan-price">${money(plan.price_monthly)}<span>/month</span></div>
        <p class="plan-yearly">${money(plan.price_yearly)} / year</p>
        <div class="plan-limits"><span><strong>${plan.product_limit ?? "∞"}</strong> products</span><span><strong>${plan.customer_limit ?? "∞"}</strong> customers</span><span><strong>${plan.user_limit ?? "∞"}</strong> users</span></div>
        <ul class="plan-features">${featureRows}</ul>
        <div class="plan-footer">${isCurrent ? `<span class="plan-current-badge">Current plan</span>` : paid ? `<button class="primary-button plan-pay" data-plan="${esc(plan.code)}">Upgrade with Pesapal</button>` : `<span class="plan-provider-note">Free plan</span>`}</div>
    </article>`;
}

async function checkout(planCode) {
    const button = document.querySelector(`[data-plan="${CSS.escape(planCode)}"]`); if (button) { button.disabled = true; button.textContent = "Preparing payment..."; }
    try {
        const payload = await api("/api/integrations/pesapal/order", { method: "POST", body: JSON.stringify({ planCode, billing: "monthly" }) });
        if (!payload.payment?.redirectUrl) throw new Error("Pesapal did not return a payment page.");
        window.location.assign(payload.payment.redirectUrl);
    } catch (error) { alert(error.message); if (button) { button.disabled = false; button.textContent = "Upgrade with Pesapal"; } }
}

document.addEventListener("DOMContentLoaded", async () => {
    await DukaAuth.ready;
    const currentElement = document.querySelector("#current-plan"); const plansElement = document.querySelector("#plans");
    const payment = new URLSearchParams(window.location.search).get("payment");
    if (payment) currentElement.insertAdjacentHTML("beforebegin", `<div class="form-message success">Payment returned to DukaFlow. We are syncing the Pesapal transaction.</div>`);
    try {
        const [currentPayload, plansPayload] = await Promise.all([api("/api/subscriptions/current"), api("/api/subscriptions/plans")]);
        const current = currentPayload.subscription || null;
        currentElement.innerHTML = current ? `<div class="current-plan-content"><div><p class="section-label">Current plan</p><h2>${esc(current.name)}</h2><p>Active workspace plan for this business.</p></div><div class="current-plan-meta"><span class="plan-status"><i></i>${esc(current.status)}</span><strong>${money(current.price_monthly)}<small>/month</small></strong></div></div>` : `<div class="empty-state"><strong>No subscription found</strong><span>Choose a plan below.</span></div>`;
        plansElement.innerHTML = (plansPayload.plans || []).map(plan => renderPlan(plan,current)).join("");
        plansElement.querySelectorAll(".plan-pay").forEach(btn => btn.addEventListener("click", () => checkout(btn.dataset.plan)));
    } catch (error) { currentElement.innerHTML = `<div class="empty-state"><strong>Could not load plans</strong><span>${esc(error.message)}</span></div>`; }
});
