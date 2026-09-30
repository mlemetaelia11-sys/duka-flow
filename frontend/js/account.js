"use strict";

(() => {
    const esc = (value) => String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

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
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message || "Request failed.");
        return payload;
    }

    function renderProfile(profile) {
        const name = String(profile?.name || "User").trim();
        const initial = name.charAt(0).toUpperCase();

        $("#account-avatar").textContent = initial;
        $("#account-name").textContent = name;
        $("#account-email").textContent = profile?.email || "—";
        $("#account-role").textContent = String(profile?.role || "user").replaceAll("_", " ");
        $("#account-business").textContent = profile?.business_name || "—";

        $("#account-profile").innerHTML = `
            <div class="df-profile-row"><span>Jina kamili</span><strong>${esc(name)}</strong></div>
            <div class="df-profile-row"><span>Barua pepe</span><strong>${esc(profile?.email || "—")}</strong></div>
            <div class="df-profile-row"><span>Wadhifa</span><strong>${esc(String(profile?.role || "user").replaceAll("_", " "))}</strong></div>
            <div class="df-profile-row"><span>Biashara</span><strong>${esc(profile?.business_name || "—")}</strong></div>
            <div class="df-profile-row"><span>Akaunti ilifunguliwa</span><strong>${profile?.created_at ? new Date(profile.created_at).toLocaleDateString("sw-TZ") : "—"}</strong></div>
            <div class="df-profile-row"><span>Login ya mwisho</span><strong>${profile?.last_login_at ? new Date(profile.last_login_at).toLocaleString("sw-TZ", { dateStyle: "medium", timeStyle: "short" }) : "—"}</strong></div>
        `;
    }

    const $ = (selector) => document.querySelector(selector);

    document.addEventListener("DOMContentLoaded", async () => {
        try {
            const data = await api("/api/account/profile");
            renderProfile(data.profile);
        } catch (error) {
            $("#account-profile").innerHTML = `<div class="df-account-error">${esc(error.message)}</div>`;
        }

        $("#account-password-form")?.addEventListener("submit", async (event) => {
            event.preventDefault();

            const button = $("#account-password-button");
            const message = $("#account-message");
            const next = $("#account-new-password").value;
            const confirm = $("#account-confirm-password").value;

            if (next !== confirm) {
                message.textContent = "Nenosiri jipya halifanani.";
                message.className = "form-message error";
                return;
            }

            button.disabled = true;
            button.textContent = "Inahifadhi...";

            try {
                await api("/api/account/change-password", {
                    method: "POST",
                    body: JSON.stringify({
                        currentPassword: $("#account-current-password").value,
                        newPassword: next
                    })
                });

                event.target.reset();
                message.textContent = "✓ Nenosiri limebadilishwa.";
                message.className = "form-message success";
            } catch (error) {
                message.textContent = error.message;
                message.className = "form-message error";
            } finally {
                button.disabled = false;
                button.textContent = "Hifadhi nenosiri";
            }
        });
    });
})();
