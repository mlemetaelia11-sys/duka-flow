const savedCustomers = localStorage.getItem("dukaflow_customers");

const customers = savedCustomers
    ? JSON.parse(savedCustomers)
    : [];

    function populateCustomerSelect() {
    if (!paymentCustomerSelect) {
        return;
    }

    paymentCustomerSelect.innerHTML = `
        <option value="">Select customer</option>
    `;

    customers.forEach((customer) => {
        const option = document.createElement("option");

        option.value = customer.id;
        option.textContent = `${customer.name} - ${customer.phone}`;

        paymentCustomerSelect.appendChild(option);
    });
}
const paymentModal = document.querySelector("#payment-modal");
const openPaymentModalButton = document.querySelector("#open-payment-modal");
const closePaymentModalButtons = document.querySelectorAll(
    "[data-close-payment-modal]"
);

const paymentForm = document.querySelector("#payment-form");
const paymentFormMessage = document.querySelector("#payment-form-message");
const paymentCustomerSelect = document.querySelector("#payment-customer");
const paymentAmountInput = document.querySelector("#payment-amount");


function openPaymentModal() {
    if (!paymentModal) {
        return;
    }

    paymentModal.classList.add("is-open");
    paymentModal.setAttribute("aria-hidden", "false");

    if (paymentCustomerSelect) {
        paymentCustomerSelect.focus();
    }
}


function closePaymentModal() {
    if (!paymentModal) {
        return;
    }

    if (openPaymentModalButton) {
        openPaymentModalButton.focus();
    }

    paymentModal.classList.remove("is-open");
    paymentModal.setAttribute("aria-hidden", "true");
}


function showPaymentFormMessage(message, type = "error") {
    if (!paymentFormMessage) {
        return;
    }

    paymentFormMessage.textContent = message;
    paymentFormMessage.className = `form-message ${type}`;
}


function validatePaymentForm() {
    if (!paymentForm) {
        return false;
    }

    if (!paymentCustomerSelect || !paymentAmountInput) {
        showPaymentFormMessage(
            "Payment form is not configured correctly."
        );

        return false;
    }

    const customerId = paymentCustomerSelect.value;
    const amount = Number(paymentAmountInput.value);

    if (customerId === "") {
        showPaymentFormMessage(
            "Please select a customer."
        );

        paymentCustomerSelect.focus();

        return false;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
        showPaymentFormMessage(
            "Payment amount must be greater than 0."
        );

        paymentAmountInput.focus();

        return false;
    }

    return true;
}


if (openPaymentModalButton) {
    openPaymentModalButton.addEventListener(
        "click",
        openPaymentModal
    );
}


closePaymentModalButtons.forEach((button) => {
    button.addEventListener(
        "click",
        closePaymentModal
    );
});


if (paymentForm) {
    paymentForm.addEventListener("submit", (event) => {
        event.preventDefault();

        const isValid = validatePaymentForm();

        if (!isValid) {
            return;
        }

        showPaymentFormMessage(
            "Payment is valid. It has not been saved yet.",
            "success"
        );
    });
}

populateCustomerSelect();