CREATE TABLE IF NOT EXISTS idempotency_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

    key VARCHAR(255) NOT NULL,

    order_id UUID NOT NULL
        REFERENCES orders(id)
        ON DELETE CASCADE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_idempotency_user_key
        UNIQUE (user_id, key)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_order_id
    ON idempotency_keys(order_id);