"use strict";

const $ = (selector) => document.querySelector(selector);

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
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

    const text = await response.text();
    let payload = {};

    try {
        payload = text ? JSON.parse(text) : {};
    } catch {
        payload = {};
    }

    if (!response.ok) {
        throw new Error(payload.message || `Request failed (${response.status}).`);
    }

    return payload;
}

function setMessage(selector, message, type = "") {
    const element = $(selector);
    if (!element) return;
    element.textContent = message;
    element.className = `form-message ${type}`.trim();
}

function setBusinessForm(business) {
    const fields = [
        ["#business-name", "name"],
        ["#business-phone", "phone"],
        ["#business-email", "email"],
        ["#business-address", "address"],
        ["#business-city", "city"],
        ["#business-country", "country"],
        ["#business-currency", "currency"],
        ["#business-timezone", "timezone"]
    ];

    for (const [selector, key] of fields) {
        const field = $(selector);
        if (field) field.value = business?.[key] ?? "";
    }
}

function refreshUserBusinessName(name) {
    if (!window.__DUKAFLOW_USER__) return;

    window.__DUKAFLOW_USER__.business_name = name;
    window.__DUKAFLOW_USER__.businessName = name;

    const businessElements = document.querySelectorAll(".auth-business-name");
    businessElements.forEach((element) => {
        element.textContent = name;
    });
}

async function loadBusiness() {
    const payload = await api("/api/business");
    setBusinessForm(payload.business);
    return payload.business;
}

async function handleBusinessSubmit(event) {
    event.preventDefault();

    const button = $("#business-save");
    const business = {
        name: $("#business-name")?.value || "",
        phone: $("#business-phone")?.value || "",
        email: $("#business-email")?.value || "",
        address: $("#business-address")?.value || "",
        city: $("#business-city")?.value || "",
        country: $("#business-country")?.value || "",
        currency: $("#business-currency")?.value || "",
        timezone: $("#business-timezone")?.value || ""
    };

    if (!button) return;

    button.disabled = true;
    button.textContent = "Saving...";
    setMessage("#business-message", "");

    try {
        const payload = await api("/api/business", {
            method: "PUT",
            body: JSON.stringify(business)
        });

        setBusinessForm(payload.business);
        refreshUserBusinessName(payload.business.name);
        setMessage("#business-message", "Business settings saved successfully.", "success");
    } catch (error) {
        setMessage("#business-message", error.message, "error");
    } finally {
        button.disabled = false;
        button.textContent = "Save Changes";
    }
}

async function handlePasswordSubmit(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const currentPassword = $("#current-password")?.value || "";
    const newPassword = $("#new-password")?.value || "";
    const confirmPassword = $("#confirm-password")?.value || "";

    if (newPassword !== confirmPassword) {
        setMessage("#password-message", "New passwords do not match.", "error");
        return;
    }

    const button = form.querySelector("button[type='submit']");
    if (button) {
        button.disabled = true;
        button.textContent = "Changing...";
    }

    try {
        await api("/api/account/change-password", {
            method: "POST",
            body: JSON.stringify({ currentPassword, newPassword })
        });

        form.reset();
        setMessage("#password-message", "Password changed successfully.", "success");
    } catch (error) {
        setMessage("#password-message", error.message, "error");
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = "Change Password";
        }
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    const businessForm = $("#business-form");
    const passwordForm = $("#password-form");

    try {
        await window.DukaAuth?.ready;
        await loadBusiness();
    } catch (error) {
        setMessage("#business-message", error.message, "error");
    }

    businessForm?.addEventListener("submit", handleBusinessSubmit);
    passwordForm?.addEventListener("submit", handlePasswordSubmit);
});
