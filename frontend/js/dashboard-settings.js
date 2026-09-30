"use strict";

const dashboardWidgetLabels = {
    summary_sales: "Today's Sales",
    summary_profit: "Today's Profit",
    summary_sales_count: "Number of Sales",
    summary_debt: "Outstanding Debts",
    summary_products: "Total Products",
    summary_inventory: "Inventory Value",
    sales_chart: "Sales Overview Chart",
    low_stock: "Low Stock Products",
    recent_transactions: "Recent Transactions"
};

let dashboardPreferences = [];

async function dashboardSettingsRequest(url, options = {}) {
    const response = await fetch(url, {
        credentials: "include",
        headers: {
            Accept: "application/json",
            ...(options.body ? { "Content-Type": "application/json" } : {}),
            ...(options.headers || {})
        },
        ...options
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || "Request failed.");
    return payload;
}

async function loadDashboardPreferences() {
    const list = document.querySelector("#widget-settings-list");
    try {
        const payload = await dashboardSettingsRequest("/api/dashboard-widgets");
        dashboardPreferences = payload.preferences || [];
        list.innerHTML = dashboardPreferences.map((item) => `
            <label class="settings-list-item">
                <span>
                    <strong>${escapeHtml(dashboardWidgetLabels[item.widget_key] || item.widget_key)}</strong>
                    <small>Dashboard widget</small>
                </span>
                <input type="checkbox" data-widget-key="${escapeHtml(item.widget_key)}" ${item.is_visible ? "checked" : ""}>
            </label>
        `).join("");
    } catch (error) {
        list.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
    }
}

async function saveDashboardPreferences() {
    const button = document.querySelector("#save-widget-settings");
    const message = document.querySelector("#widget-settings-message");
    const inputs = [...document.querySelectorAll("[data-widget-key]")];

    button.disabled = true;
    button.textContent = "Saving...";
    message.textContent = "";

    try {
        const preferences = inputs.map((input, index) => ({
            widgetKey: input.dataset.widgetKey,
            position: index,
            isVisible: input.checked
        }));

        await dashboardSettingsRequest("/api/dashboard-widgets", {
            method: "PUT",
            body: JSON.stringify({ preferences })
        });

        message.textContent = "Dashboard preferences saved.";
        message.className = "form-message success";
    } catch (error) {
        message.textContent = error.message;
        message.className = "form-message error";
    } finally {
        button.disabled = false;
        button.textContent = "Save Dashboard";
    }
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

document.addEventListener("DOMContentLoaded", async () => {
    await DukaAuth.ready;
    await loadDashboardPreferences();
    document.querySelector("#save-widget-settings")?.addEventListener("click", saveDashboardPreferences);
});
