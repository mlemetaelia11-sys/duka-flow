BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS stock_movements_movement_type_check;
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_movement_type_check CHECK (movement_type IN ('purchase','sale','sale_return','purchase_return','adjustment','damaged','opening','transfer'));

/* Purchase returns / supplier credit adjustments */
CREATE SEQUENCE IF NOT EXISTS purchase_return_seq START 1 INCREMENT 1;

CREATE TABLE IF NOT EXISTS purchase_returns (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    business_id BIGINT NOT NULL REFERENCES businesses(id) ON DELETE RESTRICT,
    purchase_id BIGINT NOT NULL,
    supplier_id BIGINT,
    return_number VARCHAR(50) NOT NULL,
    total_amount NUMERIC(12,2) NOT NULL CHECK (total_amount >= 0),
    reason VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','cancelled')),
    created_by BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (business_id, return_number)
);

CREATE UNIQUE INDEX IF NOT EXISTS purchase_returns_business_id_id_key
    ON purchase_returns (business_id, id);

ALTER TABLE purchase_returns
    DROP CONSTRAINT IF EXISTS purchase_returns_business_purchase_fkey;
ALTER TABLE purchase_returns
    ADD CONSTRAINT purchase_returns_business_purchase_fkey
    FOREIGN KEY (business_id, purchase_id)
    REFERENCES purchases (business_id, id) ON DELETE RESTRICT;

ALTER TABLE purchase_returns
    DROP CONSTRAINT IF EXISTS purchase_returns_business_supplier_fkey;
ALTER TABLE purchase_returns
    ADD CONSTRAINT purchase_returns_business_supplier_fkey
    FOREIGN KEY (business_id, supplier_id)
    REFERENCES suppliers (business_id, id) ON DELETE SET NULL;

ALTER TABLE purchase_returns
    DROP CONSTRAINT IF EXISTS purchase_returns_business_created_by_fkey;
ALTER TABLE purchase_returns
    ADD CONSTRAINT purchase_returns_business_created_by_fkey
    FOREIGN KEY (business_id, created_by)
    REFERENCES users (business_id, id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS purchase_returns_business_created_idx
    ON purchase_returns (business_id, created_at DESC);

CREATE TABLE IF NOT EXISTS purchase_return_items (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    business_id BIGINT NOT NULL REFERENCES businesses(id) ON DELETE RESTRICT,
    return_id BIGINT NOT NULL,
    purchase_item_id BIGINT NOT NULL,
    product_id INTEGER NOT NULL,
    product_name VARCHAR(150) NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_cost NUMERIC(12,2) NOT NULL CHECK (unit_cost >= 0),
    line_total NUMERIC(12,2) NOT NULL CHECK (line_total >= 0)
);

ALTER TABLE purchase_return_items
    DROP CONSTRAINT IF EXISTS purchase_return_items_business_return_fkey;
ALTER TABLE purchase_return_items
    ADD CONSTRAINT purchase_return_items_business_return_fkey
    FOREIGN KEY (business_id, return_id)
    REFERENCES purchase_returns (business_id, id) ON DELETE CASCADE;

ALTER TABLE purchase_return_items
    DROP CONSTRAINT IF EXISTS purchase_return_items_business_product_fkey;
ALTER TABLE purchase_return_items
    ADD CONSTRAINT purchase_return_items_business_product_fkey
    FOREIGN KEY (business_id, product_id)
    REFERENCES products (business_id, id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS purchase_return_items_business_return_idx
    ON purchase_return_items (business_id, return_id);

/* Reversible high-risk action approvals */
CREATE TABLE IF NOT EXISTS approval_requests (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    business_id BIGINT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    requested_by BIGINT NOT NULL,
    reviewed_by BIGINT,
    action_type VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id BIGINT,
    amount NUMERIC(12,2),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
    notes VARCHAR(500),
    review_notes VARCHAR(500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ
);

ALTER TABLE approval_requests
    DROP CONSTRAINT IF EXISTS approval_requests_business_requested_by_fkey;
ALTER TABLE approval_requests
    ADD CONSTRAINT approval_requests_business_requested_by_fkey
    FOREIGN KEY (business_id, requested_by)
    REFERENCES users (business_id, id) ON DELETE RESTRICT;

ALTER TABLE approval_requests
    DROP CONSTRAINT IF EXISTS approval_requests_business_reviewed_by_fkey;
ALTER TABLE approval_requests
    ADD CONSTRAINT approval_requests_business_reviewed_by_fkey
    FOREIGN KEY (business_id, reviewed_by)
    REFERENCES users (business_id, id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS approval_requests_business_status_idx
    ON approval_requests (business_id, status, created_at DESC);

/* Per-user dashboard layout preferences */
CREATE TABLE IF NOT EXISTS dashboard_widget_preferences (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    business_id BIGINT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL,
    widget_key VARCHAR(60) NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    is_visible BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (business_id, user_id, widget_key)
);

ALTER TABLE dashboard_widget_preferences
    DROP CONSTRAINT IF EXISTS dashboard_widget_preferences_business_user_fkey;
ALTER TABLE dashboard_widget_preferences
    ADD CONSTRAINT dashboard_widget_preferences_business_user_fkey
    FOREIGN KEY (business_id, user_id)
    REFERENCES users (business_id, id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS dashboard_widget_preferences_business_user_idx
    ON dashboard_widget_preferences (business_id, user_id, position);

/* Safe retry/idempotency foundation for future offline or flaky-network retries */
CREATE TABLE IF NOT EXISTS api_idempotency_keys (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    business_id BIGINT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    user_id BIGINT,
    idempotency_key VARCHAR(120) NOT NULL,
    route VARCHAR(120) NOT NULL,
    status_code INTEGER,
    response_body JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
    UNIQUE (business_id, idempotency_key, route)
);

ALTER TABLE api_idempotency_keys
    DROP CONSTRAINT IF EXISTS api_idempotency_keys_business_user_fkey;
ALTER TABLE api_idempotency_keys
    ADD CONSTRAINT api_idempotency_keys_business_user_fkey
    FOREIGN KEY (business_id, user_id)
    REFERENCES users (business_id, id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS api_idempotency_keys_expires_idx
    ON api_idempotency_keys (expires_at);

CREATE OR REPLACE FUNCTION dukaflow_cleanup_idempotency_keys()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    DELETE FROM api_idempotency_keys WHERE expires_at < NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS api_idempotency_cleanup_trigger ON api_idempotency_keys;
CREATE TRIGGER api_idempotency_cleanup_trigger
AFTER INSERT ON api_idempotency_keys
FOR EACH STATEMENT
EXECUTE FUNCTION dukaflow_cleanup_idempotency_keys();

CREATE OR REPLACE FUNCTION dukaflow_touch_dashboard_widget_preferences()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS dashboard_widget_preferences_updated_at_trigger ON dashboard_widget_preferences;
CREATE TRIGGER dashboard_widget_preferences_updated_at_trigger
BEFORE UPDATE ON dashboard_widget_preferences
FOR EACH ROW EXECUTE FUNCTION dukaflow_touch_dashboard_widget_preferences();

COMMIT;
