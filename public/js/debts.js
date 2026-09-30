let debts = [];

async function loadDebts() {
    try {
        const response = await fetch(
            "/api/debts",
            {
                headers: {
                    Accept: "application/json"
                }
            }
        );

        const result = await response.json();

        if (!response.ok) {
            throw new Error(
                result.message ||
                "Failed to load debts."
            );
        }

        debts = result.debts || [];

        renderDebts();

    } catch (error) {
        console.error(
            "Load debts error:",
            error
        );
    }
}


let customers = [];

async function loadDebtCustomers() {
    try {
        const response = await fetch(
            "/api/customers",
            {
                credentials: "include",
                headers: {
                    Accept: "application/json"
                }
            }
        );
        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.message || "Failed to load customers.");
        }

        customers = Array.isArray(result.customers)
            ? result.customers
            : [];
        populateCustomerSelect();
    } catch (error) {
        console.error("Load debt customers error:", error);
    }
}


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
        option.textContent = customer.phone
            ? `${customer.name} - ${customer.phone}`
            : customer.name;

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

loadDebtCustomers();


function renderDebts() {
    const tableBody =
        document.querySelector(
            "#debts-table-body"
        );

    if (!tableBody) {
        return;
    }

    if (debts.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="7">
                    No debts found.
                </td>
            </tr>
        `;

        return;
    }

    tableBody.innerHTML =
        debts.map((debt) => {

            const status =
                debt.status === "paid"
                    ? "Paid"
                    : debt.status === "partial"
                    ? "Partially Paid"
                    : debt.status === "overdue"
                    ? "Overdue"
                    : "Unpaid";

            const dueDate =
                debt.due_date
                    ? new Date(
                        debt.due_date
                    ).toLocaleDateString(
                        "en-GB",
                        {
                            day: "2-digit",
                            month: "short",
                            year: "numeric"
                        }
                    )
                    : "-";

            return `
                <tr>

                    <td>
                        <strong>
                            ${escapeHtml(
                                debt.customer_name
                            )}
                        </strong>

                        <small>
                            ${escapeHtml(
                                debt.customer_phone || ""
                            )}
                        </small>
                    </td>

                    <td>
                        TSh ${formatDebtNumber(
                            debt.total_amount
                        )}
                    </td>

                    <td>
                        TSh ${formatDebtNumber(
                            debt.amount_paid
                        )}
                    </td>

                    <td>
                        <strong>
                            TSh ${formatDebtNumber(
                                debt.balance
                            )}
                        </strong>
                    </td>

                    <td>
                        ${dueDate}
                    </td>

                    <td>
                        <span class="status-badge">
                            ${status}
                        </span>
                    </td>

                    <td>

                        <div class="table-actions">

                            ${
                                debt.balance > 0
                                    ? `
                                        <button
                                            type="button"
                                            class="btn btn-sm btn-primary"
                                            data-record-payment="${debt.id}"
                                        >
                                            Record Payment
                                        </button>
                                      `
                                    : ""
                            }

                            <button
                                type="button"
                                class="btn btn-sm btn-secondary"
                                data-payment-history="${debt.id}"
                            >
                                History
                            </button>

                        </div>

                    </td>

                </tr>
            `;
        }).join("");
}


function formatDebtNumber(value) {
    return Number(
        value || 0
    ).toLocaleString(
        "en-TZ",
        {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }
    );
}


function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}


document.addEventListener(
    "DOMContentLoaded",
    () => {
        loadDebts();
    }
);

/* =========================================================
   RECORD DEBT PAYMENT
   ========================================================= */

document.addEventListener("click", (event) => {
    const button = event.target.closest(
        "[data-record-payment]"
    );

    if (!button) {
        return;
    }

    const debtId = button.getAttribute(
        "data-record-payment"
    );

    openPaymentModal(debtId);
});


function openPaymentModal(debtId) {
    const debt = debts.find(
        (item) =>
            Number(item.id) === Number(debtId)
    );

    if (!debt) {
        console.error("Debt not found:", debtId);
        return;
    }

    const modal =
        document.querySelector("#payment-modal") ||
        document.querySelector("[data-payment-modal]");

    if (!modal) {
        console.error("Payment modal not found.");
        return;
    }

    const amountInput =
        document.querySelector("#payment-amount") ||
        document.querySelector("#amount");

    const methodInput =
        document.querySelector("#payment-method") ||
        document.querySelector("[name='paymentMethod']");

    const notesInput =
        document.querySelector("#payment-notes") ||
        document.querySelector("[name='notes']");

    const customerElement =
        document.querySelector("#payment-customer");

    const balanceElement =
        document.querySelector("#payment-balance");

    /*
     * Store the debt ID on the modal.
     */
    modal.dataset.debtId = debt.id;

    if (customerElement) {
        customerElement.textContent =
            debt.customer_name;
    }

    if (balanceElement) {
        balanceElement.textContent =
            `TSh ${formatDebtNumber(debt.balance)}`;
    }

    if (amountInput) {
        amountInput.value = "";
        amountInput.max = Number(debt.balance);
    }

    if (methodInput) {
        methodInput.value = "cash";
    }

    if (notesInput) {
        notesInput.value = "";
    }

    modal.classList.add("active");
    modal.classList.add("show");
    modal.style.display = "flex";
    modal.setAttribute("aria-hidden", "false");

    setTimeout(() => {
        amountInput?.focus();
    }, 100);
}

/* =========================================================
   PAYMENT FORM
   ========================================================= */

if (paymentForm) {
    paymentForm.addEventListener(
        "submit",
        async (event) => {
            event.preventDefault();

            const modal =
                document.querySelector("#payment-modal") ||
                document.querySelector("[data-payment-modal]");

            if (!modal) {
                return;
            }

            const debtId =
                Number(modal.dataset.debtId);

            const amountInput =
                document.querySelector("#payment-amount") ||
                document.querySelector("#amount");

            const methodInput =
                document.querySelector("#payment-method") ||
                document.querySelector("[name='paymentMethod']");

            const notesInput =
                document.querySelector("#payment-notes") ||
                document.querySelector("[name='notes']");

            const amount =
                Number(amountInput?.value || 0);

            const paymentMethod =
                methodInput?.value || "cash";

            const notes =
                notesInput?.value.trim() || null;


            if (
                !Number.isFinite(amount) ||
                amount <= 0
            ) {
                alert(
                    "Enter a valid payment amount."
                );

                return;
            }


            const debt =
                debts.find(
                    (item) =>
                        Number(item.id) ===
                        debtId
                );

            if (!debt) {
                alert("Debt not found.");
                return;
            }


            if (
                amount >
                Number(debt.balance)
            ) {
                alert(
                    "Payment cannot exceed the remaining balance."
                );

                return;
            }


            const submitButton =
                paymentForm.querySelector(
                    "button[type='submit']"
                );

            if (submitButton) {
                submitButton.disabled = true;
                submitButton.textContent =
                    "Processing...";
            }


            try {
                const response =
                    await fetch(
                        `/api/debts/${debtId}/payments`,
                        {
                            method: "POST",

                            headers: {
                                "Content-Type":
                                    "application/json",

                                Accept:
                                    "application/json"
                            },

                            body:
                                JSON.stringify({
                                    amount,
                                    paymentMethod,
                                    notes
                                })
                        }
                    );


                const result =
                    await response.json();


                if (!response.ok) {
                    throw new Error(
                        result.message ||
                        "Failed to record payment."
                    );
                }


                alert(
                    result.message ||
                    "Debt payment recorded successfully."
                );


                closePaymentModal();


                await loadDebts();

            } catch (error) {

                console.error(
                    "Record payment error:",
                    error
                );

                alert(
                    error.message ||
                    "Failed to record payment."
                );

            } finally {

                if (submitButton) {
                    submitButton.disabled = false;
                    submitButton.textContent =
                        "Record Payment";
                }
            }
        }
    );
}

/* =========================================================
   CLOSE PAYMENT MODAL
   ========================================================= */

function closePaymentModal() {
    const modal =
        document.querySelector("#payment-modal") ||
        document.querySelector("[data-payment-modal]");

    if (!modal) {
        return;
    }

    if (
        document.activeElement &&
        modal.contains(
            document.activeElement
        )
    ) {
        document.activeElement.blur();
    }

    modal.classList.remove("active");
    modal.classList.remove("show");

    modal.style.display = "none";

    modal.setAttribute(
        "aria-hidden",
        "true"
    );

    delete modal.dataset.debtId;
}


/* =========================================================
   CLOSE BUTTON
   ========================================================= */

document.addEventListener("click", (event) => {
    const button = event.target.closest(
        "#close-payment-modal, #cancel-payment, #cancel-payment-btn"
    );

    if (!button) {
        return;
    }

    event.preventDefault();

    closePaymentModal();
});

/* =========================================================
   PAYMENT HISTORY
   ========================================================= */

document.addEventListener("click", (event) => {
    const button = event.target.closest(
        "[data-payment-history]"
    );

    if (!button) {
        return;
    }

    const debtId = Number(
        button.getAttribute(
            "data-payment-history"
        )
    );

    openPaymentHistory(debtId);
});


async function openPaymentHistory(debtId) {
    const debt = debts.find(
        (item) =>
            Number(item.id) === debtId
    );

    if (!debt) {
        alert("Debt not found.");
        return;
    }

    const modal =
        document.querySelector(
            "#payment-history-modal"
        );

    const customerElement =
        document.querySelector(
            "#payment-history-customer"
        );

    const totalElement =
        document.querySelector(
            "#history-total-debt"
        );

    const paidElement =
        document.querySelector(
            "#history-total-paid"
        );

    const balanceElement =
        document.querySelector(
            "#history-balance"
        );

    const tableBody =
        document.querySelector(
            "#payment-history-body"
        );

    if (!modal || !tableBody) {
        return;
    }

    if (customerElement) {
        customerElement.textContent =
            `${debt.customer_name} • ${debt.receipt_number}`;
    }

    if (totalElement) {
        totalElement.textContent =
            `TSh ${formatDebtNumber(
                debt.total_amount
            )}`;
    }

    if (paidElement) {
        paidElement.textContent =
            `TSh ${formatDebtNumber(
                debt.amount_paid
            )}`;
    }

    if (balanceElement) {
        balanceElement.textContent =
            `TSh ${formatDebtNumber(
                debt.balance
            )}`;
    }

    tableBody.innerHTML = `
        <tr>
            <td colspan="4">
                Loading payment history...
            </td>
        </tr>
    `;

    modal.classList.add("active");
    modal.classList.add("show");
    modal.style.display = "flex";
    modal.setAttribute(
        "aria-hidden",
        "false"
    );

    try {
        const response = await fetch(
            `/api/debts/${debtId}/payments`,
            {
                headers: {
                    Accept:
                        "application/json"
                }
            }
        );

        const result =
            await response.json();

        if (!response.ok) {
            throw new Error(
                result.message ||
                "Failed to load payment history."
            );
        }

        const payments =
            result.payments || [];

        if (payments.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="4">
                        No payments recorded yet.
                    </td>
                </tr>
            `;

            return;
        }

        tableBody.innerHTML =
            payments.map((payment) => {

                const date =
                    new Date(
                        payment.paid_at
                    ).toLocaleString(
                        "en-GB",
                        {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit"
                        }
                    );

                return `
                    <tr>

                        <td>
                            ${date}
                        </td>

                        <td>
                            <strong>
                                TSh ${formatDebtNumber(
                                    payment.amount
                                )}
                            </strong>
                        </td>

                        <td>
                            ${formatDebtPaymentMethod(
                                payment.payment_method
                            )}
                        </td>

                        <td>
                            ${escapeHtml(
                                payment.notes || "-"
                            )}
                        </td>

                    </tr>
                `;
            }).join("");

    } catch (error) {

        console.error(
            "Payment history error:",
            error
        );

        tableBody.innerHTML = `
            <tr>
                <td colspan="4">
                    Failed to load payment history.
                </td>
            </tr>
        `;
    }
}


/* =========================================================
   PAYMENT METHOD
   ========================================================= */

function formatDebtPaymentMethod(method) {
    const methods = {
        cash: "Cash",
        mobile_money: "Mobile Money",
        bank: "Bank"
    };

    return methods[method] || method;
}


/* =========================================================
   CLOSE HISTORY MODAL
   ========================================================= */

function closePaymentHistory() {
    const modal =
        document.querySelector(
            "#payment-history-modal"
        );

    if (!modal) {
        return;
    }

    if (
        document.activeElement &&
        modal.contains(
            document.activeElement
        )
    ) {
        document.activeElement.blur();
    }

    modal.classList.remove("active");
    modal.classList.remove("show");
    modal.style.display = "none";

    modal.setAttribute(
        "aria-hidden",
        "true"
    );
}


document.addEventListener("click", (event) => {

    if (
        event.target.closest(
            "#close-payment-history"
        ) ||
        event.target.closest(
            "#close-payment-history-bottom"
        )
    ) {
        closePaymentHistory();
    }

});