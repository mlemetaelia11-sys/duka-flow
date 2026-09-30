"use strict";

let purchaseSuppliers = [];
let purchaseProducts = [];
let purchaseCart = [];


/* =========================================================
   INIT
   ========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    async () => {

        await loadPurchaseSuppliers();
        await loadPurchaseProducts();

        setupPurchaseEvents();

        renderPurchaseCart();

        calculatePurchaseTotals();

        loadPurchaseHistory();

    }
);


/* =========================================================
   SUPPLIERS
   ========================================================= */

async function loadPurchaseSuppliers() {

    try {

        const response =
            await fetch(
                "/api/suppliers"
            );

        const result =
            await response.json();

        purchaseSuppliers =
            result.suppliers || [];

        const select =
            document.querySelector(
                "#purchase-supplier"
            );


        if (!select) {
            return;
        }


        select.innerHTML = `
            <option value="">
                Select supplier
            </option>
        `;


        purchaseSuppliers.forEach(
            (supplier) => {

                const option =
                    document.createElement(
                        "option"
                    );

                option.value =
                    supplier.id;

                option.textContent =
                    supplier.name;

                select.appendChild(
                    option
                );

            }
        );

    } catch (error) {

        console.error(
            "Supplier loading error:",
            error
        );

    }
}


/* =========================================================
   PRODUCTS
   ========================================================= */

async function loadPurchaseProducts() {

    try {

        const response =
            await fetch(
                "/api/products"
            );

        const result =
            await response.json();

        purchaseProducts =
            result.products || [];


        const select =
            document.querySelector(
                "#purchase-product"
            );


        if (!select) {
            return;
        }


        select.innerHTML = `
            <option value="">
                Select product
            </option>
        `;


        purchaseProducts.forEach(
            (product) => {

                const option =
                    document.createElement(
                        "option"
                    );

                option.value =
                    product.id;

                option.textContent =
                    `${product.name} — Current stock: ${product.stock_quantity}`;

                select.appendChild(
                    option
                );

            }
        );

    } catch (error) {

        console.error(
            "Product loading error:",
            error
        );

    }
}


/* =========================================================
   EVENTS
   ========================================================= */

function setupPurchaseEvents() {

    document
        .querySelector(
            "#add-purchase-item-btn"
        )
        ?.addEventListener(
            "click",
            addPurchaseItem
        );


    document
        .querySelector(
            "#complete-purchase-btn"
        )
        ?.addEventListener(
            "click",
            completePurchase
        );


    document
        .querySelector(
            "#purchase-discount"
        )
        ?.addEventListener(
            "input",
            calculatePurchaseTotals
        );


    document.addEventListener(
        "click",
        (event) => {

            const removeButton =
                event.target.closest(
                    "[data-remove-purchase-item]"
                );

            if (!removeButton) {
                return;
            }

            removePurchaseItem(
                Number(
                    removeButton.getAttribute(
                        "data-remove-purchase-item"
                    )
                )
            );

        }
    );

}


/* =========================================================
   ADD ITEM
   ========================================================= */

function addPurchaseItem() {

    const productId =
        Number(
            document.querySelector(
                "#purchase-product"
            )?.value
        );


    const quantity =
        Number(
            document.querySelector(
                "#purchase-quantity"
            )?.value
        );


    const unitCost =
        Number(
            document.querySelector(
                "#purchase-unit-cost"
            )?.value
        );


    if (!productId) {

        alert(
            "Select a product."
        );

        return;
    }


    if (
        !Number.isInteger(
            quantity
        ) ||
        quantity <= 0
    ) {

        alert(
            "Enter a valid quantity."
        );

        return;
    }


    if (
        !Number.isFinite(
            unitCost
        ) ||
        unitCost < 0
    ) {

        alert(
            "Enter a valid unit cost."
        );

        return;
    }


    const product =
        purchaseProducts.find(
            (item) =>
                Number(item.id) ===
                productId
        );


    if (!product) {
        return;
    }


    const existing =
        purchaseCart.find(
            (item) =>
                Number(item.productId) ===
                productId
        );


    if (existing) {

        existing.quantity += quantity;

    } else {

        purchaseCart.push({
            productId,
            productName:
                product.name,
            quantity,
            unitCost
        });

    }


    renderPurchaseCart();

    calculatePurchaseTotals();


    document.querySelector(
        "#purchase-quantity"
    ).value = 1;

    document.querySelector(
        "#purchase-unit-cost"
    ).value = "";

}


/* =========================================================
   REMOVE ITEM
   ========================================================= */

function removePurchaseItem(
    productId
) {

    purchaseCart =
        purchaseCart.filter(
            (item) =>
                Number(
                    item.productId
                ) !== productId
        );


    renderPurchaseCart();

    calculatePurchaseTotals();
}


/* =========================================================
   RENDER CART
   ========================================================= */

function renderPurchaseCart() {

    const body =
        document.querySelector(
            "#purchase-cart-body"
        );


    if (!body) {
        return;
    }


    if (
        purchaseCart.length === 0
    ) {

        body.innerHTML = `
            <tr>
                <td colspan="5">
                    No items added.
                </td>
            </tr>
        `;

        return;
    }


    body.innerHTML =
        purchaseCart
            .map(
                (item) => {

                    const total =
                        item.quantity *
                        item.unitCost;


                    return `
                        <tr>

                            <td>
                                ${escapeHtml(
                                    item.productName
                                )}
                            </td>

                            <td>
                                TSh ${money(
                                    item.unitCost
                                )}
                            </td>

                            <td>
                                ${item.quantity}
                            </td>

                            <td>
                                TSh ${money(
                                    total
                                )}
                            </td>

                            <td>
                                <button
                                    type="button"
                                    class="btn btn-sm btn-danger"
                                    data-remove-purchase-item="${item.productId}"
                                >
                                    Remove
                                </button>
                            </td>

                        </tr>
                    `;

                }
            )
            .join("");
}


