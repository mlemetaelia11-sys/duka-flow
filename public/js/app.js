"use strict";

document.addEventListener("DOMContentLoaded", () => {
    initializeApp();
});


/* =========================================================
   INITIALIZATION
   ========================================================= */

function initializeApp() {
    setupDateTime();
    setupMobileNavigation();
    setupProductPage();
}


/* =========================================================
   DATE & TIME
   ========================================================= */

function setupDateTime() {
    const dateElement =
        document.querySelector("#current-date") ||
        document.querySelector("[data-current-date]");

    const timeElement =
        document.querySelector("#current-time") ||
        document.querySelector("[data-current-time]");

    if (!dateElement && !timeElement) {
        return;
    }

    function updateDateTime() {
        const now = new Date();

        if (dateElement) {
            dateElement.textContent = now.toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "short",
                year: "numeric"
            });
        }

        if (timeElement) {
            timeElement.textContent = now.toLocaleTimeString("en-GB", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit"
            });
        }
    }

    updateDateTime();
    setInterval(updateDateTime, 1000);
}


/* =========================================================
   MOBILE NAVIGATION
   ========================================================= */

function setupMobileNavigation() {
    const menuButton =
        document.querySelector("#mobile-menu-button") ||
        document.querySelector("[data-mobile-menu]");

    const sidebar =
        document.querySelector(".sidebar") ||
        document.querySelector("#sidebar");

    if (!menuButton || !sidebar) {
        return;
    }

    menuButton.addEventListener("click", () => {
        sidebar.classList.toggle("active");
        menuButton.classList.toggle("active");
    });
}


/* =========================================================
   PRODUCT VARIABLES
   ========================================================= */

let products = [];
let editingProductId = null;

let productModal = null;
let productForm = null;
let productsTableBody = null;
let productSearchInput = null;

let productNameInput = null;
let productSkuInput = null;
let productBarcodeInput = null;
let productCategoryInput = null;
let productUnitInput = null;
let buyingPriceInput = null;
let sellingPriceInput = null;
let stockQuantityInput = null;
let lowStockThresholdInput = null;
let productImageInput = null;
let productImageKeyInput = null;
let productImageUrlInput = null;
let productImageStatus = null;

let productModalTitle = null;
let productSubmitButton = null;


/* =========================================================
   PRODUCT PAGE
   ========================================================= */

function setupProductPage() {
    productModal =
        document.querySelector("#product-modal") ||
        document.querySelector("[data-product-modal]") ||
        document.querySelector(".product-modal");

    productForm =
        document.querySelector("#product-form") ||
        document.querySelector("[data-product-form]");

    productsTableBody =
        document.querySelector("#products-table-body") ||
        document.querySelector("[data-products-table-body]");

    productSearchInput =
        document.querySelector("#product-search") ||
        document.querySelector("[data-product-search]");

    productNameInput =
        document.querySelector("#product-name") ||
        document.querySelector("#name") ||
        document.querySelector("[name='name']");

    productSkuInput = document.querySelector("#product-sku");
    productBarcodeInput = document.querySelector("#product-barcode");
    productCategoryInput = document.querySelector("#product-category");
    productUnitInput = document.querySelector("#product-unit");

    buyingPriceInput =
        document.querySelector("#buying-price") ||
        document.querySelector("#buyingPrice") ||
        document.querySelector("[name='buyingPrice']");

    sellingPriceInput =
        document.querySelector("#selling-price") ||
        document.querySelector("#sellingPrice") ||
        document.querySelector("[name='sellingPrice']");

    stockQuantityInput =
        document.querySelector("#stock-quantity") ||
        document.querySelector("#stockQuantity") ||
        document.querySelector("[name='stockQuantity']");

    lowStockThresholdInput =
        document.querySelector("#low-stock-threshold") ||
        document.querySelector("#lowStockThreshold") ||
        document.querySelector("[name='lowStockThreshold']");
    productImageInput = document.querySelector("#product-image");
    productImageKeyInput = document.querySelector("#product-image-key");
    productImageUrlInput = document.querySelector("#product-image-url");
    productImageStatus = document.querySelector("#product-image-status");

    productModalTitle =
        document.querySelector("#product-modal-title") ||
        document.querySelector("#modal-product-title");

    productSubmitButton =
        document.querySelector("#product-submit-button") ||
        document.querySelector("#product-submit-btn") ||
        document.querySelector("#product-form button[type='submit']");

    if (
        !productModal &&
        !productForm &&
        !productsTableBody
    ) {
        return;
    }

    setupProductEvents();
    setupProductForm();
    setupProductSearch();
    setupProductKeyboard();
    setupProductImageUpload();

    loadProducts();
}


