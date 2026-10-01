"use strict";

const express = require("express");

const {
    requireAuth,
    authorizeRoles
} = require("../middleware/authMiddleware");

const {
    requireFeature
} = require("../middleware/subscriptionMiddleware");

const controller = require("../controllers/branchController");

const router = express.Router();

router.use(requireAuth);

// Existing branch visibility/context remains available.
router.get(
    "/",
    controller.listBranches
);

router.get(
    "/current",
    controller.currentBranch
);

// Selecting an existing branch is allowed.
router.post(
    "/select",
    controller.selectBranch
);

// Creating/managing multiple branches requires the multi_branch feature.
router.post(
    "/",
    authorizeRoles("owner"),
    requireFeature("multi_branch"),
    controller.createBranch
);

router.patch(
    "/:id",
    authorizeRoles("owner"),
    requireFeature("multi_branch"),
    controller.updateBranch
);

module.exports = router;