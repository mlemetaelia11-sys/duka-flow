BEGIN;

CREATE SEQUENCE IF NOT EXISTS sale_return_seq START 1 INCREMENT 1;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_business_id_id_key') THEN
        ALTER TABLE users ADD CONSTRAINT users_business_id_id_key UNIQUE (business_id, id);
    END IF;
END $$;

ALTER TABLE products
    ADD COLUMN IF NOT EXISTS sku VARCHAR(80),
    ADD COLUMN IF NOT EXISTS barcode VARCHAR(80),
    ADD COLUMN IF NOT EXISTS category VARCHAR(100),
    ADD COLUMN IF NOT EXISTS unit VARCHAR(30) NOT NULL DEFAULT 'pcs';

ALTER TABLE sales
    ADD COLUMN IF NOT EXISTS payment_reference VARCHAR(100),
    ADD COLUMN IF NOT EXISTS mobile_money_provider VARCHAR(50),
    ADD COLUMN IF NOT EXISTS created_by BIGINT;

ALTER TABLE purchases
    ADD COLUMN IF NOT EXISTS payment_reference VARCHAR(100),
    ADD COLUMN IF NOT EXISTS created_by BIGINT;

ALTER TABLE debt_payments
    ADD COLUMN IF NOT EXISTS payment_reference VARCHAR(100),
    ADD COLUMN IF NOT EXISTS mobile_money_provider VARCHAR(50),
    ADD COLUMN IF NOT EXISTS created_by BIGINT;

CREATE UNIQUE INDEX IF NOT EXISTS products_business_sku_uidx
    ON products (business_id, LOWER(sku))
    WHERE sku IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS products_business_barcode_uidx
    ON products (business_id, barcode)
    WHERE barcode IS NOT NULL;

