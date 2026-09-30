"use strict";

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const pool = require("../db");

const BASELINE_FILE = "000_initial_schema.sql";
const BASELINE_COVERS_UP_TO = 12;

function migrationNumber(filename) {
    const match = filename.match(/^(\d+)_/);
    return match ? Number(match[1]) : null;
}

function isHistoricalMigration(filename) {
    const number = migrationNumber(filename);
    return (
        number !== null &&
        number >= 1 &&
        number <= BASELINE_COVERS_UP_TO
    );
}

function sanitizePgDump(sql) {
    const cleaned = sql
        .replace(/^\s*\\restrict[^\r\n]*\r?\n/gm, "")
        .replace(/^\s*\\unrestrict[^\r\n]*\r?\n/gm, "")
        .replace(
            /SELECT pg_catalog\.set_config\('search_path', '', false\);\s*/g,
            "SET search_path TO public, pg_catalog;\n"
        );

    return `SET search_path TO public, pg_catalog;\n${cleaned}`;
}

async function tableExists(client, tableName) {
    const result = await client.query(
        "SELECT to_regclass($1) IS NOT NULL AS exists",
        [`public.${tableName}`]
    );

    return result.rows[0].exists === true;
}

async function baselineSchemaExists(client) {
    const requiredTables = [
        "users",
        "businesses",
        "products",
        "customers",
        "sales",
        "whatsapp_accounts",
        "ai_conversations",
        "ai_actions"
    ];

    for (const table of requiredTables) {
        if (!(await tableExists(client, table))) {
            return false;
        }
    }

    return true;
}

async function ensureSchemaMigrationsTable(client) {
    await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            filename VARCHAR(255) NOT NULL UNIQUE,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
}

async function markApplied(client, filename) {
    await client.query(
        `INSERT INTO schema_migrations (filename)
         VALUES ($1)
         ON CONFLICT (filename) DO NOTHING`,
        [filename]
    );
}

async function getAppliedMigrations(client) {
    const result = await client.query(
        "SELECT filename FROM schema_migrations ORDER BY filename"
    );

    return new Set(result.rows.map((row) => row.filename));
}

async function applyBaseline(client, migrationDir, files) {
    console.log(`→ Applying ${BASELINE_FILE}`);

    const baselinePath = path.join(migrationDir, BASELINE_FILE);

    if (!fs.existsSync(baselinePath)) {
        throw new Error(`${BASELINE_FILE} not found`);
    }

    const rawSql = fs.readFileSync(baselinePath, "utf8");
    const sql = sanitizePgDump(rawSql);

    if (!sql.includes("CREATE TABLE public.users")) {
        throw new Error(
            `${BASELINE_FILE} does not contain the expected users table`
        );
    }

    await client.query("BEGIN");

try {
    await client.query(sql);

    await ensureSchemaMigrationsTable(client);
    await markApplied(client, BASELINE_FILE);

    for (const filename of files) {
        if (filename === BASELINE_FILE) continue;
        if (!isHistoricalMigration(filename)) continue;

        await markApplied(client, filename);
        console.log(`✓ ${filename} included in baseline`);
    }

    await client.query("COMMIT");
} catch (error) {
    await client.query("ROLLBACK");
    throw error;
}

    /*
     * 000_initial_schema.sql is a complete schema snapshot containing
     * everything represented by historical migrations 001-012.
     *
     * Mark only 001-012 as already included in the baseline.
     * Future migrations (013+) must still execute normally.
     */
    for (const filename of files) {
        if (filename === BASELINE_FILE) continue;
        if (!isHistoricalMigration(filename)) continue;

        await markApplied(client, filename);
        console.log(`✓ ${filename} included in baseline`);
    }

    console.log(`✓ Applied ${BASELINE_FILE}`);
}

