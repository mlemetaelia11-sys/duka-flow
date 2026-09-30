BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TEMP TABLE business_tenancy_row_counts ON COMMIT DROP AS
SELECT
    (SELECT COUNT(*) FROM users) AS users_count,
    (SELECT COUNT(*) FROM products) AS products_count,
    (SELECT COUNT(*) FROM sales) AS sales_count,
    (SELECT COUNT(*) FROM sale_items) AS sale_items_count,
    (SELECT COUNT(*) FROM customers) AS customers_count,
    (SELECT COUNT(*) FROM debts) AS debts_count,
    (SELECT COUNT(*) FROM debt_payments) AS debt_payments_count,
    (SELECT COUNT(*) FROM suppliers) AS suppliers_count,
    (SELECT COUNT(*) FROM purchases) AS purchases_count,
    (SELECT COUNT(*) FROM purchase_items) AS purchase_items_count;

SELECT pg_advisory_xact_lock(73519023);

CREATE TABLE IF NOT EXISTS businesses (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    slug VARCHAR(180) NOT NULL UNIQUE,
    phone VARCHAR(30),
    email VARCHAR(255),
    address VARCHAR(255),
    city VARCHAR(100),
    country VARCHAR(100) NOT NULL DEFAULT 'Tanzania',
    currency VARCHAR(10) NOT NULL DEFAULT 'TZS',
    timezone VARCHAR(80) NOT NULL DEFAULT 'Africa/Dar_es_Salaam',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS businesses_is_active_idx
    ON businesses (is_active);

INSERT INTO businesses (name, slug)
VALUES ('DukaFlow', 'dukaflow-legacy')
ON CONFLICT (slug) DO NOTHING;

ALTER TABLE users ADD COLUMN IF NOT EXISTS business_id BIGINT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS business_id BIGINT;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS business_id BIGINT;
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS business_id BIGINT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS business_id BIGINT;
ALTER TABLE debts ADD COLUMN IF NOT EXISTS business_id BIGINT;
ALTER TABLE debt_payments ADD COLUMN IF NOT EXISTS business_id BIGINT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS business_id BIGINT;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS business_id BIGINT;
ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS business_id BIGINT;

UPDATE users
SET business_id = (SELECT id FROM businesses WHERE slug = 'dukaflow-legacy')
WHERE business_id IS NULL;

UPDATE products
SET business_id = (SELECT id FROM businesses WHERE slug = 'dukaflow-legacy')
WHERE business_id IS NULL;

UPDATE sales
SET business_id = (SELECT id FROM businesses WHERE slug = 'dukaflow-legacy')
WHERE business_id IS NULL;

UPDATE customers
SET business_id = (SELECT id FROM businesses WHERE slug = 'dukaflow-legacy')
WHERE business_id IS NULL;

UPDATE suppliers
SET business_id = (SELECT id FROM businesses WHERE slug = 'dukaflow-legacy')
WHERE business_id IS NULL;

UPDATE purchases
SET business_id = (SELECT id FROM businesses WHERE slug = 'dukaflow-legacy')
WHERE business_id IS NULL;

UPDATE sale_items child
SET business_id = parent.business_id
FROM sales parent
WHERE child.sale_id = parent.id
  AND child.business_id IS NULL;

UPDATE debts child
SET business_id = parent.business_id
FROM sales parent
WHERE child.sale_id = parent.id
  AND child.business_id IS NULL;

UPDATE debt_payments child
SET business_id = parent.business_id
FROM debts parent
WHERE child.debt_id = parent.id
  AND child.business_id IS NULL;

UPDATE purchase_items child
SET business_id = parent.business_id
FROM purchases parent
WHERE child.purchase_id = parent.id
  AND child.business_id IS NULL;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM sale_items WHERE business_id IS NULL)
       OR EXISTS (SELECT 1 FROM debts WHERE business_id IS NULL)
       OR EXISTS (SELECT 1 FROM debt_payments WHERE business_id IS NULL)
       OR EXISTS (SELECT 1 FROM purchase_items WHERE business_id IS NULL) THEN
        RAISE EXCEPTION 'Tenant backfill found an orphaned child row; migration aborted.';
    END IF;
END $$;

