"use strict";

let suppliers = [];
let editingSupplierId = null;

const $ = (selector) => document.querySelector(selector);

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function money(value) {
    return Number(value || 0).toLocaleString("en-TZ", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function setMessage(message, type = "error") {
    const element = $("#supplier-form-message");
    if (!element) return;
    element.textContent = message;
    element.className = `form-message ${type}`;
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
        throw new Error(payload?.message || payload || "Request failed.");
    }

    return payload;
}

function openSupplierModal(supplier = null) {
    editingSupplierId = supplier?.id ?? null;

    const modal = $("#supplier-modal");
    const form = $("#supplier-form");
    if (!modal || !form) return;

    form.reset();
    setMessage("");

    $("#supplier-modal-title").textContent = supplier
        ? "Edit Supplier"
        : "Add Supplier";
    $("#supplier-submit").textContent = supplier
        ? "Save Changes"
        : "Add Supplier";

    $("#supplier-name").value = supplier?.name || "";
    $("#supplier-phone").value = supplier?.phone || "";
    $("#supplier-email").value = supplier?.email || "";
    $("#supplier-address").value = supplier?.address || "";

    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    $("#supplier-name")?.focus();
}

function closeSupplierModal() {
    const modal = $("#supplier-modal");
    if (!modal) return;
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    editingSupplierId = null;
    setMessage("");
}

function filteredSuppliers() {
    const term = String($("#supplier-search")?.value || "").trim().toLowerCase();
    if (!term) return suppliers;

    return suppliers.filter((supplier) =>
        String(supplier.name || "").toLowerCase().includes(term) ||
        String(supplier.phone || "").toLowerCase().includes(term) ||
        String(supplier.email || "").toLowerCase().includes(term)
    );
}

function renderSuppliers() {
    const body = $("#suppliers-table-body");
    if (!body) return;

    const rows = filteredSuppliers();

    if (!rows.length) {
        body.innerHTML = `
            <tr>
                <td colspan="6">
                    <div class="table-empty-state">
                        <strong>No suppliers found</strong>
                        <span>Add a supplier or change your search.</span>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    body.innerHTML = rows.map((supplier) => `
        <tr>
            <td>
                <strong>${escapeHtml(supplier.name)}</strong>
                <div class="table-secondary-text">${escapeHtml(supplier.email || "")}</div>
            </td>
            <td>${escapeHtml(supplier.phone || "—")}</td>
            <td>${Number(supplier.total_purchases || 0).toLocaleString("en-TZ")}</td>
            <td>TSh ${money(supplier.total_purchase_value)}</td>
            <td>TSh ${money(supplier.outstanding_balance)}</td>
            <td>
                <div class="table-actions">
                    <button type="button" class="secondary-button" data-edit-supplier="${supplier.id}">Edit</button>
                    <a class="secondary-button" href="/supplier-payments/?supplier=${supplier.id}">Payments</a>
                    <button type="button" class="table-action-button danger" data-delete-supplier="${supplier.id}">Delete</button>
                </div>
            </td>
        </tr>
    `).join("");
}

async function loadSuppliers() {
    const body = $("#suppliers-table-body");
    try {
        if (body) {
            body.innerHTML = `<tr><td colspan="6">Loading suppliers...</td></tr>`;
        }

        const result = await api("/api/suppliers");
        suppliers = Array.isArray(result.suppliers) ? result.suppliers : [];
        renderSuppliers();
    } catch (error) {
        console.error("Load suppliers error:", error);
        if (body) {
            body.innerHTML = `<tr><td colspan="6">${escapeHtml(error.message)}</td></tr>`;
        }
    }
}

async function saveSupplier(event) {
    event.preventDefault();

    const submitButton = $("#supplier-submit");
    const name = $("#supplier-name").value.trim();
    const phone = $("#supplier-phone").value.trim();
    const email = $("#supplier-email").value.trim();
    const address = $("#supplier-address").value.trim();

    if (name.length < 2) {
        setMessage("Supplier name must be at least 2 characters.");
        return;
    }

    submitButton.disabled = true;
    submitButton.textContent = editingSupplierId ? "Saving..." : "Creating...";

    try {
        await api(editingSupplierId
            ? `/api/suppliers/${editingSupplierId}`
            : "/api/suppliers", {
            method: editingSupplierId ? "PUT" : "POST",
            body: JSON.stringify({ name, phone, email, address })
        });

        closeSupplierModal();
        await loadSuppliers();
    } catch (error) {
        setMessage(error.message || "Failed to save supplier.");
    } finally {
        submitButton.disabled = false;
    }
}

async function deleteSupplier(id) {
    const supplier = suppliers.find((item) => Number(item.id) === id);
    if (!supplier) return;

    if (!window.confirm(`Delete supplier "${supplier.name}"?`)) return;

    try {
        await api(`/api/suppliers/${id}`, { method: "DELETE" });
        await loadSuppliers();
    } catch (error) {
        window.alert(error.message || "Failed to delete supplier.");
    }
}

document.addEventListener("DOMContentLoaded", () => {
    $("#add-supplier-btn")?.addEventListener("click", () => openSupplierModal());
    $("#close-supplier-modal")?.addEventListener("click", closeSupplierModal);
    $("#cancel-supplier")?.addEventListener("click", closeSupplierModal);
    $("#supplier-form")?.addEventListener("submit", saveSupplier);
    $("#supplier-search")?.addEventListener("input", renderSuppliers);

    $("#supplier-modal")?.addEventListener("click", (event) => {
        if (event.target === $("#supplier-modal")) closeSupplierModal();
    });

    document.addEventListener("click", (event) => {
        const edit = event.target.closest("[data-edit-supplier]");
        if (edit) {
            const supplier = suppliers.find((item) => Number(item.id) === Number(edit.dataset.editSupplier));
            if (supplier) openSupplierModal(supplier);
            return;
        }

        const remove = event.target.closest("[data-delete-supplier]");
        if (remove) {
            deleteSupplier(Number(remove.dataset.deleteSupplier));
        }
    });

    loadSuppliers();
});
