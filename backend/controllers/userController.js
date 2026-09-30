const bcrypt = require("bcryptjs");
const pool = require("../db");
const { logAudit } = require("../utils/audit");

const ALLOWED_ROLES = ["owner", "manager", "cashier"];

function getBusinessId(req) {
    return req.businessId || req.user?.businessId || req.user?.business_id || null;
}

function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
}

function cleanName(name) {
    return String(name || "").trim();
}

function validateRole(role) {
    return ALLOWED_ROLES.includes(role);
}

function userSelectColumns() {
    return `
        id,
        business_id,
        name,
        email,
        role,
        is_active,
        last_login_at,
        created_at,
        updated_at
    `;
}

async function getUsers(req, res) {
    try {
        const businessId = getBusinessId(req);

        if (!businessId) {
            return res.status(401).json({
                message: "Business context is missing."
            });
        }

        const result = await pool.query(
            `
            SELECT
                id,
                name,
                email,
                role,
                is_active,
                last_login_at,
                created_at,
                updated_at
            FROM users
            WHERE business_id = $1
            ORDER BY created_at DESC
            `,
            [businessId]
        );

        return res.json(result.rows);
    } catch (error) {
        console.error("getUsers error:", error);
        return res.status(500).json({
            message: "Failed to load users."
        });
    }
}