ALTER TABLE users ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE products ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE sales ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE sale_items ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE customers ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE debts ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE debt_payments ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE suppliers ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE purchases ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE purchase_items ALTER COLUMN business_id SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_business_id_fkey') THEN
        ALTER TABLE users ADD CONSTRAINT users_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE RESTRICT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_business_id_fkey') THEN
        ALTER TABLE products ADD CONSTRAINT products_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE RESTRICT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_business_id_fkey') THEN
        ALTER TABLE sales ADD CONSTRAINT sales_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE RESTRICT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sale_items_business_id_fkey') THEN
        ALTER TABLE sale_items ADD CONSTRAINT sale_items_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE RESTRICT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customers_business_id_fkey') THEN
        ALTER TABLE customers ADD CONSTRAINT customers_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE RESTRICT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'debts_business_id_fkey') THEN
        ALTER TABLE debts ADD CONSTRAINT debts_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE RESTRICT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'debt_payments_business_id_fkey') THEN
        ALTER TABLE debt_payments ADD CONSTRAINT debt_payments_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE RESTRICT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'suppliers_business_id_fkey') THEN
        ALTER TABLE suppliers ADD CONSTRAINT suppliers_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE RESTRICT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchases_business_id_fkey') THEN
        ALTER TABLE purchases ADD CONSTRAINT purchases_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE RESTRICT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_items_business_id_fkey') THEN
        ALTER TABLE purchase_items ADD CONSTRAINT purchase_items_business_id_fkey FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE RESTRICT;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_business_id_id_key') THEN
        ALTER TABLE products ADD CONSTRAINT products_business_id_id_key UNIQUE (business_id, id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customers_business_id_id_key') THEN
        ALTER TABLE customers ADD CONSTRAINT customers_business_id_id_key UNIQUE (business_id, id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_business_id_id_key') THEN
        ALTER TABLE sales ADD CONSTRAINT sales_business_id_id_key UNIQUE (business_id, id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'debts_business_id_id_key') THEN
        ALTER TABLE debts ADD CONSTRAINT debts_business_id_id_key UNIQUE (business_id, id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchases_business_id_id_key') THEN
        ALTER TABLE purchases ADD CONSTRAINT purchases_business_id_id_key UNIQUE (business_id, id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'suppliers_business_id_id_key') THEN
        ALTER TABLE suppliers ADD CONSTRAINT suppliers_business_id_id_key UNIQUE (business_id, id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sale_items_business_sale_fkey') THEN
        ALTER TABLE sale_items ADD CONSTRAINT sale_items_business_sale_fkey
            FOREIGN KEY (business_id, sale_id)
            REFERENCES sales (business_id, id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sale_items_business_product_fkey') THEN
        ALTER TABLE sale_items ADD CONSTRAINT sale_items_business_product_fkey
            FOREIGN KEY (business_id, product_id)
            REFERENCES products (business_id, id) ON DELETE RESTRICT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_business_customer_fkey') THEN
        ALTER TABLE sales ADD CONSTRAINT sales_business_customer_fkey
            FOREIGN KEY (business_id, customer_id)
            REFERENCES customers (business_id, id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'debts_business_sale_fkey') THEN
        ALTER TABLE debts ADD CONSTRAINT debts_business_sale_fkey
            FOREIGN KEY (business_id, sale_id)
            REFERENCES sales (business_id, id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'debts_business_customer_fkey') THEN
        ALTER TABLE debts ADD CONSTRAINT debts_business_customer_fkey
            FOREIGN KEY (business_id, customer_id)
            REFERENCES customers (business_id, id) ON DELETE RESTRICT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'debt_payments_business_debt_fkey') THEN
        ALTER TABLE debt_payments ADD CONSTRAINT debt_payments_business_debt_fkey
            FOREIGN KEY (business_id, debt_id)
            REFERENCES debts (business_id, id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchases_business_supplier_fkey') THEN
        ALTER TABLE purchases ADD CONSTRAINT purchases_business_supplier_fkey
            FOREIGN KEY (business_id, supplier_id)
            REFERENCES suppliers (business_id, id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_items_business_purchase_fkey') THEN
        ALTER TABLE purchase_items ADD CONSTRAINT purchase_items_business_purchase_fkey
            FOREIGN KEY (business_id, purchase_id)
            REFERENCES purchases (business_id, id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_items_business_product_fkey') THEN
        ALTER TABLE purchase_items ADD CONSTRAINT purchase_items_business_product_fkey
            FOREIGN KEY (business_id, product_id)
            REFERENCES products (business_id, id) ON DELETE RESTRICT;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS users_business_id_idx ON users (business_id);
CREATE INDEX IF NOT EXISTS products_business_id_idx ON products (business_id);
CREATE INDEX IF NOT EXISTS customers_business_id_idx ON customers (business_id);
CREATE INDEX IF NOT EXISTS suppliers_business_id_idx ON suppliers (business_id);
CREATE INDEX IF NOT EXISTS sales_business_created_at_idx ON sales (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sale_items_business_id_idx ON sale_items (business_id);
CREATE INDEX IF NOT EXISTS debts_business_status_idx ON debts (business_id, status);
CREATE INDEX IF NOT EXISTS debt_payments_business_paid_at_idx ON debt_payments (business_id, paid_at DESC);
CREATE INDEX IF NOT EXISTS purchases_business_created_at_idx ON purchases (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS purchase_items_business_id_idx ON purchase_items (business_id);

DO $$
BEGIN
    IF (SELECT COUNT(*) FROM users) <> (SELECT users_count FROM business_tenancy_row_counts)
       OR (SELECT COUNT(*) FROM products) <> (SELECT products_count FROM business_tenancy_row_counts)
       OR (SELECT COUNT(*) FROM sales) <> (SELECT sales_count FROM business_tenancy_row_counts)
       OR (SELECT COUNT(*) FROM sale_items) <> (SELECT sale_items_count FROM business_tenancy_row_counts)
       OR (SELECT COUNT(*) FROM customers) <> (SELECT customers_count FROM business_tenancy_row_counts)
       OR (SELECT COUNT(*) FROM debts) <> (SELECT debts_count FROM business_tenancy_row_counts)
       OR (SELECT COUNT(*) FROM debt_payments) <> (SELECT debt_payments_count FROM business_tenancy_row_counts)
       OR (SELECT COUNT(*) FROM suppliers) <> (SELECT suppliers_count FROM business_tenancy_row_counts)
       OR (SELECT COUNT(*) FROM purchases) <> (SELECT purchases_count FROM business_tenancy_row_counts)
       OR (SELECT COUNT(*) FROM purchase_items) <> (SELECT purchase_items_count FROM business_tenancy_row_counts) THEN
        RAISE EXCEPTION 'Row counts changed during tenant migration; transaction aborted.';
    END IF;
END $$;

COMMIT;
