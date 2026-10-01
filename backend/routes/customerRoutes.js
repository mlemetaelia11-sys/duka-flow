"use strict";

const express = require("express");

const {
    requireAuth,
    authorizeRoles
} = require("../middleware/authMiddleware");

const {
    requireActiveSubscription,
    requireLimit
} = require("../middleware/subscriptionMiddleware");

const {
    getCustomers,
    getCustomerById,
    getCustomerHistory,
    createCustomer,
    updateCustomer,
    deleteCustomer
} = require("../controllers/customerController");

const {
    getCustomerNotes,
    createCustomerNote,
    deleteCustomerNote
} = require("../controllers/customerEngagementController");

const router = express.Router();

router.get(
    "/",
    requireAuth,
    authorizeRoles("owner", "manager", "cashier"),
    getCustomers
);

router.get(
    "/:id/history",
    requireAuth,
    authorizeRoles("owner", "manager", "cashier"),
    getCustomerHistory
);

router.get(
    "/:id/notes",
    requireAuth,
    authorizeRoles("owner", "manager", "cashier"),
    getCustomerNotes
);

router.post(
    "/:id/notes",
    requireAuth,
    authorizeRoles("owner", "manager", "cashier"),
    requireActiveSubscription,
    createCustomerNote
);

router.delete(
    "/:id/notes/:noteId",
    requireAuth,
    authorizeRoles("owner", "manager"),
    requireActiveSubscription,
    deleteCustomerNote
);

router.get(
    "/:id",
    requireAuth,
    authorizeRoles("owner", "manager", "cashier"),
    getCustomerById
);

router.post(
    "/",
    requireAuth,
    authorizeRoles("owner", "manager", "cashier"),
    requireActiveSubscription,
    requireLimit({
        resource: "customers",
        limitKey: "customer_limit",
        label: "Customer"
    }),
    createCustomer
);

router.put(
    "/:id",
    requireAuth,
    authorizeRoles("owner", "manager", "cashier"),
    requireActiveSubscription,
    updateCustomer
);

router.delete(
    "/:id",
    requireAuth,
    authorizeRoles("owner", "manager"),
    requireActiveSubscription,
    deleteCustomer
);

module.exports = router;