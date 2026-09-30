const express = require("express");
const { requireAuth, authorizeRoles } = require("../middleware/authMiddleware");

const {
    createPurchase,
    getPurchases,
    getPurchaseById
} = require("../controllers/purchaseController");

const router = express.Router();


router.get(
    "/",
    requireAuth,
    authorizeRoles("owner", "manager"),
    getPurchases
);


router.get(
    "/:id",
    requireAuth,
    authorizeRoles("owner", "manager"),
    getPurchaseById
);


router.post(
    "/",
    requireAuth,
    authorizeRoles("owner", "manager"),
    createPurchase
);


module.exports = router;