CREATE TABLE IF NOT EXISTS stock_movements (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    business_id BIGINT NOT NULL REFERENCES businesses(id) ON DELETE RESTRICT,
    product_id INTEGER NOT NULL,
    movement_type VARCHAR(30) NOT NULL CHECK (
        movement_type IN ('purchase','sale','sale_return','adjustment','damaged','opening','transfer')
    ),
    quantity_change INTEGER NOT NULL CHECK (quantity_change <> 0),
    reference_type VARCHAR(40),
    reference_id BIGINT,
    notes VARCHAR(255),
    created_by BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS stock_movements_business_product_idx
    ON stock_movements (business_id, product_id, created_at DESC);

CREATE INDEX IF NOT EXISTS stock_movements_business_created_idx
    ON stock_movements (business_id, created_at DESC);

ALTER TABLE stock_movements
    DROP CONSTRAINT IF EXISTS stock_movements_business_created_by_fkey;
ALTER TABLE stock_movements
    ADD CONSTRAINT stock_movements_business_created_by_fkey
    FOREIGN KEY (business_id, created_by)
    REFERENCES users (business_id, id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS stock_movements_business_created_by_idx
    ON stock_movements (business_id, created_by, created_at DESC);

ALTER TABLE stock_movements
    DROP CONSTRAINT IF EXISTS stock_movements_business_product_fkey;
ALTER TABLE stock_movements
    ADD CONSTRAINT stock_movements_business_product_fkey
    FOREIGN KEY (business_id, product_id)
    REFERENCES products (business_id, id) ON DELETE RESTRICT;

CREATE TABLE IF NOT EXISTS sale_returns (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    business_id BIGINT NOT NULL REFERENCES businesses(id) ON DELETE RESTRICT,
    sale_id BIGINT NOT NULL,
    customer_id BIGINT,
    return_number VARCHAR(50) NOT NULL,
    total_amount NUMERIC(12,2) NOT NULL CHECK (total_amount >= 0),
    reason VARCHAR(255),
    refund_method VARCHAR(20) NOT NULL DEFAULT 'cash' CHECK (
        refund_method IN ('cash','mobile_money','bank','credit_balance')
    ),
    refund_reference VARCHAR(100),
    status VARCHAR(20) NOT NULL DEFAULT 'completed' CHECK (
        status IN ('completed','cancelled')
    ),
    created_by BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (business_id, return_number)
);

CREATE INDEX IF NOT EXISTS sale_returns_business_created_idx
    ON sale_returns (business_id, created_at DESC);

ALTER TABLE sale_returns
    DROP CONSTRAINT IF EXISTS sale_returns_business_created_by_fkey;
ALTER TABLE sale_returns
    ADD CONSTRAINT sale_returns_business_created_by_fkey
    FOREIGN KEY (business_id, created_by)
    REFERENCES users (business_id, id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS sale_returns_business_created_by_idx
    ON sale_returns (business_id, created_by, created_at DESC);

CREATE TABLE IF NOT EXISTS sale_return_items (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    business_id BIGINT NOT NULL REFERENCES businesses(id) ON DELETE RESTRICT,
    return_id BIGINT NOT NULL,
    sale_item_id BIGINT NOT NULL,
    product_id INTEGER NOT NULL,
    product_name VARCHAR(150) NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
    line_total NUMERIC(12,2) NOT NULL CHECK (line_total >= 0)
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sale_returns_business_id_id_key') THEN
        ALTER TABLE sale_returns ADD CONSTRAINT sale_returns_business_id_id_key UNIQUE (business_id, id);
    END IF;
END $$;

ALTER TABLE sale_returns
    DROP CONSTRAINT IF EXISTS sale_returns_business_sale_fkey;
ALTER TABLE sale_returns
    ADD CONSTRAINT sale_returns_business_sale_fkey
    FOREIGN KEY (business_id, sale_id)
    REFERENCES sales (business_id, id) ON DELETE RESTRICT;

ALTER TABLE sale_returns
    DROP CONSTRAINT IF EXISTS sale_returns_business_customer_fkey;
ALTER TABLE sale_returns
    ADD CONSTRAINT sale_returns_business_customer_fkey
    FOREIGN KEY (business_id, customer_id)
    REFERENCES customers (business_id, id) ON DELETE SET NULL;

ALTER TABLE sale_return_items
    DROP CONSTRAINT IF EXISTS sale_return_items_business_return_fkey;
ALTER TABLE sale_return_items
    ADD CONSTRAINT sale_return_items_business_return_fkey
    FOREIGN KEY (business_id, return_id)
    REFERENCES sale_returns (business_id, id) ON DELETE CASCADE;

ALTER TABLE sale_return_items
    DROP CONSTRAINT IF EXISTS sale_return_items_business_product_fkey;
ALTER TABLE sale_return_items
    ADD CONSTRAINT sale_return_items_business_product_fkey
    FOREIGN KEY (business_id, product_id)
    REFERENCES products (business_id, id) ON DELETE RESTRICT;

CREATE TABLE IF NOT EXISTS cash_registers (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    business_id BIGINT NOT NULL REFERENCES businesses(id) ON DELETE RESTRICT,
    opened_by BIGINT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
    opening_balance NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (opening_balance >= 0),
    closing_balance NUMERIC(12,2),
    expected_balance NUMERIC(12,2),
    notes VARCHAR(255),
    opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS cash_registers_one_open_per_business_uidx
    ON cash_registers (business_id)
    WHERE status = 'open';

CREATE INDEX IF NOT EXISTS cash_registers_business_opened_idx
    ON cash_registers (business_id, opened_at DESC);

CREATE TABLE IF NOT EXISTS cash_movements (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    business_id BIGINT NOT NULL REFERENCES businesses(id) ON DELETE RESTRICT,
    register_id BIGINT NOT NULL,
    movement_type VARCHAR(30) NOT NULL CHECK (
        movement_type IN ('opening','sale','cash_in','cash_out','refund','adjustment','closing')
    ),
    amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    direction VARCHAR(5) NOT NULL DEFAULT 'in' CHECK (direction IN ('in','out')),
    reference_type VARCHAR(40),
    reference_id BIGINT,
    note VARCHAR(255),
    created_by BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cash_registers_business_id_id_key') THEN
        ALTER TABLE cash_registers ADD CONSTRAINT cash_registers_business_id_id_key UNIQUE (business_id, id);
    END IF;
END $$;

ALTER TABLE cash_movements
    ADD COLUMN IF NOT EXISTS direction VARCHAR(5) NOT NULL DEFAULT 'in';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cash_movements_direction_check') THEN
        ALTER TABLE cash_movements ADD CONSTRAINT cash_movements_direction_check CHECK (direction IN ('in','out'));
    END IF;
END $$;

ALTER TABLE cash_registers
    DROP CONSTRAINT IF EXISTS cash_registers_business_opened_by_fkey;
ALTER TABLE cash_registers
    ADD CONSTRAINT cash_registers_business_opened_by_fkey
    FOREIGN KEY (business_id, opened_by)
    REFERENCES users (business_id, id) ON DELETE RESTRICT;

ALTER TABLE cash_movements
    DROP CONSTRAINT IF EXISTS cash_movements_business_register_fkey;
ALTER TABLE cash_movements
    ADD CONSTRAINT cash_movements_business_register_fkey
    FOREIGN KEY (business_id, register_id)
    REFERENCES cash_registers (business_id, id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS cash_movements_business_register_idx
    ON cash_movements (business_id, register_id, created_at DESC);

ALTER TABLE cash_movements
    DROP CONSTRAINT IF EXISTS cash_movements_business_created_by_fkey;
ALTER TABLE cash_movements
    ADD CONSTRAINT cash_movements_business_created_by_fkey
    FOREIGN KEY (business_id, created_by)
    REFERENCES users (business_id, id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS cash_movements_business_created_by_idx
    ON cash_movements (business_id, created_by, created_at DESC);

CREATE TABLE IF NOT EXISTS supplier_payments (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    business_id BIGINT NOT NULL REFERENCES businesses(id) ON DELETE RESTRICT,
    purchase_id BIGINT NOT NULL,
    supplier_id BIGINT NOT NULL,
    amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    payment_method VARCHAR(20) NOT NULL CHECK (payment_method IN ('cash','mobile_money','bank')),
    payment_reference VARCHAR(100),
    notes VARCHAR(255),
    paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by BIGINT
);

ALTER TABLE supplier_payments
    DROP CONSTRAINT IF EXISTS supplier_payments_business_purchase_fkey;
ALTER TABLE supplier_payments
    ADD CONSTRAINT supplier_payments_business_purchase_fkey
    FOREIGN KEY (business_id, purchase_id)
    REFERENCES purchases (business_id, id) ON DELETE CASCADE;

ALTER TABLE supplier_payments
    DROP CONSTRAINT IF EXISTS supplier_payments_business_supplier_fkey;
ALTER TABLE supplier_payments
    ADD CONSTRAINT supplier_payments_business_supplier_fkey
    FOREIGN KEY (business_id, supplier_id)
    REFERENCES suppliers (business_id, id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS supplier_payments_business_supplier_idx
    ON supplier_payments (business_id, supplier_id, paid_at DESC);

ALTER TABLE supplier_payments
    DROP CONSTRAINT IF EXISTS supplier_payments_business_created_by_fkey;
ALTER TABLE supplier_payments
    ADD CONSTRAINT supplier_payments_business_created_by_fkey
    FOREIGN KEY (business_id, created_by)
    REFERENCES users (business_id, id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS supplier_payments_business_created_by_idx
    ON supplier_payments (business_id, created_by, paid_at DESC);

CREATE TABLE IF NOT EXISTS notifications (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    business_id BIGINT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    user_id BIGINT,
    title VARCHAR(150) NOT NULL,
    message VARCHAR(500) NOT NULL,
    notification_type VARCHAR(40) NOT NULL DEFAULT 'info',
    priority VARCHAR(20) NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','critical')),
    action_url VARCHAR(255),
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE notifications
    DROP CONSTRAINT IF EXISTS notifications_business_user_fkey;
ALTER TABLE notifications
    ADD CONSTRAINT notifications_business_user_fkey
    FOREIGN KEY (business_id, user_id)
    REFERENCES users (business_id, id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS notifications_business_user_read_idx
    ON notifications (business_id, user_id, is_read, created_at DESC);

CREATE TABLE IF NOT EXISTS loyalty_accounts (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    business_id BIGINT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    customer_id BIGINT NOT NULL,
    points_balance INTEGER NOT NULL DEFAULT 0 CHECK (points_balance >= 0),
    lifetime_points INTEGER NOT NULL DEFAULT 0 CHECK (lifetime_points >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (business_id, customer_id)
);

ALTER TABLE loyalty_accounts
    DROP CONSTRAINT IF EXISTS loyalty_accounts_business_customer_fkey;
ALTER TABLE loyalty_accounts
    ADD CONSTRAINT loyalty_accounts_business_customer_fkey
    FOREIGN KEY (business_id, customer_id)
    REFERENCES customers (business_id, id) ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS loyalty_transactions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    business_id BIGINT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    account_id BIGINT NOT NULL,
    transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('earn','redeem','adjustment')),
    points INTEGER NOT NULL CHECK (points <> 0),
    description VARCHAR(255),
    sale_id BIGINT,
    created_by BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'loyalty_accounts_business_id_id_key') THEN
        ALTER TABLE loyalty_accounts ADD CONSTRAINT loyalty_accounts_business_id_id_key UNIQUE (business_id, id);
    END IF;
END $$;

ALTER TABLE loyalty_transactions
    DROP CONSTRAINT IF EXISTS loyalty_transactions_business_account_fkey;
ALTER TABLE loyalty_transactions
    ADD CONSTRAINT loyalty_transactions_business_account_fkey
    FOREIGN KEY (business_id, account_id)
    REFERENCES loyalty_accounts (business_id, id) ON DELETE CASCADE;

ALTER TABLE loyalty_transactions
    DROP CONSTRAINT IF EXISTS loyalty_transactions_business_sale_fkey;
ALTER TABLE loyalty_transactions
    ADD CONSTRAINT loyalty_transactions_business_sale_fkey
    FOREIGN KEY (business_id, sale_id)
    REFERENCES sales (business_id, id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS loyalty_transactions_business_account_idx
    ON loyalty_transactions (business_id, account_id, created_at DESC);

ALTER TABLE loyalty_transactions
    DROP CONSTRAINT IF EXISTS loyalty_transactions_business_created_by_fkey;
ALTER TABLE loyalty_transactions
    ADD CONSTRAINT loyalty_transactions_business_created_by_fkey
    FOREIGN KEY (business_id, created_by)
    REFERENCES users (business_id, id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS customer_notes (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    business_id BIGINT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    customer_id BIGINT NOT NULL,
    note TEXT NOT NULL,
    created_by BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE customer_notes
    DROP CONSTRAINT IF EXISTS customer_notes_business_customer_fkey;
ALTER TABLE customer_notes
    ADD CONSTRAINT customer_notes_business_customer_fkey
    FOREIGN KEY (business_id, customer_id)
    REFERENCES customers (business_id, id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS customer_notes_business_customer_idx
    ON customer_notes (business_id, customer_id, created_at DESC);

ALTER TABLE customer_notes
    DROP CONSTRAINT IF EXISTS customer_notes_business_created_by_fkey;
ALTER TABLE customer_notes
    ADD CONSTRAINT customer_notes_business_created_by_fkey
    FOREIGN KEY (business_id, created_by)
    REFERENCES users (business_id, id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    business_id BIGINT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    user_id BIGINT,
    action VARCHAR(80) NOT NULL,
    entity_type VARCHAR(80),
    entity_id BIGINT,
    details JSONB,
    ip_address VARCHAR(64),
    user_agent VARCHAR(500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE audit_logs
    DROP CONSTRAINT IF EXISTS audit_logs_business_user_fkey;
ALTER TABLE audit_logs
    ADD CONSTRAINT audit_logs_business_user_fkey
    FOREIGN KEY (business_id, user_id)
    REFERENCES users (business_id, id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS audit_logs_business_created_idx
    ON audit_logs (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_business_entity_idx
    ON audit_logs (business_id, entity_type, entity_id, created_at DESC);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    business_id BIGINT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL,
    token_hash VARCHAR(128) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE password_reset_tokens
    DROP CONSTRAINT IF EXISTS password_reset_tokens_business_user_fkey;
ALTER TABLE password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_business_user_fkey
    FOREIGN KEY (business_id, user_id)
    REFERENCES users (business_id, id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS password_reset_tokens_expires_idx
    ON password_reset_tokens (expires_at);

CREATE TABLE IF NOT EXISTS subscription_plans (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code VARCHAR(30) NOT NULL UNIQUE,
    name VARCHAR(80) NOT NULL,
    price_monthly NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (price_monthly >= 0),
    price_yearly NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (price_yearly >= 0),
    product_limit INTEGER,
    customer_limit INTEGER,
    user_limit INTEGER,
    features JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscriptions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    business_id BIGINT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    plan_id BIGINT NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
    status VARCHAR(20) NOT NULL DEFAULT 'trial' CHECK (status IN ('trial','active','past_due','cancelled','expired')),
    starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ends_at TIMESTAMPTZ,
    trial_ends_at TIMESTAMPTZ,
    external_reference VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_one_current_per_business_uidx
    ON subscriptions (business_id)
    WHERE status IN ('trial','active','past_due');

CREATE INDEX IF NOT EXISTS subscriptions_business_idx
    ON subscriptions (business_id, updated_at DESC);

INSERT INTO subscription_plans (code, name, price_monthly, price_yearly, product_limit, customer_limit, user_limit, features)
VALUES
    ('free', 'Free', 0, 0, 100, 250, 1,
        '{"advanced_reports":false,"multiple_users":false,"audit_logs":false,"data_export":false,"multiple_branches":false,"automatic_backups":false}'::jsonb),
    ('pro', 'Pro', 19900, 199000, NULL, NULL, 5,
        '{"advanced_reports":true,"multiple_users":true,"audit_logs":true,"data_export":true,"multiple_branches":false,"automatic_backups":true}'::jsonb),
    ('business', 'Business', 49900, 499000, NULL, NULL, NULL,
        '{"advanced_reports":true,"multiple_users":true,"audit_logs":true,"data_export":true,"multiple_branches":true,"automatic_backups":true}'::jsonb)
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    price_monthly = EXCLUDED.price_monthly,
    price_yearly = EXCLUDED.price_yearly,
    product_limit = EXCLUDED.product_limit,
    customer_limit = EXCLUDED.customer_limit,
    user_limit = EXCLUDED.user_limit,
    features = EXCLUDED.features,
    updated_at = NOW();

CREATE OR REPLACE FUNCTION dukaflow_create_default_subscription()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    free_plan_id BIGINT;
BEGIN
    SELECT id INTO free_plan_id FROM subscription_plans WHERE code = 'free' LIMIT 1;
    IF free_plan_id IS NOT NULL THEN
        INSERT INTO subscriptions (business_id, plan_id, status, starts_at, trial_ends_at)
        VALUES (NEW.id, free_plan_id, 'active', NOW(), NULL)
        ON CONFLICT DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS businesses_default_subscription_trigger ON businesses;
CREATE TRIGGER businesses_default_subscription_trigger
AFTER INSERT ON businesses
FOR EACH ROW
EXECUTE FUNCTION dukaflow_create_default_subscription();

CREATE OR REPLACE FUNCTION dukaflow_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS loyalty_accounts_updated_at_trigger ON loyalty_accounts;
CREATE TRIGGER loyalty_accounts_updated_at_trigger
BEFORE UPDATE ON loyalty_accounts
FOR EACH ROW EXECUTE FUNCTION dukaflow_touch_updated_at();

DROP TRIGGER IF EXISTS subscriptions_updated_at_trigger ON subscriptions;
CREATE TRIGGER subscriptions_updated_at_trigger
BEFORE UPDATE ON subscriptions
FOR EACH ROW EXECUTE FUNCTION dukaflow_touch_updated_at();

DROP TRIGGER IF EXISTS subscription_plans_updated_at_trigger ON subscription_plans;
CREATE TRIGGER subscription_plans_updated_at_trigger
BEFORE UPDATE ON subscription_plans
FOR EACH ROW EXECUTE FUNCTION dukaflow_touch_updated_at();

ALTER TABLE sales
    DROP CONSTRAINT IF EXISTS sales_business_created_by_fkey;
ALTER TABLE sales
    ADD CONSTRAINT sales_business_created_by_fkey
    FOREIGN KEY (business_id, created_by)
    REFERENCES users (business_id, id) ON DELETE SET NULL;

ALTER TABLE purchases
    DROP CONSTRAINT IF EXISTS purchases_business_created_by_fkey;
ALTER TABLE purchases
    ADD CONSTRAINT purchases_business_created_by_fkey
    FOREIGN KEY (business_id, created_by)
    REFERENCES users (business_id, id) ON DELETE SET NULL;

ALTER TABLE debt_payments
    DROP CONSTRAINT IF EXISTS debt_payments_business_created_by_fkey;
ALTER TABLE debt_payments
    ADD CONSTRAINT debt_payments_business_created_by_fkey
    FOREIGN KEY (business_id, created_by)
    REFERENCES users (business_id, id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS sales_business_created_by_idx ON sales (business_id, created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS purchases_business_created_by_idx ON purchases (business_id, created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS debt_payments_business_created_by_idx ON debt_payments (business_id, created_by, paid_at DESC);

-- Backfill staff attribution for legacy records.
UPDATE sales s
SET created_by = (
    SELECT u.id
    FROM users u
    WHERE u.business_id = s.business_id
    ORDER BY u.created_at
    LIMIT 1
)
WHERE s.created_by IS NULL;

UPDATE purchases p
SET created_by = (
    SELECT u.id
    FROM users u
    WHERE u.business_id = p.business_id
    ORDER BY u.created_at
    LIMIT 1
)
WHERE p.created_by IS NULL;

UPDATE debt_payments dp
SET created_by = (
    SELECT u.id
    FROM users u
    WHERE u.business_id = dp.business_id
    ORDER BY u.created_at
    LIMIT 1
)
WHERE dp.created_by IS NULL;

-- Create a Free subscription for pre-existing businesses.
INSERT INTO subscriptions (business_id, plan_id, status, starts_at)
SELECT b.id, p.id, 'active', NOW()
FROM businesses b
CROSS JOIN subscription_plans p
WHERE p.code = 'free'
  AND NOT EXISTS (
      SELECT 1 FROM subscriptions s
      WHERE s.business_id = b.id
        AND s.status IN ('trial','active','past_due')
  );

COMMIT;
