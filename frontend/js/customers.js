"use strict";

const $ = (selector) => document.querySelector(selector);
const money = (value) => Number(value || 0).toLocaleString("en-TZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");

let customers = [];
let editingCustomerId = null;

async function api(url, options = {}) {
    const response = await fetch(url, { credentials: "include", ...options, headers: { Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) } });
    const type = response.headers.get("content-type") || "";
    const payload = type.includes("application/json") ? await response.json() : await response.text();
    if (!response.ok) throw new Error(payload?.message || payload || "Request failed.");
    return payload;
}

function message(text, type = "") {
    const el = $("#customer-form-message");
    el.textContent = text;
    el.className = `form-message ${type}`;
}

function filteredCustomers() {
    const q = String($("#customer-search")?.value || "").trim().toLowerCase();
    return !q ? customers : customers.filter((c) => String(c.name || "").toLowerCase().includes(q) || String(c.phone || "").toLowerCase().includes(q));
}

function renderCustomers() {
    const body = $("#customers-table-body");
    const rows = filteredCustomers();
    if (!rows.length) {
        body.innerHTML = `<tr><td colspan="6"><div class="table-empty-state"><strong>No customers found</strong><span>Add a customer or change your search.</span></div></td></tr>`;
        return;
    }
    body.innerHTML = rows.map((customer) => {
        const debt = Number(customer.outstanding_debt || 0);
        return `<tr>
            <td><strong>${esc(customer.name)}</strong><div class="table-secondary-text">${esc(customer.email || customer.address || "")}</div></td>
            <td>${esc(customer.phone || "—")}</td>
            <td>TSh ${money(customer.total_purchases)}</td>
            <td>TSh ${money(debt)}</td>
            <td><span class="status-badge ${debt > 0 ? "status-warning" : "status-active"}">${debt > 0 ? "Credit due" : "Good"}</span></td>
            <td><div class="table-actions"><a class="secondary-button" href="/customer-profile/?id=${customer.id}">Profile</a><button class="secondary-button" data-history="${customer.id}">History</button><button class="secondary-button" data-edit="${customer.id}">Edit</button><button class="table-action-button danger" data-delete="${customer.id}">Delete</button></div></td>
        </tr>`;
    }).join("");
}

async function loadCustomers() {
    const body = $("#customers-table-body");
    try {
        const result = await api("/api/customers");
        customers = result.customers || [];
        renderCustomers();
    } catch (error) {
        body.innerHTML = `<tr><td colspan="6">${esc(error.message)}</td></tr>`;
    }
}

function openCustomer(customer = null) {
    editingCustomerId = customer?.id ?? null;
    $("#customer-form").reset();
    message("");
    $("#customer-modal-title").textContent = customer ? "Edit Customer" : "Add Customer";
    $("#customer-submit").textContent = customer ? "Save Changes" : "Add Customer";
    $("#customer-name").value = customer?.name || "";
    $("#customer-phone").value = customer?.phone || "";
    $("#customer-email").value = customer?.email || "";
    $("#customer-address").value = customer?.address || "";
    $("#customer-modal").classList.add("is-open");
    $("#customer-modal").setAttribute("aria-hidden", "false");
    $("#customer-name").focus();
}

function closeCustomer() {
    $("#customer-modal")?.classList.remove("is-open");
    $("#customer-modal")?.setAttribute("aria-hidden", "true");
    editingCustomerId = null;
}

function closeHistory() {
    $("#customer-history-modal")?.classList.remove("is-open");
    $("#customer-history-modal")?.setAttribute("aria-hidden", "true");
}

async function saveCustomer(event) {
    event.preventDefault();
    const button = $("#customer-submit");
    button.disabled = true;
    button.textContent = editingCustomerId ? "Saving..." : "Creating...";
    try {
        const payload = {
            name: $("#customer-name").value.trim(),
            phone: $("#customer-phone").value.trim(),
            email: $("#customer-email").value.trim(),
            address: $("#customer-address").value.trim()
        };
        await api(editingCustomerId ? `/api/customers/${editingCustomerId}` : "/api/customers", { method: editingCustomerId ? "PUT" : "POST", body: JSON.stringify(payload) });
        closeCustomer();
        await loadCustomers();
    } catch (error) {
        message(error.message, "error");
    } finally {
        button.disabled = false;
        button.textContent = editingCustomerId ? "Save Changes" : "Add Customer";
    }
}

async function showHistory(id) {
    const result = await api(`/api/customers/${id}/history`);
    const debt = (result.debts || []).reduce((sum, d) => sum + Number(d.balance || 0), 0);
    $("#history-customer-name").textContent = [result.customer.phone, result.customer.email].filter(Boolean).join(" · ");
    $("#customer-history-purchases").textContent = `TSh ${money(result.summary.totalPurchases)}`;
    $("#customer-history-sales").textContent = Number(result.summary.totalSales || 0).toLocaleString("en-TZ");
    $("#customer-history-debt").textContent = `TSh ${money(debt)}`;
    $("#customer-history-sales-body").innerHTML = (result.sales || []).length ? result.sales.map((sale) => `<tr><td>${new Date(sale.created_at).toLocaleString("en-GB")}</td><td>${esc(sale.receipt_number)}</td><td>${Number(sale.total_items || 0)}</td><td>TSh ${money(sale.total_amount)}</td><td>${esc(sale.payment_method)}</td><td>${esc(sale.status)}</td></tr>`).join("") : `<tr><td colspan="6">No sales.</td></tr>`;
    $("#customer-history-debts-body").innerHTML = (result.debts || []).length ? result.debts.map((d) => `<tr><td>${new Date(d.created_at).toLocaleString("en-GB")}</td><td>TSh ${money(d.total_amount)}</td><td>TSh ${money(d.amount_paid)}</td><td>TSh ${money(d.balance)}</td><td>${esc(d.status)}</td></tr>`).join("") : `<tr><td colspan="5">No debt history.</td></tr>`;
    $("#customer-history-modal").classList.add("is-open");
    $("#customer-history-modal").setAttribute("aria-hidden", "false");
}

async function deleteCustomer(id) {
    const customer = customers.find((item) => Number(item.id) === id);
    if (!customer || !confirm(`Delete ${customer.name}?`)) return;
    try { await api(`/api/customers/${id}`, { method: "DELETE" }); await loadCustomers(); }
    catch (error) { alert(error.message); }
}

document.addEventListener("DOMContentLoaded", () => {
    $("#open-customer-modal")?.addEventListener("click", () => openCustomer());
    $("#customer-form")?.addEventListener("submit", saveCustomer);
    $("#customer-search")?.addEventListener("input", renderCustomers);
    document.querySelectorAll("[data-close-customer-modal]").forEach((el) => el.addEventListener("click", closeCustomer));
    $("#close-customer-history")?.addEventListener("click", closeHistory);
    $("#close-customer-history-bottom")?.addEventListener("click", closeHistory);
    $("[data-close-history-modal]")?.addEventListener("click", closeHistory);
    $("#customers-table-body")?.addEventListener("click", async (event) => {
        const history = event.target.closest("[data-history]");
        if (history) return showHistory(Number(history.dataset.history)).catch((e) => alert(e.message));
        const edit = event.target.closest("[data-edit]");
        if (edit) {
            const customer = customers.find((item) => Number(item.id) === Number(edit.dataset.edit));
            if (customer) openCustomer(customer);
            return;
        }
        const remove = event.target.closest("[data-delete]");
        if (remove) await deleteCustomer(Number(remove.dataset.delete));
    });
    loadCustomers();
});
