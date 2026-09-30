# DukaFlow Production Engineering Pass 1–11

- Multi-branch: request-scoped branch context, branch assignment triggers and PostgreSQL RLS for operational tables.
- Offline: restricted queue to safe business mutations, IndexedDB replay and idempotency headers.
- i18n: Swahili default with persistent English/Swahili switch and shared UI translation layer.
- Copilot: expanded read tools plus confirmation-gated product/customer/expense/stock/debt actions.
- AI operations: conversations, tool messages and action audit records remain tenant/branch scoped.
- Email verification: token, expiry, resend and verification page; production Render enables it.
- Backups: pg_dump now uses DATABASE_* variables and supports R2 off-site upload with checksum metadata.
- Security: production environment validation and security headers; provider flags are explicit.
- UI: branch switcher, Expenses page, Copilot confirmation UI and responsive shared controls.
- QA: production-qa.js syntax-checks backend code.
- Configuration: cleaned single-source .env.example and production provider flags.

No API secrets are included in the archive.
