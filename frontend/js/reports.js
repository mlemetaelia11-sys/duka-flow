"use strict";

let reportData = null;

const money = (value) => `TSh ${Number(value || 0).toLocaleString("en-TZ", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
})}`;

const escapeHtml = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

function setText(selector, value) {
    const element = document.querySelector(selector);
    if (element) element.textContent = value;
}

function setMessage(selector, message, type = "") {
    const element = document.querySelector(selector);
    if (!element) return;
    element.textContent = message;
    element.className = `form-message ${type}`.trim();
}

function paymentLabel(method) {
    const labels = {
        cash: "Cash",
        mobile_money: "Mobile Money",
        bank: "Bank",
        credit: "Credit"
    };
    return labels[method] || String(method || "Other");
}

function formatDate(value) {
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return String(value || "");
    return date.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    });
}

function setDefaultDates() {
    const startInput = document.querySelector("#report-start-date");
    const endInput = document.querySelector("#report-end-date");
    const today = new Date();
    const end = today.toISOString().split("T")[0];
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - 29);
    const start = startDate.toISOString().split("T")[0];

    if (startInput && !startInput.value) startInput.value = start;
    if (endInput && !endInput.value) endInput.value = end;
}

async function api(url, options = {}) {
    const response = await fetch(url, {
        credentials: "include",
        ...options,
        headers: {
            Accept: "application/json",
            ...(options.body ? { "Content-Type": "application/json" } : {}),
            ...(options.headers || {})
        }
    });

    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json")
        ? await response.json()
        : await response.text();

    if (!response.ok) {
        const message = typeof payload === "object"
            ? payload.message
            : payload;
        throw new Error(message || `Request failed (${response.status}).`);
    }

    return payload;
}

async function loadReport() {
    const startDate = document.querySelector("#report-start-date")?.value;
    const endDate = document.querySelector("#report-end-date")?.value;
    const button = document.querySelector("#generate-report-btn");

    if (!startDate || !endDate) {
        setMessage("#report-message", "Select both report dates.", "error");
        return;
    }

    if (startDate > endDate) {
        setMessage("#report-message", "Start date cannot be after end date.", "error");
        return;
    }

    button?.setAttribute("disabled", "disabled");
    if (button) button.textContent = "Generating...";
    setMessage("#report-message", "");

    try {
        reportData = await api(
            `/api/reports/summary?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`
        );
        renderAll();
        await loadStaffReport();
        setMessage("#report-message", "Report updated successfully.", "success");
    } catch (error) {
        console.error("Reports error:", error);
        setMessage("#report-message", error.message || "Failed to load report.", "error");
    } finally {
        if (button) {
            button.removeAttribute("disabled");
            button.textContent = "Generate";
        }
    }
}

async function loadStaffReport() {
    const body = document.querySelector("#report-staff-body");
    if (!body) return;

    try {
        const payload = await api("/api/reports/staff");
        const staff = payload.staff || [];
        if (!staff.length) {
            body.innerHTML = '<tr><td colspan="5">No staff sales found.</td></tr>';
            return;
        }

        body.innerHTML = staff.map((row) => `
            <tr>
                <td><strong>${escapeHtml(row.name)}</strong></td>
                <td>${escapeHtml(row.role)}</td>
                <td>${Number(row.sale_count || 0).toLocaleString("en-TZ")}</td>
                <td>${money(row.revenue)}</td>
                <td>${money(row.profit)}</td>
            </tr>
        `).join("");
    } catch (error) {
        if (error.message.toLowerCase().includes("feature")) {
            body.innerHTML = '<tr><td colspan="5">Staff performance is available on an eligible plan.</td></tr>';
        } else if (error.message.toLowerCase().includes("forbidden")) {
            body.innerHTML = '<tr><td colspan="5">You do not have permission to view staff performance.</td></tr>';
        } else {
            body.innerHTML = `<tr><td colspan="5">${escapeHtml(error.message)}</td></tr>`;
        }
    }
}

