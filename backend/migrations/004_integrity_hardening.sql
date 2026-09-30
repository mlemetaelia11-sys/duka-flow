BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

/* PostgreSQL 14 cannot SET NULL only selected columns of a composite FK.
   business_id is NOT NULL, so composite SET NULL constraints could fail at
   delete time by trying to null the tenant column. Operational history is
   safer when its actor/customer/supplier relationship is restricted. */

ALTER TABLE sales
    DROP CONSTRAINT IF EXISTS sales_business_customer_fkey;
ALTER TABLE sales
    ADD CONSTRAINT sales_business_customer_fkey
    FOREIGN KEY (business_id, customer_id)
    REFERENCES customers (business_id, id) ON DELETE RESTRICT;

ALTER TABLE purchases
    DROP CONSTRAINT IF EXISTS purchases_business_supplier_fkey;
ALTER TABLE purchases
    ADD CONSTRAINT purchases_business_supplier_fkey
    FOREIGN KEY (business_id, supplier_id)
    REFERENCES suppliers (business_id, id) ON DELETE RESTRICT;

ALTER TABLE sale_returns
    DROP CONSTRAINT IF EXISTS sale_returns_business_customer_fkey;
ALTER TABLE sale_returns
    ADD CONSTRAINT sale_returns_business_customer_fkey
    FOREIGN KEY (business_id, customer_id)
    REFERENCES customers (business_id, id) ON DELETE RESTRICT;

ALTER TABLE purchase_returns
    DROP CONSTRAINT IF EXISTS purchase_returns_business_supplier_fkey;
ALTER TABLE purchase_returns
    ADD CONSTRAINT purchase_returns_business_supplier_fkey
    FOREIGN KEY (business_id, supplier_id)
    REFERENCES suppliers (business_id, id) ON DELETE RESTRICT;

ALTER TABLE stock_movements
    DROP CONSTRAINT IF EXISTS stock_movements_business_created_by_fkey;
ALTER TABLE stock_movements
    ADD CONSTRAINT stock_movements_business_created_by_fkey
    FOREIGN KEY (business_id, created_by)
    REFERENCES users (business_id, id) ON DELETE RESTRICT;

ALTER TABLE sale_returns
    DROP CONSTRAINT IF EXISTS sale_returns_business_created_by_fkey;
ALTER TABLE sale_returns
    ADD CONSTRAINT sale_returns_business_created_by_fkey
    FOREIGN KEY (business_id, created_by)
    REFERENCES users (business_id, id) ON DELETE RESTRICT;

ALTER TABLE cash_movements
    DROP CONSTRAINT IF EXISTS cash_movements_business_created_by_fkey;
ALTER TABLE cash_movements
    ADD CONSTRAINT cash_movements_business_created_by_fkey
    FOREIGN KEY (business_id, created_by)
    REFERENCES users (business_id, id) ON DELETE RESTRICT;

ALTER TABLE supplier_payments
    DROP CONSTRAINT IF EXISTS supplier_payments_business_created_by_fkey;
ALTER TABLE supplier_payments
    ADD CONSTRAINT supplier_payments_business_created_by_fkey
    FOREIGN KEY (business_id, created_by)
    REFERENCES users (business_id, id) ON DELETE RESTRICT;

ALTER TABLE loyalty_transactions
    DROP CONSTRAINT IF EXISTS loyalty_transactions_business_sale_fkey;
ALTER TABLE loyalty_transactions
    ADD CONSTRAINT loyalty_transactions_business_sale_fkey
    FOREIGN KEY (business_id, sale_id)
    REFERENCES sales (business_id, id) ON DELETE RESTRICT;

ALTER TABLE loyalty_transactions
    DROP CONSTRAINT IF EXISTS loyalty_transactions_business_created_by_fkey;
ALTER TABLE loyalty_transactions
    ADD CONSTRAINT loyalty_transactions_business_created_by_fkey
    FOREIGN KEY (business_id, created_by)
    REFERENCES users (business_id, id) ON DELETE RESTRICT;

ALTER TABLE customer_notes
    DROP CONSTRAINT IF EXISTS customer_notes_business_created_by_fkey;
ALTER TABLE customer_notes
    ADD CONSTRAINT customer_notes_business_created_by_fkey
    FOREIGN KEY (business_id, created_by)
    REFERENCES users (business_id, id) ON DELETE RESTRICT;

ALTER TABLE audit_logs
    DROP CONSTRAINT IF EXISTS audit_logs_business_user_fkey;
ALTER TABLE audit_logs
    ADD CONSTRAINT audit_logs_business_user_fkey
    FOREIGN KEY (business_id, user_id)
    REFERENCES users (business_id, id) ON DELETE RESTRICT;

ALTER TABLE sales
    DROP CONSTRAINT IF EXISTS sales_business_created_by_fkey;
ALTER TABLE sales
    ADD CONSTRAINT sales_business_created_by_fkey
    FOREIGN KEY (business_id, created_by)
    REFERENCES users (business_id, id) ON DELETE RESTRICT;

ALTER TABLE purchases
    DROP CONSTRAINT IF EXISTS purchases_business_created_by_fkey;
ALTER TABLE purchases
    ADD CONSTRAINT purchases_business_created_by_fkey
    FOREIGN KEY (business_id, created_by)
    REFERENCES users (business_id, id) ON DELETE RESTRICT;

ALTER TABLE debt_payments
    DROP CONSTRAINT IF EXISTS debt_payments_business_created_by_fkey;
ALTER TABLE debt_payments
    ADD CONSTRAINT debt_payments_business_created_by_fkey
    FOREIGN KEY (business_id, created_by)
    REFERENCES users (business_id, id) ON DELETE RESTRICT;

ALTER TABLE purchase_returns
    DROP CONSTRAINT IF EXISTS purchase_returns_business_created_by_fkey;
ALTER TABLE purchase_returns
    ADD CONSTRAINT purchase_returns_business_created_by_fkey
    FOREIGN KEY (business_id, created_by)
    REFERENCES users (business_id, id) ON DELETE RESTRICT;

ALTER TABLE approval_requests
    DROP CONSTRAINT IF EXISTS approval_requests_business_reviewed_by_fkey;
ALTER TABLE approval_requests
    ADD CONSTRAINT approval_requests_business_reviewed_by_fkey
    FOREIGN KEY (business_id, reviewed_by)
    REFERENCES users (business_id, id) ON DELETE RESTRICT;

ALTER TABLE api_idempotency_keys
    DROP CONSTRAINT IF EXISTS api_idempotency_keys_business_user_fkey;
ALTER TABLE api_idempotency_keys
    ADD CONSTRAINT api_idempotency_keys_business_user_fkey
    FOREIGN KEY (business_id, user_id)
    REFERENCES users (business_id, id) ON DELETE RESTRICT;

COMMIT;
