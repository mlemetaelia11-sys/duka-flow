"use strict";

const pool = require("../db");

function businessIdFrom(req) {
    const value = Number(req.businessId || req.user?.businessId || req.user?.business_id);
    return Number.isInteger(value) && value > 0 ? value : null;
}

async function getCurrentPlan(req) {
    const businessId = businessIdFrom(req);
    if (!businessId) return null;

    const result = await pool.query(
        `SELECT
            p.id,
            p.code,
            p.name,
            p.product_limit,
            p.customer_limit,
            p.user_limit,
            p.features,
            s.status,
            s.ends_at,
            s.trial_ends_at
         FROM subscriptions s
         INNER JOIN subscription_plans p ON p.id = s.plan_id
         WHERE s.business_id = $1
           AND s.status IN ('trial','active','past_due')
           AND (s.ends_at IS NULL OR s.ends_at > NOW())
           AND (s.trial_ends_at IS NULL OR s.trial_ends_at > NOW())
         ORDER BY s.updated_at DESC
         LIMIT 1`,
        [businessId]
    );

    return result.rows[0] || null;
}

function requireFeature(feature) {
    return async function featureMiddleware(req, res, next) {
        try {
            const plan = await getCurrentPlan(req);
            if (!plan) {
                return res.status(403).json({
                    message: "No active subscription plan is available for this business."
                });
            }

            if (plan.features?.[feature] !== true) {
                return res.status(403).json({
                    message: `${feature.replaceAll("_", " ")} requires a higher DukaFlow plan.`
                });
            }

            req.subscription = plan;
            return next();
        } catch (error) {
            console.error("SUBSCRIPTION FEATURE ERROR:", error.message);
            return res.status(500).json({ message: "Unable to verify plan access." });
        }
    };
}

function requireLimit({ resource, limitKey, label }) {
    return async function limitMiddleware(req, res, next) {
        try {
            const plan = await getCurrentPlan(req);
            if (!plan) {
                return res.status(403).json({ message: "No active subscription plan is available." });
            }

            const limit = plan[limitKey];
            if (limit === null || limit === undefined) {
                req.subscription = plan;
                return next();
            }

            const businessId = businessIdFrom(req);
            const safeResources = {
                users: "users",
                products: "products",
                customers: "customers"
            };
            const table = safeResources[resource];

            if (!table) {
                return res.status(500).json({ message: "Subscription resource is not configured." });
            }

            const result = await pool.query(
                `SELECT COUNT(*)::int AS count FROM ${table} WHERE business_id = $1`,
                [businessId]
            );

            const current = Number(result.rows[0].count);
            if (current >= Number(limit)) {
                return res.status(403).json({
                    message: `${label} limit reached for the ${plan.name} plan. Current limit: ${limit}.`
                });
            }

            req.subscription = plan;
            return next();
        } catch (error) {
            console.error("SUBSCRIPTION LIMIT ERROR:", error.message);
            return res.status(500).json({ message: "Unable to verify plan limit." });
        }
    };
}

module.exports = {
    getCurrentPlan,
    requireFeature,
    requireLimit
};
