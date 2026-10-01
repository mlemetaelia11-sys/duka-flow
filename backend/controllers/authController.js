"use strict";

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const pool = require("../db");
const { COOKIE_NAME } = require("../middleware/authMiddleware");
const { sendEmail } = require("../services/email");

const PASSWORD_MIN_LENGTH = 10;
const USER_FIELDS = "id, name, email, role, is_active, business_id, email_verified_at, last_login_at, created_at";

function cookieOptions() {
    return {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/"
    };
}

function cookieMaxAge() {
    const value = process.env.JWT_EXPIRES_IN || "8h";
    const match = String(value).match(/^(\d+)(s|m|h|d)$/i);
    const multipliers = {
        s: 1000,
        m: 60 * 1000,
        h: 60 * 60 * 1000,
        d: 24 * 60 * 60 * 1000
    };

    return match
        ? Number(match[1]) * multipliers[match[2].toLowerCase()]
        : 8 * 60 * 60 * 1000;
}

function issueSession(res, user) {
    const secret = process.env.JWT_SECRET;

    if (!secret) {
        throw new Error("Authentication is not configured.");
    }

    const token = jwt.sign(
        {
            sub: String(user.id),
            businessId: String(user.business_id),
            role: user.role
        },
        secret,
        { expiresIn: process.env.JWT_EXPIRES_IN || "8h" }
    );

    res.cookie(COOKIE_NAME, token, {
        ...cookieOptions(),
        maxAge: cookieMaxAge()
    });
}

function normalizeEmail(value) {
    return String(value ?? "").trim().toLowerCase();
}

function validEmail(email) {
    return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function createBusinessSlug(name) {
    const base = name
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 160) || "business";

    return `${base}-${crypto.randomBytes(6).toString("hex")}`;
}

function verificationRequired(){ return process.env.REQUIRE_EMAIL_VERIFICATION === "1"; }
async function sendVerification(userId,businessId,email){ const raw=crypto.randomBytes(32).toString("hex"); const hash=crypto.createHash("sha256").update(raw).digest("hex"); await pool.query(`UPDATE email_verification_tokens SET used_at=NOW() WHERE user_id=$1 AND used_at IS NULL`,[userId]); await pool.query(`INSERT INTO email_verification_tokens(business_id,user_id,token_hash,expires_at) VALUES($1,$2,$3,NOW()+INTERVAL '24 hours')`,[businessId,userId,hash]); const url=`${String(process.env.APP_URL||"http://localhost:3000").replace(/\/$/,"")}/verify-email/?token=${raw}`; await sendEmail({to:email,subject:"Verify your DukaFlow email",html:`<h2>Welcome to DukaFlow</h2><p>Verify your email to activate your account.</p><p><a href="${url}">Verify email</a></p>`,text:`Verify your DukaFlow email: ${url}`}); }

function googleConfigured() {
    return Boolean(
        process.env.GOOGLE_CLIENT_ID &&
        process.env.GOOGLE_CLIENT_SECRET &&
        process.env.JWT_SECRET
    );
}

function googleCallbackUrl() {
    return (
        process.env.GOOGLE_CALLBACK_URL ||
        `${process.env.APP_URL || "http://localhost:3000"}/api/auth/google/callback`
    ).replace(/\/$/, "");
}

function googleStateCookieOptions() {
    return {
        ...cookieOptions(),
        maxAge: 10 * 60 * 1000,
        path: "/api/auth/google"
    };
}

function redirectAfterGoogle(res, path) {
    res.clearCookie("dukaflow_google_oauth_state", googleStateCookieOptions());
    return res.redirect(path);
}

function oauthErrorPath(mode, code) {
    const page = mode === "signup" ? "/register/" : "/login/";
    return `${page}?oauth=${encodeURIComponent(code)}`;
}

