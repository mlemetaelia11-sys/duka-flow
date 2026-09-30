"use strict";
let salesCustomers = [];
let salesProducts = [];
let salesCart = [];
const customerDisplayChannel = "BroadcastChannel" in window ? new BroadcastChannel("dukaflow-customer-display") : null;


/* =========================================================
   INITIALIZE
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {
    initializeSales();
});


async function initializeSales() {
    await loadSalesProducts();
    await loadSalesCustomers();

    setupSalesProductSelector();
    setupSalesBarcodeScanner();
    setupSalesCartEvents();
    setupPaymentMethod();
    setupCustomerDisplayButton();
    setupSalesHistoryFilters();
    calculateSaleTotals();
    publishCustomerDisplay();
}


function setupCustomerDisplayButton() {
    const button = document.querySelector("#open-customer-display");
    if (!button) return;
    button.addEventListener("click", () => {
        publishCustomerDisplay();
        const displayWindow = window.open(
            "/customer-display/",
            "dukaflow-customer-display",
            "noopener,noreferrer,width=1100,height=760"
        );
        if (displayWindow) {
            window.setTimeout(() => {
                publishCustomerDisplay();
            }, 250);
        }
    });
}


/* =========================================================
   LOAD PRODUCTS
   ========================================================= */

async function loadSalesProducts() {
    try {
        const response = await fetch("/api/products", {
            headers: {
                Accept: "application/json"
            }
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(
                result.message ||
                "Failed to load products."
            );
        }

        salesProducts = Array.isArray(result.products)
            ? result.products
            : [];

        populateProductSelector();

    } catch (error) {
        console.error(
            "Sales products error:",
            error
        );
    }
}


async function loadSalesCustomers() {
    try {
        const response = await fetch(
            "/api/customers",
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
                "Failed to load customers."
            );
        }

        salesCustomers =
            result.customers || [];

        populateCustomerSelector();

    } catch (error) {
        console.error(
            "Sales customers error:",
            error
        );
    }
}


function populateCustomerSelector() {
    const customerSelect =
        document.querySelector(
            "#sale-customer"
        );

    if (!customerSelect) {
        return;
    }

    customerSelect.innerHTML = `
        <option value="">
            Select customer
        </option>
    `;

    salesCustomers.forEach((customer) => {
        const option =
            document.createElement("option");

        option.value = customer.id;

        option.textContent =
            customer.phone
                ? `${customer.name} — ${customer.phone}`
                : customer.name;

        customerSelect.appendChild(
            option
        );
    });
}


function setupPaymentMethod() {
    const paymentMethodSelect =
        document.querySelector(
            "#sale-payment-method"
        ) ||
        document.querySelector(
            "#payment-method"
        );

    const customerGroup =
        document.querySelector(
            "#sale-customer-group"
        );

    const dueDateGroup =
        document.querySelector(
            "#sale-due-date-group"
        );

    const customerSelect =
        document.querySelector(
            "#sale-customer"
        );

    const mobileProviderGroup = document.querySelector("#sale-mobile-provider-group");
    const mobileProviderSelect = document.querySelector("#sale-mobile-provider");

    if (!paymentMethodSelect) {
        return;
    }

    function updateCreditFields() {
        const isCredit =
            paymentMethodSelect.value === "credit";

        if (customerGroup) {
            customerGroup.style.display =
                isCredit ? "block" : "none";
        }

        if (dueDateGroup) {
            dueDateGroup.style.display =
                isCredit ? "block" : "none";
        }

        if (mobileProviderGroup) {
            mobileProviderGroup.style.display = paymentMethodSelect.value === "mobile_money" ? "grid" : "none";
        }

        if (!isCredit) {
            if (customerSelect) {
                customerSelect.value = "";
            }

            const dueDateInput =
                document.querySelector(
                    "#sale-due-date"
                );

            if (dueDateInput) {
                dueDateInput.value = "";
            }
        }
    }

    paymentMethodSelect.addEventListener(
        "change",
        updateCreditFields
    );

    updateCreditFields();
}


