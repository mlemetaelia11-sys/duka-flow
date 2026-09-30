"use strict";

const express = require("express");
const { requireAuth, authorizeRoles } = require("../middleware/authMiddleware");
const { listApprovals, createApproval, reviewApproval } = require("../controllers/approvalController");

const router = express.Router();

router.get("/", requireAuth, listApprovals);
router.post("/", requireAuth, createApproval);
router.patch("/:id", requireAuth, authorizeRoles("owner"), reviewApproval);

module.exports = router;