/* =========================================================
   PRODUCT EVENTS
   ========================================================= */

function setupProductEvents() {
    document.addEventListener("click", (event) => {

        const button = event.target.closest(
            "button, a, [role='button'], [data-close-modal]"
        );

        if (!button) {
            return;
        }


        if (button.hasAttribute("data-close-modal")) {
            event.preventDefault();
            closeProductModal();
            return;
        }


        /* ---------------- ADD PRODUCT ---------------- */

if (
    button.id === "add-product-btn" ||
    button.id === "add-product"
) {
    event.preventDefault();
    openAddProductModal();
    return;
}

        /* ---------------- BACKDROP CLICK ---------------- */

        if (
            productModal &&
            event.target === productModal
        ) {
            closeProductModal();
        }
    });
}


/* =========================================================
   KEYBOARD
   ========================================================= */

function setupProductKeyboard() {
    document.addEventListener("keydown", (event) => {
        if (
            event.key === "Escape" &&
            productModal &&
            isProductModalOpen()
        ) {
            closeProductModal();
        }
    });
}


/* =========================================================
   OPEN ADD PRODUCT
   ========================================================= */

function openAddProductModal() {
    if (!productModal) {
        console.error("Product modal not found.");
        return;
    }

    editingProductId = null;

    if (productForm) {
        productForm.reset();
    }

    if (productModalTitle) {
        productModalTitle.textContent = "Add Product";
    }

    if (productSubmitButton) {
        productSubmitButton.textContent = "Add Product";
        productSubmitButton.disabled = false;
    }

    if (lowStockThresholdInput) {
        lowStockThresholdInput.value = "5";
    }
    if (productImageInput) productImageInput.value = "";
    if (productImageKeyInput) productImageKeyInput.value = "";
    if (productImageUrlInput) productImageUrlInput.value = "";
    if (productImageStatus) productImageStatus.textContent = "";

    showProductModal();

    setTimeout(() => {
        if (productNameInput) {
            productNameInput.focus();
        }
    }, 100);
}


/* =========================================================
   OPEN EDIT PRODUCT
   ========================================================= */

function openEditProductModal(productId) {
    if (!productModal) {
        console.error("Product modal not found.");
        return;
    }

    const product = products.find(
        (item) =>
            Number(item.id) === Number(productId)
    );

    if (!product) {
        showMessage(
            "Product not found.",
            "error"
        );

        return;
    }

    editingProductId = Number(product.id);

    if (productNameInput) {
        productNameInput.value =
            product.name ?? "";
    }

    if (productSkuInput) productSkuInput.value = product.sku ?? "";
    if (productBarcodeInput) productBarcodeInput.value = product.barcode ?? "";
    if (productCategoryInput) productCategoryInput.value = product.category ?? "";
    if (productUnitInput) productUnitInput.value = product.unit ?? "pcs";

    if (buyingPriceInput) {
        buyingPriceInput.value =
            product.buying_price ?? "";
    }

    if (sellingPriceInput) {
        sellingPriceInput.value =
            product.selling_price ?? "";
    }

    if (stockQuantityInput) {
        stockQuantityInput.value =
            product.stock_quantity ?? "";
    }

    if (lowStockThresholdInput) {
        lowStockThresholdInput.value =
            product.low_stock_threshold ?? 5;
    }
    if (productImageInput) productImageInput.value = "";
    if (productImageKeyInput) productImageKeyInput.value = product.image_key || "";
    if (productImageUrlInput) productImageUrlInput.value = product.image_url || "";
    if (productImageStatus) productImageStatus.textContent = product.image_key ? "Picha iliyopo itatumika hadi uchague nyingine." : "";

    if (productModalTitle) {
        productModalTitle.textContent =
            "Edit Product";
    }

    if (productSubmitButton) {
        productSubmitButton.textContent =
            "Save Changes";

        productSubmitButton.disabled =
            false;
    }

    showProductModal();

    setTimeout(() => {
        if (productNameInput) {
            productNameInput.focus();
        }
    }, 100);
}