async function getUserById(req, res) {
    try {
        const businessId = getBusinessId(req);
        const userId = Number(req.params.id);

        if (!businessId) {
            return res.status(401).json({
                message: "Business context is missing."
            });
        }

        if (!Number.isInteger(userId) || userId <= 0) {
            return res.status(400).json({
                message: "Invalid user ID."
            });
        }

        const result = await pool.query(
            `
            SELECT
                id,
                name,
                email,
                role,
                is_active,
                last_login_at,
                created_at,
                updated_at
            FROM users
            WHERE id = $1
              AND business_id = $2
            LIMIT 1
            `,
            [userId, businessId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({
                message: "User not found."
            });
        }

        return res.json(result.rows[0]);
    } catch (error) {
        console.error("getUserById error:", error);
        return res.status(500).json({
            message: "Failed to load user."
        });
    }
}

async function createUser(req, res) {
    try {
        const businessId = getBusinessId(req);

        if (!businessId) {
            return res.status(401).json({
                message: "Business context is missing."
            });
        }

        const name = cleanName(req.body?.name);
        const email = normalizeEmail(req.body?.email);
        const password = String(req.body?.password || "");
        const role = String(req.body?.role || "").trim().toLowerCase();

        if (!name || name.length < 2) {
            return res.status(400).json({
                message: "Name is required."
            });
        }

        if (!email || !email.includes("@")) {
            return res.status(400).json({
                message: "A valid email is required."
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                message: "Password must be at least 8 characters."
            });
        }

        if (!validateRole(role)) {
            return res.status(400).json({
                message: "Invalid role."
            });
        }

        const existing = await pool.query(
            `
            SELECT id
            FROM users
            WHERE LOWER(email) = LOWER($1)
            LIMIT 1
            `,
            [email]
        );

        if (existing.rowCount > 0) {
            return res.status(409).json({
                message: "A user with this email already exists."
            });
        }

        const passwordHash = await bcrypt.hash(password, 12);

        const result = await pool.query(
            `
            INSERT INTO users (
                business_id,
                name,
                email,
                password_hash,
                role,
                is_active
            )
            VALUES ($1, $2, $3, $4, $5, TRUE)
            RETURNING
                id,
                name,
                email,
                role,
                is_active,
                last_login_at,
                created_at,
                updated_at
            `,
            [
                businessId,
                name,
                email,
                passwordHash,
                role
            ]
        );

        await logAudit(req, "user.created", "user", result.rows[0].id, { role: result.rows[0].role });
        return res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error("createUser error:", error);

        if (error.code === "23505") {
            return res.status(409).json({
                message: "A user with this email already exists."
            });
        }

        return res.status(500).json({
            message: "Failed to create user."
        });
    }
}

async function updateUser(req, res) {
    try {
        const businessId = getBusinessId(req);
        const userId = Number(req.params.id);

        if (!businessId) {
            return res.status(401).json({
                message: "Business context is missing."
            });
        }

        if (!Number.isInteger(userId) || userId <= 0) {
            return res.status(400).json({
                message: "Invalid user ID."
            });
        }

        const name = cleanName(req.body?.name);
        const email = normalizeEmail(req.body?.email);
        const role = String(req.body?.role || "").trim().toLowerCase();
        const password = req.body?.password
            ? String(req.body.password)
            : "";

        if (!name || name.length < 2) {
            return res.status(400).json({
                message: "Name is required."
            });
        }

        if (!email || !email.includes("@")) {
            return res.status(400).json({
                message: "A valid email is required."
            });
        }

        if (!validateRole(role)) {
            return res.status(400).json({
                message: "Invalid role."
            });
        }

        const currentResult = await pool.query(
            `
            SELECT
                id,
                name,
                email,
                role,
                is_active
            FROM users
            WHERE id = $1
              AND business_id = $2
            LIMIT 1
            `,
            [userId, businessId]
        );

        if (currentResult.rowCount === 0) {
            return res.status(404).json({
                message: "User not found."
            });
        }

        const currentUser = currentResult.rows[0];

        if (
            currentUser.role === "owner" &&
            role !== "owner"
        ) {
            const ownerCount = await pool.query(
                `
                SELECT COUNT(*)::int AS count
                FROM users
                WHERE business_id = $1
                  AND role = 'owner'
                  AND is_active = TRUE
                `,
                [businessId]
            );

            if (ownerCount.rows[0].count <= 1) {
                return res.status(400).json({
                    message: "The final active owner cannot be changed to another role."
                });
            }
        }

        const emailOwner = await pool.query(
            `
            SELECT id
            FROM users
            WHERE LOWER(email) = LOWER($1)
              AND id <> $2
            LIMIT 1
            `,
            [email, userId]
        );

        if (emailOwner.rowCount > 0) {
            return res.status(409).json({
                message: "A user with this email already exists."
            });
        }

        let result;

        if (password) {
            if (password.length < 8) {
                return res.status(400).json({
                    message: "Password must be at least 8 characters."
                });
            }

            const passwordHash = await bcrypt.hash(password, 12);

            result = await pool.query(
                `
                UPDATE users
                SET
                    name = $1,
                    email = $2,
                    role = $3,
                    password_hash = $4,
                    updated_at = NOW()
                WHERE id = $5
                  AND business_id = $6
                RETURNING
                    id,
                    name,
                    email,
                    role,
                    is_active,
                    last_login_at,
                    created_at,
                    updated_at
                `,
                [
                    name,
                    email,
                    role,
                    passwordHash,
                    userId,
                    businessId
                ]
            );
        } else {
            result = await pool.query(
                `
                UPDATE users
                SET
                    name = $1,
                    email = $2,
                    role = $3,
                    updated_at = NOW()
                WHERE id = $4
                  AND business_id = $5
                RETURNING
                    id,
                    name,
                    email,
                    role,
                    is_active,
                    last_login_at,
                    created_at,
                    updated_at
                `,
                [
                    name,
                    email,
                    role,
                    userId,
                    businessId
                ]
            );
        }

        await logAudit(req, "user.updated", "user", userId, { role: result.rows[0].role });
        return res.json(result.rows[0]);
    } catch (error) {
        console.error("updateUser error:", error);

        if (error.code === "23505") {
            return res.status(409).json({
                message: "A user with this email already exists."
            });
        }

        return res.status(500).json({
            message: "Failed to update user."
        });
    }
}

async function updateUserStatus(req, res) {
    try {
        const businessId = getBusinessId(req);
        const userId = Number(req.params.id);
        const isActive = req.body?.is_active;

        if (!businessId) {
            return res.status(401).json({
                message: "Business context is missing."
            });
        }

        if (!Number.isInteger(userId) || userId <= 0) {
            return res.status(400).json({
                message: "Invalid user ID."
            });
        }

        if (typeof isActive !== "boolean") {
            return res.status(400).json({
                message: "is_active must be true or false."
            });
        }

        const currentResult = await pool.query(
            `
            SELECT
                id,
                role,
                is_active
            FROM users
            WHERE id = $1
              AND business_id = $2
            LIMIT 1
            `,
            [userId, businessId]
        );

        if (currentResult.rowCount === 0) {
            return res.status(404).json({
                message: "User not found."
            });
        }

        const currentUser = currentResult.rows[0];

        if (
            currentUser.role === "owner" &&
            currentUser.is_active === true &&
            isActive === false
        ) {
            const ownerCount = await pool.query(
                `
                SELECT COUNT(*)::int AS count
                FROM users
                WHERE business_id = $1
                  AND role = 'owner'
                  AND is_active = TRUE
                `,
                [businessId]
            );

            if (ownerCount.rows[0].count <= 1) {
                return res.status(400).json({
                    message: "The final active owner cannot be deactivated."
                });
            }
        }

        const result = await pool.query(
            `
            UPDATE users
            SET
                is_active = $1,
                updated_at = NOW()
            WHERE id = $2
              AND business_id = $3
            RETURNING
                id,
                name,
                email,
                role,
                is_active,
                last_login_at,
                created_at,
                updated_at
            `,
            [
                isActive,
                userId,
                businessId
            ]
        );

        await logAudit(req, isActive ? "user.activated" : "user.deactivated", "user", userId, { role: currentUser.role });
        return res.json(result.rows[0]);
    } catch (error) {
        console.error("updateUserStatus error:", error);

        return res.status(500).json({
            message: "Failed to update user status."
        });
    }
}

async function deleteUser(req, res) {
    try {
        const businessId = getBusinessId(req);
        const userId = Number(req.params.id);

        if (!businessId) {
            return res.status(401).json({
                message: "Business context is missing."
            });
        }

        if (!Number.isInteger(userId) || userId <= 0) {
            return res.status(400).json({
                message: "Invalid user ID."
            });
        }

        const currentResult = await pool.query(
            `
            SELECT
                id,
                role,
                is_active
            FROM users
            WHERE id = $1
              AND business_id = $2
            LIMIT 1
            `,
            [userId, businessId]
        );

        if (currentResult.rowCount === 0) {
            return res.status(404).json({
                message: "User not found."
            });
        }

        const currentUser = currentResult.rows[0];

        if (
            currentUser.role === "owner" &&
            currentUser.is_active === true
        ) {
            const ownerCount = await pool.query(
                `
                SELECT COUNT(*)::int AS count
                FROM users
                WHERE business_id = $1
                  AND role = 'owner'
                  AND is_active = TRUE
                `,
                [businessId]
            );

            if (ownerCount.rows[0].count <= 1) {
                return res.status(400).json({
                    message: "The final active owner cannot be deleted."
                });
            }
        }

        await pool.query(
            `
            DELETE FROM users
            WHERE id = $1
              AND business_id = $2
            `,
            [userId, businessId]
        );

        await logAudit(req, "user.deleted", "user", userId);
        return res.json({
            message: "User deleted successfully."
        });
    } catch (error) {
        console.error("deleteUser error:", error);

        if (error.code === "23503") {
            return res.status(409).json({
                message: "This user has historical records. Deactivate the user instead of deleting the account."
            });
        }

        return res.status(500).json({
            message: "Failed to delete user."
        });
    }
}

module.exports = {
    getUsers,
    getUserById,
    createUser,
    updateUser,
    updateUserStatus,
    deleteUser
};