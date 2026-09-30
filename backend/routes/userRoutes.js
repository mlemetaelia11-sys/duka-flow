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
const { requireLimit } = require("../middleware/subscriptionMiddleware");

const router = express.Router();

router.use(requireAuth);
router.use(authorizeRoles("owner"));

router.get("/", getUsers);
router.get("/:id", getUserById);
router.post(
    "/",
    requireLimit({
        resource: "users",
        limitKey: "user_limit",
        label: "User"
    }),
    createUser
);
router.put("/:id", updateUser);
router.patch("/:id/status", updateUserStatus);
router.delete("/:id", deleteUser);

module.exports = router;