"use strict";

const pool = require("../db");
const { logAudit } = require("../utils/audit");

function businessIdFrom(req) {
    const value = Number(req.businessId || req.user?.businessId || req.user?.business_id);
    return Number.isInteger(value) && value > 0 ? value : null;
}
function fail(message, status = 400) { const e = new Error(message); e.status = status; return e; }

async function getCurrentRegister(req, res) {
    const businessId = businessIdFrom(req);
    if (!businessId) return res.status(401).json({ message: "Business context is missing." });
    try {
        const result = await pool.query(`
            SELECT r.*, u.name AS opened_by_name,
                   COALESCE((SELECT SUM(CASE WHEN direction = 'in' THEN amount ELSE -amount END)
                             FROM cash_movements cm WHERE cm.business_id=r.business_id AND cm.register_id=r.id), 0) AS movement_net
            FROM cash_registers r
            INNER JOIN users u ON u.id=r.opened_by AND u.business_id=r.business_id
            WHERE r.business_id=$1 AND r.status='open'
            LIMIT 1
        `, [businessId]);
        return res.json({ register: result.rows[0] || null });
    } catch (error) {
        console.error("GET CASH REGISTER ERROR:", error);
        return res.status(500).json({ message: "Failed to load cash register." });
    }
}

async function openRegister(req, res) {
    const businessId = businessIdFrom(req);
    if (!businessId) return res.status(401).json({ message: "Business context is missing." });
    const openingBalance = Number(req.body?.openingBalance ?? 0);
    const notes = String(req.body?.notes || "").trim().slice(0,255) || null;
    if (!Number.isFinite(openingBalance) || openingBalance < 0) return res.status(400).json({ message: "Opening balance must be a valid non-negative number." });
    try {
        const existing = await pool.query(`SELECT id FROM cash_registers WHERE business_id=$1 AND status='open' LIMIT 1`, [businessId]);
        if (existing.rowCount) return res.status(409).json({ message: "A cash register is already open." });
        const result = await pool.query(`
            INSERT INTO cash_registers (business_id, opened_by, status, opening_balance, notes)
            VALUES ($1,$2,'open',$3,$4)
            RETURNING *
        `, [businessId, req.user.id, openingBalance, notes]);
        const register = result.rows[0];
        if (openingBalance > 0) {
            await pool.query(`
                INSERT INTO cash_movements (business_id, register_id, movement_type, amount, direction, note, created_by)
                VALUES ($1,$2,'opening',$3,'in',$4,$5)
            `, [businessId, register.id, openingBalance, "Opening float", req.user.id]);
        }
        await logAudit(req, "cash.register_opened", "cash_register", register.id, { openingBalance });
        return res.status(201).json({ message: "Cash register opened.", register });
    } catch (error) {
        if (error.code === "23505") return res.status(409).json({ message: "A cash register is already open." });
        console.error("OPEN CASH REGISTER ERROR:", error);
        return res.status(500).json({ message: "Failed to open cash register." });
    }
}

async function addCashMovement(req, res) {
    const businessId = businessIdFrom(req);
    if (!businessId) return res.status(401).json({ message: "Business context is missing." });
    const type = String(req.body?.movementType || "").trim();
    const amount = Number(req.body?.amount);
    let direction = String(req.body?.direction || (type === "cash_out" ? "out" : "in")).trim();
    const note = String(req.body?.note || "").trim().slice(0,255) || null;
    if (!["cash_in","cash_out","adjustment"].includes(type)) return res.status(400).json({ message: "Invalid cash movement type." });
    if (type === "cash_in") direction = "in";
    if (type === "cash_out") direction = "out";
    if (type === "adjustment" && !["in", "out"].includes(direction)) return res.status(400).json({ message: "Adjustment direction must be in or out." });
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ message: "Amount must be greater than zero." });
    try {
        const register = await pool.query(`SELECT id FROM cash_registers WHERE business_id=$1 AND status='open' LIMIT 1`, [businessId]);
        if (!register.rowCount) return res.status(409).json({ message: "Open a cash register first." });
        const row = await pool.query(`
            INSERT INTO cash_movements (business_id, register_id, movement_type, amount, direction, note, created_by)
            VALUES ($1,$2,$3,$4,$5,$6,$7)
            RETURNING *
        `, [businessId, register.rows[0].id, type, amount, direction, note, req.user.id]);
        await logAudit(req, `cash.${type}`, "cash_movement", row.rows[0].id, { amount, note, direction });
        return res.status(201).json({ message: "Cash movement recorded.", movement: row.rows[0] });
    } catch (error) {
        console.error("CASH MOVEMENT ERROR:", error);
        return res.status(500).json({ message: "Failed to record cash movement." });
    }
}

