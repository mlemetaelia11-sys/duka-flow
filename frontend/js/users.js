"use strict";

const usersTableBody = document.querySelector("#users-table-body");
const userModal = document.querySelector("#user-modal");
const userForm = document.querySelector("#user-form");
const userNameInput = document.querySelector("#user-name");
const userEmailInput = document.querySelector("#user-email");
const userPasswordInput = document.querySelector("#user-password");
const userRoleInput = document.querySelector("#user-role");
const userModalTitle = document.querySelector("#user-modal-title");
const userSubmitButton = document.querySelector("#user-submit");
const userFormMessage = document.querySelector("#user-form-message");
const userPasswordHint = document.querySelector("#user-password-hint");

let users = [];
let editingUserId = null;

function escapeUserHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function formatUserDate(value) {
    if (!value) return "Never";
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? "-"
        : date.toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric"
        });
}

function setUserMessage(message, type = "error") {
    userFormMessage.textContent = message;
    userFormMessage.className = `form-message ${type}`;
}

function showUserModal(user = null) {
    editingUserId = user?.id ?? null;
    userForm.reset();
    setUserMessage("");

    userModalTitle.textContent = user ? "Edit User" : "Add User";
    userSubmitButton.textContent = user ? "Save Changes" : "Add User";
    userNameInput.value = user?.name ?? "";
    userEmailInput.value = user?.email ?? "";
    userRoleInput.value = user?.role ?? "cashier";
    userPasswordInput.required = !user;
    userPasswordHint.textContent = user
        ? "Leave blank to keep the current password"
        : "At least 10 characters";

    userModal.classList.add("is-open");
    userModal.setAttribute("aria-hidden", "false");
    userNameInput.focus();
}

function closeUserModal() {
    userModal.classList.remove("is-open");
    userModal.setAttribute("aria-hidden", "true");
    editingUserId = null;
}

function renderUsers() {
    if (!usersTableBody) return;

    if (users.length === 0) {
        usersTableBody.innerHTML = `
            <tr><td colspan="7"><div class="table-empty-state"><strong>No users found</strong></div></td></tr>
        `;
        return;
    }

    usersTableBody.innerHTML = users.map((user) => `
        <tr>
            <td><strong>${escapeUserHtml(user.name)}</strong></td>
            <td>${escapeUserHtml(user.email)}</td>
            <td>${escapeUserHtml(user.role)}</td>
            <td><span class="status-badge ${user.is_active ? "status-active" : "status-inactive"}">${user.is_active ? "Active" : "Inactive"}</span></td>
            <td>${formatUserDate(user.last_login_at)}</td>
            <td>${formatUserDate(user.created_at)}</td>
            <td>
                <div class="table-actions user-actions">
                    <button type="button" class="secondary-button" data-edit-user="${user.id}">Edit</button>
                    <button type="button" class="secondary-button" data-toggle-user="${user.id}">${user.is_active ? "Deactivate" : "Activate"}</button>
                    <button type="button" class="table-action-button danger" data-delete-user="${user.id}">Delete</button>
                </div>
            </td>
        </tr>
    `).join("");
}

async function requestJson(url, options = {}) {
    const response = await fetch(url, {
        credentials: "include",
        ...options,
        headers: {
            Accept: "application/json",
            ...(options.body ? { "Content-Type": "application/json" } : {}),
            ...options.headers
        }
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Request failed.");
    return result;
}

async function loadUsers() {
    try {
        const result = await requestJson("/api/users");
        users = Array.isArray(result.users) ? result.users : [];
        renderUsers();
    } catch (error) {
        usersTableBody.innerHTML = `<tr><td colspan="7">${escapeUserHtml(error.message)}</td></tr>`;
    }
}

document.querySelector("#open-user-modal").addEventListener("click", () => showUserModal());
document.querySelectorAll("[data-close-user-modal]").forEach((button) => {
    button.addEventListener("click", closeUserModal);
});

document.addEventListener("click", async (event) => {
    const editButton = event.target.closest("[data-edit-user]");
    const toggleButton = event.target.closest("[data-toggle-user]");
    const deleteButton = event.target.closest("[data-delete-user]");

    if (editButton) {
        const user = users.find((item) => Number(item.id) === Number(editButton.dataset.editUser));
        if (user) showUserModal(user);
        return;
    }

    if (toggleButton) {
        const user = users.find((item) => Number(item.id) === Number(toggleButton.dataset.toggleUser));
        if (!user) return;
        toggleButton.disabled = true;
        try {
            await requestJson(`/api/users/${user.id}/status`, {
                method: "PATCH",
                body: JSON.stringify({ is_active: !user.is_active })
            });
            await loadUsers();
        } catch (error) {
            window.alert(error.message);
        } finally {
            toggleButton.disabled = false;
        }
        return;
    }

    if (deleteButton) {
        const user = users.find((item) => Number(item.id) === Number(deleteButton.dataset.deleteUser));
        if (!user || !window.confirm(`Delete ${user.name}'s account?`)) return;
        deleteButton.disabled = true;
        try {
            await requestJson(`/api/users/${user.id}`, { method: "DELETE" });
            await loadUsers();
        } catch (error) {
            window.alert(error.message);
        } finally {
            deleteButton.disabled = false;
        }
    }
});

userForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = {
        name: userNameInput.value.trim(),
        email: userEmailInput.value.trim(),
        role: userRoleInput.value
    };
    if (userPasswordInput.value) payload.password = userPasswordInput.value;

    userSubmitButton.disabled = true;
    userSubmitButton.textContent = editingUserId ? "Saving..." : "Creating...";
    setUserMessage("");

    try {
        const isEditing = Boolean(editingUserId);
        const url = isEditing ? `/api/users/${editingUserId}` : "/api/users";
        const result = await requestJson(url, {
            method: isEditing ? "PUT" : "POST",
            body: JSON.stringify(payload)
        });
        closeUserModal();
        userForm.reset();
        await loadUsers();
        window.alert(result.message || "User saved successfully.");
    } catch (error) {
        setUserMessage(error.message || "Failed to save user.");
    } finally {
        userSubmitButton.disabled = false;
        userSubmitButton.textContent = editingUserId ? "Save Changes" : "Add User";
    }
});

loadUsers();