/* =========================================================
   PRODUCT SELECTOR
   ========================================================= */

function setupSalesBarcodeScanner() {
    const input = document.querySelector("#sale-barcode");
    if (!input) return;

    const addByCode = () => {
        const code = String(input.value || "").trim().toLowerCase();
        if (!code) return;
        const product = salesProducts.find((item) =>
            String(item.barcode || "").trim().toLowerCase() === code ||
            String(item.sku || "").trim().toLowerCase() === code
        );
        if (!product) {
            showSalesMessage("Product barcode/SKU was not found.", "error");
            return;
        }
        const select = document.querySelector("#sale-product");
        const quantity = document.querySelector("#sale-quantity");
        if (select) select.value = String(product.id);
        if (quantity && (!quantity.value || Number(quantity.value) < 1)) quantity.value = "1";
        updateSelectedProductInfo();
        addSelectedProductToCart();
        input.value = "";
    };

    input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            addByCode();
        }
    });
}

function setupSalesProductSelector() {
    const productSelect =
        document.querySelector("#sale-product") ||
        document.querySelector("#product-select") ||
        document.querySelector("[data-sale-product]");

    if (!productSelect) {
        return;
    }

    productSelect.addEventListener("change", () => {
        updateSelectedProductInfo();
    });


    const addButton =
        document.querySelector("#add-to-cart-btn") ||
        document.querySelector("#add-to-cart") ||
        document.querySelector("[data-add-to-cart]");

    if (addButton) {
        addButton.addEventListener("click", () => {
            addSelectedProductToCart();
        });
    }
}


/* =========================================================
   POPULATE PRODUCT SELECT
   ========================================================= */

function populateProductSelector() {
    const productSelect =
        document.querySelector("#sale-product") ||
        document.querySelector("#product-select") ||
        document.querySelector("[data-sale-product]");

    if (!productSelect) {
        return;
    }

    productSelect.innerHTML = `
        <option value="">
            Select product
        </option>
    `;

    salesProducts.forEach((product) => {
        const stock =
            Number(product.stock_quantity || 0);

        const option =
            document.createElement("option");

        option.value = product.id;

        option.textContent =
            `${product.name} — TSh ${formatNumber(product.selling_price)} — Stock: ${stock}`;

        option.disabled = stock <= 0;

        productSelect.appendChild(option);
    });
}


/* =========================================================
   SELECTED PRODUCT INFO
   ========================================================= */

function updateSelectedProductInfo() {
    const productSelect =
        document.querySelector("#sale-product") ||
        document.querySelector("#product-select") ||
        document.querySelector("[data-sale-product]");

    const priceInput =
        document.querySelector("#sale-price") ||
        document.querySelector("#product-price");

    if (!productSelect) {
        return;
    }

    const productId =
        Number(productSelect.value);

    const product =
        salesProducts.find(
            (item) =>
                Number(item.id) === productId
        );

    if (!product) {
        return;
    }

    if (priceInput) {
        priceInput.value =
            Number(product.selling_price);
    }

    const stockElement =
        document.querySelector("#sale-stock") ||
        document.querySelector("#product-stock");

    if (stockElement) {
        stockElement.textContent =
            `Available: ${product.stock_quantity}`;
    }
}


/* =========================================================
   ADD PRODUCT TO CART
   ========================================================= */

