# DukaFlow — Google Sign-In setup

Google Sign-In is implemented for both authentication screens:

- `/login/` → **Continue with Google**
- `/register/` → **Sign up with Google**

The register flow uses the business name entered in the form, then creates the owner account after Google verifies the user's email.

## Backend environment

Copy these values into `backend/.env`:

```env
GOOGLE_CLIENT_ID=YOUR_GOOGLE_WEB_CLIENT_ID
GOOGLE_CLIENT_SECRET=YOUR_GOOGLE_WEB_CLIENT_SECRET
GOOGLE_CALLBACK_URL=http://localhost:3000/api/auth/google/callback
```

Keep the client secret server-side. Do not place it in frontend JavaScript.

## Google Cloud OAuth client

For local testing when DukaFlow is opened directly on port 3000:

**Authorized JavaScript origins**

```text
http://localhost:3000
```

**Authorized redirect URIs**

```text
http://localhost:3000/api/auth/google/callback
```

For production, replace these with the real DukaFlow domain and callback URL, for example:

```text
https://app.example.com
https://app.example.com/api/auth/google/callback
```

The production values must exactly match `GOOGLE_CALLBACK_URL` and the URL from which the web app is served.

## Important

- Do not commit `backend/.env`.
- Do not paste `GOOGLE_CLIENT_SECRET` into the frontend.
- Apple OAuth can be added later without changing the Google button flow.