function googleStart(req, res) {
    const mode = req.query?.mode === "signup" ? "signup" : "login";

    if (!googleConfigured()) {
        return res.status(503).json({
            message: "Google Sign-In is not configured yet."
        });
    }

    let businessName = "";
    if (mode === "signup") {
        businessName = String(req.query?.businessName || "").trim();
        if (businessName.length < 2 || businessName.length > 150) {
            return redirectAfterGoogle(res, oauthErrorPath(mode, "business_name_required"));
        }
    }

    const state = jwt.sign(
        {
            mode,
            businessName,
            nonce: crypto.randomBytes(18).toString("hex")
        },
        process.env.JWT_SECRET,
        { expiresIn: "10m" }
    );

    res.cookie("dukaflow_google_oauth_state", state, googleStateCookieOptions());

    const params = new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        redirect_uri: googleCallbackUrl(),
        response_type: "code",
        scope: "openid email profile",
        state,
        access_type: "online",
        prompt: "select_account"
    });

    return res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}

async function googleCallback(req, res) {
    const state = String(req.query?.state || "");
    const code = String(req.query?.code || "");
    const savedState = String(req.cookies?.dukaflow_google_oauth_state || "");

    if (!googleConfigured()) {
        return redirectAfterGoogle(res, "/login/?oauth=not_configured");
    }

    let statePayload;
    try {
        statePayload = jwt.verify(state, process.env.JWT_SECRET);
    } catch {
        return redirectAfterGoogle(res, "/login/?oauth=invalid_state");
    }

    if (!state || !savedState || state !== savedState || !code) {
        return redirectAfterGoogle(res, oauthErrorPath(statePayload?.mode, "invalid_state"));
    }

    const mode = statePayload?.mode === "signup" ? "signup" : "login";
    const businessName = String(statePayload?.businessName || "").trim();

    try {
        const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                code,
                client_id: process.env.GOOGLE_CLIENT_ID,
                client_secret: process.env.GOOGLE_CLIENT_SECRET,
                redirect_uri: googleCallbackUrl(),
                grant_type: "authorization_code"
            })
        });

        if (!tokenResponse.ok) {
            throw new Error("Google token exchange failed.");
        }

        const tokens = await tokenResponse.json();
        if (!tokens.access_token) {
            throw new Error("Google did not return an access token.");
        }

        const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
            headers: { Authorization: `Bearer ${tokens.access_token}` }
        });

        if (!profileResponse.ok) {
            throw new Error("Google profile lookup failed.");
        }

        const profile = await profileResponse.json();
        const email = normalizeEmail(profile.email);
        const name = String(profile.name || profile.given_name || "DukaFlow User").trim().slice(0, 150);

        if (!validEmail(email) || profile.email_verified !== true) {
            return redirectAfterGoogle(res, oauthErrorPath(mode, "email_not_verified"));
        }

        const existingResult = await pool.query(
            `
            SELECT u.id, u.name, u.email, u.role, u.is_active, u.business_id, u.email_verified_at,
                   u.last_login_at, u.created_at,
                   b.name AS business_name, b.is_active AS business_is_active
            FROM users u
            INNER JOIN businesses b ON b.id = u.business_id
            WHERE LOWER(u.email) = LOWER($1)
            LIMIT 1
            `,
            [email]
        );

        if (existingResult.rowCount) {
            const user = existingResult.rows[0];

            if (!user.is_active) {
                return redirectAfterGoogle(res, oauthErrorPath(mode, "account_disabled"));
            }

            if (!user.business_is_active) {
                return redirectAfterGoogle(res, oauthErrorPath(mode, "business_inactive"));
            }

            const updated = await pool.query(
                `
                UPDATE users
                SET last_login_at = NOW(), updated_at = NOW()
                WHERE id = $1 AND business_id = $2
                RETURNING ${USER_FIELDS}
                `,
                [user.id, user.business_id]
            );

            const sessionUser = {
                ...updated.rows[0],
                business_name: user.business_name
            };

            issueSession(res, sessionUser);
            return redirectAfterGoogle(res, "/");
        }

        if (mode !== "signup") {
            return redirectAfterGoogle(res, "/login/?oauth=account_not_found");
        }

        if (businessName.length < 2 || businessName.length > 150) {
            return redirectAfterGoogle(res, "/register/?oauth=business_name_required");
        }

        const client = await pool.connect();
        try {
            await client.query("BEGIN");

            const businessResult = await client.query(
                `
                INSERT INTO businesses (name, slug)
                VALUES ($1, $2)
                RETURNING id, name
                `,
                [businessName, createBusinessSlug(businessName)]
            );

            const business = businessResult.rows[0];

            const branchResult = await client.query(
                `
                INSERT INTO branches (
                    business_id,
                    name,
                    code,
                    is_active
                )
                VALUES ($1, $2, 'MAIN', TRUE)
                RETURNING id
                `,
                [business.id, `${business.name} - Main Branch`]
            );

            const mainBranchId = branchResult.rows[0].id;
            const randomPassword = crypto.randomBytes(32).toString("hex");
            const passwordHash = await bcrypt.hash(randomPassword, 12);

            const userResult = await client.query(
                `
                INSERT INTO users (
                    name,
                    email,
                    password_hash,
                    role,
                    is_active,
                    business_id,
                    default_branch_id,
                    email_verified_at
                )
                VALUES ($1, $2, $3, 'owner', TRUE, $4, $5, NOW())
                RETURNING ${USER_FIELDS}
                `,
                [
                    name || email.split("@")[0],
                    email,
                    passwordHash,
                    business.id,
                    mainBranchId
                ]
            );

            const user = {
                ...userResult.rows[0],
                business_name: business.name
            };

            await client.query("COMMIT");
            issueSession(res, user);
            return redirectAfterGoogle(res, "/");
        } catch (error) {
            await client.query("ROLLBACK");
            if (error.code === "23505") {
                const retry = await pool.query(
                    `SELECT u.id, u.name, u.email, u.role, u.is_active, u.business_id,
                            u.last_login_at, u.created_at, b.name AS business_name,
                            b.is_active AS business_is_active
                     FROM users u
                     INNER JOIN businesses b ON b.id = u.business_id
                     WHERE LOWER(u.email) = LOWER($1)
                     LIMIT 1`,
                    [email]
                );
                if (retry.rowCount && retry.rows[0].is_active && retry.rows[0].business_is_active) {
                    const user = retry.rows[0];
                    const updated = await pool.query(
                        `UPDATE users SET last_login_at = NOW(), updated_at = NOW()
                         WHERE id = $1 AND business_id = $2
                         RETURNING ${USER_FIELDS}`,
                        [user.id, user.business_id]
                    );
                    issueSession(res, { ...updated.rows[0], business_name: user.business_name });
                    return redirectAfterGoogle(res, "/");
                }
            }
            throw error;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error("GOOGLE OAUTH ERROR:", error);
        return redirectAfterGoogle(res, oauthErrorPath(mode, "google_signin_failed"));
    }
}

