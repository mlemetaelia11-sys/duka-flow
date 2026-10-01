"use strict";

const express = require("express");
const {
    requireAuth
} = require("../middleware/authMiddleware");

const {
    getPlans,
    getCurrent
} = require("../controllers/subscriptionController");

const router = express.Router();

// Public plan catalogue.
router.get("/plans", getPlans);

// Logged-in business subscription.
router.get(
    "/current",
    requireAuth,
    getCurrent
);

module.exports = router;