const customerModal = document.querySelector("#customer-modal");
const openCustomerModalButton = document.querySelector("#open-customer-modal");
const closeCustomerModalButtons = document.querySelectorAll(
    "[data-close-customer-modal]"
);

const customerForm = document.querySelector("#customer-form");
const customerFormMessage = document.querySelector("#customer-form-message");

const customersTableBody = document.querySelector("#customers-table-body");

const customers = [];


function openCustomerModal() {
    if (!customerModal) {
        return;
    }

    customerModal.classList.add("is-open");
    customerModal.setAttribute("aria-hidden", "false");
}


function closeCustomerModal() {
    if (!customerModal) {
        return;
    }

    customerModal.classList.remove("is-open");
    customerModal.setAttribute("aria-hidden", "true");
}


function showCustomerFormMessage(message, type = "error") {
    if (!customerFormMessage) {
        return;
    }

    customerFormMessage.textContent = message;
    customerFormMessage.className = `form-message ${type}`;
}


function validateCustomerForm() {
    if (!customerForm) {
        return false;
    }

    const customerName = document.querySelector("#customer-name");
    const customerPhone = document.querySelector("#customer-phone");

    if (!customerName || !customerPhone) {
        showCustomerFormMessage(
            "Customer form is not configured correctly."
        );

        return false;
    }

    const name = customerName.value.trim();
    const phone = customerPhone.value.trim();

    if (name.length < 2) {
        showCustomerFormMessage(
            "Customer name must contain at least 2 characters."
        );

        customerName.focus();

        return false;
    }

    if (phone.length < 7) {
        showCustomerFormMessage(
            "Please enter a valid phone number."
        );

        customerPhone.focus();

        return false;
    }

    return true;
}


function renderCustomers() {
    if (!customersTableBody) {
        return;
    }

    if (customers.length === 0) {
        customersTableBody.innerHTML = `
            <tr>
                <td colspan="6">
                    <div class="table-empty-state">
                        <strong>No customers yet</strong>
                        <span>
                            Customers will appear here after they are added.
                        </span>
                    </div>
                </td>
            </tr>
        `;

        return;
    }

    customersTableBody.innerHTML = "";

    customers.forEach((customer) => {
        const row = document.createElement("tr");

        row.innerHTML = `
            <td>${customer.name}</td>
            <td>${customer.phone}</td>
            <td>TSh 0</td>
            <td>TSh 0</td>
            <td>Active</td>
            <td>
                <button
                    class="table-action-button"
                    type="button"
                    data-customer-id="${customer.id}"
                >
                    Delete
                </button>
            </td>
        `;

        customersTableBody.appendChild(row);
    });
}


function addCustomerFromForm() {
    if (!customerForm) {
        return;
    }

    const isValid = validateCustomerForm();

    if (!isValid) {
        return;
    }

    const customerName = document.querySelector("#customer-name");
    const customerPhone = document.querySelector("#customer-phone");

    if (!customerName || !customerPhone) {
        return;
    }

    const customer = {
        id: Date.now(),
        name: customerName.value.trim(),
        phone: customerPhone.value.trim()
    };

    customers.push(customer);

    renderCustomers();

    customerForm.reset();

    closeCustomerModal();
}


if (openCustomerModalButton) {
    openCustomerModalButton.addEventListener(
        "click",
        openCustomerModal
    );
}


closeCustomerModalButtons.forEach((button) => {
    button.addEventListener("click", closeCustomerModal);
});


if (customerForm) {
    customerForm.addEventListener("submit", (event) => {
        event.preventDefault();

        addCustomerFromForm();
    });
}


if (customersTableBody) {
    customersTableBody.addEventListener("click", (event) => {
        const clickedButton = event.target.closest(
            "[data-customer-id]"
        );

        if (!clickedButton) {
            return;
        }

        const customerId = Number(
            clickedButton.dataset.customerId
        );

        const customerIndex = customers.findIndex(
            (customer) => customer.id === customerId
        );

        if (customerIndex === -1) {
            return;
        }

        customers.splice(customerIndex, 1);

        renderCustomers();
    });
}


renderCustomers();