# DukaFlow — Live integrations handoff

The application is wired so providers turn on automatically when their server-side credentials are present. Do not put provider secrets in frontend files or commit `.env`.

## 1. Google Sign-in / Sign-up

Server variables:

```env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_CALLBACK_URL=https://YOUR_APP_DOMAIN/api/auth/google/callback
```

For local development:

```text
Authorized JavaScript origins:
http://localhost:3000

Authorized redirect URI:
http://localhost:3000/api/auth/google/callback
```

Production uses the exact production origin and callback path above.

## 2. Pesapal

```env
PESAPAL_CONSUMER_KEY=...
PESAPAL_CONSUMER_SECRET=...
PESAPAL_ENVIRONMENT=production
PESAPAL_IPN_URL=https://YOUR_APP_DOMAIN/api/integrations/pesapal/ipn
```

After deployment, sign in to DukaFlow as an owner and call the IPN registration action from the integration layer, or register the exact URL in Pesapal. DukaFlow stores the returned `ipn_id` in PostgreSQL and uses it on checkout.

Checkout flow:

`DukaFlow → Pesapal SubmitOrderRequest → payment page → callback/IPN → GetTransactionStatus → PostgreSQL subscription activation`

## 3. Resend

```env
RESEND_API_KEY=...
RESEND_FROM_EMAIL=DukaFlow <noreply@YOUR_VERIFIED_DOMAIN>
```

Password reset now sends through Resend when configured.

## 4. Cloudflare R2

```env
R2_ACCOUNT_ID=...
R2_ENDPOINT=https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=dukaflow-assets
R2_PUBLIC_BASE_URL=https://YOUR_PUBLIC_ASSET_DOMAIN
```

The backend exposes an authenticated presigned-upload endpoint:

`POST /api/integrations/storage/presign`

The bucket can remain private; use presigned URLs or a controlled public asset domain.

## 5. Groq — DukaFlow Copilot

```env
GROQ_API_KEY=...
GROQ_MODEL=openai/gpt-oss-120b
```

When configured, `/api/assistant` switches from the safe business-data fallback to Groq tool calling. The model can read live DukaFlow data through server-side tools; PostgreSQL remains the source of truth.

## 6. Firebase / FCM

```env
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n"
```

Device tokens are registered at:

`POST /api/integrations/notifications/register-token`

## 7. Production deployment

The included `render.yaml` declares the production secret variables as `sync: false`, so they can be entered securely in the hosting dashboard.

After deployment:

1. Set `APP_URL` to the real DukaFlow URL.
2. Set all provider secrets in the host environment.
3. Deploy.
4. Run migrations automatically through the container startup command.
5. Register the Pesapal IPN URL and keep the returned notification ID.
6. Set the Google production origin + callback URI.
7. Test Google, password reset email, R2 upload, Copilot, and Pesapal sandbox/live payment separately.

## Apple OAuth

Apple OAuth is intentionally not included yet, as requested. It can be added later without changing the core user/business model.