function renderAll() {
    renderSummary();
    renderDailySales();
    renderTopProducts();
    renderPaymentMethods();
    renderInventory();
    renderLowStock();
}

function renderSummary() {
    const summary = reportData?.summary || {};
    setText("#report-revenue", money(summary.revenue));
    setText("#report-profit", money(summary.profit));
    setText("#report-sales-count", Number(summary.salesCount || 0).toLocaleString("en-TZ"));
    setText("#report-items-sold", Number(summary.itemsSold || 0).toLocaleString("en-TZ"));
    setText("#report-average-sale", money(summary.averageSale));
    setText("#report-debt", money(reportData?.debts?.outstanding));
}

function renderDailySales() {
    const body = document.querySelector("#report-daily-body");
    const rows = reportData?.daily || [];
    if (!body) return;

    if (!rows.length) {
        body.innerHTML = '<tr><td colspan="4">No sales found for this period.</td></tr>';
        return;
    }

    body.innerHTML = rows.map((row) => `
        <tr>
            <td>${formatDate(row.report_date)}</td>
            <td>${money(row.revenue)}</td>
            <td>${money(row.profit)}</td>
            <td>${Number(row.sales_count || 0).toLocaleString("en-TZ")}</td>
        </tr>
    `).join("");
}

function renderTopProducts() {
    const body = document.querySelector("#report-products-body");
    const rows = reportData?.topProducts || [];
    if (!body) return;

    if (!rows.length) {
        body.innerHTML = '<tr><td colspan="4">No product sales found.</td></tr>';
        return;
    }

    body.innerHTML = rows.map((row) => `
        <tr>
            <td><strong>${escapeHtml(row.product_name)}</strong></td>
            <td>${Number(row.quantity_sold || 0).toLocaleString("en-TZ")}</td>
            <td>${money(row.revenue)}</td>
            <td>${money(row.profit)}</td>
        </tr>
    `).join("");
}

function renderPaymentMethods() {
    const body = document.querySelector("#report-payments-body");
    const rows = reportData?.paymentMethods || [];
    if (!body) return;

    if (!rows.length) {
        body.innerHTML = '<tr><td colspan="3">No payments found.</td></tr>';
        return;
    }

    body.innerHTML = rows.map((row) => `
        <tr>
            <td>${paymentLabel(row.payment_method)}</td>
            <td>${Number(row.transaction_count || 0).toLocaleString("en-TZ")}</td>
            <td>${money(row.amount)}</td>
        </tr>
    `).join("");
}

function renderInventory() {
    const inventory = reportData?.inventory || {};
    setText("#report-inventory-products", Number(inventory.products || 0).toLocaleString("en-TZ"));
    setText("#report-inventory-stock", Number(inventory.totalStock || 0).toLocaleString("en-TZ"));
    setText("#report-inventory-value", money(inventory.value));
}

function renderLowStock() {
    const container = document.querySelector("#report-low-stock");
    const rows = reportData?.lowStock || [];
    if (!container) return;

    if (!rows.length) {
        container.innerHTML = '<div class="empty-state">All products are sufficiently stocked.</div>';
        return;
    }

    container.innerHTML = rows.map((row) => `
        <div class="list-row">
            <strong>${escapeHtml(row.name)}</strong>
            <span>${Number(row.stock_quantity || 0)} left</span>
        </div>
    `).join("");
}

document.addEventListener("DOMContentLoaded", () => {
    setDefaultDates();
    document.querySelector("#generate-report-btn")?.addEventListener("click", loadReport);
    document.querySelector("#export-report-btn")?.addEventListener("click", () => {
        const start = document.querySelector("#report-start-date")?.value;
        const end = document.querySelector("#report-end-date")?.value;
        if (!start || !end) return;
        window.open(
            `/api/reports/sales.csv?startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}`,
            "_blank",
            "noopener"
        );
    });
    loadReport();
});
