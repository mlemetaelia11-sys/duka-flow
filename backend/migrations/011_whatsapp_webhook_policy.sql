BEGIN;
DROP POLICY IF EXISTS whatsapp_accounts_webhook_select ON whatsapp_accounts;
CREATE POLICY whatsapp_accounts_webhook_select ON whatsapp_accounts
FOR SELECT
USING (
    current_setting('app.whatsapp_phone_number_id', true) <> ''
    AND phone_number_id = current_setting('app.whatsapp_phone_number_id', true)
);
COMMIT;
