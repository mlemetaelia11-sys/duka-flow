BEGIN;

CREATE TABLE IF NOT EXISTS whatsapp_accounts (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    business_id BIGINT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    branch_id BIGINT NOT NULL,
    phone_number_id VARCHAR(120) NOT NULL,
    display_phone_number VARCHAR(40),
    business_account_id VARCHAR(120),
    access_token TEXT,
    verify_token_hash VARCHAR(128),
    app_secret_hash VARCHAR(128),
    is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    ai_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    auto_create_orders BOOLEAN NOT NULL DEFAULT TRUE,
    human_takeover BOOLEAN NOT NULL DEFAULT TRUE,
    welcome_message TEXT,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    last_webhook_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (business_id, phone_number_id),
    UNIQUE (phone_number_id)
);
ALTER TABLE whatsapp_accounts DROP CONSTRAINT IF EXISTS whatsapp_accounts_business_branch_fkey;
ALTER TABLE whatsapp_accounts ADD CONSTRAINT whatsapp_accounts_business_branch_fkey
    FOREIGN KEY (business_id, branch_id) REFERENCES branches(business_id, id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS whatsapp_accounts_business_idx ON whatsapp_accounts(business_id, branch_id);

CREATE TABLE IF NOT EXISTS whatsapp_contacts (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    business_id BIGINT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    account_id BIGINT NOT NULL REFERENCES whatsapp_accounts(id) ON DELETE CASCADE,
    wa_id VARCHAR(80) NOT NULL,
    phone VARCHAR(40),
    name VARCHAR(160),
    customer_id BIGINT,
    is_blocked BOOLEAN NOT NULL DEFAULT FALSE,
    human_takeover BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(account_id, wa_id)
);
CREATE INDEX IF NOT EXISTS whatsapp_contacts_business_idx ON whatsapp_contacts(business_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS whatsapp_conversations (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    business_id BIGINT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    account_id BIGINT NOT NULL REFERENCES whatsapp_accounts(id) ON DELETE CASCADE,
    contact_id BIGINT NOT NULL REFERENCES whatsapp_contacts(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed','human')),
    ai_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(account_id, contact_id)
);
CREATE INDEX IF NOT EXISTS whatsapp_conversations_business_idx ON whatsapp_conversations(business_id, status, last_message_at DESC);

CREATE TABLE IF NOT EXISTS whatsapp_messages (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    business_id BIGINT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    conversation_id BIGINT NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
    wa_message_id VARCHAR(180),
    direction VARCHAR(10) NOT NULL CHECK(direction IN ('inbound','outbound')),
    sender_type VARCHAR(20) NOT NULL CHECK(sender_type IN ('customer','ai','human','system')),
    message_type VARCHAR(30) NOT NULL DEFAULT 'text',
    body TEXT,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(20) NOT NULL DEFAULT 'received',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(wa_message_id)
);
CREATE INDEX IF NOT EXISTS whatsapp_messages_conversation_idx ON whatsapp_messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS whatsapp_orders (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    business_id BIGINT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    conversation_id BIGINT NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
    sale_id BIGINT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','cancelled')),
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    total_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    customer_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS whatsapp_orders_business_idx ON whatsapp_orders(business_id, created_at DESC);

ALTER TABLE whatsapp_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_accounts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dukaflow_branch_isolation ON whatsapp_accounts;
CREATE POLICY dukaflow_branch_isolation ON whatsapp_accounts
USING (business_id=dukaflow_current_business_id() AND branch_id=dukaflow_current_branch_id())
WITH CHECK (business_id=dukaflow_current_business_id() AND branch_id=dukaflow_current_branch_id());

ALTER TABLE whatsapp_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_contacts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dukaflow_branch_isolation ON whatsapp_contacts;
CREATE POLICY dukaflow_branch_isolation ON whatsapp_contacts
USING (business_id=dukaflow_current_business_id())
WITH CHECK (business_id=dukaflow_current_business_id());

ALTER TABLE whatsapp_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_conversations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dukaflow_branch_isolation ON whatsapp_conversations;
CREATE POLICY dukaflow_branch_isolation ON whatsapp_conversations
USING (business_id=dukaflow_current_business_id())
WITH CHECK (business_id=dukaflow_current_business_id());

ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dukaflow_branch_isolation ON whatsapp_messages;
CREATE POLICY dukaflow_branch_isolation ON whatsapp_messages
USING (business_id=dukaflow_current_business_id())
WITH CHECK (business_id=dukaflow_current_business_id());

ALTER TABLE whatsapp_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_orders FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dukaflow_branch_isolation ON whatsapp_orders;
CREATE POLICY dukaflow_branch_isolation ON whatsapp_orders
USING (business_id=dukaflow_current_business_id())
WITH CHECK (business_id=dukaflow_current_business_id());

COMMIT;
