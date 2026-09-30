const express = require("express");
const { requireAuth, authorizeRoles } = require("../middleware/authMiddleware");
const { requireLimit } = require("../middleware/subscriptionMiddleware");

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

router.get("/", requireAuth, authorizeRoles("owner", "manager", "cashier"), getCustomers);

router.get(
    "/:id/history",
    requireAuth,
    authorizeRoles("owner", "manager", "cashier"),
    getCustomerHistory
);

router.get("/:id/notes", requireAuth, authorizeRoles("owner", "manager", "cashier"), getCustomerNotes);
router.post("/:id/notes", requireAuth, authorizeRoles("owner", "manager", "cashier"), createCustomerNote);
router.delete("/:id/notes/:noteId", requireAuth, authorizeRoles("owner", "manager"), deleteCustomerNote);

router.get("/:id", requireAuth, authorizeRoles("owner", "manager", "cashier"), getCustomerById);

router.post("/", requireAuth, authorizeRoles("owner", "manager", "cashier"), requireLimit({ resource: "customers", limitKey: "customer_limit", label: "Customer" }), createCustomer);

router.put("/:id", requireAuth, authorizeRoles("owner", "manager", "cashier"), updateCustomer);

router.delete("/:id", requireAuth, authorizeRoles("owner", "manager"), deleteCustomer);

module.exports = router;