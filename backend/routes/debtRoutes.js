const express = require("express");
const { requireAuth, authorizeRoles } = require("../middleware/authMiddleware");

const {
    getAllDebts,
    recordDebtPayment,
    getCustomerDebts,
    getDebtPayments
} = require("../controllers/debtController");

const router = express.Router();


router.get("/", requireAuth, authorizeRoles("owner", "manager", "cashier"), getAllDebts);


router.get(
    "/customer/:customerId",
    requireAuth,
    authorizeRoles("owner", "manager", "cashier"),
    getCustomerDebts
);


router.get(
    "/:id/payments",
    requireAuth,
    authorizeRoles("owner", "manager", "cashier"),
    getDebtPayments
);


router.post(
    "/:id/payments",
    requireAuth,
    authorizeRoles("owner", "manager", "cashier"),
    recordDebtPayment
);


module.exports = router;