/* =========================================================
   SHOW PRODUCT MODAL
   ========================================================= */

function showProductModal() {
    if (!productModal) {
        return;
    }

    productModal.classList.add("active");
    productModal.classList.add("show");

    productModal.setAttribute(
        "aria-hidden",
        "false"
    );

    productModal.style.display = "flex";

    document.body.classList.add(
        "modal-open"
    );
}


/* =========================================================
   CLOSE PRODUCT MODAL
   ========================================================= */

function closeProductModal() {
    if (!productModal) {
        return;
    }

    if (
        document.activeElement &&
        productModal.contains(
            document.activeElement
        )
    ) {
        document.activeElement.blur();
    }

    productModal.classList.remove(
        "active"
    );

    productModal.classList.remove(
        "show"
    );

    productModal.setAttribute(
        "aria-hidden",
        "true"
    );

    productModal.style.display = "none";

    document.body.classList.remove(
        "modal-open"
    );

    editingProductId = null;

    if (productForm) {
        productForm.reset();
    }

    if (lowStockThresholdInput) {
        lowStockThresholdInput.value = "5";
    }

    if (productModalTitle) {
        productModalTitle.textContent =
            "Add Product";
    }

    if (productSubmitButton) {
        productSubmitButton.textContent =
            "Add Product";

        productSubmitButton.disabled =
            false;
    }
}


/* =========================================================
   CHECK MODAL
   ========================================================= */

function isProductModalOpen() {
    if (!productModal) {
        return false;
    }

    return (
        productModal.classList.contains(
            "active"
        ) ||
        productModal.classList.contains(
            "show"
        ) ||
        productModal.style.display === "flex"
    );
}


async function setupProductImageUpload() {
    if (!productImageInput) {
        return;
    }

    productImageInput.addEventListener("change", async () => {
        const file = productImageInput.files?.[0];

        if (!file) {
            return;
        }

        /*
         * Vercel/serverless request body safety:
         * keep image uploads below 4MB.
         */
        if (file.size > 4 * 1024 * 1024) {
            productImageInput.value = "";

            if (productImageStatus) {
                productImageStatus.textContent =
                    "Picha lazima iwe chini ya 4MB.";
            }

            return;
        }

        /*
         * Only allow normal image formats.
         */
        if (
            !/^image\/(png|jpeg|webp|gif)$/i.test(
                file.type
            )
        ) {
            productImageInput.value = "";

            if (productImageStatus) {
                productImageStatus.textContent =
                    "Aina ya picha haikubaliki. Tumia PNG, JPEG, WEBP au GIF.";
            }

            return;
        }

        if (productImageStatus) {
            productImageStatus.textContent =
                "Inapakia picha...";
        }

        try {
            /*
             * IMPORTANT:
             *
             * We NO LONGER upload directly to the
             * Cloudflare R2 presigned URL from the browser.
             *
             * The browser sends the image to DukaFlow.
             * DukaFlow uploads it to R2 server-side.
             */
            const uploadUrl =
                "/api/integrations/storage/upload" +
                `?filename=${encodeURIComponent(file.name)}` +
                "&folder=products";

            const response = await fetch(
                uploadUrl,
                {
                    method: "POST",
                    credentials: "include",
                    headers: {
                        "Content-Type": file.type,
                        "Accept": "application/json"
                    },
                    body: file
                }
            );

            const payload =
                await response
                    .json()
                    .catch(() => ({}));

            if (!response.ok) {
                throw new Error(
                    payload.message ||
                    "Picha haikupakiwa."
                );
            }

            if (!payload.key) {
                throw new Error(
                    "Storage key haikurudi vizuri."
                );
            }

            /*
             * Keep both key and view URL so the existing
             * product form can save the uploaded object.
             */
            if (productImageKeyInput) {
                productImageKeyInput.value =
                    payload.key;
            }

            if (productImageUrlInput) {
                productImageUrlInput.value =
                    payload.publicUrl ||
                    payload.viewUrl ||
                    `/api/integrations/storage/view?key=${encodeURIComponent(
                        payload.key
                    )}`;
            }

            if (productImageStatus) {
                productImageStatus.textContent =
                    "✓ Picha imepakiwa.";
            }
        } catch (error) {
            console.error(
                "Product image upload error:",
                error?.message || error
            );

            if (productImageStatus) {
                productImageStatus.textContent =
                    error?.message ||
                    "Picha haikupakiwa.";
            }

            productImageInput.value = "";

            if (productImageKeyInput) {
                productImageKeyInput.value = "";
            }

            if (productImageUrlInput) {
                productImageUrlInput.value = "";
            }
        }
    });
}

