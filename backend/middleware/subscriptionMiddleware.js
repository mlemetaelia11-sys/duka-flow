"use strict";

const pool = require("../db");

function businessIdFrom(req) {
    const value = Number(
        req.businessId ||
        req.user?.businessId ||
        req.user?.business_id
    );

    return Number.isInteger(value) && value > 0 ? value : null;
}

async function getCurrentPlan(req) {
    const businessId = businessIdFrom(req);

    if (!businessId) {
        return null;
    }

    const result = await pool.query(
        `
        SELECT
            s.id AS subscription_id,
            s.status,
            s.starts_at,
            s.ends_at,
            s.trial_ends_at,
            s.external_reference,

            p.id AS plan_id,
            p.code,
            p.name,
            p.price_monthly,
            p.price_yearly,
            p.product_limit,
            p.customer_limit,
            p.user_limit,
            p.features
        FROM subscriptions s
        INNER JOIN subscription_plans p
            ON p.id = s.plan_id
        WHERE s.business_id = $1
          AND s.status IN ('trial', 'active', 'past_due')
          AND p.is_active = TRUE
          AND (s.ends_at IS NULL OR s.ends_at > NOW())
          AND (
              s.trial_ends_at IS NULL
              OR s.trial_ends_at > NOW()
              OR s.status <> 'trial'
          )
        ORDER BY
            CASE
                WHEN s.status = 'active' THEN 1
                WHEN s.status = 'trial' THEN 2
                WHEN s.status = 'past_due' THEN 3
                ELSE 4
            END,
            s.updated_at DESC
        LIMIT 1
        `,
        [businessId]
    );

    return result.rows[0] || null;
}

async function requireActiveSubscription(req, res, next) {
    try {
        const plan = await getCurrentPlan(req);

        if (!plan) {
            return res.status(403).json({
                code: "SUBSCRIPTION_REQUIRED",
                message: "Active subscription required. Please choose a DukaFlow plan to continue."
            });
        }

        req.subscription = plan;
        return next();
    } catch (error) {
        console.error(
            "SUBSCRIPTION CHECK ERROR:",
            error.message
        );

        return res.status(500).json({
            message: "Unable to verify subscription."
        });
    }
}

function requireFeature(feature) {
    if (!feature || typeof feature !== "string") {
        throw new Error("Subscription feature name is required.");
    }

    return async function featureMiddleware(req, res, next) {
        try {
            const plan = req.subscription || await getCurrentPlan(req);

            if (!plan) {
                return res.status(403).json({
                    code: "SUBSCRIPTION_REQUIRED",
                    message: "Active subscription required."
                });
            }

            const enabled = Boolean(
                plan.features &&
                plan.features[feature] === true
            );

            if (!enabled) {
                return res.status(403).json({
                    code: "FEATURE_NOT_INCLUDED",
                    feature,
                    plan: plan.code,
                    message:
                        `${feature.replaceAll("_", " ")} is not included in the ${plan.name} plan.`
                });
            }

            req.subscription = plan;

            return next();
        } catch (error) {
            console.error(
                "SUBSCRIPTION FEATURE ERROR:",
                error.message
            );

            return res.status(500).json({
                message: "Unable to verify plan feature."
            });
        }
    };
}

function requireLimit({
    resource,
    limitKey,
    label
}) {
    const safeResources = {
        users: "users",
        products: "products",
        customers: "customers"
    };

    const table = safeResources[resource];

    if (!table) {
        throw new Error(
            `Unsupported subscription resource: ${resource}`
        );
    }

    return async function limitMiddleware(req, res, next) {
        try {
            const plan = req.subscription || await getCurrentPlan(req);

            if (!plan) {
                return res.status(403).json({
                    code: "SUBSCRIPTION_REQUIRED",
                    message: "Active subscription required."
                });
            }

            const rawLimit = plan[limitKey];

            // NULL means unlimited.
            if (
                rawLimit === null ||
                rawLimit === undefined
            ) {
                req.subscription = plan;
                return next();
            }

            const limit = Number(rawLimit);

            if (!Number.isFinite(limit) || limit < 0) {
                return res.status(500).json({
                    message: "Subscription limit is incorrectly configured."
                });
            }

            const businessId = businessIdFrom(req);

            if (!businessId) {
                return res.status(401).json({
                    message: "Business context is missing."
                });
            }

            const result = await pool.query(
                `
                SELECT COUNT(*)::int AS count
                FROM ${table}
                WHERE business_id = $1
                `,
                [businessId]
            );

            const current = Number(
                result.rows[0]?.count || 0
            );

            if (current >= limit) {
                return res.status(403).json({
                    code: "PLAN_LIMIT_REACHED",
                    resource,
                    plan: plan.code,
                    current,
                    limit,
                    message:
                        `${label || resource} limit reached for the ${plan.name} plan. Current limit: ${limit}.`
                });
            }

            req.subscription = plan;

            return next();
        } catch (error) {
            console.error(
                "SUBSCRIPTION LIMIT ERROR:",
                error.message
            );

            return res.status(500).json({
                message: "Unable to verify plan limit."
            });
        }
    };
}

function subscriptionInfo(req) {
    const plan = req.subscription;

    if (!plan) {
        return {
            active: false,
            plan: null
        };
    }

    return {
        active: true,
        plan: {
            id: plan.plan_id,
            code: plan.code,
            name: plan.name,
            productLimit: plan.product_limit,
            customerLimit: plan.customer_limit,
            userLimit: plan.user_limit,
            features: plan.features || {}
        },
        subscription: {
            id: plan.subscription_id,
            status: plan.status,
            startsAt: plan.starts_at,
            endsAt: plan.ends_at,
            trialEndsAt: plan.trial_ends_at
        }
    };
}

module.exports = {
    businessIdFrom,
    getCurrentPlan,
    requireActiveSubscription,
    requireFeature,
    requireLimit,
    subscriptionInfo
};