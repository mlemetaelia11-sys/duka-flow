"use strict";
const pool = require("../db");

function businessId(req) {
    const id = Number(req.user?.businessId || req.user?.business_id);
    return Number.isInteger(id) && id > 0 ? id : null;
}

async function listBranches(req, res) {
    const bid = businessId(req);
    if (!bid) return res.status(401).json({ message: "Business context is missing." });
    const result = await pool.query(`SELECT id,name,code,phone,address,city,is_active,created_at,updated_at FROM branches WHERE business_id=$1 ORDER BY is_active DESC,name ASC`, [bid]);
    return res.json({ branches: result.rows });
}

async function createBranch(req, res) {
    const bid = businessId(req);
    if (!bid) return res.status(401).json({ message: "Business context is missing." });
    const name = String(req.body?.name || "").trim();
    const code = String(req.body?.code || "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "-").slice(0,40);
    if (name.length < 2 || !code) return res.status(400).json({ message: "Branch name and code are required." });
    try {
        const result = await pool.query(`INSERT INTO branches(business_id,name,code,phone,address,city) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`, [bid,name,code,req.body?.phone||null,req.body?.address||null,req.body?.city||null]);
        return res.status(201).json({ branch: result.rows[0] });
    } catch (e) {
        if (e.code === "23505") return res.status(409).json({ message: "Branch code already exists." });
        throw e;
    }
}

async function updateBranch(req,res) {
    const bid=businessId(req); const id=Number(req.params.id);
    if(!bid) return res.status(401).json({message:"Business context is missing."});
    if(!Number.isInteger(id)) return res.status(400).json({message:"Invalid branch."});
    const result=await pool.query(`UPDATE branches SET name=COALESCE($1,name),phone=COALESCE($2,phone),address=COALESCE($3,address),city=COALESCE($4,city),is_active=COALESCE($5,is_active),updated_at=NOW() WHERE id=$6 AND business_id=$7 RETURNING *`, [req.body?.name?.trim()||null,req.body?.phone||null,req.body?.address||null,req.body?.city||null,typeof req.body?.is_active === "boolean" ? req.body.is_active : null,id,bid]);
    if(!result.rowCount) return res.status(404).json({message:"Branch not found."});
    return res.json({branch:result.rows[0]});
}

async function selectBranch(req,res) {
    const bid=businessId(req); const id=Number(req.body?.branchId);
    if(!bid || !Number.isInteger(id)) return res.status(400).json({message:"Valid branch is required."});
    const result=await pool.query(`SELECT id,name,code,is_active FROM branches WHERE id=$1 AND business_id=$2`,[id,bid]);
    if(!result.rowCount || !result.rows[0].is_active) return res.status(404).json({message:"Active branch not found."});
    await pool.query(`UPDATE users SET default_branch_id=$1,updated_at=NOW() WHERE id=$2 AND business_id=$3`,[id,req.user.id,bid]);
    res.cookie("dukaflow_branch", String(id), {httpOnly:true, sameSite:"lax", secure:process.env.NODE_ENV==="production", maxAge:31536000000, path:"/"});
    return res.json({branch:result.rows[0]});
}

async function currentBranch(req,res) {
    const bid=businessId(req); if(!bid) return res.status(401).json({message:"Business context is missing."});
    const selected=Number(req.cookies?.dukaflow_branch || req.user?.default_branch_id);
    const result=await pool.query(`SELECT id,name,code,is_active FROM branches WHERE business_id=$1 AND is_active=TRUE AND id=COALESCE($2,(SELECT id FROM branches WHERE business_id=$1 AND code='MAIN' LIMIT 1)) LIMIT 1`,[bid,Number.isInteger(selected)?selected:null]);
    return res.json({branch:result.rows[0]||null});
}
module.exports={listBranches,createBranch,updateBranch,selectBranch,currentBranch};
