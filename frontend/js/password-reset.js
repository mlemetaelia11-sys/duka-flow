"use strict";

async function post(url, body) {
    const response = await fetch(url, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || "Request failed.");
    return payload;
}

const setMessage = (selector, text, type = "") => {
    const node = document.querySelector(selector);
    node.textContent = text;
    node.className = `form-message ${type}`;
};

document.querySelector("#forgot-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = document.querySelector("#forgot-button");
    button.disabled = true;
    button.textContent = "Requesting...";
    try {
        const payload = await post("/api/auth/password/forgot", { email: document.querySelector("#reset-email").value.trim() });
        setMessage("#forgot-message", payload.message, "success");
        const dev = document.querySelector("#dev-token");
        if (payload.developmentResetToken) {
            dev.hidden = false;
            dev.textContent = `Development reset token: ${payload.developmentResetToken}`;
            document.querySelector("#reset-token").value = payload.developmentResetToken;
        }
    } catch (error) {
        setMessage("#forgot-message", error.message, "error");
    } finally {
        button.disabled = false;
        button.textContent = "Request Reset";
    }
});

document.querySelector("#reset-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const password = document.querySelector("#reset-password").value;
    if (password !== document.querySelector("#reset-confirm").value) {
        setMessage("#reset-message", "Passwords do not match.", "error");
        return;
    }
    try {
        const payload = await post("/api/auth/password/reset", { token: document.querySelector("#reset-token").value.trim(), newPassword: password });
        setMessage("#reset-message", payload.message, "success");
        event.target.reset();
    } catch (error) {
        setMessage("#reset-message", error.message, "error");
    }
});