function safeUser(user) {
    return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        is_active: user.is_active,
        email_verified_at: user.email_verified_at ?? null,
        last_login_at: user.last_login_at ?? null,
        created_at: user.created_at,
        business_id: user.business_id,
        business_name: user.business_name
    };
}

async function register(req, res) {
    const name = String(req.body.name ?? "").trim();
    const businessName = String(req.body.businessName ?? "").trim();
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password ?? "");

    if (
        name.length < 2 ||
        name.length > 150 ||
        businessName.length < 2 ||
        businessName.length > 150 ||
        !validEmail(email) ||
        password.length < PASSWORD_MIN_LENGTH
    ) {
        return res.status(400).json({
            message: "Enter a business name, valid name and email, and a password of at least 10 characters."
        });
    }

    if (!process.env.JWT_SECRET) {
        return res.status(500).json({
            message: "Authentication is not configured."
        });
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");
        const passwordHash = await bcrypt.hash(password, 12);
        const businessResult = await client.query(
            `
            INSERT INTO businesses (name, slug)
            VALUES ($1, $2)
            RETURNING id, name
            `,
            [businessName, createBusinessSlug(businessName)]
        );

        const business = businessResult.rows[0];

        const branchResult = await client.query(
            `
            INSERT INTO branches (
                business_id,
                name,
                code,
                is_active
            )
            VALUES ($1, $2, 'MAIN', TRUE)
            RETURNING id
            `,
            [business.id, `${business.name} - Main Branch`]
        );

        const mainBranchId = branchResult.rows[0].id;

        const userResult = await client.query(
            `
            INSERT INTO users (
                name,
                email,
                password_hash,
                role,
                is_active,
                business_id,
                default_branch_id
            )
            VALUES ($1, $2, $3, 'owner', TRUE, $4, $5)
            RETURNING ${USER_FIELDS}
            `,
            [name, email, passwordHash, business.id, mainBranchId]
        );

        const user = {
            ...userResult.rows[0],
            business_name: business.name
        };

        await client.query("COMMIT");
        if (verificationRequired()) { await sendVerification(user.id,business.id,email); return res.status(201).json({message:"Account created. Check your email to verify your DukaFlow account.",verificationRequired:true}); }
        issueSession(res,user);
        return res.status(201).json({message:"Business and owner account created successfully.",user:safeUser(user)});
    } catch (error) {
        await client.query("ROLLBACK");
        if (error.code === "23505") {
            return res.status(409).json({
                message: "An account with this email already exists."
            });
        }

        console.error("REGISTRATION ERROR:", error);
        return res.status(500).json({
            message: "Unable to create the account."
        });
    } finally {
        client.release();
    }
}