/* =========================================================
   TOTALS
   ========================================================= */

function calculatePurchaseTotals() {

    const subtotal =
        purchaseCart.reduce(
            (sum, item) =>
                sum +
                (
                    item.quantity *
                    item.unitCost
                ),
            0
        );


    const discount =
        Number(
            document.querySelector(
                "#purchase-discount"
            )?.value || 0
        );


    const total =
        Math.max(
            subtotal -
            discount,
            0
        );


    const subtotalElement =
        document.querySelector(
            "#purchase-subtotal"
        );

    const totalElement =
        document.querySelector(
            "#purchase-total"
        );


    if (subtotalElement) {

        subtotalElement.textContent =
            `TSh ${money(subtotal)}`;

    }


    if (totalElement) {

        totalElement.textContent =
            `TSh ${money(total)}`;

    }

}


/* =========================================================
   COMPLETE PURCHASE
   ========================================================= */

async function completePurchase() {

    if (
        purchaseCart.length === 0
    ) {

        alert(
            "Add at least one product."
        );

        return;
    }


    const supplierId =
        Number(
            document.querySelector(
                "#purchase-supplier"
            )?.value
        ) || null;


    const discount =
        Number(
            document.querySelector(
                "#purchase-discount"
            )?.value || 0
        );


    const paymentMethod =
        document.querySelector(
            "#purchase-payment-method"
        )?.value || "cash";


    const amountPaid =
        Number(
            document.querySelector(
                "#purchase-amount-paid"
            )?.value || 0
        );


    if (!supplierId) {

        if (
            !confirm(
                "No supplier selected. Continue?"
            )
        ) {
            return;
        }

    }


    const button =
        document.querySelector(
            "#complete-purchase-btn"
        );


    try {

        button.disabled =
            true;

        button.textContent =
            "Processing...";


        const response =
            await fetch(
                "/api/purchases",
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
                            supplierId:
                                supplierId,

                            items:
                                purchaseCart.map(
                                    (item) => ({
                                        productId:
                                            Number(
                                                item.productId
                                            ),

                                        quantity:
                                            Number(
                                                item.quantity
                                            ),

                                        unitCost:
                                            Number(
                                                item.unitCost
                                            )
                                    })
                                ),

                            discount,

                            amountPaid,

                            paymentMethod
                        })
                }
            );


        const result =
            await response.json();


        if (!response.ok) {

            throw new Error(
                result.message ||
                "Failed to complete purchase."
            );

        }


        alert(
            `${result.message}\nReference: ${result.purchase.reference_number}`
        );


        purchaseCart = [];


        document.querySelector(
            "#purchase-discount"
        ).value = 0;


        document.querySelector(
            "#purchase-amount-paid"
        ).value = 0;


        renderPurchaseCart();

        calculatePurchaseTotals();

        await loadPurchaseProducts();

        await loadPurchaseHistory();


    } catch (error) {

        console.error(
            "Purchase error:",
            error
        );

        alert(
            error.message
        );

    } finally {

        button.disabled =
            false;

        button.textContent =
            "Receive Stock";

    }

}


/* =========================================================
   PURCHASE HISTORY
   ========================================================= */

async function loadPurchaseHistory() {

    const body =
        document.querySelector(
            "#purchase-history-body"
        );


    if (!body) {
        return;
    }


    try {

        const response =
            await fetch(
                "/api/purchases"
            );


        const result =
            await response.json();


        if (!response.ok) {

            throw new Error(
                result.message ||
                "Failed to load purchases."
            );

        }


        const purchases =
            result.purchases || [];


        if (
            purchases.length === 0
        ) {

            body.innerHTML = `
                <tr>
                    <td colspan="8">
                        No purchases found.
                    </td>
                </tr>
            `;

            return;
        }


        body.innerHTML =
            purchases.map(
                (purchase) => {

                    const date =
                        new Date(
                            purchase.created_at
                        ).toLocaleDateString(
                            "en-GB",
                            {
                                day: "2-digit",
                                month: "short",
                                year: "numeric"
                            }
                        );


                    return `
                        <tr>

                            <td>
                                <strong>
                                    ${escapeHtml(
                                        purchase.reference_number
                                    )}
                                </strong>
                            </td>

                            <td>
                                ${escapeHtml(
                                    purchase.supplier_name ||
                                    "-"
                                )}
                            </td>

                            <td>
                                ${purchase.total_items}
                            </td>

                            <td>
                                TSh ${money(
                                    purchase.total_amount
                                )}
                            </td>

                            <td>
                                TSh ${money(
                                    purchase.amount_paid
                                )}
                            </td>

                            <td>
                                TSh ${money(
                                    purchase.balance
                                )}
                            </td>

                            <td>
                                ${escapeHtml(
                                    purchase.status
                                )}
                            </td>

                            <td>
                                ${date}
                            </td>

                        </tr>
                    `;
                }
            ).join("");

    } catch (error) {

        console.error(
            error
        );

        body.innerHTML = `
            <tr>
                <td colspan="8">
                    Failed to load purchase history.
                </td>
            </tr>
        `;

    }
}


/* =========================================================
   HELPERS
   ========================================================= */

function money(value) {

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

    return String(
        value ?? ""
    )
        .replaceAll(
            "&",
            "&amp;"
        )
        .replaceAll(
            "<",
            "&lt;"
        )
        .replaceAll(
            ">",
            "&gt;"
        )
        .replaceAll(
            '"',
            "&quot;"
        )
        .replaceAll(
            "'",
            "&#039;"
        );

}