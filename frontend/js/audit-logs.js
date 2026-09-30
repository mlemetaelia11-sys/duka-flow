"use strict";

const esc = (v) => String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");

async function loadAuditLogs() {
    const response = await fetch("/api/audit-logs?limit=250", { credentials: "include", headers: { Accept: "application/json" } });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || "Failed to load audit logs.");
    const body = document.querySelector("#audit-body");
    const logs = payload.logs || [];
    body.innerHTML = logs.length ? logs.map((log) => `
        <tr>
            <td>${new Date(log.created_at).toLocaleString("en-GB")}</td>
            <td>${esc(log.user_name || "System")}</td>
            <td><strong>${esc(log.action)}</strong></td>
            <td>${esc(log.entity_type || "—")} ${log.entity_id ? `#${esc(log.entity_id)}` : ""}</td>
            <td><code>${esc(JSON.stringify(log.details || {}))}</code></td>
            <td>${esc(log.ip_address || "—")}</td>
        </tr>
    `).join("") : `<tr><td colspan="6">No audit entries found.</td></tr>`;
}

document.addEventListener("DOMContentLoaded", () => {
    loadAuditLogs().catch((error) => {
        document.querySelector("#audit-body").innerHTML = `<tr><td colspan="6">${esc(error.message)}</td></tr>`;
    });
});