async function login(req, res) {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password ?? "");

    if (!validEmail(email) || !password) {
        return res.status(400).json({
            message: "Enter a valid email and password."
        });
    }

    if (!process.env.JWT_SECRET) {
        return res.status(500).json({
            message: "Authentication is not configured."
        });
    }

    try {
        const result = await pool.query(
            `
             SELECT u.id, u.name, u.email, u.password_hash, u.role,
                 u.is_active, u.business_id, u.email_verified_at, u.last_login_at, u.created_at,
                 b.name AS business_name, b.is_active AS business_is_active
             FROM users u
             INNER JOIN businesses b ON b.id = u.business_id
             WHERE u.email = $1
            `,
            [email]
        );

        const user = result.rows[0];
        const passwordMatches = user
            ? await bcrypt.compare(password, user.password_hash)
            : false;

        if (!user || !passwordMatches) {
            return res.status(401).json({
                message: "Invalid email or password."
            });
        }

        if (!user.is_active) return res.status(403).json({message:"This account is disabled. Contact an owner."});
        if (verificationRequired() && !user.email_verified_at) return res.status(403).json({message:"Please verify your email before signing in.",code:"EMAIL_NOT_VERIFIED"});

        if (!user.business_is_active) {
            return res.status(403).json({
                message: "This business is inactive. Contact support."
            });
        }

        const updated = await pool.query(
            `
            UPDATE users
            SET last_login_at = NOW(), updated_at = NOW()
            WHERE id = $1 AND business_id = $2
            RETURNING ${USER_FIELDS}
            `,
            [user.id, user.business_id]
        );

        const sessionUser = {
            ...updated.rows[0],
            business_name: user.business_name
        };

        issueSession(res, sessionUser);
        return res.json({
            message: "Signed in successfully.",
            user: safeUser(sessionUser)
        });
    } catch (error) {
        console.error("LOGIN ERROR:", error);
        return res.status(500).json({
            message: "Unable to sign in right now."
        });
    }
}

function me(req, res) {
    return res.json({ user: req.user });
}

function logout(req, res) {
    res.clearCookie(COOKIE_NAME, cookieOptions());
    return res.json({ message: "Signed out successfully." });
}

