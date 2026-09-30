"use strict";

const express = require("express");
const { requireAuth, authorizeRoles } = require("../middleware/authMiddleware");
const { getReturns, getReturnById, createReturn } = require("../controllers/returnController");

const router = express.Router();
router.get("/", requireAuth, authorizeRoles("owner", "manager"), getReturns);
router.get("/:id", requireAuth, authorizeRoles("owner", "manager"), getReturnById);
router.post("/", requireAuth, authorizeRoles("owner", "manager"), createReturn);
module.exports = router;
