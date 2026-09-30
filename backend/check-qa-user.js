require("dotenv").config();
const db = require("./db");
const pool = typeof db.query === "function" ? db : db.pool;

(async () => {
  try {
    const r = await pool.query(
      `SELECT
         u.id,
         u.email,
         u.name,
         u.role,
         u.is_active,
         u.business_id,
         u.default_branch_id,
         b.name AS business_name,
         br.name AS branch_name,
         br.is_active AS branch_active,
         (u.password_hash IS NOT NULL AND u.password_hash <> '') AS has_password_hash
       FROM users u
       LEFT JOIN businesses b ON b.id = u.business_id
       LEFT JOIN branches br ON br.id = u.default_branch_id
       WHERE LOWER(u.email) = LOWER($1)
       LIMIT 1`,
      ["qa+1790707643@dukaflow.test"]
    );

    console.table(r.rows);
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  } finally {
    if (typeof pool.end === "function") await pool.end();
  }
})();
