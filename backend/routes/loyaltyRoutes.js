"use strict";
const express=require("express");const {requireAuth,authorizeRoles}=require("../middleware/authMiddleware");const {getAccount,adjustPoints}=require("../controllers/loyaltyController");
const router=express.Router();
router.get("/customer/:customerId",requireAuth,authorizeRoles("owner","manager","cashier"),getAccount);
router.post("/adjust",requireAuth,authorizeRoles("owner","manager"),adjustPoints);
module.exports=router;
