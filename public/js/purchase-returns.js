"use strict";

let purchaseReturnPurchases = [];
let selectedPurchase = null;

const money = (value) => `TSh ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const el = (selector) => document.querySelector(selector);

async function getJson(url, options = {}) {
    const response = await fetch(url, options);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || "Request failed.");
    return payload;
}

function setMessage(message = "", type = "") {
    const target = el("#purchase-return-message");
    if (!target) return;
    target.textContent = message;
    target.className = `form-message ${type}`.trim();
}

async function loadPurchases() {
    try {
        const payload = await getJson("/api/purchases");
        purchaseReturnPurchases = payload.purchases || [];
        const select = el("#purchase-return-purchase");
        select.innerHTML = '<option value="">Select purchase</option>';
        purchaseReturnPurchases.forEach((purchase) => {
            const option = document.createElement("option");
            option.value = purchase.id;
            option.textContent = `${purchase.reference_number} — ${purchase.supplier_name || "No supplier"} — ${money(purchase.total_amount)}`;
            select.appendChild(option);
        });
    } catch (error) {
        setMessage(error.message, "error");
    }
}

async function loadPurchase(id) {
    if (!id) {
        selectedPurchase = null;
        renderItems([]);
        el("#purchase-return-summary").textContent = "Select a purchase to see its items.";
        return;
    }

    try {
        const payload = await getJson(`/api/purchases/${id}`);
        selectedPurchase = payload;
        const purchase = payload.purchase || {};
        el("#purchase-return-summary").innerHTML = `<strong>${escapeHtml(purchase.reference_number || "Purchase")}</strong> · ${escapeHtml(purchase.supplier_name || "No supplier")} · Original ${money(purchase.total_amount)}`;
        renderItems(payload.items || []);
    } catch (error) {
        selectedPurchase = null;
        renderItems([]);
        setMessage(error.message, "error");
    }
}

function renderItems(items) {
    const tbody = el("#purchase-return-items-body");
    if (!tbody) return;

    if (!items.length) {
        tbody.innerHTML = '<tr><td colspan="5">No items found for this purchase.</td></tr>';
        updateTotal();
        return;
    }

    tbody.innerHTML = items.map((item) => `
        <tr>
            <td>${escapeHtml(item.product_name)}</td>
            <td>${Number(item.quantity)}</td>
            <td>${Number(item.returned_quantity || 0)}</td>
            <td>${money(item.unit_cost)}</td>
            <td>
                <input
                    class="table-input purchase-return-qty"
                    type="number"
                    min="0"
                    max="${Math.max(0, Number(item.remaining_quantity ?? (Number(item.quantity) - Number(item.returned_quantity || 0))))}"
                    step="1"
                    value="0"
                    data-purchase-item-id="${Number(item.id)}"
                    data-unit-cost="${Number(item.unit_cost)}"
                    data-remaining="${Math.max(0, Number(item.remaining_quantity ?? (Number(item.quantity) - Number(item.returned_quantity || 0))))}"
                >
            </td>
        </tr>
    `).join("");

    document.querySelectorAll(".purchase-return-qty").forEach((input) => {
        input.addEventListener("input", updateTotal);
    });

    updateTotal();
}

function updateTotal() {
    let total = 0;
    document.querySelectorAll(".purchase-return-qty").forEach((input) => {
        let quantity = Number(input.value || 0);
        const max = Number(input.dataset.remaining || 0);
        if (quantity < 0) quantity = 0;
        if (quantity > max) quantity = max;
        if (Number(input.value || 0) !== quantity) input.value = String(quantity);
        total += quantity * Number(input.dataset.unitCost || 0);
    });
    el("#purchase-return-total").textContent = money(total);
}

async function completeReturn(event) {
    event.preventDefault();
    setMessage("");

    const purchaseId = Number(el("#purchase-return-purchase")?.value);
    const items = [];

    document.querySelectorAll(".purchase-return-qty").forEach((input) => {
        const quantity = Number(input.value || 0);
        if (quantity > 0) {
            items.push({
                purchaseItemId: Number(input.dataset.purchaseItemId),
                quantity
            });
        }
    });

    if (!purchaseId) {
        setMessage("Select a purchase.", "error");
        return;
    }

    if (!items.length) {
        setMessage("Enter a return quantity for at least one item.", "error");
        return;
    }

    const button = el("#purchase-return-submit");
    button.disabled = true;
    button.textContent = "Processing...";

    try {
        const payload = await getJson("/api/purchase-returns", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                purchaseId,
                items,
                reason: el("#purchase-return-reason")?.value || ""
            })
        });

        setMessage(payload.message || "Purchase return completed.", "success");
        el("#purchase-return-reason").value = "";
        await loadPurchases();
        el("#purchase-return-purchase").value = String(purchaseId);
        await loadPurchase(purchaseId);
        await loadHistory();
    } catch (error) {
        setMessage(error.message, "error");
    } finally {
        button.disabled = false;
        button.textContent = "Complete Return";
    }
}

async function loadHistory() {
    try {
        const payload = await getJson("/api/purchase-returns");
        const tbody = el("#purchase-return-history-body");
        const rows = payload.returns || [];
        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="5">No purchase returns yet.</td></tr>';
            return;
        }
        tbody.innerHTML = rows.map((row) => `
            <tr>
                <td>${escapeHtml(row.return_number)}</td>
                <td>${escapeHtml(row.reference_number || "-")}</td>
                <td>${escapeHtml(row.supplier_name || "-")}</td>
                <td>${money(row.total_amount)}</td>
                <td>${formatDate(row.created_at)}</td>
            </tr>
        `).join("");
    } catch (error) {
        el("#purchase-return-history-body").innerHTML = `<tr><td colspan="5">${escapeHtml(error.message)}</td></tr>`;
    }
}

function formatDate(value) {
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime()) ? date.toLocaleString() : "-";
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
    el("#purchase-return-purchase")?.addEventListener("change", (event) => loadPurchase(Number(event.target.value)));
    el("#purchase-return-form")?.addEventListener("submit", completeReturn);
    el("#purchase-return-refresh")?.addEventListener("click", loadHistory);
    await Promise.all([loadPurchases(), loadHistory()]);
});
