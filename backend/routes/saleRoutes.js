const express = require("express");
const { requireAuth, authorizeRoles } = require("../middleware/authMiddleware");

const {
    createSale,
    getSales,
    getSaleById
} = require("../controllers/saleController");

const router = express.Router();


router.get("/", requireAuth, authorizeRoles("owner", "manager", "cashier"), getSales);

router.get("/:id", requireAuth, authorizeRoles("owner", "manager", "cashier"), getSaleById);

router.post("/", requireAuth, authorizeRoles("owner", "manager", "cashier"), createSale);


module.exports = router;