/* =========================================================
   PRODUCT FORM
   ========================================================= */

function setupProductForm() {
    if (!productForm) {
        return;
    }

    productForm.addEventListener(
        "submit",
        async (event) => {

            event.preventDefault();
            event.stopPropagation();

            const productData =
                getProductFormData();

            const validationError =
                validateProduct(
                    productData
                );

            if (validationError) {
                showMessage(
                    validationError,
                    "error"
                );

                return;
            }

            if (
                editingProductId !== null
            ) {
                await updateProduct(
                    editingProductId,
                    productData
                );
            } else {
                await createProduct(
                    productData
                );
            }
        }
    );
}


/* =========================================================
   FORM DATA
   ========================================================= */

function getProductFormData() {
    return {
        name:
            productNameInput?.value
                .trim() || "",

        sku: productSkuInput?.value.trim() || null,
        barcode: productBarcodeInput?.value.trim() || null,
        category: productCategoryInput?.value.trim() || null,
        unit: productUnitInput?.value.trim() || "pcs",

        buyingPrice:
            Number(
                buyingPriceInput?.value
            ),

        sellingPrice:
            Number(
                sellingPriceInput?.value
            ),

        stockQuantity:
            Number(
                stockQuantityInput?.value
            ),

        lowStockThreshold:
            Number(
                lowStockThresholdInput?.value
            ),
        imageKey: productImageKeyInput?.value.trim() || null,
        imageUrl: productImageUrlInput?.value.trim() || null
    };
}


/* =========================================================
   VALIDATION
   ========================================================= */

function validateProduct(product) {
    if (!product.name) {
        return "Product name is required.";
    }

    if (
        product.name.length < 2 ||
        product.name.length > 150
    ) {
        return "Product name must be between 2 and 150 characters.";
    }

    if (
        !Number.isFinite(
            product.buyingPrice
        ) ||
        product.buyingPrice < 0
    ) {
        return "Enter a valid buying price.";
    }

    if (
        !Number.isFinite(
            product.sellingPrice
        ) ||
        product.sellingPrice < 0
    ) {
        return "Enter a valid selling price.";
    }

    if (
        !Number.isInteger(
            product.stockQuantity
        ) ||
        product.stockQuantity < 0
    ) {
        return "Stock quantity must be a non-negative whole number.";
    }

    if (
        !Number.isInteger(
            product.lowStockThreshold
        ) ||
        product.lowStockThreshold < 0
    ) {
        return "Low stock threshold must be a non-negative whole number.";
    }

    return null;
}


/* =========================================================
   LOAD PRODUCTS
   ========================================================= */

async function loadProducts() {
    if (!productsTableBody) {
        return;
    }

    showProductsLoading();

    try {
        const response =
            await fetch(
                "/api/products",
                {
                    method: "GET",
                    headers: {
                        Accept:
                            "application/json"
                    }
                }
            );

        const result =
            await parseResponse(
                response
            );

        if (!response.ok) {
            throw new Error(
                getErrorMessage(result) ||
                `Failed to load products. (${response.status})`
            );
        }

        products =
            normalizeProducts(result);

        renderProducts();

    } catch (error) {
        console.error(
            "loadProducts error:",
            error
        );

        products = [];

        renderProducts();

        showMessage(
            error.message ||
            "Failed to load products.",
            "error"
        );
    }
}


