"use strict";

const pool = require("../db");
const { logAudit } = require("../utils/audit");

function businessIdFrom(req){const v=Number(req.businessId||req.user?.businessId||req.user?.business_id);return Number.isInteger(v)&&v>0?v:null;}
function fail(message,status=400){const e=new Error(message);e.status=status;return e;}

async function getSupplierPayables(req,res){
 const businessId=businessIdFrom(req); if(!businessId)return res.status(401).json({message:"Business context is missing."});
 try{const r=await pool.query(`SELECT s.id,s.name,s.phone,COUNT(p.id) FILTER(WHERE p.balance>0) AS open_purchases,COALESCE(SUM(p.balance),0) AS outstanding_balance,COALESCE(SUM(p.total_amount),0) AS total_purchase_value FROM suppliers s LEFT JOIN purchases p ON p.supplier_id=s.id AND p.business_id=s.business_id WHERE s.business_id=$1 GROUP BY s.id ORDER BY outstanding_balance DESC,s.name`,[businessId]);return res.json({suppliers:r.rows});}
 catch(e){console.error("SUPPLIER PAYABLES ERROR:",e);return res.status(500).json({message:"Failed to load supplier balances."});}
}

async function getSupplierPayments(req,res){
 const businessId=businessIdFrom(req);if(!businessId)return res.status(401).json({message:"Business context is missing."});
 const supplierId=Number(req.params.supplierId);if(!Number.isInteger(supplierId)||supplierId<=0)return res.status(400).json({message:"Invalid supplier ID."});
 try{const supplier=await pool.query(`SELECT id,name FROM suppliers WHERE id=$1 AND business_id=$2`,[supplierId,businessId]);if(!supplier.rowCount)return res.status(404).json({message:"Supplier not found."});const r=await pool.query(`SELECT sp.*,p.reference_number,u.name AS created_by_name FROM supplier_payments sp INNER JOIN purchases p ON p.id=sp.purchase_id AND p.business_id=sp.business_id LEFT JOIN users u ON u.id=sp.created_by AND u.business_id=sp.business_id WHERE sp.supplier_id=$1 AND sp.business_id=$2 ORDER BY sp.paid_at DESC`,[supplierId,businessId]);return res.json({supplier:supplier.rows[0],payments:r.rows});}
 catch(e){console.error("SUPPLIER PAYMENTS ERROR:",e);return res.status(500).json({message:"Failed to load supplier payments."});}
}

async function recordSupplierPayment(req,res){
 const businessId=businessIdFrom(req);if(!businessId)return res.status(401).json({message:"Business context is missing."});
 const purchaseId=Number(req.body?.purchaseId), amount=Number(req.body?.amount), paymentMethod=String(req.body?.paymentMethod||"").trim(), reference=String(req.body?.paymentReference||"").trim().slice(0,100)||null,notes=String(req.body?.notes||"").trim().slice(0,255)||null;
 if(!Number.isInteger(purchaseId)||purchaseId<=0)return res.status(400).json({message:"Invalid purchase ID."});
 if(!Number.isFinite(amount)||amount<=0)return res.status(400).json({message:"Payment amount must be greater than zero."});
 if(!["cash","mobile_money","bank"].includes(paymentMethod))return res.status(400).json({message:"Invalid payment method."});
 const client=await pool.connect();let begun=false;
 try{
  await client.query("BEGIN");begun=true;
  const p=await client.query(`SELECT id,supplier_id,total_amount,amount_paid,balance,status,reference_number FROM purchases WHERE id=$1 AND business_id=$2 FOR UPDATE`,[purchaseId,businessId]);
  if(!p.rowCount)throw fail("Purchase not found.",404);
  const purchase=p.rows[0];const balance=Number(purchase.balance);if(balance<=0)throw fail("This purchase is already fully paid.");if(amount>balance)throw fail(`Payment cannot exceed the outstanding balance of TSh ${balance.toLocaleString()}.`);
  const newPaid=Math.round((Number(purchase.amount_paid)+amount)*100)/100,newBalance=Math.round((balance-amount)*100)/100,newStatus=newBalance===0?"paid":"partial";
  const payment=await client.query(`INSERT INTO supplier_payments(business_id,purchase_id,supplier_id,amount,payment_method,payment_reference,notes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[businessId,purchaseId,purchase.supplier_id,amount,paymentMethod,reference,notes,req.user.id]);
  const updated=await client.query(`UPDATE purchases SET amount_paid=$1,balance=$2,status=$3,payment_reference=COALESCE($4,payment_reference) WHERE id=$5 AND business_id=$6 RETURNING id,reference_number,supplier_id,total_amount,amount_paid,balance,payment_method,payment_reference,status,created_at`,[newPaid,newBalance,newStatus,reference,purchaseId,businessId]);
  if (paymentMethod === "cash") {
   const register = await client.query(`SELECT id FROM cash_registers WHERE business_id=$1 AND status='open' LIMIT 1 FOR UPDATE`, [businessId]);
   if (register.rowCount) {
    await client.query(`INSERT INTO cash_movements (business_id,register_id,movement_type,amount,direction,reference_type,reference_id,note,created_by) VALUES ($1,$2,'cash_out',$3,'out','supplier_payment',$4,$5,$6)`, [businessId, register.rows[0].id, amount, purchaseId, `Supplier payment ${purchase.reference_number}`, req.user.id]);
   }
  }
  await client.query("COMMIT");begun=false;await logAudit(req,"supplier.payment_recorded","purchase",purchaseId,{amount,paymentMethod,reference});return res.status(201).json({message:"Supplier payment recorded successfully.",payment:payment.rows[0],purchase:updated.rows[0]});
 }catch(e){if(begun){try{await client.query("ROLLBACK")}catch{}}console.error("RECORD SUPPLIER PAYMENT ERROR:",e);return res.status(e.status||400).json({message:e.message||"Failed to record supplier payment."});}finally{client.release();}
}

module.exports={getSupplierPayables,getSupplierPayments,recordSupplierPayment};