async function main() {
    const client = await pool.connect();

    try {
        await client.query("SET lock_timeout = '5s'");
        await client.query("SET search_path TO public, pg_catalog");
        await client.query("SET statement_timeout = '60s'");
        await client.query(
            "SELECT pg_advisory_lock(39182024)"
        );

        const migrationDir = path.join(__dirname, "..", "migrations");

        const files = fs
            .readdirSync(migrationDir)
            .filter((name) => /^\d+_.+\.sql$/i.test(name))
            .sort((a, b) =>
                a.localeCompare(b, undefined, { numeric: true })
            );

        const hasBaseline = files.includes(BASELINE_FILE);
        const schemaMigrationsExists = await tableExists(
            client,
            "schema_migrations"
        );

        /*
         * CASE 1:
         * Completely fresh database.
         *
         * Do NOT create schema_migrations first because the baseline dump
         * creates it itself.
         */
        if (!schemaMigrationsExists && hasBaseline) {
            await applyBaseline(client, migrationDir, files);
        } else {
            /*
             * Existing database.
             */
            await ensureSchemaMigrationsTable(client);

            let applied = await getAppliedMigrations(client);

            /*
             * CASE 2:
             * A complete baseline schema was restored manually, but
             * schema_migrations has no baseline record yet.
             */
            if (!applied.has(BASELINE_FILE) && hasBaseline) {
                const completeSchema = await baselineSchemaExists(client);

                if (completeSchema) {
                    console.log(
                        `→ Complete baseline schema detected; registering ${BASELINE_FILE}`
                    );

                    await markApplied(client, BASELINE_FILE);

                    for (const filename of files) {
                        if (filename === BASELINE_FILE) continue;
                        if (!isHistoricalMigration(filename)) continue;

                        await markApplied(client, filename);
                        console.log(
                            `✓ ${filename} included in baseline`
                        );
                    }

                    console.log(
                        `✓ ${BASELINE_FILE} registered as applied`
                    );
                }
            }

            applied = await getAppliedMigrations(client);

            /*
             * CASE 3:
             * Older database already has 001-012 recorded.
             * Register 000 without executing it.
             */
            if (!applied.has(BASELINE_FILE)) {
                const historicalFiles = files.filter(
                    (filename) =>
                        filename !== BASELINE_FILE &&
                        isHistoricalMigration(filename)
                );

                const historicalAlreadyApplied =
                    historicalFiles.length > 0 &&
                    historicalFiles.every((filename) =>
                        applied.has(filename)
                    );

                if (historicalAlreadyApplied) {
                    console.log(
                        `→ Historical migrations 001-${String(
                            BASELINE_COVERS_UP_TO
                        ).padStart(3, "0")} already applied; registering ${BASELINE_FILE}`
                    );

                    await markApplied(client, BASELINE_FILE);
                }
            }
        }

        /*
         * Apply anything not yet recorded.
         *
         * 000 is never re-executed once schema_migrations exists.
         * This is intentional because it is a full schema baseline.
         */
        for (const filename of files) {
            if (filename === BASELINE_FILE) {
                const existing = await client.query(
                    "SELECT 1 FROM schema_migrations WHERE filename = $1",
                    [filename]
                );

                if (existing.rowCount) {
                    console.log(
                        `✓ ${filename} already applied`
                    );
                }

                continue;
            }

            const existing = await client.query(
                "SELECT 1 FROM schema_migrations WHERE filename = $1",
                [filename]
            );

            if (existing.rowCount) {
                console.log(
                    `✓ ${filename} already applied`
                );
                continue;
            }

            console.log(`→ Applying ${filename}`);

            const sql = fs.readFileSync(
                path.join(migrationDir, filename),
                "utf8"
            );

            await client.query("BEGIN");

            try {
                await client.query(sql);

                await markApplied(client, filename);

                await client.query("COMMIT");

                console.log(`✓ Applied ${filename}`);
            } catch (error) {
                await client.query("ROLLBACK");
                throw error;
            }
        }

        console.log("All DukaFlow migrations are up to date.");
   } catch (error) {
    console.error("Migration failed:", error.message);
    console.error("Code:", error.code || "N/A");
    console.error("Position:", error.position || "N/A");
    console.error("Detail:", error.detail || "N/A");
    console.error("Hint:", error.hint || "N/A");
    console.error("Routine:", error.routine || "N/A");
    process.exitCode = 1;
} finally {
        try {
            await client.query(
                "SELECT pg_advisory_unlock(39182024)"
            );
        } catch {}

        client.release();
        await pool.end();
    }
}

main();