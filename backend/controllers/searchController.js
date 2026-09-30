"use strict";
const pool=require("../db");
function bid(req){const v=Number(req.businessId||req.user?.businessId||req.user?.business_id);return Number.isInteger(v)&&v>0?v:null;}
async function globalSearch(req,res){const businessId=bid(req);if(!businessId)return res.status(401).json({message:"Business context is missing."});const q=String(req.query.q||"").trim().slice(0,100);if(q.length<2)return res.json({query:q,results:[]});const like=`%${q}%`;try{const [products,customers,suppliers,sales,purchases]=await Promise.all([
 pool.query(`SELECT id,name,sku,barcode,'product' AS type FROM products WHERE business_id=$1 AND (name ILIKE $2 OR COALESCE(sku,'') ILIKE $2 OR COALESCE(barcode,'') ILIKE $2) ORDER BY name LIMIT 10`,[businessId,like]),
 pool.query(`SELECT id,name,phone,'customer' AS type FROM customers WHERE business_id=$1 AND (name ILIKE $2 OR COALESCE(phone,'') ILIKE $2) ORDER BY name LIMIT 10`,[businessId,like]),
 pool.query(`SELECT id,name,phone,'supplier' AS type FROM suppliers WHERE business_id=$1 AND (name ILIKE $2 OR COALESCE(phone,'') ILIKE $2) ORDER BY name LIMIT 10`,[businessId,like]),
 pool.query(`SELECT id,receipt_number,total_amount,created_at,'sale' AS type FROM sales WHERE business_id=$1 AND receipt_number ILIKE $2 ORDER BY created_at DESC LIMIT 10`,[businessId,like]),
 pool.query(`SELECT id,reference_number,total_amount,created_at,'purchase' AS type FROM purchases WHERE business_id=$1 AND reference_number ILIKE $2 ORDER BY created_at DESC LIMIT 10`,[businessId,like])
 ]);return res.json({query:q,results:[...products.rows,...customers.rows,...suppliers.rows,...sales.rows,...purchases.rows]});}catch(e){console.error("GLOBAL SEARCH ERROR:",e);return res.status(500).json({message:"Search failed."});}}
module.exports={globalSearch};
