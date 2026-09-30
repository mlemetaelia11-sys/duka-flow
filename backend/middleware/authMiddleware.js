"use strict";

const jwt = require("jsonwebtoken");
const pool = require("../db");
const { runWithContext } = require("../requestContext");

const COOKIE_NAME = "dukaflow_session";

async function requireAuth(req, res, next) {
    const token = req.cookies?.[COOKIE_NAME];
    const secret = process.env.JWT_SECRET;

    if (!token || !secret) {
        return res.status(401).json({
            message: "Authentication required."
        });
    }

    let payload;

    try {
        payload = jwt.verify(token, secret);
    } catch {
        return res.status(401).json({
            message: "Your session is invalid or has expired."
        });
    }

    const userId = Number(payload.sub);

    if (!Number.isInteger(userId) || userId <= 0) {
        return res.status(401).json({
            message: "Your session is invalid or has expired."
        });
    }

    try {
        const result = await pool.query(
            `
            SELECT
                u.id,
                u.name,
                u.email,
                u.role,
                u.is_active,
                u.business_id,
                b.name AS business_name,
                b.is_active AS business_is_active
            FROM users u
            INNER JOIN businesses b
                ON b.id = u.business_id
            WHERE u.id = $1
            `,
            [userId]
        );

        const user = result.rows[0];

        if (!user || !user.is_active) {
            return res.status(401).json({
                message: "Authentication required."
            });
        }

        if (
            !payload.businessId ||
            Number(payload.businessId) !== Number(user.business_id)
        ) {
            return res.status(401).json({
                message: "Your session is invalid or has expired."
            });
        }

        if (!user.business_is_active) {
            return res.status(403).json({
                message: "This business is inactive. Contact support."
            });
        }

        const selected = Number(req.cookies?.dukaflow_branch || user.default_branch_id);
        const branch = await pool.query(`SELECT id,name,code,is_active FROM branches WHERE business_id=$1 AND is_active=TRUE AND id=COALESCE($2,(SELECT id FROM branches WHERE business_id=$1 AND code='MAIN' LIMIT 1)) LIMIT 1`, [user.business_id, Number.isInteger(selected)?selected:null]);
        if(!branch.rowCount) return res.status(409).json({message:"No active branch is available."});
        req.user={id:user.id,name:user.name,email:user.email,role:user.role,businessId:user.business_id,businessName:user.business_name,default_branch_id:branch.rows[0].id};
        req.businessId=user.business_id;req.branchId=branch.rows[0].id;
        return runWithContext({businessId:user.business_id,branchId:branch.rows[0].id,userId:user.id},()=>next());
    } catch (error) {
        console.error("AUTH USER LOOKUP ERROR:", error);
        return res.status(500).json({
            message: "Unable to verify your session."
        });
    }
}

function authorizeRoles(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                message: "Authentication required."
            });
        }

        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                message: "You do not have permission to perform this action."
            });
        }

        return next();
    };
}

module.exports = {
    COOKIE_NAME,
    requireAuth,
    authorizeRoles
};