function addSelectedProductToCart() {
    const productSelect =
        document.querySelector("#sale-product") ||
        document.querySelector("#product-select") ||
        document.querySelector("[data-sale-product]");

    const quantityInput =
        document.querySelector("#sale-quantity") ||
        document.querySelector("#product-quantity");

    if (!productSelect) {
        showSalesMessage(
            "Select a product first.",
            "error"
        );

        return;
    }

    const productId =
        Number(productSelect.value);

    const quantity =
        Number(quantityInput?.value || 1);

    if (!productId) {
        showSalesMessage(
            "Select a product first.",
            "error"
        );

        return;
    }

    if (
        !Number.isInteger(quantity) ||
        quantity <= 0
    ) {
        showSalesMessage(
            "Quantity must be a positive whole number.",
            "error"
        );

        return;
    }

    const product =
        salesProducts.find(
            (item) =>
                Number(item.id) === productId
        );

    if (!product) {
        showSalesMessage(
            "Product not found.",
            "error"
        );

        return;
    }

    const existingItem =
        salesCart.find(
            (item) =>
                Number(item.productId) === productId
        );

    const existingQuantity =
        existingItem
            ? existingItem.quantity
            : 0;

    if (
        existingQuantity + quantity >
        Number(product.stock_quantity)
    ) {
        showSalesMessage(
            `Only ${product.stock_quantity} ${product.name} available.`,
            "error"
        );

        return;
    }


    if (existingItem) {
        existingItem.quantity += quantity;

    } else {
        salesCart.push({
            productId: product.id,
            name: product.name,
            quantity: quantity,
            unitPrice:
                Number(product.selling_price),
            buyingPrice:
                Number(product.buying_price)
        });
    }


    renderSalesCart();

    calculateSaleTotals();
    publishCustomerDisplay();

    if (quantityInput) {
        quantityInput.value = 1;
    }
}


/* =========================================================
   CART EVENTS
   ========================================================= */

function setupSalesCartEvents() {
    document.addEventListener("click", (event) => {

        const removeButton =
            event.target.closest(
                "[data-remove-sale-item]"
            );

        if (removeButton) {
            const productId =
                Number(
                    removeButton.getAttribute(
                        "data-remove-sale-item"
                    )
                );

            removeFromCart(productId);

            return;
        }


        const increaseButton =
            event.target.closest(
                "[data-increase-sale-item]"
            );

        if (increaseButton) {
            const productId =
                Number(
                    increaseButton.getAttribute(
                        "data-increase-sale-item"
                    )
                );

            changeCartQuantity(
                productId,
                1
            );

            return;
        }


        const decreaseButton =
            event.target.closest(
                "[data-decrease-sale-item]"
            );

        if (decreaseButton) {
            const productId =
                Number(
                    decreaseButton.getAttribute(
                        "data-decrease-sale-item"
                    )
                );

            changeCartQuantity(
                productId,
                -1
            );
        }
    });
}


/* =========================================================
   CHANGE CART QUANTITY
   ========================================================= */

function changeCartQuantity(
    productId,
    amount
) {
    const item =
        salesCart.find(
            (cartItem) =>
                Number(cartItem.productId) ===
                Number(productId)
        );

    if (!item) {
        return;
    }

    const product =
        salesProducts.find(
            (productItem) =>
                Number(productItem.id) ===
                Number(productId)
        );

    if (!product) {
        return;
    }

    const newQuantity =
        item.quantity + amount;

    if (newQuantity <= 0) {
        removeFromCart(productId);
        return;
    }

    if (
        newQuantity >
        Number(product.stock_quantity)
    ) {
        showSalesMessage(
            `Only ${product.stock_quantity} available.`,
            "error"
        );

        return;
    }

    item.quantity = newQuantity;

    renderSalesCart();

    calculateSaleTotals();
    publishCustomerDisplay();
}


/* =========================================================
   REMOVE FROM CART
   ========================================================= */

function removeFromCart(productId) {
    salesCart =
        salesCart.filter(
            (item) =>
                Number(item.productId) !==
                Number(productId)
        );

    renderSalesCart();

    calculateSaleTotals();
    publishCustomerDisplay();
}


/* =========================================================
   RENDER CART
   ========================================================= */

