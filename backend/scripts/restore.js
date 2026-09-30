"use strict";

require("dotenv").config();

const { spawnSync } = require("child_process");

function required(name) {
    if (!process.env[name]) throw new Error(`${name} is required.`);
    return process.env[name];
}

function main() {
    const backupFile = process.argv[2];
    const confirmation = process.argv[3];
    if (!backupFile || confirmation !== "--confirm") {
        throw new Error("Usage: npm run restore -- <backup-file> --confirm");
    }

    const database = required("DATABASE_NAME");
    const user = required("DATABASE_USER");
    const host = process.env.DATABASE_HOST || "localhost";
    const port = process.env.DATABASE_PORT || "5432";
    const password = required("DATABASE_PASSWORD");
    const restoreTool = process.env.PG_RESTORE_PATH || "pg_restore";

    console.warn("WARNING: pg_restore with --clean will replace objects in the target database.");
    console.warn("Destructive restore confirmed with --confirm.");
    console.warn(`Restoring ${backupFile} into ${database}@${host}:${port}`);

    const result = spawnSync(restoreTool, [
        "-h", host,
        "-p", String(port),
        "-U", user,
        "--clean",
        "--if-exists",
        "--no-owner",
        "--dbname", database,
        backupFile
    ], {
        env: { ...process.env, PGPASSWORD: password },
        stdio: "inherit"
    });

    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`pg_restore exited with status ${result.status}.`);

    console.log("Restore completed.");
}

try {
    main();
} catch (error) {
    console.error("Restore failed:", error.message);
    process.exitCode = 1;
}
