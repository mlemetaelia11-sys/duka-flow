const express = require("express");
const { requireAuth, authorizeRoles } = require("../middleware/authMiddleware");

const {
    getSuppliers,
    getSupplierById,
    createSupplier,
    updateSupplier,
    deleteSupplier
} = require("../controllers/supplierController");

const router = express.Router();

router.get("/", requireAuth, authorizeRoles("owner", "manager"), getSuppliers);

router.get("/:id", requireAuth, authorizeRoles("owner", "manager"), getSupplierById);

router.post("/", requireAuth, authorizeRoles("owner", "manager"), createSupplier);

router.put("/:id", requireAuth, authorizeRoles("owner", "manager"), updateSupplier);

router.delete("/:id", requireAuth, authorizeRoles("owner", "manager"), deleteSupplier);

module.exports = router;