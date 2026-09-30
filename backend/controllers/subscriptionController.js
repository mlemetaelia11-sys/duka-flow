"use strict";
const pool=require("../db");
function bid(req){const v=Number(req.businessId||req.user?.businessId||req.user?.business_id);return Number.isInteger(v)&&v>0?v:null;}
async function getPlans(req,res){try{const r=await pool.query(`SELECT id,code,name,price_monthly,price_yearly,product_limit,customer_limit,user_limit,features,is_active FROM subscription_plans WHERE is_active=TRUE ORDER BY price_monthly`);return res.json({plans:r.rows});}catch(e){console.error("PLANS ERROR:",e);return res.status(500).json({message:"Failed to load subscription plans."});}}
async function getCurrent(req,res){const businessId=bid(req);if(!businessId)return res.status(401).json({message:"Business context is missing."});try{const r=await pool.query(`SELECT s.id,s.status,s.starts_at,s.ends_at,s.trial_ends_at,s.external_reference,p.id AS plan_id,p.code,p.name,p.price_monthly,p.price_yearly,p.product_limit,p.customer_limit,p.user_limit,p.features FROM subscriptions s INNER JOIN subscription_plans p ON p.id=s.plan_id WHERE s.business_id=$1
 AND s.status IN ('trial','active','past_due')
 AND (s.ends_at IS NULL OR s.ends_at > NOW())
 AND (s.trial_ends_at IS NULL OR s.trial_ends_at > NOW())
 ORDER BY s.updated_at DESC LIMIT 1`,[businessId]);return res.json({subscription:r.rows[0]||null});}catch(e){console.error("CURRENT SUBSCRIPTION ERROR:",e);return res.status(500).json({message:"Failed to load subscription."});}}
module.exports={getPlans,getCurrent};
