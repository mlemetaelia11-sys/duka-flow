"use strict";

const express = require("express");
const { requireAuth, authorizeRoles } = require("../middleware/authMiddleware");
const {
    getInventorySummary,
    getStockMovements,
    adjustStock,
    getProductMovements
} = require("../controllers/inventoryController");

const router = express.Router();

router.get("/summary", requireAuth, authorizeRoles("owner", "manager", "cashier"), getInventorySummary);
router.get("/movements", requireAuth, authorizeRoles("owner", "manager", "cashier"), getStockMovements);
router.get("/products/:id/movements", requireAuth, authorizeRoles("owner", "manager", "cashier"), getProductMovements);
router.post("/adjustments", requireAuth, authorizeRoles("owner", "manager"), adjustStock);

module.exports = router;
