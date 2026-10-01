"use strict";

const pool = require("../db");
const {
    getCurrentPlan
} = require("../middleware/subscriptionMiddleware");

function businessIdFrom(req) {
    const value = Number(
        req.businessId ||
        req.user?.businessId ||
        req.user?.business_id
    );

    return Number.isInteger(value) && value > 0
        ? value
        : null;
}

function formatSubscription(plan) {
    if (!plan) {
        return null;
    }

    return {
        id: plan.subscription_id,
        status: plan.status,
        starts_at: plan.starts_at,
        ends_at: plan.ends_at,
        trial_ends_at: plan.trial_ends_at,
        external_reference: plan.external_reference,
        plan_id: plan.plan_id,
        code: plan.code,
        name: plan.name,
        price_monthly: plan.price_monthly,
        price_yearly: plan.price_yearly,
        product_limit: plan.product_limit,
        customer_limit: plan.customer_limit,
        user_limit: plan.user_limit,
        features: plan.features || {}
    };
}

async function getPlans(req, res) {
    try {
        const result = await pool.query(
            `
            SELECT
                id,
                code,
                name,
                price_monthly,
                price_yearly,
                product_limit,
                customer_limit,
                user_limit,
                features,
                is_active
            FROM subscription_plans
            WHERE is_active = TRUE
            ORDER BY price_monthly ASC
            `
        );

        return res.json({
            plans: result.rows
        });
    } catch (error) {
        console.error(
            "PLANS ERROR:",
            error.message
        );

        return res.status(500).json({
            message: "Failed to load subscription plans."
        });
    }
}

async function getCurrent(req, res) {
    const businessId = businessIdFrom(req);

    if (!businessId) {
        return res.status(401).json({
            message: "Business context is missing."
        });
    }

    try {
        const plan = await getCurrentPlan(req);

        return res.json({
            subscription: formatSubscription(plan)
        });
    } catch (error) {
        console.error(
            "CURRENT SUBSCRIPTION ERROR:",
            error.message
        );

        return res.status(500).json({
            message: "Failed to load subscription."
        });
    }
}

module.exports = {
    getPlans,
    getCurrent
};