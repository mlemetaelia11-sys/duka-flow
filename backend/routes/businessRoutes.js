const express = require("express");

const {
    getBusiness,
    updateBusiness
} = require("../controllers/businessController");

const {
    requireAuth,
    authorizeRoles
} = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/", requireAuth, getBusiness);

router.put(
    "/",
    requireAuth,
    authorizeRoles("owner"),
    updateBusiness
);

module.exports = router;