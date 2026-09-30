"use strict";

require("dotenv").config();

const { Pool } = require("pg");
const { getContext } = require("./requestContext");

/*
 * DukaFlow supports:
 *
 * 1. Vercel + Neon:
 *    DATABASE_URL
 *    DATABASE_URL_UNPOOLED
 *
 * 2. Existing/local PostgreSQL:
 *    DATABASE_HOST
 *    DATABASE_PORT
 *    DATABASE_NAME
 *    DATABASE_USER
 *    DATABASE_PASSWORD
 *
 * DATABASE_URL is preferred because Neon/Vercel provides it directly.
 */

const neonConnectionString =
    process.env.DATABASE_URL ||
    process.env.DATABASE_URL_UNPOOLED ||
    null;

const poolConfig = neonConnectionString
    ? {
        connectionString: neonConnectionString,

        // Keep connection counts conservative on Vercel/serverless.
        max: Number(
            process.env.DATABASE_POOL_MAX ||
            (process.env.VERCEL ? 5 : 20)
        ),

        idleTimeoutMillis: Number(
            process.env.DATABASE_IDLE_TIMEOUT_MS || 30000
        ),

        connectionTimeoutMillis: Number(
            process.env.DATABASE_CONNECTION_TIMEOUT_MS || 10000
        ),

        query_timeout: Number(
            process.env.DATABASE_QUERY_TIMEOUT_MS || 15000
        ),

        application_name: "dukaflow-api"
    }
    : {
        // Local / traditional PostgreSQL fallback.
        host: process.env.DATABASE_HOST,
        port: Number(process.env.DATABASE_PORT || 5432),
        database: process.env.DATABASE_NAME,
        user: process.env.DATABASE_USER,
        password: process.env.DATABASE_PASSWORD,

        max: Number(
            process.env.DATABASE_POOL_MAX ||
            (process.env.VERCEL ? 5 : 20)
        ),

        idleTimeoutMillis: Number(
            process.env.DATABASE_IDLE_TIMEOUT_MS || 30000
        ),

        connectionTimeoutMillis: Number(
            process.env.DATABASE_CONNECTION_TIMEOUT_MS || 10000
        ),

        query_timeout: Number(
            process.env.DATABASE_QUERY_TIMEOUT_MS || 15000
        ),

        application_name: "dukaflow-api"
    };

const pool = new Pool(poolConfig);

const nativeConnect = pool.connect.bind(pool);

function currentContext() {
    const context = getContext();

    if (!context?.businessId || !context?.branchId) {
        return null;
    }

    return context;
}

function isBeginQuery(query) {
    return (
        typeof query === "string" &&
        /^BEGIN(?:\s|$)/i.test(query.trim())
    );
}

async function applyTransactionContext(client, context) {
    if (!context) {
        return;
    }

    await client.query(
        `
        SELECT
            set_config('app.business_id', $1, true),
            set_config('app.branch_id', $2, true)
        `,
        [
            String(context.businessId),
            String(context.branchId)
        ]
    );
}

function wrapClient(client) {
    const nativeQuery = client.query.bind(client);

    client.query = function queryWithContext(
        query,
        values,
        callback
    ) {
        const context = currentContext();

        /*
         * Only attach DukaFlow tenant/branch context after BEGIN.
         * This keeps ordinary queries compatible with the existing code.
         */
        if (!context || !isBeginQuery(query)) {
            return nativeQuery(query, values, callback);
        }

        if (typeof callback === "function") {
            return nativeQuery(
                query,
                values,
                (error, result) => {
                    if (error) {
                        return callback(error);
                    }

                    applyTransactionContext(client, context)
                        .then(() => callback(null, result))
                        .catch((contextError) =>
                            callback(contextError)
                        );
                }
            );
        }

        return nativeQuery(query, values).then(
            async (result) => {
                await applyTransactionContext(
                    client,
                    context
                );

                return result;
            }
        );
    };

    return client;
}

async function queryWithContext(query, values) {
    const client = wrapClient(await nativeConnect());
    const context = currentContext();

    try {
        if (context) {
            await client.query("BEGIN");

            const result = await client.query(
                query,
                values
            );

            await client.query("COMMIT");

            return result;
        }

        return await client.query(query, values);
    } catch (error) {
        if (context) {
            try {
                await client.query("ROLLBACK");
            } catch (_) {
                // Preserve the original query error.
            }
        }

        throw error;
    } finally {
        client.release();
    }
}

/*
 * Keep DukaFlow's existing pool.query behavior.
 *
 * We intentionally don't delegate to pg Pool#query because the project
 * wraps pool.connect() for transaction-aware tenant/branch context.
 */
pool.query = function dukaflowQuery(
    query,
    values,
    callback
) {
    const promise = queryWithContext(
        query,
        values
    );

    if (typeof callback === "function") {
        promise.then(
            (result) => callback(null, result),
            (error) => callback(error)
        );
    }

    return promise;
};

/*
 * Keep explicit transactional controllers compatible with branch-aware
 * context. Supports both promise and callback forms.
 */
pool.connect = function dukaflowConnect(callback) {
    if (typeof callback === "function") {
        return nativeConnect(
            (error, client, release) => {
                if (error) {
                    return callback(error);
                }

                return callback(
                    null,
                    wrapClient(client),
                    release
                );
            }
        );
    }

    return nativeConnect().then(wrapClient);
};

/*
 * WhatsApp webhook queries require their own request-scoped setting.
 *
 * The setting is LOCAL to the transaction, so it does not leak between
 * requests/connections.
 */
async function webhookQuery(
    query,
    values,
    phoneNumberId
) {
    const client = await nativeConnect();

    try {
        await client.query("BEGIN");

        await client.query(
            `
            SELECT set_config(
                'app.whatsapp_phone_number_id',
                $1,
                true
            )
            `,
            [String(phoneNumberId || "")]
        );

        const result = await client.query(
            query,
            values
        );

        await client.query("COMMIT");

        return result;
    } catch (error) {
        try {
            await client.query("ROLLBACK");
        } catch (_) {
            // Preserve original error.
        }

        throw error;
    } finally {
        client.release();
    }
}

pool.webhookQuery = webhookQuery;

pool.on("error", (error) => {
    console.error(
        "PostgreSQL pool error",
        error
    );
});

module.exports = pool;