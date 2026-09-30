"use strict";

const express = require("express");
const { requireAuth } = require("../middleware/authMiddleware");
const {
    getWidgetPreferences,
    updateWidgetPreferences
} = require("../controllers/dashboardWidgetController");

const router = express.Router();

router.get("/", requireAuth, getWidgetPreferences);
router.put("/", requireAuth, updateWidgetPreferences);

module.exports = router;