async function closeRegister(req, res) {
    const businessId = businessIdFrom(req);
    if (!businessId) return res.status(401).json({ message: "Business context is missing." });
    const closingBalance = Number(req.body?.closingBalance);
    const notes = String(req.body?.notes || "").trim().slice(0,255) || null;
    if (!Number.isFinite(closingBalance) || closingBalance < 0) return res.status(400).json({ message: "Closing balance must be a valid non-negative number." });
    const client = await pool.connect();
    let begun=false;
    try {
        await client.query("BEGIN"); begun=true;
        const r=await client.query(`SELECT id, opening_balance FROM cash_registers WHERE business_id=$1 AND status='open' FOR UPDATE`,[businessId]);
        if(!r.rowCount) throw fail("No open cash register found.",404);
        const register=r.rows[0];
        const movement=await client.query(`SELECT COALESCE(SUM(CASE WHEN direction='in' THEN amount ELSE -amount END),0) AS net FROM cash_movements WHERE business_id=$1 AND register_id=$2 AND movement_type <> 'closing'`,[businessId,register.id]);
        const expected=Number(movement.rows[0].net);
        const updated=await client.query(`UPDATE cash_registers SET status='closed', closing_balance=$1, expected_balance=$2, closed_at=NOW(), notes=COALESCE($3,notes) WHERE id=$4 AND business_id=$5 RETURNING *`,[closingBalance,expected,notes,register.id,businessId]);
        if (closingBalance > 0) {
            await client.query(`INSERT INTO cash_movements (business_id, register_id, movement_type, amount, direction, note, created_by) VALUES ($1,$2,'closing',$3,'out',$4,$5)`,[businessId,register.id,closingBalance,`Register closed. Expected TSh ${expected.toLocaleString()}; counted TSh ${closingBalance.toLocaleString()}`,req.user.id]);
        }
        await client.query("COMMIT"); begun=false;
        await logAudit(req,"cash.register_closed","cash_register",register.id,{closingBalance,expected});
        return res.json({message:"Cash register closed.",register:updated.rows[0],variance:Math.round((closingBalance-expected)*100)/100});
    }catch(error){if(begun){try{await client.query("ROLLBACK")}catch{}} console.error("CLOSE CASH REGISTER ERROR:",error); return res.status(error.status||400).json({message:error.message||"Failed to close cash register."});}finally{client.release();}
}

async function getRegisterMovements(req,res){
    const businessId=businessIdFrom(req); if(!businessId) return res.status(401).json({message:"Business context is missing."});
    try{const result=await pool.query(`SELECT cm.*,u.name AS created_by_name FROM cash_movements cm LEFT JOIN users u ON u.id=cm.created_by AND u.business_id=cm.business_id WHERE cm.business_id=$1 ORDER BY cm.created_at DESC LIMIT 200`,[businessId]); return res.json({movements:result.rows});}catch(error){console.error("GET CASH MOVEMENTS ERROR:",error); return res.status(500).json({message:"Failed to load cash movements."});}
}
module.exports={getCurrentRegister,openRegister,addCashMovement,closeRegister,getRegisterMovements};
