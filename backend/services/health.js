"use strict";
const pool=require("../db");
const {getRuntimeConfig}=require("../config/providers");
async function runHealthChecks(){
 const checks=[];
 try{await pool.query("SELECT 1"); checks.push({component:"postgres",status:"ok",details:{connected:true}});}catch(e){checks.push({component:"postgres",status:"error",details:{message:e.message}});}
 const cfg=getRuntimeConfig();
 for(const [name,v] of Object.entries(cfg.providers)) checks.push({component:name,status:v.configured?"configured":"disabled",details:{mode:v.mode}});
 for(const c of checks){try{await pool.query("INSERT INTO system_health_checks(component,status,details) VALUES($1,$2,$3)",[c.component,c.status,c.details]);}catch{}}
 return checks;
}
module.exports={runHealthChecks};
