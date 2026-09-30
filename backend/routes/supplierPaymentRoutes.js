"use strict";
const express=require("express");
const {requireAuth,authorizeRoles}=require("../middleware/authMiddleware");
const {getSupplierPayables,getSupplierPayments,recordSupplierPayment}=require("../controllers/supplierPaymentController");
const router=express.Router();
router.get("/",requireAuth,authorizeRoles("owner","manager"),getSupplierPayables);
router.get("/supplier/:supplierId",requireAuth,authorizeRoles("owner","manager"),getSupplierPayments);
router.post("/",requireAuth,authorizeRoles("owner","manager"),recordSupplierPayment);
module.exports=router;
