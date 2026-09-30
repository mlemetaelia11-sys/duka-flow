"use strict";

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const pool = require("../db");

async function main() {
    const client = await pool.connect();

    try {
        await client.query("SET lock_timeout = '5s'");
        await client.query("SET statement_timeout = '60s'");
        await client.query("SELECT pg_advisory_lock(39182024)");
        await client.query(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                filename VARCHAR(255) NOT NULL UNIQUE,
                applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `);

        const migrationDir = path.join(__dirname, "..", "migrations");
        const files = fs.readdirSync(migrationDir)
            .filter((name) => /^\d+_.+\.sql$/i.test(name))
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

        for (const filename of files) {
            const existing = await client.query(
                "SELECT 1 FROM schema_migrations WHERE filename = $1",
                [filename]
            );

            if (existing.rowCount) {
                console.log(`✓ ${filename} already applied`);
                continue;
            }

            console.log(`→ Applying ${filename}`);
            const sql = fs.readFileSync(path.join(migrationDir, filename), "utf8");
            await client.query(sql);
            await client.query(
                "INSERT INTO schema_migrations (filename) VALUES ($1)",
                [filename]
            );
            console.log(`✓ Applied ${filename}`);
        }

        console.log("All DukaFlow migrations are up to date.");
    } catch (error) {
        console.error("Migration failed:", error.message);
        process.exitCode = 1;
    } finally {
        try {
            await client.query("SELECT pg_advisory_unlock(39182024)");
        } catch {}
        client.release();
        await pool.end();
    }
}

main();
