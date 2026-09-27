const currentDateElement = document.querySelector("#current-date");

function updateCurrentDate() {
    if (!currentDateElement) {
        return;
    }

    const now = new Date();

    const formattedDate = now.toLocaleDateString("en-TZ", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric"
    });

    const formattedTime = now.toLocaleTimeString("en-TZ", {
        hour: "2-digit",
        minute: "2-digit"
    });

    currentDateElement.textContent = `${formattedDate} • ${formattedTime}`;
}

updateCurrentDate();

setInterval(updateCurrentDate, 1000);


const productModal = document.querySelector("#product-modal");
const openProductModalButton = document.querySelector("#open-product-modal");
const closeModalButtons = document.querySelectorAll("[data-close-modal]");

function openProductModal() {
    if (!productModal) {
        return;
    }

    productModal.classList.add("is-open");
    productModal.setAttribute("aria-hidden", "false");
}

function closeProductModal() {
    if (!productModal) {
        return;
    }

    productModal.classList.remove("is-open");
    productModal.setAttribute("aria-hidden", "true");
}

if (openProductModalButton) {
    openProductModalButton.addEventListener("click", openProductModal);
}

closeModalButtons.forEach((button) => {
    button.addEventListener("click", closeProductModal);
});

const productForm = document.querySelector("#product-form");
const productFormMessage = document.querySelector("#product-form-message");

function showProductFormMessage(message, type = "error") {
    if (!productFormMessage) {
        return;
    }

    productFormMessage.textContent = message;
    productFormMessage.className = `form-message ${type}`;
}

function validateProductForm() {
    if (!productForm) {
        return false;
    }

    const productName = document.querySelector("#product-name");
    const buyingPrice = document.querySelector("#buying-price");
    const sellingPrice = document.querySelector("#selling-price");
    const stockQuantity = document.querySelector("#stock-quantity");

    if (!productName || !buyingPrice || !sellingPrice || !stockQuantity) {
        showProductFormMessage("Product form is not configured correctly.");
        return false;
    }

    const name = productName.value.trim();
    const buyingPriceValue = Number(buyingPrice.value);
    const sellingPriceValue = Number(sellingPrice.value);
    const stockQuantityValue = Number(stockQuantity.value);

    if (name.length < 2) {
        showProductFormMessage("Product name must contain at least 2 characters.");
        productName.focus();
        return false;
    }

    if (!Number.isFinite(buyingPriceValue) || buyingPriceValue < 0) {
        showProductFormMessage("Buying price must be 0 or greater.");
        buyingPrice.focus();
        return false;
    }

    if (!Number.isFinite(sellingPriceValue) || sellingPriceValue < 0) {
        showProductFormMessage("Selling price must be 0 or greater.");
        sellingPrice.focus();
        return false;
    }

    if (
        !Number.isInteger(stockQuantityValue) ||
        stockQuantityValue < 0
    ) {
        showProductFormMessage("Stock quantity must be a whole number of 0 or greater.");
        stockQuantity.focus();
        return false;
    }

    showProductFormMessage(
        "Form is valid. The product has not been saved yet.",
        "success"
    );

    return true;
}

if (productForm) {
    productForm.addEventListener("submit", (event) => {
        event.preventDefault();
        addProductFromForm();
    });
}

const productsTableBody = document.querySelector("#products-table-body");

const products = [];

function renderProducts() {
    if (!productsTableBody) {
        return;
    }

    if (products.length === 0) {
        productsTableBody.innerHTML = `
            <tr>
                <td colspan="6">
                    <div class="table-empty-state">
                        <strong>No products yet</strong>
                        <span>
                            Products will appear here after they are added.
                        </span>
                    </div>
                </td>
            </tr>
        `;

        return;
    }

    productsTableBody.innerHTML = "";

    products.forEach((product) => {
        const row = document.createElement("tr");

        const status = product.stockQuantity === 0
            ? "Out of stock"
            : product.stockQuantity <= 5
                ? "Low stock"
                : "Normal";

        row.innerHTML = `
            <td>${product.name}</td>
            <td>TSh ${product.buyingPrice.toLocaleString("en-TZ")}</td>
            <td>TSh ${product.sellingPrice.toLocaleString("en-TZ")}</td>
            <td>${product.stockQuantity}</td>
            <td>${status}</td>
            <td>
                <button
                    class="table-action-button"
                    type="button"
                    data-product-id="${product.id}"
                >
                    Delete
                </button>
            </td>
        `;

        productsTableBody.appendChild(row);
    });
}

function addProductFromForm() {
    if (!productForm) {
        return;
    }

    const isValid = validateProductForm();

    if (!isValid) {
        return;
    }

    const productName = document.querySelector("#product-name");
    const buyingPrice = document.querySelector("#buying-price");
    const sellingPrice = document.querySelector("#selling-price");
    const stockQuantity = document.querySelector("#stock-quantity");

    if (!productName || !buyingPrice || !sellingPrice || !stockQuantity) {
        return;
    }

    const product = {
        id: Date.now(),
        name: productName.value.trim(),
        buyingPrice: Number(buyingPrice.value),
        sellingPrice: Number(sellingPrice.value),
        stockQuantity: Number(stockQuantity.value)
    };

    products.push(product);

    renderProducts();

    productForm.reset();

    closeProductModal();

    showProductFormMessage(
        "Product added to the current browser session.",
        "success"
    );
}

if (productsTableBody) {
    productsTableBody.addEventListener("click", (event) => {
        const clickedButton = event.target.closest("[data-product-id]");

        if (!clickedButton) {
            return;
        }

        const productId = Number(clickedButton.dataset.productId);

        const productIndex = products.findIndex(
            (product) => product.id === productId
        );

        if (productIndex === -1) {
            return;
        }

        products.splice(productIndex, 1);

        renderProducts();
    });
}
renderProducts();