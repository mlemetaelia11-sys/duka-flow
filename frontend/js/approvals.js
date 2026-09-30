"use strict";

const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
const money = (v) => v === null || v === undefined ? "—" : `TSh ${Number(v).toLocaleString("en-TZ", { maximumFractionDigits: 2 })}`;

async function api(url, options={}) {
    const r = await fetch(url, { credentials:"include", ...options, headers:{Accept:"application/json", ...(options.body ? {"Content-Type":"application/json"}:{}), ...(options.headers||{})} });
    const data = await r.json().catch(()=>({}));
    if (!r.ok) throw new Error(data.message || "Request failed.");
    return data;
}

async function loadApprovals() {
    const body = $("#approvals-body");
    try {
        const data = await api("/api/approvals");
        const rows = data.approvals || [];
        if (!rows.length) { body.innerHTML = '<tr><td colspan="7">No approval requests.</td></tr>'; return; }
        const role = window.__DUKAFLOW_USER__?.role;
        body.innerHTML = rows.map((row) => `
            <tr>
                <td>${esc(row.action_type)}</td>
                <td>${esc(row.entity_type)}${row.entity_id ? ` #${esc(row.entity_id)}` : ""}</td>
                <td>${money(row.amount)}</td>
                <td>${esc(row.requested_by_name)}</td>
                <td><span class="status-badge">${esc(row.status)}</span></td>
                <td>${new Date(row.created_at).toLocaleString("en-GB")}</td>
                <td>${role === "owner" && row.status === "pending" ? `<button class="table-action-button" data-review="${row.id}" data-status="approved">Approve</button> <button class="table-action-button danger" data-review="${row.id}" data-status="rejected">Reject</button>` : "—"}</td>
            </tr>
        `).join("");
    } catch (error) {
        body.innerHTML = `<tr><td colspan="7">${esc(error.message)}</td></tr>`;
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    await DukaAuth.ready;
    $("#approval-form")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const button = $("#approval-submit");
        const message = $("#approval-message");
        button.disabled = true; button.textContent = "Submitting...";
        try {
            await api("/api/approvals", { method:"POST", body:JSON.stringify({
                actionType: $("#approval-action").value,
                entityType: $("#approval-entity").value,
                entityId: $("#approval-entity-id").value || null,
                amount: $("#approval-amount").value || null,
                notes: $("#approval-notes").value
            })});
            event.target.reset(); message.textContent="Approval request submitted."; message.className="form-message success"; await loadApprovals();
        } catch (error) { message.textContent=error.message; message.className="form-message error"; }
        finally { button.disabled=false; button.textContent="Submit Request"; }
    });
    $("#refresh-approvals")?.addEventListener("click", loadApprovals);
    document.addEventListener("click", async (event) => {
        const button = event.target.closest("[data-review]");
        if (!button) return;
        const status = button.dataset.status;
        try {
            await api(`/api/approvals/${button.dataset.review}`, { method:"PATCH", body:JSON.stringify({ status, reviewNotes: status === "approved" ? "Approved from DukaFlow." : "Rejected from DukaFlow." }) });
            await loadApprovals();
        } catch (error) { alert(error.message); }
    });
    await loadApprovals();
});
