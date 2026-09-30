"use strict";

const express = require("express");
const { requireAuth } = require("../middleware/authMiddleware");
const { getBusinessInsights } = require("../controllers/businessInsightsController");

const router = express.Router();

router.get("/", requireAuth, getBusinessInsights);

module.exports = router;
