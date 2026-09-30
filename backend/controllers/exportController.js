"use strict";

const pool = require("../db");
const { logAudit } = require("../utils/audit");

function bid(req) {
    const value = Number(req.businessId || req.user?.businessId || req.user?.business_id);
    return Number.isInteger(value) && value > 0 ? value : null;
}

function csvCell(value) {
    return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function sendCsv(res, filename, headers, rows) {
    const lines = [headers.map(csvCell).join(",")];
    rows.forEach((row) => lines.push(row.map(csvCell).join(",")));
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send("\uFEFF" + lines.join("\n"));
}

async function exportResource(req, res) {
    const businessId = bid(req);
    if (!businessId) return res.status(401).json({ message: "Business context is missing." });

    const resource = String(req.params.resource || "").toLowerCase();
    const queries = {
        products: {
            headers: ["ID","Name","SKU","Barcode","Category","Unit","Buying Price","Selling Price","Stock","Low Stock Threshold","Created At"],
            query: `SELECT id,name,sku,barcode,category,unit,buying_price,selling_price,stock_quantity,low_stock_threshold,created_at FROM products WHERE business_id=$1 ORDER BY id`
        },
        customers: {
            headers: ["ID","Name","Phone","Email","Address","Created At"],
            query: `SELECT id,name,phone,email,address,created_at FROM customers WHERE business_id=$1 ORDER BY id`
        },
        suppliers: {
            headers: ["ID","Name","Phone","Email","Address","Created At"],
            query: `SELECT id,name,phone,email,address,created_at FROM suppliers WHERE business_id=$1 ORDER BY id`
        },
        sales: {
            headers: ["Receipt","Date","Subtotal","Discount","Total","Payment Method","Paid","Change","Status"],
            query: `SELECT receipt_number,created_at,subtotal,discount,total_amount,payment_method,amount_paid,change_amount,status FROM sales WHERE business_id=$1 ORDER BY created_at DESC`
        },
        purchases: {
            headers: ["Reference","Date","Supplier ID","Subtotal","Discount","Total","Paid","Balance","Payment Method","Status"],
            query: `SELECT reference_number,created_at,supplier_id,subtotal,discount,total_amount,amount_paid,balance,payment_method,status FROM purchases WHERE business_id=$1 ORDER BY created_at DESC`
        },
        debts: {
            headers: ["ID","Sale ID","Customer ID","Total","Paid","Balance","Due Date","Status","Created At"],
            query: `SELECT id,sale_id,customer_id,total_amount,amount_paid,balance,due_date,status,created_at FROM debts WHERE business_id=$1 ORDER BY created_at DESC`
        },
        stock: {
            headers: ["Date","Product ID","Movement Type","Quantity Change","Reference Type","Reference ID","Notes"],
            query: `SELECT created_at,product_id,movement_type,quantity_change,reference_type,reference_id,notes FROM stock_movements WHERE business_id=$1 ORDER BY created_at DESC`
        }
    };

    const config = queries[resource];
    if (!config) return res.status(404).json({ message: "Export resource not found." });

    try {
        const result = await pool.query(config.query, [businessId]);
        const rows = result.rows.map((row) => Object.values(row));
        await logAudit(req, "data.exported", resource, null, { rows: rows.length });
        return sendCsv(res, `dukaflow-${resource}-${new Date().toISOString().slice(0,10)}.csv`, config.headers, rows);
    } catch (error) {
        console.error("EXPORT ERROR:", error);
        return res.status(500).json({ message: "Failed to export data." });
    }
}

module.exports = { exportResource };