/* =========================================================
   CREATE
   ========================================================= */

async function createProduct(
    productData
) {
    setSubmitting(true);

    try {
        const response =
            await fetch(
                "/api/products",
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json",

                        Accept:
                            "application/json"
                    },

                    body:
                        JSON.stringify(
                            productData
                        )
                }
            );

        const result =
            await parseResponse(
                response
            );

        if (!response.ok) {
            throw new Error(
                getErrorMessage(result) ||
                `Failed to create product. (${response.status})`
            );
        }

        closeProductModal();

        showMessage(
            result.message ||
            "Product added successfully.",
            "success"
        );

        await loadProducts();

    } catch (error) {
        console.error(
            "createProduct error:",
            error
        );

        showMessage(
            error.message ||
            "Failed to add product.",
            "error"
        );

    } finally {
        setSubmitting(false);
    }
}


/* =========================================================
   UPDATE
   ========================================================= */

async function updateProduct(
    productId,
    productData
) {
    setSubmitting(true);

    try {
        const response =
            await fetch(
                `/api/products/${encodeURIComponent(productId)}`,
                {
                    method: "PUT",

                    headers: {
                        "Content-Type":
                            "application/json",

                        Accept:
                            "application/json"
                    },

                    body:
                        JSON.stringify(
                            productData
                        )
                }
            );

        const result =
            await parseResponse(
                response
            );

        if (!response.ok) {
            throw new Error(
                getErrorMessage(result) ||
                `Failed to update product. (${response.status})`
            );
        }

        closeProductModal();

        showMessage(
            result.message ||
            "Product updated successfully.",
            "success"
        );

        await loadProducts();

    } catch (error) {
        console.error(
            "updateProduct error:",
            error
        );

        showMessage(
            error.message ||
            "Failed to update product.",
            "error"
        );

    } finally {
        setSubmitting(false);
    }
}


/* =========================================================
   DELETE
   ========================================================= */

async function deleteProduct(
    productId
) {
    const product =
        products.find(
            (item) =>
                Number(item.id) ===
                Number(productId)
        );

    if (!product) {
        showMessage(
            "Product not found.",
            "error"
        );

        return;
    }

    const confirmed =
        window.confirm(
            `Delete "${product.name}"?\n\nThis action cannot be undone.`
        );

    if (!confirmed) {
        return;
    }

    try {
        const response =
            await fetch(
                `/api/products/${encodeURIComponent(productId)}`,
                {
                    method: "DELETE",

                    headers: {
                        Accept:
                            "application/json"
                    }
                }
            );

        const result =
            await parseResponse(
                response
            );

        if (!response.ok) {
            throw new Error(
                getErrorMessage(result) ||
                `Failed to delete product. (${response.status})`
            );
        }

        showMessage(
            result.message ||
            "Product deleted successfully.",
            "success"
        );

        await loadProducts();

    } catch (error) {
        console.error(
            "deleteProduct error:",
            error
        );

        showMessage(
            error.message ||
            "Failed to delete product.",
            "error"
        );
    }
}


/* =========================================================
   SEARCH
   ========================================================= */

function setupProductSearch() {
    if (!productSearchInput) {
        return;
    }

    productSearchInput.addEventListener(
        "input",
        () => {
            renderProducts();
        }
    );
}


/* =========================================================
   RENDER
   ========================================================= */

function renderProducts() {
    if (!productsTableBody) {
        return;
    }

    const searchTerm =
        productSearchInput?.value
            .trim()
            .toLowerCase() || "";

    const filteredProducts =
        products.filter(
            (product) =>
                [product.name, product.sku, product.barcode, product.category]
                    .filter(Boolean)
                    .some((value) => String(value).toLowerCase().includes(searchTerm))
        );

    if (
        filteredProducts.length === 0
    ) {
        productsTableBody.innerHTML = `
            <tr>
                <td colspan="10" class="empty-state">
                    <div class="empty-state-content">
                        <h3>No products found</h3>
                        <p>
                            ${
                                searchTerm
                                    ? "Try a different search."
                                    : "Add your first product to get started."
                            }
                        </p>
                    </div>
                </td>
            </tr>
        `;

        updateProductSummary(
            filteredProducts
        );

        return;
    }

    productsTableBody.innerHTML =
        filteredProducts
            .map(
                createProductRow
            )
            .join("");

    updateProductSummary(
        filteredProducts
    );
}


