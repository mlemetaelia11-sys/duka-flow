require("dotenv").config();

const db = require("./db");
const pool = typeof db.query === "function" ? db : db.pool;

(async () => {
  try {
    await pool.query("BEGIN");

    const business = await pool.query(
      "SELECT id, name FROM businesses WHERE name = $1 ORDER BY id DESC LIMIT 1",
      ["DukaFlow QA Shop"]
    );

    if (!business.rowCount) {
      throw new Error("DukaFlow QA Shop not found.");
    }

    const businessId = business.rows[0].id;

    const branch = await pool.query(
      "INSERT INTO branches (business_id, name, code, is_active) VALUES ($1, $2, $3, TRUE) ON CONFLICT (business_id, code) DO UPDATE SET is_active = TRUE RETURNING id, name, is_active",
      [businessId, "DukaFlow QA Shop - Main Branch", "MAIN"]
    );

    const branchId = branch.rows[0].id;

    await pool.query(
      "UPDATE users SET default_branch_id = $1 WHERE business_id = $2 AND is_active = TRUE",
      [branchId, businessId]
    );

    await pool.query("COMMIT");

    console.log("QA branch/default branch fixed.");
    console.table(branch.rows);
  } catch (error) {
    await pool.query("ROLLBACK").catch(() => {});
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    if (typeof pool.end === "function") {
      await pool.end();
    }
  }
})();
