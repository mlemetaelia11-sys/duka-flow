"use strict";
const pool=require("../db");
const {runHealthChecks}=require("../services/health");
async function health(req,res){
 const started=Date.now(); const checks=await runHealthChecks();
 const bad=checks.some(c=>c.component==="postgres"&&c.status!=="ok");
 res.status(bad?503:200).json({status:bad?"degraded":"ok",latencyMs:Date.now()-started,checks,timestamp:new Date().toISOString()});
}
async function backupHistory(req,res){
 const r=await pool.query("SELECT id,status,backup_type,target,file_path,size_bytes,checksum_sha256,error_message,started_at,completed_at FROM backup_runs ORDER BY id DESC LIMIT 20");
 res.json({backups:r.rows});
}
module.exports={health,backupHistory};