async function requestPasswordReset(req, res) {
    const email = normalizeEmail(req.body?.email);

    if (!validEmail(email)) {
        return res.status(400).json({
            message: "Enter a valid email address."
        });
    }

    try {
        const result = await pool.query(
            `SELECT u.id, u.business_id
             FROM users u
             INNER JOIN businesses b
               ON b.id = u.business_id
              AND b.is_active = TRUE
             WHERE u.email = $1
               AND u.is_active = TRUE
             LIMIT 1`,
            [email]
        );

        // Keep account enumeration protection.
        if (!result.rowCount) {
            return res.json({
                message:
                    "If an active account exists for that email, password reset instructions will be sent."
            });
        }

        const user = result.rows[0];

        // Invalidate previous unused reset tokens for this user.
        await pool.query(
            `UPDATE password_reset_tokens
             SET used_at = NOW()
             WHERE user_id = $1
               AND business_id = $2
               AND used_at IS NULL`,
            [user.id, user.business_id]
        );

        const rawToken = crypto.randomBytes(32).toString("hex");
        const tokenHash = crypto
            .createHash("sha256")
            .update(rawToken)
            .digest("hex");

        await pool.query(
            `INSERT INTO password_reset_tokens
                (business_id, user_id, token_hash, expires_at)
             VALUES
                ($1, $2, $3, NOW() + INTERVAL '30 minutes')`,
            [user.business_id, user.id, tokenHash]
        );

        const appUrl = String(
            process.env.APP_URL || "http://localhost:3000"
        ).replace(/\/$/, "");

        const resetUrl =
            `${appUrl}/password-reset/?token=` +
            encodeURIComponent(rawToken);

        // Development fallback only.
        if (
            !process.env.RESEND_API_KEY ||
            !process.env.RESEND_FROM_EMAIL
        ) {
            if (process.env.NODE_ENV !== "production") {
                return res.json({
                    message: "Reset link generated in development.",
                    developmentResetToken: rawToken,
                    developmentResetUrl: resetUrl
                });
            }

            console.error(
                "PASSWORD RESET EMAIL NOT CONFIGURED",
                {
                    hasApiKey: Boolean(process.env.RESEND_API_KEY),
                    hasFromEmail: Boolean(process.env.RESEND_FROM_EMAIL)
                }
            );

            return res.json({
                message:
                    "If an active account exists for that email, password reset instructions will be sent."
            });
        }

        try {
            const emailResult = await sendEmail({
                to: email,
                subject: "Reset your DukaFlow password",
                html: `
                    <div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:24px;color:#111827">
                        <h2 style="margin:0 0 16px">Reset your DukaFlow password</h2>

                        <p style="line-height:1.6">
                            We received a request to reset your DukaFlow password.
                        </p>

                        <p style="margin:24px 0">
                            <a
                                href="${resetUrl}"
                                style="display:inline-block;padding:12px 18px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:600"
                            >
                                Reset Password
                            </a>
                        </p>

                        <p style="line-height:1.6;color:#6b7280">
                            This password reset link expires in 30 minutes.
                        </p>

                        <p style="line-height:1.6;color:#6b7280">
                            If you did not request this, you can safely ignore this email.
                        </p>
                    </div>
                `,
                text:
                    `Reset your DukaFlow password:\n\n` +
                    `${resetUrl}\n\n` +
                    `This link expires in 30 minutes.\n` +
                    `If you did not request this, you can safely ignore this email.`
            });

            console.log(
                "PASSWORD RESET EMAIL SENT",
                {
                    recipient: email,
                    resendId: emailResult?.id || null
                }
            );
        } catch (emailError) {
            console.error(
                "PASSWORD RESET EMAIL FAILED",
                {
                    message: emailError?.message || "Unknown email error",
                    status: emailError?.status || emailError?.statusCode || null,
                    code: emailError?.code || null
                }
            );

            // Keep generic response to prevent account enumeration.
            return res.json({
                message:
                    "If an active account exists for that email, password reset instructions will be sent."
            });
        }

        return res.json({
            message:
                "If an active account exists for that email, password reset instructions will be sent."
        });
    } catch (error) {
        console.error(
            "PASSWORD RESET REQUEST ERROR",
            {
                message: error?.message || "Unknown error",
                code: error?.code || null
            }
        );

        return res.json({
            message:
                "If an active account exists for that email, password reset instructions will be sent."
        });
    }
}

