"use strict";

const express = require("express");

const {
    getUsers,
    getUserById,
    createUser,
    updateUser,
    updateUserStatus,
    deleteUser
} = require("../controllers/userController");

const {
    requireAuth,
    authorizeRoles
} = require("../middleware/authMiddleware");

const {
    requireActiveSubscription,
    requireLimit
} = require("../middleware/subscriptionMiddleware");

const router = express.Router();

router.use(requireAuth);
router.use(authorizeRoles("owner"));

// Owner can inspect staff accounts.
router.get("/", getUsers);
router.get("/:id", getUserById);

// Creating a staff account requires an active subscription
// and respects the plan's user_limit.
router.post(
    "/",
    requireActiveSubscription,
    requireLimit({
        resource: "users",
        limitKey: "user_limit",
        label: "User"
    }),
    createUser
);

// Existing staff management also requires an active subscription.
router.put(
    "/:id",
    requireActiveSubscription,
    updateUser
);

router.patch(
    "/:id/status",
    requireActiveSubscription,
    updateUserStatus
);

router.delete(
    "/:id",
    requireActiveSubscription,
    deleteUser
);

module.exports = router;