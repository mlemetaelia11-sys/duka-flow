"use strict";

const registerForm = document.querySelector("#register-form");
const registerMessage = document.querySelector("#register-message");
const registerSubmit = document.querySelector("#register-submit");
const googleRegister = document.querySelector("#google-register");
const businessNameInput = document.querySelector("#register-business-name");
const passwordInput = document.querySelector("#register-password");
const passwordStrength = document.querySelector("#register-password-strength");
const passwordStrengthLabel = document.querySelector("#register-password-strength-label");

function setRegisterMessage(message, type = "error") {
    registerMessage.textContent = message;
    registerMessage.className = `form-message ${type}`;
}

function measurePasswordStrength(password) {
    let score = 0;
    if (password.length >= 10) score++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    return score;
}

function updatePasswordStrength() {
    const score = measurePasswordStrength(passwordInput.value);
    const labels = ["Enter a password", "Weak", "Fair", "Good", "Strong"];
    passwordStrength.value = score;
    passwordStrengthLabel.textContent = labels[score];
}

function showOAuthMessage() {
    const code = new URLSearchParams(window.location.search).get("oauth");
    const messages = {
        business_name_required: "Enter your business name first, then choose Sign up with Google.",
        invalid_state: "Your Google sign-up session expired. Please try again.",
        email_not_verified: "Google could not verify your email address.",
        account_disabled: "This account is disabled. Contact an owner.",
        business_inactive: "This business is inactive. Contact support.",
        google_signin_failed: "Google sign-up could not be completed. Please try again."
    };

    if (messages[code]) {
        setRegisterMessage(messages[code]);
        window.history.replaceState({}, document.title, "/register/");
    }
}

passwordInput.addEventListener("input", updatePasswordStrength);

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

googleRegister.addEventListener("click", () => {
    const businessName = businessNameInput.value.trim();

    if (businessName.length < 2 || businessName.length > 150) {
        setRegisterMessage("Enter your business name first, then choose Sign up with Google.");
        businessNameInput.focus();
        return;
    }

    googleRegister.disabled = true;
    googleRegister.classList.add("is-loading");
    googleRegister.querySelector("span").textContent = "Connecting to Google...";

    const params = new URLSearchParams({
        mode: "signup",
        businessName
    });
    window.location.assign(`/api/auth/google?${params.toString()}`);
});

registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const name = document.querySelector("#register-name").value.trim();
    const businessName = businessNameInput.value.trim();
    const email = document.querySelector("#register-email").value.trim();
    const password = passwordInput.value;

    if (name.length < 2 || businessName.length < 2 || !email || password.length < 10) {
        setRegisterMessage("Enter a business name, valid name and email, and a password of at least 10 characters.");
        return;
    }

    registerSubmit.disabled = true;
    registerSubmit.textContent = "Creating account...";
    setRegisterMessage("");

    try {
        const response = await fetch("/api/auth/register", {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json"
            },
            body: JSON.stringify({ name, businessName, email, password })
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.message || "Unable to create account.");

        window.location.replace("/");
    } catch (error) {
        setRegisterMessage(error.message || "Unable to create account.");
        registerSubmit.disabled = false;
        registerSubmit.textContent = "Create account";
    }
});

showOAuthMessage();
