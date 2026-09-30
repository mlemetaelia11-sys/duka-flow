"use strict";

const id = Number(new URLSearchParams(window.location.search).get("id"));
const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
const money = (v) => `TSh ${Number(v || 0).toLocaleString("en-TZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function api(url, options={}) {
    const r = await fetch(url, { credentials: "include", ...options, headers: { Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) } });
    const data = await r.json();
    if (!r.ok) throw new Error(data.message || "Request failed.");
    return data;
}

async function loadAll() {
    if (!Number.isInteger(id) || id <= 0) throw new Error("Invalid customer.");
    const [history, loyalty, notes] = await Promise.all([
        api(`/api/customers/${id}/history`),
        api(`/api/loyalty/customer/${id}`),
        api(`/api/customers/${id}/notes`)
    ]);
    const c = history.customer;
    $("#customer-title").textContent = c.name;
    $("#customer-subtitle").textContent = [c.phone, c.email].filter(Boolean).join(" · ") || "No contact details";
    $("#customer-total-purchases").textContent = money(history.summary.totalPurchases);
    $("#customer-sales-count").textContent = Number(history.summary.totalSales || 0).toLocaleString("en-TZ");
    $("#customer-debt").textContent = money((history.debts || []).reduce((sum, d) => sum + Number(d.balance || 0), 0));
    $("#customer-points").textContent = Number(loyalty.account?.points_balance || 0).toLocaleString("en-TZ");

    if (c.phone) {
        const tel = c.phone.replace(/\D/g, "");
        const wa = `https://wa.me/${tel}`;
        $("#customer-contact-actions").innerHTML = `<a class="secondary-button" href="tel:${esc(c.phone)}">Call</a><a class="secondary-button" target="_blank" rel="noopener" href="${wa}">WhatsApp</a><a class="secondary-button" href="sms:${esc(c.phone)}">SMS</a>`;
    }

    $("#customer-sales-body").innerHTML = (history.sales || []).length ? history.sales.map(s => `<tr><td>${esc(s.receipt_number)}</td><td>${new Date(s.created_at).toLocaleString("en-GB")}</td><td>${money(s.total_amount)}</td><td>${money(s.amount_paid)}</td><td>${money(s.profit)}</td><td>${esc(s.status)}</td></tr>`).join("") : `<tr><td colspan="6">No sales yet.</td></tr>`;
    $("#customer-debts-body").innerHTML = (history.debts || []).length ? history.debts.map(d => `<tr><td>#${esc(d.sale_id)}</td><td>${money(d.total_amount)}</td><td>${money(d.amount_paid)}</td><td>${money(d.balance)}</td><td>${esc(d.due_date || "—")}</td><td>${esc(d.status)}</td></tr>`).join("") : `<tr><td colspan="6">No debts.</td></tr>`;
    renderNotes(notes.notes || []);
    renderLoyalty(loyalty.transactions || []);
}

function renderNotes(notes) {
    $("#customer-notes-list").innerHTML = notes.length ? notes.map(n => `<article class="note-item"><div><p>${esc(n.note)}</p><small>${esc(n.created_by_name || "System")} · ${new Date(n.created_at).toLocaleString("en-GB")}</small></div><button type="button" class="table-action-button danger" data-delete-note="${n.id}">Delete</button></article>`).join("") : `<p class="table-secondary-text">No notes yet.</p>`;
}

function renderLoyalty(transactions) {
    $("#loyalty-history").innerHTML = transactions.length ? `<div class="table-wrapper"><table class="data-table"><thead><tr><th>Date</th><th>Type</th><th>Points</th><th>Description</th></tr></thead><tbody>${transactions.map(t=>`<tr><td>${new Date(t.created_at).toLocaleString("en-GB")}</td><td>${esc(t.transaction_type)}</td><td>${Number(t.points)>0?"+":""}${Number(t.points)}</td><td>${esc(t.description || "—")}</td></tr>`).join("")}</tbody></table></div>` : `<p class="table-secondary-text">No loyalty transactions yet.</p>`;
}

$("#customer-note-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = $("#customer-note-message");
    try {
        await api(`/api/customers/${id}/notes`, { method: "POST", body: JSON.stringify({ note: $("#customer-note").value }) });
        event.target.reset();
        message.textContent = "Note added.";
        message.className = "form-message success";
        await loadAll();
    } catch (error) { message.textContent = error.message; message.className = "form-message error"; }
});

$("#loyalty-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = $("#loyalty-message");
    try {
        let points = Number($("#loyalty-points").value);
        const type = $("#loyalty-type").value;
        if (type === "redeem") points = -Math.abs(points);
        else if (type === "earn") points = Math.abs(points);
        await api("/api/loyalty/adjust", { method: "POST", body: JSON.stringify({ customerId: id, points, type, description: $("#loyalty-description").value }) });
        event.target.reset();
        message.textContent = "Loyalty points updated.";
        message.className = "form-message success";
        await loadAll();
    } catch (error) { message.textContent = error.message; message.className = "form-message error"; }
});

document.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-delete-note]");
    if (!button) return;
    if (!confirm("Delete this note?")) return;
    try { await api(`/api/customers/${id}/notes/${button.dataset.deleteNote}`, { method: "DELETE" }); await loadAll(); }
    catch (error) { alert(error.message); }
});

document.addEventListener("DOMContentLoaded", () => loadAll().catch(error => { document.querySelector("#customer-subtitle").textContent = error.message; }));
