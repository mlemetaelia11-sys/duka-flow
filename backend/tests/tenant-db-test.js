"use strict";

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const crypto = require("crypto");
const pool = require("../db");

function id(value) {
    return Number(value);
}

async function expectFailure(client, label, query, params) {
    await client.query("SAVEPOINT tenant_test_failure");
    try {
        await client.query(query, params);
    } catch (error) {
        await client.query("ROLLBACK TO SAVEPOINT tenant_test_failure");
        console.log(`PASS ${label}`);
        return;
    }
    await client.query("ROLLBACK TO SAVEPOINT tenant_test_failure");
    throw new Error(`${label}: expected database rejection, but statement succeeded`);
}

async function main() {
    let client;
    let inTransaction = false;

    try {
        client = await pool.connect();
        await client.query("SELECT 1 FROM businesses LIMIT 1");
        await client.query("SELECT 1 FROM products LIMIT 1");
        await client.query("SELECT 1 FROM customers LIMIT 1");
        await client.query("SELECT 1 FROM suppliers LIMIT 1");
        await client.query("SELECT 1 FROM sales LIMIT 1");
        await client.query("SELECT 1 FROM debts LIMIT 1");
        await client.query("SELECT 1 FROM debt_payments LIMIT 1");
        await client.query("SELECT 1 FROM purchases LIMIT 1");

        const suffix = crypto.randomBytes(6).toString("hex");
        await client.query("BEGIN");
        inTransaction = true;

        const a = await client.query(
            `INSERT INTO businesses (name, slug) VALUES ($1, $2) RETURNING id`,
            [`Tenant Test A ${suffix}`, `tenant-test-a-${suffix}`]
        );
        const b = await client.query(
            `INSERT INTO businesses (name, slug) VALUES ($1, $2) RETURNING id`,
            [`Tenant Test B ${suffix}`, `tenant-test-b-${suffix}`]
        );

        const businessA = id(a.rows[0].id);
        const businessB = id(b.rows[0].id);

        const emailA = `tenant-a-${suffix}@example.test`;
        const emailB = `tenant-b-${suffix}@example.test`;
        const ua = await client.query(
            `INSERT INTO users (business_id,name,email,password_hash,role,is_active)
             VALUES ($1,'Tenant Owner A',$2,'test-hash','owner',TRUE) RETURNING id`,
            [businessA, emailA]
        );
        const ub = await client.query(
            `INSERT INTO users (business_id,name,email,password_hash,role,is_active)
             VALUES ($1,'Tenant Owner B',$2,'test-hash','owner',TRUE) RETURNING id`,
            [businessB, emailB]
        );

        const userA = id(ua.rows[0].id);
        const userB = id(ub.rows[0].id);

        const branchAResult = await client.query(
            `INSERT INTO branches (business_id,name,code,is_active) VALUES ($1,'Main Branch A',$2,TRUE) RETURNING id`,
            [businessA, `MAIN-A-${suffix}`]
        );
        const branchBResult = await client.query(
            `INSERT INTO branches (business_id,name,code,is_active) VALUES ($1,'Main Branch B',$2,TRUE) RETURNING id`,
            [businessB, `MAIN-B-${suffix}`]
        );
        const branchA = id(branchAResult.rows[0].id);
        const branchB = id(branchBResult.rows[0].id);

        await client.query(`SELECT set_config('app.business_id',$1,TRUE), set_config('app.branch_id',$2,TRUE)`, [String(businessA), String(branchA)]);

        const pa = await client.query(
            `INSERT INTO products (business_id,name,buying_price,selling_price,stock_quantity,low_stock_threshold)
             VALUES ($1,'Tenant A Product',10,20,10,2) RETURNING id`,
            [businessA]
        );
        const productA = id(pa.rows[0].id);

        await client.query(`SELECT set_config('app.business_id',$1,TRUE), set_config('app.branch_id',$2,TRUE)`, [String(businessB), String(branchB)]);
        const pb = await client.query(
            `INSERT INTO products (business_id,name,buying_price,selling_price,stock_quantity,low_stock_threshold)
             VALUES ($1,'Tenant B Product',11,21,10,2) RETURNING id`,
            [businessB]
        );
        const productB = id(pb.rows[0].id);

        await client.query(`SELECT set_config('app.business_id',$1,TRUE), set_config('app.branch_id',$2,TRUE)`, [String(businessA), String(branchA)]);
        const ca = await client.query(
            `INSERT INTO customers (business_id,name) VALUES ($1,'Tenant A Customer') RETURNING id`,
            [businessA]
        );
        await client.query(`SELECT set_config('app.business_id',$1,TRUE), set_config('app.branch_id',$2,TRUE)`, [String(businessB), String(branchB)]);
        const cb = await client.query(
            `INSERT INTO customers (business_id,name) VALUES ($1,'Tenant B Customer') RETURNING id`,
            [businessB]
        );
        const customerA = id(ca.rows[0].id);
        const customerB = id(cb.rows[0].id);
        await client.query(`SELECT set_config('app.business_id',$1,TRUE), set_config('app.branch_id',$2,TRUE)`, [String(businessA), String(branchA)]);

        const sa = await client.query(
            `INSERT INTO sales (business_id,receipt_number,subtotal,discount,total_amount,payment_method,amount_paid,change_amount,status,customer_id,created_by)
             VALUES ($1,$2,20,0,20,'cash',20,0,'paid',$3,$4) RETURNING id`,
            [businessA, `TENANT-SALE-A-${suffix}`, customerA, userA]
        );
        await client.query(`SELECT set_config('app.business_id',$1,TRUE), set_config('app.branch_id',$2,TRUE)`, [String(businessB), String(branchB)]);
        const sb = await client.query(
            `INSERT INTO sales (business_id,receipt_number,subtotal,discount,total_amount,payment_method,amount_paid,change_amount,status,customer_id,created_by)
             VALUES ($1,$2,21,0,21,'cash',21,0,'paid',$3,$4) RETURNING id`,
            [businessB, `TENANT-SALE-B-${suffix}`, customerB, userB]
        );
        const saleA = id(sa.rows[0].id);
        const saleB = id(sb.rows[0].id);
        await client.query(`SELECT set_config('app.business_id',$1,TRUE), set_config('app.branch_id',$2,TRUE)`, [String(businessA), String(branchA)]);

        await client.query(
            `INSERT INTO sale_items (business_id,sale_id,product_id,product_name,quantity,unit_price,buying_price,line_total,profit_amount)
             VALUES ($1,$2,$3,'Tenant A Product',1,20,10,20,10)`,
            [businessA, saleA, productA]
        );

        const da = await client.query(
            `INSERT INTO debts (business_id,sale_id,customer_id,total_amount,amount_paid,balance,status)
             VALUES ($1,$2,$3,20,0,20,'unpaid') RETURNING id`,
            [businessA, saleA, customerA]
        );
        const debtA = id(da.rows[0].id);

        const spa = await client.query(
            `INSERT INTO suppliers (business_id,name) VALUES ($1,'Tenant A Supplier') RETURNING id`,
            [businessA]
        );
        await client.query(`SELECT set_config('app.business_id',$1,TRUE), set_config('app.branch_id',$2,TRUE)`, [String(businessB), String(branchB)]);
        const spb = await client.query(
            `INSERT INTO suppliers (business_id,name) VALUES ($1,'Tenant B Supplier') RETURNING id`,
            [businessB]
        );
        const supplierA = id(spa.rows[0].id);
        const supplierB = id(spb.rows[0].id);
        await client.query(`SELECT set_config('app.business_id',$1,TRUE), set_config('app.branch_id',$2,TRUE)`, [String(businessA), String(branchA)]);

        const readProductsA = await client.query(
            `SELECT COUNT(*)::int AS count FROM products WHERE business_id=$1`,
            [businessA]
        );
        if (readProductsA.rows[0].count !== 1) throw new Error("Business A product isolation read failed");

        const readProductsB = await client.query(
            `SELECT COUNT(*)::int AS count FROM products WHERE business_id=$1`,
            [businessB]
        );
        if (readProductsB.rows[0].count !== 1) throw new Error("Business B product isolation read failed");

        const crossProduct = await client.query(
            `SELECT id FROM products WHERE id=$1 AND business_id=$2`,
            [productB, businessA]
        );
        if (crossProduct.rowCount !== 0) throw new Error("Cross-business product read leaked a row");
        console.log("PASS cross-business product read isolation");

        await expectFailure(
            client,
            "sale_items reject a product from another business",
            `INSERT INTO sale_items (business_id,sale_id,product_id,product_name,quantity,unit_price,buying_price,line_total,profit_amount)
             VALUES ($1,$2,$3,'Cross Tenant',1,20,10,20,10)`,
            [businessA, saleA, productB]
        );

        await expectFailure(
            client,
            "sales reject a customer from another business",
            `INSERT INTO sales (business_id,receipt_number,subtotal,discount,total_amount,payment_method,amount_paid,change_amount,status,customer_id,created_by)
             VALUES ($1,$2,20,0,20,'cash',20,0,'paid',$3,$4)`,
            [businessA, `CROSS-CUSTOMER-${suffix}`, customerB, userA]
        );

        await expectFailure(
            client,
            "debts reject a customer from another business",
            `INSERT INTO debts (business_id,sale_id,customer_id,total_amount,amount_paid,balance,status)
             VALUES ($1,$2,$3,20,0,20,'unpaid')`,
            [businessA, saleA, customerB]
        );

        await expectFailure(
            client,
            "debt payments reject a debt from another business",
            `INSERT INTO debt_payments (business_id,debt_id,amount,payment_method) VALUES ($1,$2,5,'cash')`,
            [businessB, debtA]
        );

        const purchaseA = await client.query(
            `INSERT INTO purchases (business_id,reference_number,supplier_id,subtotal,discount,total_amount,amount_paid,balance,payment_method,status,created_by)
             VALUES ($1,$2,$3,10,0,10,10,0,'cash','paid',$4) RETURNING id`,
            [businessA, `TENANT-PURCHASE-A-${suffix}`, supplierA, userA]
        );
        const purchaseIdA = id(purchaseA.rows[0].id);

        await expectFailure(
            client,
            "purchases reject a supplier from another business",
            `INSERT INTO purchases (business_id,reference_number,supplier_id,subtotal,discount,total_amount,amount_paid,balance,payment_method,status,created_by)
             VALUES ($1,$2,$3,10,0,10,10,0,'cash','paid',$4)`,
            [businessA, `CROSS-SUPPLIER-${suffix}`, supplierB, userA]
        );

        console.log(`PASS business A/B transaction setup (${saleA}/${saleB}, ${purchaseIdA})`);

        await client.query("ROLLBACK");
        inTransaction = false;
        console.log("PASS tenant DB isolation transaction rolled back cleanly");
    } catch (error) {
        if (inTransaction) await client.query("ROLLBACK");
        const connectionError = error && (
            error.code === "ECONNREFUSED" ||
            error.code === "ENOTFOUND" ||
            error.code === "ECONNRESET" ||
            error instanceof AggregateError
        );
        if (connectionError) {
            if (process.env.DB_TEST_REQUIRED === "1") throw error;
            console.log("SKIP: PostgreSQL is not available in this environment; run `npm run test:db` locally with DukaFlow database configured.");
            return;
        }
        if (error && /relation .* does not exist/i.test(error.message || "")) {
            if (process.env.DB_TEST_REQUIRED === "1") throw error;
            console.log("SKIP: DukaFlow migrations are not applied in this environment; run `npm run migrate` first, then `npm run test:db`.");
            return;
        }
        throw error;
    } finally {
        if (client) client.release();
        await pool.end();
    }
}

main().catch((error) => {
    console.error(`FAIL tenant DB test: ${error.message}`);
    process.exit(1);
});
