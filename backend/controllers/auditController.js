"use strict";
const pool=require("../db");
function bid(req){const v=Number(req.businessId||req.user?.businessId||req.user?.business_id);return Number.isInteger(v)&&v>0?v:null;}
async function listAuditLogs(req,res){const businessId=bid(req);if(!businessId)return res.status(401).json({message:"Business context is missing."});const limit=Math.min(Math.max(Number(req.query.limit)||100,1),500);try{const r=await pool.query(`SELECT a.id,a.action,a.entity_type,a.entity_id,a.details,a.ip_address,a.created_at,u.name AS user_name FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id AND u.business_id=a.business_id WHERE a.business_id=$1 ORDER BY a.created_at DESC LIMIT $2`,[businessId,limit]);return res.json({logs:r.rows});}catch(e){console.error("AUDIT LIST ERROR:",e);return res.status(500).json({message:"Failed to load audit logs."});}}
module.exports={listAuditLogs};
