BEGIN;

ALTER TABLE whatsapp_accounts
    ADD COLUMN IF NOT EXISTS access_token_encrypted TEXT,
    ADD COLUMN IF NOT EXISTS business_name VARCHAR(160),
    ADD COLUMN IF NOT EXISTS status VARCHAR(24) NOT NULL DEFAULT 'disconnected',
    ADD COLUMN IF NOT EXISTS connected_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ;

ALTER TABLE whatsapp_accounts ALTER COLUMN ai_enabled SET DEFAULT FALSE;

UPDATE whatsapp_accounts
SET status = CASE WHEN is_enabled AND (access_token IS NOT NULL OR access_token_encrypted IS NOT NULL)
                  THEN 'connected' ELSE 'disconnected' END,
    connected_at = CASE WHEN is_enabled AND (access_token IS NOT NULL OR access_token_encrypted IS NOT NULL)
                        THEN COALESCE(connected_at, created_at) ELSE connected_at END;

ALTER TABLE whatsapp_accounts DROP CONSTRAINT IF EXISTS whatsapp_accounts_status_check;
ALTER TABLE whatsapp_accounts ADD CONSTRAINT whatsapp_accounts_status_check
    CHECK (status IN ('pending', 'connected', 'needs_attention', 'disconnected'));

CREATE INDEX IF NOT EXISTS whatsapp_accounts_phone_status_idx
    ON whatsapp_accounts(phone_number_id, status, is_enabled);
CREATE INDEX IF NOT EXISTS whatsapp_accounts_business_status_idx
    ON whatsapp_accounts(business_id, status, updated_at DESC);

COMMIT;
