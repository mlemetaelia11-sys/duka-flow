"use strict";

const express = require("express");
const { requireAuth, authorizeRoles } = require("../middleware/authMiddleware");
const {
    getPurchaseReturns,
    getPurchaseReturnById,
    createPurchaseReturn
} = require("../controllers/purchaseReturnController");

const router = express.Router();

router.get("/", requireAuth, authorizeRoles("owner", "manager"), getPurchaseReturns);
router.get("/:id", requireAuth, authorizeRoles("owner", "manager"), getPurchaseReturnById);
router.post("/", requireAuth, authorizeRoles("owner", "manager"), createPurchaseReturn);

module.exports = router;
