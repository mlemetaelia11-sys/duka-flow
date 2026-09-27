const customerModal = document.querySelector("#customer-modal");
const openCustomerModalButton = document.querySelector("#open-customer-modal");
const closeCustomerModalButtons = document.querySelectorAll(
    "[data-close-customer-modal]"
);

const customerForm = document.querySelector("#customer-form");
const customerFormMessage = document.querySelector("#customer-form-message");

const customersTableBody = document.querySelector("#customers-table-body");
const customerSearchInput = document.querySelector("#customer-search");

const savedCustomers = localStorage.getItem("dukaflow_customers");

const customers = savedCustomers
    ? JSON.parse(savedCustomers)
    : [];
function getFilteredCustomers() {
    if (!customerSearchInput) {
        return customers;
    }

    const searchTerm = customerSearchInput.value.trim().toLowerCase();

    if (searchTerm === "") {
        return customers;
    }

    return customers.filter((customer) =>
        customer.name.toLowerCase().includes(searchTerm) ||
        customer.phone.toLowerCase().includes(searchTerm)
    );
}


function openCustomerModal() {
    if (!customerModal) {
        return;
    }

    customerModal.classList.add("is-open");
    customerModal.setAttribute("aria-hidden", "false");

    const customerName = document.querySelector("#customer-name");

    if (customerName) {
        customerName.focus();
    }
}


function closeCustomerModal() {
    if (!customerModal) {
        return;
    }

    if (openCustomerModalButton) {
        openCustomerModalButton.focus();
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

    const filteredCustomers = getFilteredCustomers();

    if (filteredCustomers.length === 0) {
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

    filteredCustomers.forEach((customer) => {
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

localStorage.setItem(
    "dukaflow_customers",
    JSON.stringify(customers)
);

renderCustomers();

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

localStorage.setItem(
    "dukaflow_customers",
    JSON.stringify(customers)
);

renderCustomers();
    });
}


renderCustomers();