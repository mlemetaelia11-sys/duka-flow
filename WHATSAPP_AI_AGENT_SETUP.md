# DukaFlow WhatsApp AI Sales Agent

## What was added

- WhatsApp Cloud API webhook verification and signed webhook validation.
- Per-business WhatsApp account configuration.
- AI Sales Agent using the existing DukaFlow Groq service.
- Product/stock search, customer lookup, order creation and order status tools.
- Confirmed WhatsApp orders become DukaFlow sales and reduce stock inside a database transaction.
- Customer/WhatsApp conversation history and human takeover.
- Live inbox, AI ON/OFF, connection settings and analytics UI.
- Graph API retry handling for transient 429/5xx failures.
- Business/branch isolation for WhatsApp data.
- Copilot UI refresh and global sidebar/hamburger behavior.

## Required `.env`

```env
# Existing DukaFlow AI key (already used by Copilot)
GROQ_API_KEY=your_groq_api_key

# Meta WhatsApp Cloud API
WHATSAPP_APP_SECRET=your_meta_app_secret
WHATSAPP_VERIFY_TOKEN=create_a_long_random_verify_token
WHATSAPP_GRAPH_VERSION=v23.0
```

`WHATSAPP_GRAPH_VERSION` is optional; the backend defaults to `v23.0`.

## Values entered in DukaFlow

Open **WhatsApp AI Agent** as an owner/manager and enter:

- **Phone Number ID** — from Meta WhatsApp Manager.
- **Display phone number** — the business WhatsApp number.
- **Permanent access token** — a Meta WhatsApp Cloud API access token.
- Enable the connection.
- Enable AI Sales Agent.
- Enable auto-create orders if you want confirmed customer orders to become sales automatically.

The access token is stored per business, so multiple DukaFlow businesses can use different WhatsApp numbers/tokens without sharing credentials.

## Meta webhook

Set the callback URL to:

`https://YOUR-DUKAFLOW-DOMAIN/api/whatsapp/webhook`

Set the Verify Token to the exact value of:

`WHATSAPP_VERIFY_TOKEN`

Subscribe the WhatsApp webhook to the `messages` field.

The backend validates `X-Hub-Signature-256` when `WHATSAPP_APP_SECRET` is configured.

## Order behavior

The agent does not invent product names, prices or stock. It searches DukaFlow first.

A sale is created only after the model determines that the customer has clearly confirmed the order. The sale transaction:

1. locks and checks products,
2. calculates the total from DukaFlow prices,
3. creates the sale,
4. creates sale items,

# DukaFlow WhatsApp AI Sales Agent

DukaFlow connects each merchant's WhatsApp Business Platform account through Meta Embedded Signup. Merchants do not paste access tokens into the DukaFlow UI. The existing inbox, order tools, tenant-scoped data, signed webhook processing and human takeover continue to use the same WhatsApp agent.

## Meta Developer Setup

1. Create a Meta business app at [developers.facebook.com](https://developers.facebook.com/) and add the **WhatsApp** product.
2. In **App settings → Basic**, copy the App ID and App Secret into `META_APP_ID` and `META_APP_SECRET` in `backend/.env`.
3. In the WhatsApp product's **Configuration / Embedded Signup** settings, create an Embedded Signup configuration. Enable WhatsApp Business Account and phone-number selection, and copy its configuration ID into `META_CONFIG_ID`.
4. Grant the configuration the `whatsapp_business_management` and `whatsapp_business_messaging` permissions. For production, complete Meta business verification and the required app review/advanced access for the permissions used by your app. Development-mode signup is limited to app/test business users.
5. In **App settings → Basic**, add the DukaFlow public domain to App Domains. In the Facebook Login / client OAuth settings, enable the JavaScript SDK and allow the same HTTPS domain. Embedded Signup must be tested on the configured public domain; `localhost` is not a production callback origin.
6. Generate a high-entropy webhook verify token and a 32-byte encryption key. Keep both secret and back them up securely:

   ```powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

   Use one generated value for `META_WEBHOOK_VERIFY_TOKEN`; generate a separate value for `WHATSAPP_TOKEN_ENCRYPTION_KEY`. The encryption key must be exactly 64 hexadecimal characters and must remain stable because stored credentials cannot be decrypted after it changes.

7. Set `META_GRAPH_API_VERSION` to a Graph API version supported by the app. The example file defaults to `v23.0`; use a currently supported version for a new Meta app.
8. Configure the WhatsApp webhook callback as `https://YOUR-DUKAFLOW-DOMAIN/api/whatsapp/webhook`, enter the exact `META_WEBHOOK_VERIFY_TOKEN`, and subscribe the WhatsApp product to the `messages` field.
9. Add the same app secret in the DukaFlow server environment. The endpoint validates `X-Hub-Signature-256` for every webhook request and rejects webhook processing while no app secret is configured.

All variables and descriptions are listed in `backend/.env.example`. Restart the backend after setting them. Never commit `.env`, the App Secret, webhook verify token or encryption key.

## Database Upgrade

Run the existing migration command after deploying the code:

```powershell
cd backend
npm run migrate
```

Migration `012_whatsapp_embedded_signup.sql` extends the existing `whatsapp_accounts` table with encrypted token storage, business display name, connection status and verification timestamps. It does not create a competing WhatsApp account table. Existing plaintext tokens are upgraded to authenticated AES-256-GCM ciphertext the next time their authenticated business settings or webhook account is used, provided `WHATSAPP_TOKEN_ENCRYPTION_KEY` is configured.

## Merchant Connection

As an owner or manager, open **WhatsApp AI Agent → Connect WhatsApp**. Complete Meta's business and phone-number selection. DukaFlow exchanges the short-lived authorization code server-side, validates the token belongs to this Meta app and has both WhatsApp permissions, confirms the selected phone belongs to the selected WhatsApp Business Account, subscribes the app to that account, and stores the credential encrypted for the authenticated DukaFlow business.

The token is never sent back to frontend JavaScript or included in API responses. DukaFlow starts the AI Sales Agent **OFF**. A merchant can test the connection, enable the agent, configure the welcome message/order behavior, or disconnect it. Disconnecting disables webhook replies and clears stored credentials while retaining conversations and orders.

## Existing Agent Behavior

- Product lookup returns current DukaFlow prices and stock.
- Customer lookup and order history stay scoped to the connected account's DukaFlow business.
- A confirmed order uses the existing transaction that validates and locks products, creates the sale and sale items, deducts stock, records stock movements, and creates a debt for credit orders.
- Any failed order transaction rolls back.
- Human takeover stops AI replies until the operator returns the conversation to AI.
- Turning the AI Sales Agent off prevents automatic AI replies; inbound webhook messages may still be stored in the inbox.
- Webhook tenant resolution uses Meta's `metadata.phone_number_id`, then a restricted RLS lookup of the matching connected account. Tenant/business IDs and message text from the webhook body are not used to choose a DukaFlow business.

## Verification and Limitations

`npm test` includes the WhatsApp connection security tests. `npm run test:full` also runs the existing backend, database tenant and frontend UI smoke checks. Automated tests mock Graph API responses; completing the real Embedded Signup dialog and sending a real WhatsApp message requires valid Meta app/configuration, approved permissions, a public HTTPS deployment, a configured database, and a WhatsApp Business phone number.

Legacy `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, and `WHATSAPP_GRAPH_VERSION` values remain accepted as compatibility aliases. New deployments should use the `META_*` names above.
