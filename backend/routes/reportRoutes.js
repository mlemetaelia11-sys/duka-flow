"use strict";

const express = require("express");
const { requireAuth, authorizeRoles } = require("../middleware/authMiddleware");
const { requireFeature } = require("../middleware/subscriptionMiddleware");
const { getReportSummary, getStaffPerformance, exportSalesCsv } = require("../controllers/reportController");

const router = express.Router();

router.get("/summary", requireAuth, authorizeRoles("owner", "manager"), getReportSummary);
router.get("/staff", requireAuth, authorizeRoles("owner", "manager"), requireFeature("advanced_reports"), getStaffPerformance);
router.get("/sales.csv", requireAuth, authorizeRoles("owner", "manager"), requireFeature("data_export"), exportSalesCsv);

module.exports = router;
