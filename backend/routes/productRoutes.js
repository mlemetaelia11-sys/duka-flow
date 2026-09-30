const express = require("express");
const { requireAuth, authorizeRoles } = require("../middleware/authMiddleware");
const { requireLimit } = require("../middleware/subscriptionMiddleware");

const {
    getProducts,
    getProductById,
    createProduct,
    updateProduct,
    deleteProduct
} = require("../controllers/productController");

const router = express.Router();

router.get("/", requireAuth, authorizeRoles("owner", "manager", "cashier"), getProducts);

router.get("/:id", requireAuth, authorizeRoles("owner", "manager", "cashier"), getProductById);

router.post("/", requireAuth, authorizeRoles("owner", "manager"), requireLimit({ resource: "products", limitKey: "product_limit", label: "Product" }), createProduct);

router.put("/:id", requireAuth, authorizeRoles("owner", "manager"), updateProduct);

router.delete("/:id", requireAuth, authorizeRoles("owner", "manager"), deleteProduct);

module.exports = router;