function renderSalesCart() {
    const cartBody =
        document.querySelector(
            "#sale-cart-body"
        ) ||
        document.querySelector(
            "#cart-body"
        ) ||
        document.querySelector(
            "[data-sale-cart]"
        );

    if (!cartBody) {
        return;
    }

    if (salesCart.length === 0) {
        cartBody.innerHTML = `
            <tr>
                <td colspan="6">
                    No products added yet.
                </td>
            </tr>
        `;

        return;
    }


    cartBody.innerHTML =
        salesCart.map((item) => {

            const lineTotal =
                item.quantity *
                item.unitPrice;

            return `
                <tr>

                    <td>
                        ${escapeHtml(item.name)}
                    </td>

                    <td>
                        TSh ${formatNumber(item.unitPrice)}
                    </td>

                    <td>

                        <button
                            type="button"
                            data-decrease-sale-item="${item.productId}"
                        >
                            −
                        </button>

                        <span>
                            ${item.quantity}
                        </span>

                        <button
                            type="button"
                            data-increase-sale-item="${item.productId}"
                        >
                            +
                        </button>

                    </td>

                    <td>
                        TSh ${formatNumber(lineTotal)}
                    </td>

                    <td>

                        <button
                            type="button"
                            data-remove-sale-item="${item.productId}"
                        >
                            Remove
                        </button>

                    </td>

                </tr>
            `;
        }).join("");
}


/* =========================================================
   TOTALS
   ========================================================= */

function calculateSaleTotals() {
    const subtotal =
        salesCart.reduce(
            (total, item) =>
                total +
                (
                    item.quantity *
                    item.unitPrice
                ),
            0
        );


    const discountInput =
        document.querySelector(
            "#sale-discount"
        ) ||
        document.querySelector(
            "#discount"
        );

    const discount =
        Number(
            discountInput?.value || 0
        );


    const total =
        Math.max(
            subtotal - discount,
            0
        );


    const subtotalElement =
        document.querySelector(
            "#sale-subtotal"
        );

    const discountElement =
        document.querySelector(
            "#sale-discount-total"
        );

    const totalElement =
        document.querySelector(
            "#sale-total"
        );


    if (subtotalElement) {
        subtotalElement.textContent =
            `TSh ${formatNumber(subtotal)}`;
    }

    if (discountElement) {
        discountElement.textContent =
            `TSh ${formatNumber(discount)}`;
    }

    if (totalElement) {
        totalElement.textContent =
            `TSh ${formatNumber(total)}`;
    }


    calculateChange(total);
}


/* =========================================================
   CHANGE
   ========================================================= */

function calculateChange(total) {
    const amountPaidInput =
        document.querySelector(
            "#sale-amount-paid"
        ) ||
        document.querySelector(
            "#amount-paid"
        );

    const changeElement =
        document.querySelector(
            "#sale-change"
        ) ||
        document.querySelector(
            "#change"
        );

    if (!changeElement) {
        return;
    }

    const amountPaid =
        Number(
            amountPaidInput?.value || 0
        );

    const change =
        Math.max(
            amountPaid - total,
            0
        );

    changeElement.textContent =
        `TSh ${formatNumber(change)}`;
}


/* =========================================================
   INPUT EVENTS
   ========================================================= */

document.addEventListener(
    "input",
    (event) => {

        if (
            event.target.matches(
                "#sale-discount, #discount, #sale-amount-paid, #amount-paid"
            )
        ) {
            calculateSaleTotals();
        }
    }
);


/* =========================================================
   HELPERS
   ========================================================= */

