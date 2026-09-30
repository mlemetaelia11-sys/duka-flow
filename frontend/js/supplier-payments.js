"use strict";

const $ = (s) => document.querySelector(s);
const money = (v) => `TSh ${Number(v || 0).toLocaleString("en-TZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const esc = (v) => String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");

async function api(url, options = {}) {
    const response = await fetch(url, {
        credentials: "include",
        ...options,
        headers: { Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) }
    });
    const type = response.headers.get("content-type") || "";
    const data = type.includes("application/json") ? await response.json() : await response.text();
    if (!response.ok) throw new Error(data?.message || data || "Request failed.");
    return data;
}

let suppliers = [];
let purchases = [];

async function loadPayables() {
    const result = await api("/api/supplier-payments");
    suppliers = result.suppliers || [];
    const owed = suppliers.filter((x) => Number(x.outstanding_balance) > 0);
    $("#payable-suppliers").textContent = owed.length.toLocaleString("en-TZ");
    $("#payable-total").textContent = money(owed.reduce((sum, x) => sum + Number(x.outstanding_balance || 0), 0));
    $("#payable-purchases").textContent = owed.reduce((sum, x) => sum + Number(x.open_purchases || 0), 0).toLocaleString("en-TZ");
    $("#payables-body").innerHTML = suppliers.length ? suppliers.map((supplier) => `
        <tr>
            <td><strong>${esc(supplier.name)}</strong><div class="table-secondary-text">${esc(supplier.phone || "")}</div></td>
            <td>${Number(supplier.open_purchases || 0).toLocaleString("en-TZ")}</td>
            <td>${money(supplier.total_purchase_value)}</td>
            <td>${money(supplier.outstanding_balance)}</td>
            <td><button type="button" class="secondary-button" data-supplier="${supplier.id}">View history</button></td>
        </tr>
    `).join("") : `<tr><td colspan="5">No suppliers found.</td></tr>`;
}

async function loadPurchases() {
    const result = await api("/api/purchases");
    purchases = (result.purchases || []).filter((p) => Number(p.balance || 0) > 0);
    $("#supplier-payment-purchase").innerHTML = `<option value="">Select purchase</option>` + purchases.map((p) => `<option value="${p.id}" data-balance="${p.balance}">${esc(p.reference_number)} — ${esc(p.supplier_name || "Supplier")} — ${money(p.balance)} due</option>`).join("");
}

async function loadSupplierHistory(supplierId) {
    const result = await api(`/api/supplier-payments/supplier/${supplierId}`);
    $("#supplier-payments-body").innerHTML = (result.payments || []).length ? result.payments.map((p) => `
        <tr>
            <td>${new Date(p.paid_at).toLocaleString("en-GB")}</td>
            <td>${esc(result.supplier?.name || "")}</td>
            <td>${esc(p.reference_number || p.purchase_id)}</td>
            <td>${money(p.amount)}</td>
            <td>${esc(p.payment_method)}</td>
            <td>${esc(p.payment_reference || "—")}</td>
            <td>${esc(p.created_by_name || "System")}</td>
        </tr>
    `).join("") : `<tr><td colspan="7">No payments recorded for this supplier.</td></tr>`;
}

$("#supplier-payment-purchase")?.addEventListener("change", (event) => {
    const option = event.target.selectedOptions[0];
    $("#supplier-payment-amount").value = option?.dataset.balance || "";
});

$("#supplier-payment-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = $("#supplier-payment-submit");
    const message = $("#supplier-payment-message");
    button.disabled = true;
    button.textContent = "Saving...";
    message.textContent = "";
    try {
        await api("/api/supplier-payments", {
            method: "POST",
            body: JSON.stringify({
                purchaseId: Number($("#supplier-payment-purchase").value),
                amount: Number($("#supplier-payment-amount").value),
                paymentMethod: $("#supplier-payment-method").value,
                paymentReference: $("#supplier-payment-reference").value,
                notes: $("#supplier-payment-notes").value
            })
        });
        event.target.reset();
        message.textContent = "Supplier payment recorded successfully.";
        message.className = "form-message success";
        await Promise.all([loadPayables(), loadPurchases()]);
    } catch (error) {
        message.textContent = error.message;
        message.className = "form-message error";
    } finally {
        button.disabled = false;
        button.textContent = "Record Payment";
    }
});

document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-supplier]");
    if (button) loadSupplierHistory(Number(button.dataset.supplier)).catch((error) => window.alert(error.message));
});

document.addEventListener("DOMContentLoaded", async () => {
    try {
        await Promise.all([loadPayables(), loadPurchases()]);
        const querySupplier = new URLSearchParams(window.location.search).get("supplier");
        if (querySupplier) await loadSupplierHistory(Number(querySupplier));
    } catch (error) {
        $("#payables-body").innerHTML = `<tr><td colspan="5">${esc(error.message)}</td></tr>`;
    }
});
