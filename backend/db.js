"use strict";

require("dotenv").config();
const { Pool } = require("pg");
const { getContext } = require("./requestContext");

const pool = new Pool({
    host: process.env.DATABASE_HOST,
    port: Number(process.env.DATABASE_PORT || 5432),
    database: process.env.DATABASE_NAME,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    max: Number(process.env.DATABASE_POOL_MAX || 20),
    idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS || 30000),
    connectionTimeoutMillis: Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS || 5000),
    query_timeout: Number(process.env.DATABASE_QUERY_TIMEOUT_MS || 15000),
    application_name: "dukaflow-api"
});

const nativeConnect = pool.connect.bind(pool);

function currentContext() {
    const context = getContext();
    if (!context?.businessId || !context?.branchId) return null;
    return context;
}

function isBeginQuery(query) {
    return typeof query === "string" && /^BEGIN(?:\s|$)/i.test(query.trim());
}

async function applyTransactionContext(client, context) {
    if (!context) return;
    await client.query(
        "SELECT set_config('app.business_id',$1,true), set_config('app.branch_id',$2,true)",
        [String(context.businessId), String(context.branchId)]
    );
}

function wrapClient(client) {
    const nativeQuery = client.query.bind(client);

    client.query = function queryWithContext(query, values, callback) {
        const context = currentContext();
        if (!context || !isBeginQuery(query)) {
            return nativeQuery(query, values, callback);
        }

        if (typeof callback === "function") {
            return nativeQuery(query, values, (error, result) => {
                if (error) return callback(error);
                applyTransactionContext(client, context)
                    .then(() => callback(null, result))
                    .catch((contextError) => callback(contextError));
            });
        }

        return nativeQuery(query, values).then(async (result) => {
            await applyTransactionContext(client, context);
            return result;
        });
    };

    return client;
}

async function queryWithContext(query, values) {
    const client = wrapClient(await nativeConnect());
    const context = currentContext();

    try {
        if (context) {
            await client.query("BEGIN");
            const result = await client.query(query, values);
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

// IMPORTANT: Do not delegate to pg Pool#query here. pg's implementation calls
// pool.connect() internally; wrapping pool.connect without preserving every
// callback contract caused requests to hang. We use the original connect method
// and execute the query directly on the acquired client instead.
pool.query = function dukaflowQuery(query, values, callback) {
    const promise = queryWithContext(query, values);

    if (typeof callback === "function") {
        promise.then(
            (result) => callback(null, result),
            (error) => callback(error)
        );
    }

    return promise;
};

// Keep explicit transactional controllers compatible with branch-aware context.
// The wrapper preserves both promise and callback forms.
pool.connect = function dukaflowConnect(callback) {
    if (typeof callback === "function") {
        return nativeConnect((error, client, release) => {
            if (error) return callback(error);
            return callback(null, wrapClient(client), release);
        });
    }

    return nativeConnect().then(wrapClient);
};

async function webhookQuery(query, values, phoneNumberId) {
    const client = await nativeConnect();
    try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.whatsapp_phone_number_id',$1,true)", [String(phoneNumberId || "")]);
        const result = await client.query(query, values);
        await client.query("COMMIT");
        return result;
    } catch (error) {
        try { await client.query("ROLLBACK"); } catch (_) {}
        throw error;
    } finally { client.release(); }
}

pool.webhookQuery = webhookQuery;

pool.on("error", (error) => {
    console.error("PostgreSQL pool error", error);
});

module.exports = pool;