function createIdempotencyKey() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return `sale-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}


function formatNumber(value) {
    return Number(value || 0)
        .toLocaleString("en-TZ", {
            maximumFractionDigits: 2
        });
}


function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}


function publishCustomerDisplay() {
    if (!customerDisplayChannel) return;

    const total = salesCart.reduce(
        (sum, item) => sum + (Number(item.quantity || 0) * Number(item.unitPrice || 0)),
        0
    );

    customerDisplayChannel.postMessage({
        type: "cart",
        payload: {
            businessName: window.__DUKAFLOW_USER__?.business_name || window.__DUKAFLOW_USER__?.businessName || "DukaFlow",
            items: salesCart.map((item) => ({
                name: item.name,
                quantity: Number(item.quantity),
                unitPrice: Number(item.unitPrice)
            })),
            total
        }
    });
}

function showSalesMessage(
    message,
    type = "success"
) {
    let container =
        document.querySelector(
            "#sales-message"
        );

    if (!container) {
        container =
            document.createElement("div");

        container.id =
            "sales-message";

        document.body.appendChild(
            container
        );
    }

    container.textContent = message;
    container.dataset.type = type;
}


/* =========================================================
   GLOBAL ACCESS
   ========================================================= */

window.salesCart =
    salesCart;

window.renderSalesCart =
    renderSalesCart;

window.calculateSaleTotals =
    calculateSaleTotals;

    /* =========================================================
   COMPLETE SALE
   ========================================================= */

const completeSaleButton =
    document.querySelector("#complete-sale-btn");

if (completeSaleButton) {
    completeSaleButton.addEventListener("click", async () => {

        if (salesCart.length === 0) {
            showSalesMessage(
                "Add at least one product to the cart.",
                "error"
            );

            return;
        }

        const discountInput =
            document.querySelector("#sale-discount");

        const amountPaidInput =
            document.querySelector("#sale-amount-paid");

        const paymentMethodInput =
            document.querySelector("#sale-payment-method") ||
            document.querySelector("#payment-method");

        const discount =
            Number(discountInput?.value || 0);

        const amountPaid =
            Number(amountPaidInput?.value || 0);

        const paymentMethod =
            paymentMethodInput?.value || "cash";
const customerSelect =
    document.querySelector(
        "#sale-customer"
    );

const dueDateInput =
    document.querySelector(
        "#sale-due-date"
    );

const customerId =
    customerSelect?.value
        ? Number(customerSelect.value)
        : null;

const dueDate =
    dueDateInput?.value || null;

        if (
            paymentMethod === "credit" &&
            !customerId
        ) {
            showSalesMessage(
                "Please select a customer for a credit sale.",
                "error"
            );

            return;
        }

        const saleData = {
            items: salesCart.map((item) => ({
                productId: Number(item.productId),
                quantity: Number(item.quantity)
            })),

            discount,

            paymentMethod,

            amountPaid,

            customerId,

            dueDate,

            paymentReference: document.querySelector("#sale-payment-reference")?.value.trim() || null,

            mobileMoneyProvider: document.querySelector("#sale-mobile-provider")?.value || null
        };

        try {
            if (!navigator.onLine) {
                throw new Error("You are offline. Reconnect to complete the sale safely.");
            }

            completeSaleButton.disabled = true;
            completeSaleButton.textContent =
                "Processing...";

            const response = await fetch(
                "/api/sales",
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json",

                        Accept:
                            "application/json",

                        "X-Idempotency-Key": createIdempotencyKey()
                    },

                    body:
                        JSON.stringify(
                            saleData
                        )
                }
            );

            const result =
                await response.json();

            if (!response.ok) {
                throw new Error(
                    result.message ||
                    "Failed to complete sale."
                );
            }

            showSalesMessage(
                `Sale completed. Receipt: ${result.sale.receipt_number}`,
                "success"
            );

            salesCart = [];

            renderSalesCart();

            if (discountInput) {
                discountInput.value = 0;
            }

            if (amountPaidInput) {
                amountPaidInput.value = 0;
            }
            const referenceInput = document.querySelector("#sale-payment-reference");
            if (referenceInput) referenceInput.value = "";
            const mobileProvider = document.querySelector("#sale-mobile-provider");
            if (mobileProvider) mobileProvider.value = "";

            calculateSaleTotals();

            await loadSalesProducts();

            if (customerDisplayChannel) {
                customerDisplayChannel.postMessage({
                    type: "complete",
                    businessName: window.__DUKAFLOW_USER__?.business_name || window.__DUKAFLOW_USER__?.businessName || "DukaFlow"
                });
            }

        } catch (error) {
            console.error(
                "Complete sale error:",
                error
            );

            showSalesMessage(
                error.message ||
                "Failed to complete sale.",
                "error"
            );

        } finally {
            completeSaleButton.disabled = false;
            completeSaleButton.textContent =
                "Complete Sale";
        }
    });
}

/* =========================================================
   SALES HISTORY
   ========================================================= */

let salesHistoryState = {
    search: "",
    paymentMethod: "",
    status: ""
};

async function loadSalesHistory() {
    const salesHistoryBody = document.querySelector("#sales-history-body");
    if (!salesHistoryBody) return;

    salesHistoryBody.innerHTML = `<tr><td colspan="8"><div class="df-table-loading">Inapakia mauzo...</div></td></tr>`;

    const params = new URLSearchParams({
        page: "1",
        limit: "25"
    });
    if (salesHistoryState.search) params.set("search", salesHistoryState.search);
    if (salesHistoryState.paymentMethod) params.set("paymentMethod", salesHistoryState.paymentMethod);
    if (salesHistoryState.status) params.set("status", salesHistoryState.status);

    try {
        const response = await fetch(`/api/sales?${params.toString()}`, {
            credentials: "include",
            headers: { Accept: "application/json" }
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || "Failed to load sales history.");
        renderSalesHistory(result.sales || []);
    } catch (error) {
        console.error("Sales history error:", error);
        salesHistoryBody.innerHTML = `
            <tr><td colspan="8">
                <div class="df-dashboard-error">
                    <span>Imeshindikana kupakia historia ya mauzo.</span>
                    <button type="button" id="sales-history-retry">Jaribu tena</button>
                </div>
            </td></tr>`;
        document.querySelector("#sales-history-retry")?.addEventListener("click", loadSalesHistory);
    }
}

function renderSalesHistory(sales) {
    const salesHistoryBody = document.querySelector("#sales-history-body");
    if (!salesHistoryBody) return;

    if (!sales.length) {
        salesHistoryBody.innerHTML = `
            <tr><td colspan="8">
                <div class="df-inline-empty large">
                    <span class="df-empty-icon">↗</span>
                    <div><strong>Hakuna mauzo yaliyopatikana</strong><small>Badili filters au kamilisha mauzo mapya.</small></div>
                </div>
            </td></tr>`;
        return;
    }

    salesHistoryBody.innerHTML = sales.map((sale) => {
        const date = new Date(sale.created_at).toLocaleString("sw-TZ", {
            day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
        });
        const payment = formatPaymentMethod(sale.payment_method);
        const status = String(sale.status || "unknown");
        const statusLabel = {
            paid: "Imelipwa",
            partial: "Sehemu",
            credit: "Deni",
            cancelled: "Imeghairiwa"
        }[status] || status;
        const statusClass = status === "paid" ? "success" : (status === "cancelled" ? "danger" : "warning");

        return `
            <tr>
                <td><strong>${escapeHtml(sale.receipt_number || `#${sale.id}`)}</strong></td>
                <td>
                    <div class="df-receipt-cell">
                        <div><strong>${escapeHtml(sale.customer_name || "Walk-in customer")}</strong><small>${escapeHtml(sale.customer_phone || "—")}</small></div>
                    </div>
                </td>
                <td>${escapeHtml(date)}</td>
                <td>${escapeHtml(sale.staff_name || "System")}</td>
                <td><strong>TSh ${formatNumber(sale.total_amount)}</strong></td>
                <td>${escapeHtml(payment)}</td>
                <td><span class="df-status ${statusClass}">${escapeHtml(statusLabel)}</span></td>
                <td><button type="button" class="btn btn-sm btn-secondary" data-view-sale-id="${sale.id}">Angalia</button></td>
            </tr>`;
    }).join("");
}

function setupSalesHistoryFilters() {
    const search = document.querySelector("#sales-history-search");
    const payment = document.querySelector("#sales-history-payment");
    const status = document.querySelector("#sales-history-status");

    let timer;
    search?.addEventListener("input", () => {
        window.clearTimeout(timer);
        salesHistoryState.search = search.value.trim();
        timer = window.setTimeout(loadSalesHistory, 300);
    });
    payment?.addEventListener("change", () => {
        salesHistoryState.paymentMethod = payment.value;
        loadSalesHistory();
    });
    status?.addEventListener("change", () => {
        salesHistoryState.status = status.value;
        loadSalesHistory();
    });
}

/* =========================================================
   PAYMENT METHOD LABEL
   ========================================================= */

function formatPaymentMethod(method) {
    const labels = {
        cash: "Cash",
        mobile_money: "Mobile Money",
        bank: "Bank",
        credit: "Credit"
    };

    return labels[method] || method;
}


/* =========================================================
   SALE DETAILS
   ========================================================= */

async function viewSaleDetails(saleId) {
    const modal =
        document.querySelector(
            "#sale-details-modal"
        );

    const content =
        document.querySelector(
            "#sale-details-content"
        );

    const receiptElement =
        document.querySelector(
            "#sale-details-receipt"
        );

    if (!modal || !content) {
        return;
    }

    modal.classList.add("active");
    modal.classList.add("show");
    modal.style.display = "flex";
    modal.setAttribute(
        "aria-hidden",
        "false"
    );

    content.innerHTML = "Loading...";

    try {
        const response = await fetch(
            `/api/sales/${encodeURIComponent(saleId)}`,
            {
                headers: {
                    Accept: "application/json"
                }
            }
        );

        const result =
            await response.json();

        if (!response.ok) {
            throw new Error(
                result.message ||
                "Failed to load sale."
            );
        }

        const sale =
            result.sale;

        const items =
            result.items || [];

        if (receiptElement) {
            receiptElement.textContent =
                sale.receipt_number;
        }

        content.innerHTML = `
            <div class="receipt">

                <div class="receipt-header">
                    <h3>DukaFlow</h3>
                    <p>
                        ${escapeHtml(
                            sale.receipt_number
                        )}
                    </p>
                </div>

                <div class="receipt-items">

                    ${items.map((item) => `
                        <div class="receipt-item">

                            <div>
                                <strong>
                                    ${escapeHtml(
                                        item.product_name
                                    )}
                                </strong>

                                <small>
                                    ${item.quantity}
                                    ×
                                    TSh ${formatNumber(
                                        item.unit_price
                                    )}
                                </small>
                            </div>

                            <strong>
                                TSh ${formatNumber(
                                    item.line_total
                                )}
                            </strong>

                        </div>
                    `).join("")}

                </div>


                <div class="receipt-summary">

                    <div>
                        <span>Subtotal</span>
                        <strong>
                            TSh ${formatNumber(
                                sale.subtotal
                            )}
                        </strong>
                    </div>

                    <div>
                        <span>Discount</span>
                        <strong>
                            TSh ${formatNumber(
                                sale.discount
                            )}
                        </strong>
                    </div>

                    <div class="receipt-total">
                        <span>Total</span>
                        <strong>
                            TSh ${formatNumber(
                                sale.total_amount
                            )}
                        </strong>
                    </div>

                    <div>
                        <span>Paid</span>
                        <strong>
                            TSh ${formatNumber(
                                sale.amount_paid
                            )}
                        </strong>
                    </div>

                    <div>
                        <span>Change</span>
                        <strong>
                            TSh ${formatNumber(
                                sale.change_amount
                            )}
                        </strong>
                    </div>

                    <div>
                        <span>Payment</span>
                        <strong>
                            ${formatPaymentMethod(
                                sale.payment_method
                            )}
                        </strong>
                    </div>

                </div>

            </div>
        `;

        const printButton =
            document.querySelector(
                "#print-sale-receipt"
            );

        if (printButton) {
            printButton.onclick =
                () => printSaleReceipt(
                    sale,
                    items
                );
        }

    } catch (error) {
        console.error(
            "Sale details error:",
            error
        );

        content.innerHTML = `
            <p>
                ${escapeHtml(
                    error.message ||
                    "Failed to load sale."
                )}
            </p>
        `;
    }
}


/* =========================================================
   VIEW BUTTONS
   ========================================================= */

document.addEventListener(
    "click",
    (event) => {

        const viewButton =
            event.target.closest(
                "[data-view-sale-id]"
            );

        if (viewButton) {

            const saleId =
                viewButton.getAttribute(
                    "data-view-sale-id"
                );

            viewSaleDetails(saleId);
        }
    }
);


/* =========================================================
   CLOSE SALE DETAILS
   ========================================================= */

function closeSaleDetails() {
    const modal =
        document.querySelector(
            "#sale-details-modal"
        );

    if (!modal) {
        return;
    }

    modal.classList.remove(
        "active"
    );

    modal.classList.remove(
        "show"
    );

    modal.style.display = "none";

    modal.setAttribute(
        "aria-hidden",
        "true"
    );
}


document.addEventListener(
    "click",
    (event) => {

        if (
            event.target.closest(
                "#close-sale-details"
            ) ||
            event.target.closest(
                "#close-sale-details-bottom"
            )
        ) {
            closeSaleDetails();
        }

    }
);


/* =========================================================
   PRINT RECEIPT
   ========================================================= */

function printSaleReceipt(
    sale,
    items
) {
    const receiptWindow =
        window.open(
            "",
            "_blank",
            "width=400,height=700"
        );

    if (!receiptWindow) {
        showSalesMessage(
            "Please allow pop-ups to print the receipt.",
            "error"
        );

        return;
    }

    const itemsHtml =
        items.map((item) => `
            <tr>
                <td>
                    ${escapeHtml(
                        item.product_name
                    )}
                </td>

                <td>
                    ${item.quantity}
                </td>

                <td>
                    ${formatNumber(
                        item.line_total
                    )}
                </td>
            </tr>
        `).join("");


    receiptWindow.document.write(`
        <!DOCTYPE html>

        <html>

        <head>

            <title>
                ${escapeHtml(
                    sale.receipt_number
                )}
            </title>

            <style>

                body {
                    font-family:
                        Arial, sans-serif;
                    width: 80mm;
                    margin: 0 auto;
                    padding: 12px;
                }

                h2 {
                    text-align: center;
                    margin-bottom: 4px;
                }

                .center {
                    text-align: center;
                }

                table {
                    width: 100%;
                    border-collapse:
                        collapse;
                    margin-top: 15px;
                }

                th,
                td {
                    padding: 5px 0;
                    text-align: left;
                }

                .summary {
                    margin-top: 15px;
                    border-top:
                        1px dashed #000;
                    padding-top: 10px;
                }

                .row {
                    display: flex;
                    justify-content:
                        space-between;
                    margin-bottom: 5px;
                }

                .total {
                    font-weight: bold;
                    font-size: 18px;
                    margin-top: 8px;
                }

                .footer {
                    text-align: center;
                    margin-top: 20px;
                }

            </style>

        </head>

        <body>

            <h2>DukaFlow</h2>

            <div class="center">
                ${escapeHtml(
                    sale.receipt_number
                )}
            </div>

            <div class="center">
                ${new Date(
                    sale.created_at
                ).toLocaleString()}
            </div>

            <table>

                <thead>
                    <tr>
                        <th>Item</th>
                        <th>Qty</th>
                        <th>Amount</th>
                    </tr>
                </thead>

                <tbody>
                    ${itemsHtml}
                </tbody>

            </table>

            <div class="summary">

                <div class="row">
                    <span>Subtotal</span>
                    <span>
                        ${formatNumber(
                            sale.subtotal
                        )}
                    </span>
                </div>

                <div class="row">
                    <span>Discount</span>
                    <span>
                        ${formatNumber(
                            sale.discount
                        )}
                    </span>
                </div>

                <div class="row total">
                    <span>Total</span>
                    <span>
                        ${formatNumber(
                            sale.total_amount
                        )}
                    </span>
                </div>

                <div class="row">
                    <span>Paid</span>
                    <span>
                        ${formatNumber(
                            sale.amount_paid
                        )}
                    </span>
                </div>

                <div class="row">
                    <span>Change</span>
                    <span>
                        ${formatNumber(
                            sale.change_amount
                        )}
                    </span>
                </div>

            </div>

            <div class="footer">
                Thank you for your business.
            </div>

        </body>

        </html>
    `);

    receiptWindow.document.close();

    receiptWindow.focus();

    receiptWindow.print();
}


/* =========================================================
   INITIALIZE SALES HISTORY
   ========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    () => {
        loadSalesHistory();
    }
);

document.addEventListener("keydown", (event) => {
    if (event.key === "F2") {
        event.preventDefault();
        document.querySelector("#sale-barcode")?.focus();
    }
});
