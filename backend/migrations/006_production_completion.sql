BEGIN;

CREATE TABLE IF NOT EXISTS branches (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    business_id BIGINT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    code VARCHAR(40) NOT NULL,
    phone VARCHAR(30),
    address VARCHAR(255),
    city VARCHAR(100),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (business_id, code),
    UNIQUE (business_id, id)
);
CREATE INDEX IF NOT EXISTS branches_business_idx ON branches(business_id, is_active, name);

INSERT INTO branches (business_id, name, code)
SELECT id, name || ' - Main Branch', 'MAIN'
FROM businesses b
WHERE NOT EXISTS (SELECT 1 FROM branches br WHERE br.business_id=b.id);

ALTER TABLE users ADD COLUMN IF NOT EXISTS default_branch_id BIGINT;
ALTER TABLE users ADD CONSTRAINT users_default_branch_fkey
    FOREIGN KEY (default_branch_id) REFERENCES branches(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS offline_mutations (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    business_id BIGINT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL,
    idempotency_key VARCHAR(120) NOT NULL,
    method VARCHAR(10) NOT NULL,
    path TEXT NOT NULL,
    request_body JSONB NOT NULL DEFAULT '{}'::jsonb,
    response_status INTEGER,
    response_body JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    UNIQUE (business_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS offline_mutations_user_idx ON offline_mutations(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS backup_runs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    status VARCHAR(20) NOT NULL CHECK (status IN ('started','completed','failed')),
    backup_type VARCHAR(30) NOT NULL DEFAULT 'logical',
    target VARCHAR(255),
    file_path TEXT,
    size_bytes BIGINT,
    checksum_sha256 VARCHAR(64),
    error_message TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS system_health_checks (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    component VARCHAR(80) NOT NULL,
    status VARCHAR(20) NOT NULL,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS system_health_component_idx ON system_health_checks(component, checked_at DESC);

CREATE INDEX IF NOT EXISTS ai_memories_business_type_idx ON ai_memories(business_id, memory_type, updated_at DESC);

COMMIT;