async function resetPassword(req, res) {
    const token = String(req.body?.token || "").trim();
    const newPassword = String(req.body?.newPassword || "");

    if (!token || token.length < 32) {
        return res.status(400).json({ message: "Invalid reset token." });
    }

    if (newPassword.length < PASSWORD_MIN_LENGTH) {
        return res.status(400).json({
            message: `New password must be at least ${PASSWORD_MIN_LENGTH} characters.`
        });
    }

    try {
        const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
        const result = await pool.query(
            `SELECT id, user_id, business_id
             FROM password_reset_tokens
             WHERE token_hash = $1
               AND used_at IS NULL
               AND expires_at > NOW()
             LIMIT 1`,
            [tokenHash]
        );

        if (!result.rowCount) {
            return res.status(400).json({ message: "Invalid or expired reset token." });
        }

        const record = result.rows[0];
        const passwordHash = await bcrypt.hash(newPassword, 12);
        const client = await pool.connect();
        let started = false;

        try {
            await client.query("BEGIN");
            started = true;

            const userUpdate = await client.query(
                `UPDATE users
                 SET password_hash = $1, updated_at = NOW()
                 WHERE id = $2 AND business_id = $3 AND is_active = TRUE
                 RETURNING id`,
                [passwordHash, record.user_id, record.business_id]
            );

            if (!userUpdate.rowCount) {
                const error = new Error("Account is no longer active.");
                error.status = 400;
                throw error;
            }

            await client.query(
                `UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1 AND business_id = $2`,
                [record.id, record.business_id]
            );

            await client.query("COMMIT");
            started = false;
        } catch (error) {
            if (started) {
                try { await client.query("ROLLBACK"); } catch {}
            }
            throw error;
        } finally {
            client.release();
        }

        return res.json({ message: "Password reset successfully. You can now log in." });
    } catch (error) {
        console.error("PASSWORD RESET ERROR:", error.message);
        return res.status(error.status || 500).json({
            message: error.status ? error.message : "Unable to reset password."
        });
    }
}

async function verifyEmail(req,res){const token=String(req.query?.token||req.body?.token||"").trim();if(token.length<32)return res.status(400).json({message:"Invalid verification token."});try{const h=crypto.createHash("sha256").update(token).digest("hex");const r=await pool.query(`SELECT id,user_id,business_id FROM email_verification_tokens WHERE token_hash=$1 AND used_at IS NULL AND expires_at>NOW() LIMIT 1`,[h]);if(!r.rowCount)return res.status(400).json({message:"This verification link is invalid or expired."});await pool.query(`UPDATE users SET email_verified_at=COALESCE(email_verified_at,NOW()),updated_at=NOW() WHERE id=$1 AND business_id=$2`,[r.rows[0].user_id,r.rows[0].business_id]);await pool.query(`UPDATE email_verification_tokens SET used_at=NOW() WHERE id=$1`,[r.rows[0].id]);return res.json({message:"Email verified successfully. You can now sign in."});}catch(e){console.error("VERIFY EMAIL",e);return res.status(500).json({message:"Unable to verify email."});}}
async function resendVerification(req,res){const email=normalizeEmail(req.body?.email);if(!validEmail(email))return res.status(400).json({message:"Enter a valid email address."});try{const r=await pool.query(`SELECT id,business_id,email,email_verified_at,is_active FROM users WHERE email=$1 LIMIT 1`,[email]);if(!r.rowCount||r.rows[0].email_verified_at||!r.rows[0].is_active)return res.json({message:"If verification is needed, a new email will be sent."});await sendVerification(r.rows[0].id,r.rows[0].business_id,email);return res.json({message:"Verification email sent."});}catch(e){return res.json({message:"If verification is needed, a new email will be sent."});}}

module.exports = { register, login, googleStart, googleCallback, me, logout, requestPasswordReset, resetPassword, verifyEmail, resendVerification };
