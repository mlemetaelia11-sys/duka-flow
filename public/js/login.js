"use strict";

const loginForm = document.querySelector("#login-form");
const loginMessage = document.querySelector("#login-message");
const loginSubmit = document.querySelector("#login-submit");
const googleLogin = document.querySelector("#google-login");

function setLoginMessage(message, type = "error") {
    loginMessage.textContent = message;
    loginMessage.className = `form-message ${type}`;
}

function showOAuthMessage() {
    const code = new URLSearchParams(window.location.search).get("oauth");
    const messages = {
        not_configured: "Google Sign-In is not configured yet.",
        invalid_state: "Your Google sign-in session expired. Please try again.",
        email_not_verified: "Google could not verify your email address.",
        account_disabled: "This account is disabled. Contact an owner.",
        business_inactive: "This business is inactive. Contact support.",
        account_not_found: "No DukaFlow account was found for that Google account. Use Sign up with Google to create one.",
        google_signin_failed: "Google sign-in could not be completed. Please try again."
    };

    if (messages[code]) {
        setLoginMessage(messages[code]);
        window.history.replaceState({}, document.title, "/login/");
    }
}

document.querySelectorAll("[data-toggle-password]").forEach((button) => {
    button.addEventListener("click", () => {
        const input = document.getElementById(button.dataset.togglePassword);
        if (!input) return;
        const show = input.type === "password";
        input.type = show ? "text" : "password";
        button.textContent = show ? "Hide" : "Show";
        button.setAttribute("aria-label", `${show ? "Hide" : "Show"} password`);
    });
});

googleLogin.addEventListener("click", () => {
    googleLogin.disabled = true;
    googleLogin.classList.add("is-loading");
    googleLogin.querySelector("span").textContent = "Connecting to Google...";
    window.location.assign("/api/auth/google?mode=login");
});

loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.querySelector("#login-email").value.trim();
    const password = document.querySelector("#login-password").value;

    if (!email || !password) {
        setLoginMessage("Enter your email and password.");
        return;
    }

    loginSubmit.disabled = true;
    loginSubmit.textContent = "Signing in...";
    setLoginMessage("");

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);

    try {
        const response = await fetch("/api/auth/login", {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json"
            },
            body: JSON.stringify({ email, password }),
            signal: controller.signal
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.message || "Unable to sign in.");

        window.location.replace("/");
    } catch (error) {
        const message = error?.name === "AbortError"
            ? "The server took too long to respond. Make sure DukaFlow is running and try again."
            : (error.message || "Unable to sign in.");
        setLoginMessage(message);
        loginSubmit.disabled = false;
        loginSubmit.textContent = "Continue";
    } finally {
        window.clearTimeout(timeout);
    }
});

showOAuthMessage();