/* =========================================================
   PRODUCT ROW
   ========================================================= */

function createProductRow(
    product
) {
    const buyingPrice =
        Number(
            product.buying_price || 0
        );

    const sellingPrice =
        Number(
            product.selling_price || 0
        );

    const stock =
        Number(
            product.stock_quantity || 0
        );

    const threshold =
        Number(
            product.low_stock_threshold || 0
        );

    const profit =
        sellingPrice - buyingPrice;

    const lowStock =
        stock <= threshold;

    const stockClass =
        lowStock
            ? "low-stock"
            : "in-stock";

    return `
        <tr data-product-id="${escapeHtml(product.id)}">

            <td>
                <div class="df-product-cell">
                    ${product.image_url ? `<img class="df-product-thumb-img" src="${escapeHtml(product.image_url)}" alt="" loading="lazy">` : `<span class="df-product-thumb">${escapeHtml(String(product.name || "?").charAt(0).toUpperCase())}</span>`}
                    <div><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.category || "Bidhaa")}</small></div>
                </div>
            </td>

            <td>${escapeHtml(product.sku || "—")}</td>
            <td>${escapeHtml(product.barcode || "—")}</td>

            <td>
                ${formatCurrency(buyingPrice)}
            </td>

            <td>
                ${formatCurrency(sellingPrice)}
            </td>

            <td>
                ${formatCurrency(profit)}
            </td>

            <td>
                <span class="stock-badge ${stockClass}">
                    ${stock}
                </span>
            </td>

            <td>
                ${threshold}
            </td>

            <td>
                ${formatDate(product.created_at)}
            </td>

            <td>
                <div class="table-actions">

                    <button
                        type="button"
                        class="btn btn-sm btn-secondary"
                        data-edit-product-id="${escapeHtml(product.id)}"
                    >
                        Edit
                    </button>

                    <button
                        type="button"
                        class="btn btn-sm btn-danger"
                        data-delete-product-id="${escapeHtml(product.id)}"
                    >
                        Delete
                    </button>

                </div>
            </td>

        </tr>
    `;
}


/* =========================================================
   SUMMARY
   ========================================================= */

function updateProductSummary(
    currentProducts
) {
    const totalProductsElement =
        document.querySelector(
            "#total-products"
        );

    const lowStockElement =
        document.querySelector(
            "#low-stock-products"
        ) ||
        document.querySelector(
            "#low-stock-count"
        );

    const totalStockElement =
        document.querySelector(
            "#total-stock"
        );

    const inventoryValueElement =
        document.querySelector(
            "#inventory-value"
        );

    if (totalProductsElement) {
        totalProductsElement.textContent =
            currentProducts.length;
    }

    if (lowStockElement) {
        const lowStockCount =
            currentProducts.filter(
                (product) => {
                    const stock =
                        Number(
                            product.stock_quantity ||
                            0
                        );

                    const threshold =
                        Number(
                            product.low_stock_threshold ||
                            0
                        );

                    return (
                        stock <= threshold
                    );
                }
            ).length;

        lowStockElement.textContent =
            lowStockCount;
    }

    if (totalStockElement) {
        const totalStock =
            currentProducts.reduce(
                (total, product) =>
                    total +
                    Number(
                        product.stock_quantity ||
                        0
                    ),
                0
            );

        totalStockElement.textContent =
            totalStock;
    }

    if (inventoryValueElement) {
        const inventoryValue =
            currentProducts.reduce(
                (total, product) =>
                    total +
                    Number(
                        product.buying_price ||
                        0
                    ) *
                    Number(
                        product.stock_quantity ||
                        0
                    ),
                0
            );

        inventoryValueElement.textContent =
            formatCurrency(
                inventoryValue
            );
    }
}


/* =========================================================
   SUBMIT STATE
   ========================================================= */

