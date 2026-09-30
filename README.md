# DukaFlow

DukaFlow is a PostgreSQL-backed small-business management application for retail operations, with multi-business isolation, authentication, role-based access, inventory, sales, debts, purchases, reporting, and SaaS-ready subscription entitlements.

## Stack

- Frontend: HTML, CSS, Vanilla JavaScript
- Backend: Node.js, Express.js
- Database: PostgreSQL
- Authentication: bcryptjs + JWT in an HTTP-only cookie

## Core modules

- Dashboard and sales overview
- Products, SKU/barcode, categories, stock
- Sales / POS, discounts, receipts, mobile-money/bank references
- Customers, customer history, notes and loyalty
- Debts and debt payments
- Suppliers and purchases
- Supplier payments / purchase payables
- Sales returns and purchase returns
- Cash register / till and reconciliation
- Inventory adjustments and stock movements
- Notifications and low-stock alerts
- Reports and CSV exports
- Staff/user management with Owner, Manager and Cashier roles
- Global search
- Audit logs
- Business insights and rule-based business assistant
- Business settings
- Dashboard widget preferences
- Approval-request workflow foundation
- PWA shell / offline-aware UX

## Security / tenancy

Every operational record is scoped to a `business_id` derived from the authenticated session. Business-owned reads, writes, updates, deletes, joins, and cross-entity references are tenant-scoped. Composite foreign keys add database-level protection against cross-business relationships.

Authentication uses an HTTP-only cookie. JWTs are not stored in browser storage.

## Setup

1. Create a PostgreSQL database.
2. Copy `backend/.env.example` to `backend/.env` and fill in the real values.
3. Install dependencies:

```bash
cd backend
npm install
```

4. Run migrations:

```bash
npm run migrate
```

5. Start the server:

```bash
npm start
```

Development proxy:

```bash
npm run dev
```

## Environment

Required database settings:

- `DATABASE_HOST`
- `DATABASE_PORT`
- `DATABASE_NAME`
- `DATABASE_USER`
- `DATABASE_PASSWORD`

Authentication settings:

- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `NODE_ENV`

Optional:

- `PORT`
- `HOST`
- `BACKUP_DIR`
- `PG_DUMP_PATH`
- `PG_RESTORE_PATH`

Never commit `backend/.env`.

## Migration safety

The tenant migration backfills existing data into a legacy business instead of deleting it. Migrations use database transactions, timeouts and an advisory lock. `004_integrity_hardening.sql` fixes composite foreign-key delete behavior that would otherwise attempt to null a non-null tenant column on PostgreSQL 14.

## Testing

Static/syntax regression:

```bash
npm test
```

Tenant database isolation test:

```bash
npm run test:db
```

To require a live PostgreSQL database for the DB test:

```bash
set DB_TEST_REQUIRED=1
npm run test:db
```

On Linux/macOS use:

```bash
DB_TEST_REQUIRED=1 npm run test:db
```

Health endpoint:

```text
GET /api/health
```

Database health endpoint:

```text
GET /api/health/db
```

## Backup / restore

Create a PostgreSQL custom-format backup:

```bash
npm run backup
```

Restore a backup only when intentionally replacing the target database:

```bash
npm run restore -- <backup-file> --confirm
```

The restore script is deliberately destructive and should be treated as an administrator operation.

## SaaS subscription foundation

Subscription plans, current-plan lookup and feature/limit enforcement are implemented in the application. The current product includes plan metadata and entitlement checks.

The following still depend on external infrastructure/provider choices and credentials and are intentionally not faked in this repository:

- Real payment checkout/webhook integration
- Production email delivery for password reset / verification
- Automatic cloud backup scheduling
- Full offline transaction queue and conflict-resolution sync
- A full multi-branch database model

## Deployment notes

Before production deployment:

- use a strong `JWT_SECRET`
- set `NODE_ENV=production`
- run behind HTTPS
- use a managed PostgreSQL instance and private credentials
- schedule backups outside the application process
- configure monitoring/logging/error tracking
- apply migrations before serving traffic
- review rate limits for the expected workload


## Production-ready provider gateways

DukaFlow now includes a server-side provider configuration layer. It does not expose provider secrets to the browser.

Set credentials in `backend/.env` when each service is ready:

- **Pesapal** — payments / subscription checkout gateway
- **Resend** — transactional email
- **Cloudflare R2** — object/file storage
- **Groq** — AI assistant
- **Firebase FCM** — push notifications

Provider readiness is available to authenticated users through:

```text
GET /api/integrations/status
```

Only safe configuration status is returned; secret values are never returned.

## Fast production deployment

### Docker

```bash
docker compose up --build
```

The production container applies pending PostgreSQL migrations before starting the API.

### Render

The repository includes `render.yaml`. Connect the repository to Render, review the generated PostgreSQL service, add provider secrets in the Render environment, and deploy.

Before opening the app to customers:

1. Set a strong `JWT_SECRET`.
2. Set `APP_URL` to the final HTTPS domain.
3. Add production PostgreSQL credentials.
4. Run the smoke/static tests.
5. Configure provider credentials one service at a time.
6. Turn on the corresponding `ENABLE_*` switch only after the provider callback/webhook flow has been tested.
