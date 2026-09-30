BEGIN;

CREATE TABLE IF NOT EXISTS integration_settings (
    provider VARCHAR(40) NOT NULL,
    setting_key VARCHAR(80) NOT NULL,
    setting_value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (provider, setting_key)
);

CREATE TABLE IF NOT EXISTS payment_transactions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    business_id BIGINT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    provider VARCHAR(40) NOT NULL,
    merchant_reference VARCHAR(80) NOT NULL UNIQUE,
    provider_tracking_id VARCHAR(120),
    amount NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
    currency VARCHAR(10) NOT NULL DEFAULT 'TZS',
    status VARCHAR(30) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','failed','cancelled','reversed')),
    provider_status VARCHAR(80),
    confirmation_code VARCHAR(160),
    payment_method VARCHAR(80),
    plan_code VARCHAR(30),
    billing_cycle VARCHAR(20),
    redirect_url TEXT,
    provider_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS payment_transactions_business_idx ON payment_transactions (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payment_transactions_tracking_idx ON payment_transactions (provider_tracking_id);

CREATE TABLE IF NOT EXISTS ai_conversations (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    business_id BIGINT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL,
    title VARCHAR(160),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY (business_id, user_id) REFERENCES users(business_id, id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS ai_messages (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    business_id BIGINT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    conversation_id BIGINT NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
    user_id BIGINT,
    role VARCHAR(20) NOT NULL CHECK (role IN ('system','user','assistant','tool')),
    content TEXT,
    tool_name VARCHAR(120),
    tool_payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ai_messages_conversation_idx ON ai_messages (conversation_id, created_at);

CREATE TABLE IF NOT EXISTS ai_memories (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    business_id BIGINT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    user_id BIGINT,
    memory_type VARCHAR(40) NOT NULL DEFAULT 'preference',
    content TEXT NOT NULL,
    importance NUMERIC(4,3) NOT NULL DEFAULT 0.5 CHECK (importance >= 0 AND importance <= 1),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ai_memories_business_idx ON ai_memories (business_id, updated_at DESC);

ALTER TABLE users ADD COLUMN IF NOT EXISTS fcm_token TEXT;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS logo_url TEXT;

COMMIT;
