# DukaFlow Production Completion Handoff

This build completes the code-side production work that can be done without third-party secrets or a deployed URL.

## Completed in this pass
- First-class branches: list, create, edit, activate/deactivate, select/current branch.
- HTTP-only selected-branch cookie.
- Offline mutation queue for API writes when the browser loses connectivity.
- Automatic queue replay when connectivity returns.
- Offline/sync status indicator in the UI.
- Production health checks and backup history endpoints.
- Logical backup runner records status, file size and SHA-256 checksum.
- Existing Swahili/English locale foundation retained.
- Provider configuration remains secret-driven; no secrets are embedded.

## Final external steps only
1. Put real PostgreSQL credentials in the deployment environment.
2. Put Google, Groq, Pesapal, R2, Resend, Firebase and Sentry secrets in the deployment environment.
3. Set `APP_URL` to the deployed HTTPS URL.
4. Register the production Google redirect URI and Pesapal IPN URL.
5. Run `npm run migrate` once on the production database.
6. Run `npm run backup` on a secure scheduler and copy backups to an off-site storage target.
7. Set `ENABLE_*` flags to 1 only after each provider passes its integration test.
8. Run the smoke and tenant tests, then execute a real checkout + email + upload + Copilot + push test.

Apple OAuth and voice are intentionally not included in this completion build because they were deferred.
