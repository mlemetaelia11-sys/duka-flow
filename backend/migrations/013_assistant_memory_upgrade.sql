BEGIN;

ALTER TABLE ai_conversations ADD COLUMN IF NOT EXISTS branch_id BIGINT;
ALTER TABLE ai_conversations ADD COLUMN IF NOT EXISTS summary TEXT;
ALTER TABLE ai_conversations ALTER COLUMN branch_id DROP NOT NULL;

ALTER TABLE ai_messages ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE ai_conversations c
SET branch_id = b.id
FROM branches b
WHERE c.business_id = b.business_id AND c.branch_id IS NULL AND b.code = 'MAIN';

UPDATE ai_messages m
SET metadata = COALESCE(metadata, '{}'::jsonb)
WHERE metadata IS NULL;

ALTER TABLE ai_conversations ALTER COLUMN branch_id SET DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_conversations_business_user_updated
    ON ai_conversations (business_id, user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_messages_business_conversation_created
    ON ai_messages (business_id, conversation_id, created_at DESC);

ALTER TABLE ai_conversations
    DROP CONSTRAINT IF EXISTS ai_conversations_business_id_user_id_fkey;

ALTER TABLE ai_conversations
    ADD CONSTRAINT ai_conversations_business_id_user_id_fkey
    FOREIGN KEY (business_id, user_id) REFERENCES users(business_id, id) ON DELETE CASCADE;

ALTER TABLE ai_messages
    DROP CONSTRAINT IF EXISTS ai_messages_conversation_id_fkey;

ALTER TABLE ai_messages
    ADD CONSTRAINT ai_messages_conversation_id_fkey
    FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id) ON DELETE CASCADE;

COMMIT;
