const express = require("express");
const { requireAuth, authorizeRoles } = require("../middleware/authMiddleware");

const {
    getDashboardSummary,
    getSalesOverview
} = require("../controllers/dashboardController");
const router = express.Router();

router.get(
    "/summary",
    requireAuth,
    authorizeRoles("owner", "manager", "cashier"),
    getDashboardSummary
);
router.get(
    "/sales-overview",
    requireAuth,
    authorizeRoles("owner", "manager", "cashier"),
    getSalesOverview
);

module.exports = router;