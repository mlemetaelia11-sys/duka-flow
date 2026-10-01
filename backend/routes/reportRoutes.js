"use strict";

const express = require("express");

const {
    requireAuth,
    authorizeRoles
} = require("../middleware/authMiddleware");

const {
    requireFeature
} = require("../middleware/subscriptionMiddleware");

const {
    getReportSummary,
    getStaffPerformance,
    exportSalesCsv
} = require("../controllers/reportController");

const router = express.Router();

// Basic reports are included in the seeded plans through
// the "reports" feature.
router.get(
    "/summary",
    requireAuth,
    authorizeRoles("owner", "manager"),
    requireFeature("reports"),
    getReportSummary
);

// Advanced staff analytics require the advanced_reports feature.
router.get(
    "/staff",
    requireAuth,
    authorizeRoles("owner", "manager"),
    requireFeature("advanced_reports"),
    getStaffPerformance
);

// CSV exporting requires an explicitly enabled data_export feature.
router.get(
    "/sales.csv",
    requireAuth,
    authorizeRoles("owner", "manager"),
    requireFeature("data_export"),
    exportSalesCsv
);

module.exports = router;