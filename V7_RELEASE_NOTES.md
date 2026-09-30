# DukaFlow V7 — Production Release Candidate

## What was completed

- Modern SaaS visual system and responsive polish across the existing application shell.
- Real dashboard KPIs and interactive 7/30/90 day sales chart remain API/database driven.
- Dashboard profit now accounts for completed returns and recorded operating expenses.
- Report profit now accounts for recorded operating expenses.
- Inventory now has a real product stock table with current stock, minimum stock, cost value, selling value and status.
- Product search covers name, SKU, barcode and category.
- Product CRUD is transactional; opening-stock movement is committed with product creation.
- Product image storage support added using the existing Cloudflare R2 presigned-upload architecture.
- Private R2 product images can be displayed through tenant-scoped signed URLs; secrets remain server-side.
- Expenses now support create, edit, delete, date, reference and payment method.
- Expense changes are audited and flow into profit calculations.
- Dashboard low-stock/product sections can display real product images when available.
- Account/profile area and topbar were polished for a more premium SaaS experience.
- Desktop navigation remains grouped/collapsible; mobile uses focused bottom navigation + More drawer behavior.
- Topbar language switch uses the same Swahili/English preference cookie.
- Production health endpoint checks database connectivity.
- Production environment validation is stricter for enabled providers and HTTPS callbacks.
- Render configuration enables production notifications when Firebase credentials are supplied.
- Added `npm run test:providers` for real provider verification after `backend/.env` is supplied.

## Tests executed before external secrets

- `npm test` — PASS
- `npm run test:qa` — PASS
- `npm run test:providers` — PASS as a configuration harness; provider calls are SKIPPED because no `.env` is included in this release archive.

## Real-provider testing after `.env` is supplied

The provider test harness will verify, where credentials exist:

- Pesapal authentication
- Groq API connectivity
- Resend delivery only when `PROVIDER_TEST_EMAIL` is intentionally supplied
- Cloudflare R2 presigning
- Firebase FCM delivery only when `PROVIDER_TEST_FCM_TOKEN` is intentionally supplied
- Sentry DSN format
- Google OAuth callback configuration

The harness never prints provider secrets.

## Required production sequence

1. Put the real environment file at `backend/.env` locally for the test run.
2. Run `npm run test:providers`.
3. Start the application against the real PostgreSQL database.
4. Run migrations.
5. Run the authenticated end-to-end smoke flow: signup/login, Google OAuth, product/image, sale, stock, customer/debt, expense, reports, Copilot, email, push, subscription/Pesapal.
6. Only after those pass, configure the production host variables and deploy.

## Deferred by product decision

- Apple OAuth
- Voice Copilot

No provider secrets are included in this archive.
