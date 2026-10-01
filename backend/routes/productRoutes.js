"use strict";

const express = require("express");

const {
    requireAuth,
    authorizeRoles
} = require("../middleware/authMiddleware");

const {
    requireActiveSubscription,
    requireLimit
} = require("../middleware/subscriptionMiddleware");

const {
    getProducts,
    getProductById,
    createProduct,
    updateProduct,
    deleteProduct
} = require("../controllers/productController");

const router = express.Router();

// Viewing products is allowed so the user can still see their catalogue
// and understand what they have before choosing a plan.
router.get(
    "/",
    requireAuth,
    authorizeRoles("owner", "manager", "cashier"),
    getProducts
);

router.get(
    "/:id",
    requireAuth,
    authorizeRoles("owner", "manager", "cashier"),
    getProductById
);

// Creating a product requires an active subscription and respects
// the plan's product_limit when one is configured.
router.post(
    "/",
    requireAuth,
    authorizeRoles("owner", "manager"),
    requireActiveSubscription,
    requireLimit({
        resource: "products",
        limitKey: "product_limit",
        label: "Product"
    }),
    createProduct
);

// Existing records can only be modified while the subscription is active.
router.put(
    "/:id",
    requireAuth,
    authorizeRoles("owner", "manager"),
    requireActiveSubscription,
    updateProduct
);

router.delete(
    "/:id",
    requireAuth,
    authorizeRoles("owner", "manager"),
    requireActiveSubscription,
    deleteProduct
);

module.exports = router;