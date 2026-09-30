-- Product media support
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_key TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT;
CREATE INDEX IF NOT EXISTS products_business_image_idx ON products(business_id) WHERE image_key IS NOT NULL;