function setSubmitting(
    submitting
) {
    if (!productSubmitButton) {
        return;
    }

    productSubmitButton.disabled =
        submitting;

    if (submitting) {
        productSubmitButton.textContent =
            editingProductId !== null
                ? "Saving..."
                : "Adding...";
    } else {
        productSubmitButton.textContent =
            editingProductId !== null
                ? "Save Changes"
                : "Add Product";
    }
}


/* =========================================================
   API HELPERS
   ========================================================= */

async function parseResponse(
    response
) {
    const contentType =
        response.headers.get(
            "content-type"
        ) || "";

    if (
        contentType.includes(
            "application/json"
        )
    ) {
        return await response.json();
    }

    const text =
        await response.text();

    return {
        message: text
    };
}


function getErrorMessage(
    result
) {
    if (!result) {
        return null;
    }

    if (
        typeof result === "string"
    ) {
        return result;
    }

    return (
        result.message ||
        result.error ||
        null
    );
}


function normalizeProducts(
    result
) {
    if (Array.isArray(result)) {
        return result;
    }

    if (
        result &&
        Array.isArray(
            result.products
        )
    ) {
        return result.products;
    }

    if (
        result &&
        Array.isArray(
            result.data
        )
    ) {
        return result.data;
    }

    return [];
}


/* =========================================================
   LOADING
   ========================================================= */

function showProductsLoading() {
    if (!productsTableBody) {
        return;
    }

    productsTableBody.innerHTML = `
        <tr>
            <td colspan="8" class="loading-state">
                Loading products...
            </td>
        </tr>
    `;
}


/* =========================================================
   FORMAT
   ========================================================= */

function formatCurrency(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
        return "TSh 0";
    }

    return new Intl.NumberFormat(
        "en-TZ",
        {
            style: "currency",
            currency: "TZS",
            maximumFractionDigits: 2
        }
    ).format(number);
}


function formatDate(value) {
    if (!value) {
        return "-";
    }

    const date =
        new Date(value);

    if (
        Number.isNaN(
            date.getTime()
        )
    ) {
        return "-";
    }

    return date.toLocaleDateString(
        "en-GB",
        {
            day: "2-digit",
            month: "short",
            year: "numeric"
        }
    );
}


/* =========================================================
   SECURITY
   ========================================================= */

function escapeHtml(value) {
    return String(value)
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


/* =========================================================
   TOAST
   ========================================================= */

function showMessage(
    message,
    type = "success"
) {
    let container =
        document.querySelector(
            "#toast-container"
        );

    if (!container) {
        container =
            document.createElement(
                "div"
            );

        container.id =
            "toast-container";

        container.style.position =
            "fixed";

        container.style.top =
            "20px";

        container.style.right =
            "20px";

        container.style.zIndex =
            "99999";

        container.style.display =
            "flex";

        container.style.flexDirection =
            "column";

        container.style.gap =
            "10px";

        document.body.appendChild(
            container
        );
    }

    const toast =
        document.createElement(
            "div"
        );

    toast.textContent = message;

    toast.style.padding =
        "12px 16px";

    toast.style.borderRadius =
        "10px";

    toast.style.background =
        "#ffffff";

    toast.style.border =
        "1px solid #e5e7eb";

    toast.style.boxShadow =
        "0 10px 30px rgba(0,0,0,0.12)";

    toast.style.fontSize =
        "14px";

    toast.style.fontWeight =
        "600";

    if (type === "success") {
        toast.style.borderLeft =
            "4px solid #16a34a";
    }

    if (type === "error") {
        toast.style.borderLeft =
            "4px solid #dc2626";
    }

    container.appendChild(
        toast
    );

    setTimeout(() => {
        toast.style.opacity =
            "0";

        toast.style.transition =
            "opacity 0.25s ease";

        setTimeout(() => {
            toast.remove();
        }, 250);

    }, 3500);
}


/* =========================================================
   GLOBAL FUNCTIONS FOR HTML
   ========================================================= */

window.openAddProductModal =
    openAddProductModal;

window.openEditProductModal =
    openEditProductModal;

window.closeProductModal =
    closeProductModal;

window.deleteProduct =
    deleteProduct;

window.loadProducts =
    loadProducts;

window.renderProducts =
    renderProducts;