BEGIN;

INSERT INTO subscription_plans (
    code,
    name,
    price_monthly,
    price_yearly,
    product_limit,
    customer_limit,
    user_limit,
    features,
    is_active
)
SELECT
    'starter',
    'Starter',
    free_plan.price_monthly,
    free_plan.price_yearly,
    free_plan.product_limit,
    free_plan.customer_limit,
    free_plan.user_limit,
    free_plan.features,
    TRUE
FROM subscription_plans AS free_plan
WHERE free_plan.code = 'free'
ON CONFLICT (code) DO NOTHING;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM subscription_plans
        WHERE code = 'starter'
          AND is_active = TRUE
    ) THEN
        RAISE EXCEPTION 'An active Starter subscription plan is required for trial onboarding.';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION dukaflow_create_default_subscription()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    starter_plan_id BIGINT;
BEGIN
    SELECT id
    INTO starter_plan_id
    FROM subscription_plans
    WHERE code = 'starter'
      AND is_active = TRUE
    LIMIT 1;

    IF starter_plan_id IS NULL THEN
        RAISE EXCEPTION 'Active Starter subscription plan was not found.';
    END IF;

    INSERT INTO subscriptions (
        business_id,
        plan_id,
        status,
        starts_at,
        trial_ends_at
    )
    VALUES (
        NEW.id,
        starter_plan_id,
        'trial',
        NOW(),
        NOW() + INTERVAL '14 days'
    )
    ON CONFLICT DO NOTHING;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS businesses_default_subscription_trigger ON businesses;
CREATE TRIGGER businesses_default_subscription_trigger
AFTER INSERT ON businesses
FOR EACH ROW
EXECUTE FUNCTION dukaflow_create_default_subscription();

INSERT INTO subscriptions (
    business_id,
    plan_id,
    status,
    starts_at,
    trial_ends_at
)
SELECT
    business.id,
    starter_plan.id,
    'trial',
    NOW(),
    NOW() + INTERVAL '14 days'
FROM businesses AS business
CROSS JOIN subscription_plans AS starter_plan
WHERE starter_plan.code = 'starter'
  AND starter_plan.is_active = TRUE
  AND NOT EXISTS (
      SELECT 1
      FROM subscriptions AS existing
      WHERE existing.business_id = business.id
        AND existing.status IN ('trial', 'active', 'past_due')
  )
ON CONFLICT DO NOTHING;

COMMIT;
