"use strict";

const express = require("express");
const { requireAuth, authorizeRoles } = require("../middleware/authMiddleware");
const { requireFeature } = require("../middleware/subscriptionMiddleware");
const { exportResource } = require("../controllers/exportController");

const router = express.Router();

router.get(
    "/:resource.csv",
    requireAuth,
    authorizeRoles("owner", "manager"),
    requireFeature("data_export"),
    exportResource
);

module.exports = router;
